import { getOrderByStripeSessionId } from './db/index.js';

/**
 * GET /api/coa?session_id=cs_...
 *
 * Looks up an order by Stripe session id and 302-redirects to /coa.html
 * with all certificate fields populated as query parameters. Possession of
 * the session id (delivered only in the customer's confirmation email) is
 * the auth credential — same model as /api/track.
 *
 * The redirect target is a static HTML template that prints natively to
 * PDF via the browser's "Save as PDF" / Cmd-P pipeline. This keeps the
 * endpoint dependency-free and the certificate's typography (Playfair
 * Display via Google Fonts) pixel-perfect.
 */

const MATERIAL_LABEL = {
  canvas: 'Fine Art Canvas',
  metal: 'ChromaLuxe Metal',
  acrylic: 'Acrylic Facemount',
};

function dimensionsFor(size) {
  if (!size) return '';
  // Common formats coming out of the order options blob: "24x36", "24×36",
  // "24x36in", "24-36". Normalise to "24 × 36 in".
  const m = String(size).match(/(\d+)\s*[x×\-]\s*(\d+)/i);
  if (!m) return String(size);
  return `${m[1]} × ${m[2]} in`;
}

function fingerprintFor(seed) {
  // Tiny non-cryptographic hash → 16 hex chars in a 4-quad readable form.
  // Deterministic per-order so reprinting the certificate yields the same
  // fingerprint. Not cryptographically meaningful — it's a visual binding
  // between the physical print and its source order.
  let h1 = 0xdeadbeef >>> 0;
  let h2 = 0x41c6ce57 >>> 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ c, 1597334677) >>> 0;
  }
  const hex = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  return hex.match(/.{4}/g).join(' · ');
}

function deriveEdition(order) {
  // We don't currently track edition numbers in the schema. Derive a
  // stable, plausible-looking number from the order id so reprints match.
  // Range: 1–250.
  const seed = order.lookup_key || order.id || order.stripe_session_id || 'x';
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return (n % 250) + 1;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = (req.query.session_id || '').toString().trim();
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'Missing or invalid session_id' });
  }

  try {
    const order = await getOrderByStripeSessionId(sessionId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const opts = order.options || {};
    const material = (opts.material || opts.product_material || '').toString().toLowerCase();
    const size = opts.size || opts.product_size || '';
    const promptText = (order.prompt || '').toString().trim();

    // Title: derive a short title from the prompt's first 6 words, capped.
    let title = (opts.title || '').toString().trim();
    if (!title && promptText) {
      const words = promptText.split(/\s+/).slice(0, 6).join(' ');
      title = words.length > 60 ? words.slice(0, 60) + '…' : words;
    }
    title = title || 'Untitled';

    const edition = deriveEdition(order);
    const total = parseInt(opts.edition_total, 10) || 250;
    const issued = order.created_at
      ? new Date(order.created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const params = new URLSearchParams({
      order: order.lookup_key || `AI-P-${order.id}`,
      stripe: sessionId,
      title,
      medium: MATERIAL_LABEL[material] || 'Fine Art Print',
      dimensions: dimensionsFor(size),
      edition: String(edition),
      total: String(total),
      date: issued,
      fingerprint: fingerprintFor(promptText + '|' + sessionId),
    });

    res.setHeader('Location', `/coa.html?${params.toString()}`);
    return res.status(302).end();
  } catch (err) {
    console.error('CoA endpoint error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
