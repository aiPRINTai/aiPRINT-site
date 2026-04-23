// /api/s.js
// HTML stub for short-share URLs (/s/<slug>). Purpose: give iMessage, SMS,
// Slack, Twitter, etc. per-share Open Graph meta tags so the unfurl shows the
// actual generated artwork — not the generic site OG card. A browser landing
// here is immediately redirected to /?s=<slug> where the full design hydrates.
//
// Wired up via vercel.json: /s/:slug → /api/s?slug=:slug

import { getSharedDesign } from './db/index.js';
import { computeCanvasSize } from './og-share.js';

const SLUG_RE = /^[a-zA-Z0-9]{6,16}$/;

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s, n) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function renderStub({ slug, imageUrl, title, description, canonicalUrl, imgW, imgH }) {
  const safeTitle = esc(title);
  const safeDesc = esc(description);
  const safeImg = esc(imageUrl);
  const safeCanonical = esc(canonicalUrl);
  const safeSlug = esc(slug);
  const wh = (imgW && imgH)
    ? `<meta property="og:image:width" content="${imgW}" />\n  <meta property="og:image:height" content="${imgH}" />`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeTitle}</title>
<link rel="canonical" href="${safeCanonical}" />
<meta name="description" content="${safeDesc}" />
<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="aiPRINT.ai" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:url" content="${safeCanonical}" />
<meta property="og:image" content="${safeImg}" />
<meta property="og:image:alt" content="Custom print design shared on aiPRINT.ai" />
${wh}
<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<meta name="twitter:image" content="${safeImg}" />
<meta http-equiv="refresh" content="0; url=/?s=${safeSlug}" />
<style>body{margin:0;background:#0a0a0f;color:#eee;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}a{color:#a78bfa}</style>
</head>
<body>
  <div>
    <p style="font-size:14px;opacity:0.7;margin:0 0 8px">Loading your shared design…</p>
    <p style="font-size:12px;opacity:0.5;margin:0">If you are not redirected, <a href="/?s=${safeSlug}">tap here</a>.</p>
  </div>
  <script>window.location.replace('/?s=' + ${JSON.stringify(safeSlug)});</script>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    const slug = (req.query && (req.query.slug || req.query.s)) || '';
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = req.headers.host || 'aiprint.ai';
    const origin = `${proto}://${host}`;

    if (!slug || !SLUG_RE.test(slug)) {
      // Bad slug → send them to the home page.
      res.writeHead(302, { Location: '/' });
      return res.end();
    }

    const row = await getSharedDesign(slug).catch(() => null);
    const payload = row?.payload || null;

    // Derive meta fields. Fall back to generic values if the share is missing
    // or malformed (e.g. old slug purged, or a crawler probing a random path).
    const prompt = payload?.prompt || '';
    // og:image points at the dynamic branded composite (preview + aiPRINT.ai
    // wordmark strip), not the raw preview — so the iMessage/Slack unfurl
    // looks like a gallery card, not a loose image. og-share.js falls back
    // to /og-image.png if the slug is missing.
    const imageUrl = payload?.preview?.url
      ? `${origin}/api/og-share?slug=${encodeURIComponent(slug)}`
      : `${origin}/og-image.png`;
    // Canvas size adapts to the preview aspect so square/vertical/horizontal
    // shares all render without cropping or empty space. Dimensions MUST
    // match what og-share.js actually emits — we compute both from the same
    // computeCanvasSize() so they can never drift.
    let imgW = 1200;
    let imgH = 630;
    if (payload?.preview?.url && payload?.preview?.width && payload?.preview?.height) {
      const size = computeCanvasSize(payload.preview.width, payload.preview.height);
      imgW = size.width;
      imgH = size.height;
    }

    const title = prompt
      ? `Someone shared this custom print with you — aiPRINT.ai`
      : 'A custom print design on aiPRINT.ai';
    const description = prompt
      ? `"${truncate(prompt, 160)}" — tap to view and order this design on archival canvas, metal, or acrylic.`
      : 'Tap to view this AI-generated print design and order it on archival canvas, metal, or acrylic.';

    const canonicalUrl = `${origin}/s/${slug}`;

    const html = renderStub({
      slug,
      imageUrl,
      title,
      description,
      canonicalUrl,
      imgW,
      imgH
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache aggressively at the edge — the share payload is immutable.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
  } catch (err) {
    console.error('s handler error:', err?.message);
    // On error, degrade to home page rather than 500 — unfurls will miss the
    // dynamic OG but the user still lands somewhere useful.
    res.writeHead(302, { Location: '/' });
    return res.end();
  }
}
