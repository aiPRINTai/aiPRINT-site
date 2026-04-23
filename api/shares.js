// /api/shares.js
// Short-link share system. POST stores a design payload and returns an 8-char
// base62 slug + a short URL of shape `https://aiprint.ai/?s=<slug>`. GET
// resolves a slug back to its payload. The frontend share flow in
// /public/index.html posts the current design state here instead of encoding
// it into a 1–2 KB query-string blob.
//
// Table is `shared_designs` — created lazily by api/db/index.js if missing.

import crypto from 'crypto';
import { saveSharedDesign, getSharedDesign } from './db/index.js';
import { enforceRateLimit } from './_rate-limit.js';

const MAX_PAYLOAD_BYTES = 20000; // ~20 KB — covers a full design with prompt; rejects abuse
const SLUG_LEN = 8;
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SLUG_RE = /^[a-zA-Z0-9]{6,16}$/;

function makeSlug(len = SLUG_LEN) {
  // Unbiased slug generation: reject bytes >= 248 (largest multiple of 62)
  const out = [];
  while (out.length < len) {
    const bytes = crypto.randomBytes(len * 2);
    for (let i = 0; i < bytes.length && out.length < len; i++) {
      if (bytes[i] < 248) out.push(SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length]);
    }
  }
  return out.join('');
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      // 30 mints/min/IP is ~one every 2s — far above real UX need (the
      // share button is user-initiated), but below any abuse that would
      // fill shared_designs with garbage.
      const rl = enforceRateLimit(req, res, { bucket: 'shares-post', limit: 30, windowMs: 60_000 });
      if (!rl.ok) return;

      const body = req.body || {};
      // Accept either `{ payload: {...} }` or the payload object directly.
      const payload = body && typeof body === 'object' && 'payload' in body ? body.payload : body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Missing payload' });
      }
      const json = JSON.stringify(payload);
      if (json.length > MAX_PAYLOAD_BYTES) {
        return res.status(413).json({ error: 'Payload too large' });
      }

      // Try a handful of slugs in case of collision (extraordinarily unlikely
      // at 62^8 = ~2.18e14, but defensive).
      let slug = null;
      let lastErr = null;
      for (let i = 0; i < 5; i++) {
        const candidate = makeSlug(SLUG_LEN);
        try {
          await saveSharedDesign(candidate, payload);
          slug = candidate;
          break;
        } catch (err) {
          lastErr = err;
          if (!String(err?.message || '').includes('duplicate key')) throw err;
        }
      }
      if (!slug) {
        console.error('shares: could not allocate slug:', lastErr?.message);
        return res.status(500).json({ error: 'Could not allocate slug' });
      }

      const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
      const host = req.headers.host || 'aiprint.ai';
      return res.status(200).json({
        slug,
        // Path-style URL (/s/<slug>) so iMessage/SMS/Slack unfurl through
        // /api/s.js, which serves per-share OG meta tags (actual artwork
        // preview instead of the generic site card). A browser landing on
        // /s/<slug> is instantly redirected to /?s=<slug> where the full
        // design hydrates.
        url: `${proto}://${host}/s/${slug}`
      });
    }

    if (req.method === 'GET') {
      // Slug-enumeration defense: at 62^8 slugs a brute-force scan is not
      // realistic, but an attacker probing for harvested-via-logs slugs
      // gets capped here. 120 lookups/min/IP covers legit hotlinking
      // (multiple tabs, link previews) without letting a script enumerate.
      const rl = enforceRateLimit(req, res, { bucket: 'shares-get', limit: 120, windowMs: 60_000 });
      if (!rl.ok) return;

      const slug = (req.query && (req.query.slug || req.query.s)) || '';
      if (!slug || !SLUG_RE.test(slug)) {
        return res.status(400).json({ error: 'Invalid slug' });
      }
      const row = await getSharedDesign(slug);
      if (!row) return res.status(404).json({ error: 'Not found' });
      // Small client-cache so identical refreshes don't re-hit the DB.
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.status(200).json({ ok: true, payload: row.payload });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('shares handler error:', err?.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
