// /api/cart
// Cross-device cart sync for logged-in users. Single-user-row JSONB store.
//
//   GET  /api/cart           -> { cart: [...], saved: [...], updated_at: ISO }
//   PUT  /api/cart           body: { cart: [...], saved: [...] }
//                            -> echoes back the persisted shape on success
//
// Authentication: Bearer JWT (same as the rest of the user APIs). Stale
// tokens (issued before the last password reset) are rejected so a leaked
// token can't keep syncing after the user has rotated their password.
//
// Sanitization: the server sanitizes EVERY field on a PUT — capping string
// lengths, clamping quantities, and dropping unrecognized keys — so a
// compromised localStorage on a client device can't smuggle larger payloads
// or arbitrary JSONB shapes into the row.

import { getUserFromRequest, isTokenFresh } from './auth/utils.js';
import { getUserById, getUserCart, setUserCart } from './db/index.js';
import { enforceRateLimit } from './_rate-limit.js';

const MAX_CART  = 10;   // distinct items in cart
const MAX_SAVED = 30;   // distinct items in saved-for-later

// Per-key string caps (mirrors what the cart-checkout endpoint allows so a
// PUT here can't store anything that wouldn't fit through checkout anyway).
function sanitizeItem(x) {
  if (!x || typeof x !== 'object') return null;
  const lookup = String(x.lookup_key || '').slice(0, 64);
  const preview = String(x.preview_url || '').slice(0, 2048);
  // Reject obvious garbage early — an item without a lookup_key or preview
  // can't be checked out anyway.
  if (!lookup || !preview) return null;
  // Only keep https URLs to avoid javascript:/data: smuggling.
  if (!/^https:\/\//i.test(preview)) return null;
  const clean = x.clean_url ? String(x.clean_url).slice(0, 2048) : null;
  if (clean && !/^https:\/\//i.test(clean)) return null;

  let qty = parseInt(x.quantity, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  if (qty > 10) qty = 10;

  let unit = parseInt(x.unit_amount, 10);
  if (!Number.isFinite(unit) || unit < 0) unit = 0;
  if (unit > 100000000) unit = 100000000; // cents — sanity ceiling

  // options is shallow-copied with field caps so we don't accept arbitrary
  // depth/length JSON. Signature can be a small object; everything else
  // is short strings.
  const opts = (x.options && typeof x.options === 'object') ? x.options : {};
  const cleanOpts = {
    ratio:  opts.ratio  ? String(opts.ratio).slice(0, 32)  : '',
    style:  opts.style  ? String(opts.style).slice(0, 200) : '',
    mood:   opts.mood   ? String(opts.mood).slice(0, 200)  : '',
    light:  opts.light  ? String(opts.light).slice(0, 200) : '',
    comp:   opts.comp   ? String(opts.comp).slice(0, 200)  : '',
    medium: opts.medium ? String(opts.medium).slice(0, 200): ''
  };
  if (opts.sig && typeof opts.sig === 'object') {
    cleanOpts.sig = {
      text:     String(opts.sig.text     || '').slice(0, 200),
      font:     String(opts.sig.font     || '').slice(0, 64),
      color:    String(opts.sig.color    || '').slice(0, 64),
      size:     String(opts.sig.size     || '').slice(0, 16),
      position: opts.sig.position && typeof opts.sig.position === 'object'
        ? { x: Number(opts.sig.position.x) || null, y: Number(opts.sig.position.y) || null }
        : null
    };
  }

  return {
    id:           String(x.id || '').slice(0, 64),
    preview_url:  preview,
    clean_url:    clean,
    prompt:       String(x.prompt || '').slice(0, 1000),
    options:      cleanOpts,
    lookup_key:   lookup,
    product_name: String(x.product_name || '').slice(0, 200),
    unit_amount:  unit,
    currency:     String(x.currency || 'usd').slice(0, 8).toLowerCase(),
    quantity:     qty,
    addedAt:      Number.isFinite(x.addedAt) ? x.addedAt : Date.now()
  };
}

function sanitizeArray(arr, cap) {
  if (!Array.isArray(arr)) return [];
  return arr.map(sanitizeItem).filter(Boolean).slice(0, cap);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Loose IP cap — legit users sync ~5–20 times per session, way below this.
  const rl = enforceRateLimit(req, res, {
    bucket: 'cart-sync-ip',
    limit: 120,
    windowMs: 60_000
  });
  if (!rl.ok) return;

  // Auth + freshness gate (same pattern as /api/credits/balance, /api/user/orders).
  const tokenData = getUserFromRequest(req);
  if (!tokenData?.userId) return res.status(401).json({ error: 'Authentication required' });

  let user;
  try { user = await getUserById(tokenData.userId); }
  catch (err) {
    console.error('cart auth lookup failed:', err);
    return res.status(500).json({ error: 'Server error' });
  }
  if (!user || !isTokenFresh(tokenData, user)) {
    return res.status(401).json({ error: 'Session expired — please log in again.' });
  }

  try {
    if (req.method === 'GET') {
      const data = await getUserCart(user.id);
      return res.status(200).json({
        cart:       Array.isArray(data.cart)  ? data.cart  : [],
        saved:      Array.isArray(data.saved) ? data.saved : [],
        updated_at: data.updated_at
      });
    }

    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
      }
      body = body || {};
      const cart  = sanitizeArray(body.cart,  MAX_CART);
      const saved = sanitizeArray(body.saved, MAX_SAVED);
      const result = await setUserCart(user.id, { cart, saved });
      return res.status(200).json({
        cart:       result.cart,
        saved:      result.saved,
        updated_at: result.updated_at
      });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('cart endpoint error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
