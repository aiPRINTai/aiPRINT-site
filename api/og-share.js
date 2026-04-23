// /api/og-share.js
// Dynamic branded Open Graph image for /s/<slug> unfurls. Composites the
// shared preview onto a 1200x630 canvas with an aiPRINT.ai wordmark strip
// at the bottom — so iMessage/SMS/Slack previews look like a gallery card
// instead of a raw image dump.
//
// Wired up via /api/s.js, which emits `<meta property="og:image"
// content="/api/og-share?slug=<slug>">`.

import sharp from 'sharp';
import { getSharedDesign } from './db/index.js';

const SLUG_RE = /^[a-zA-Z0-9]{6,16}$/;
const WIDTH = 1200;
const HEIGHT = 630;

// Bottom branded strip: logo tile on the left, wordmark next to it, tagline
// on the right. Fade gradient behind it so it reads on any preview.
function brandOverlaySvg() {
  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#050816" stop-opacity="0"/>
        <stop offset="0.55" stop-color="#050816" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#050816" stop-opacity="0.98"/>
      </linearGradient>
      <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#E9E5FF"/>
        <stop offset="0.6" stop-color="#A5B4FC"/>
        <stop offset="1" stop-color="#6366F1"/>
      </linearGradient>
      <linearGradient id="frame" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0" stop-color="#C4B5FD"/>
        <stop offset="0.55" stop-color="#8B8CF5"/>
        <stop offset="1" stop-color="#6366F1"/>
      </linearGradient>
    </defs>

    <!-- Bottom fade so the brand strip reads on bright previews -->
    <rect x="0" y="380" width="${WIDTH}" height="${HEIGHT - 380}" fill="url(#fade)"/>

    <!-- Logo tile (mini favicon): navy rect + frame + 'ai' wordmark -->
    <g transform="translate(40, 510)">
      <rect width="80" height="80" rx="16" fill="#0A0F1D" stroke="#1a1f33" stroke-width="1"/>
      <!-- Hang wire V -->
      <path d="M25 18 L40 10 L55 18" fill="none" stroke="url(#frame)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Frame outer -->
      <rect x="10" y="18" width="60" height="54" rx="8" fill="url(#frame)"/>
      <!-- Frame inner matte -->
      <rect x="15" y="23" width="50" height="44" rx="4" fill="#0A0F1D"/>
      <!-- 'ai' mark -->
      <text x="40" y="58" text-anchor="middle" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="900" font-size="28" fill="url(#ink)">ai</text>
    </g>

    <!-- Wordmark + tagline -->
    <text x="140" y="548" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="800" font-size="40" fill="#ffffff" letter-spacing="-1">aiPRINT<tspan fill="#A5B4FC">.ai</tspan></text>
    <text x="140" y="582" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="500" font-size="22" fill="#cbd5e1">Premium AI-generated fine art prints</text>

    <!-- Right: share message -->
    <text x="${WIDTH - 40}" y="548" text-anchor="end" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="700" font-size="30" fill="#ffffff">🎨 Shared with you</text>
    <text x="${WIDTH - 40}" y="582" text-anchor="end" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="500" font-size="22" fill="#cbd5e1">Tap to view &amp; order — canvas · metal · acrylic</text>
  </svg>`;
}

async function fetchBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export default async function handler(req, res) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers.host || 'aiprint.ai';
  const origin = `${proto}://${host}`;

  try {
    const slug = (req.query && (req.query.slug || req.query.s)) || '';
    if (!slug || !SLUG_RE.test(slug)) {
      res.writeHead(302, { Location: '/og-image.png' });
      return res.end();
    }

    const row = await getSharedDesign(slug).catch(() => null);
    const previewUrl = row?.payload?.preview?.url;

    if (!previewUrl) {
      // No preview on file — fall back to the static site OG so the unfurl
      // still looks branded rather than broken.
      res.writeHead(302, { Location: '/og-image.png' });
      return res.end();
    }

    // Pull the preview and cover-fit it onto the 1200x630 OG canvas.
    const previewBuf = await fetchBuffer(previewUrl);
    const coverBuf = await sharp(previewBuf)
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
      .toBuffer();

    const composited = await sharp(coverBuf)
      .composite([{ input: Buffer.from(brandOverlaySvg()), top: 0, left: 0 }])
      .png({ compressionLevel: 8 })
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    // Immutable per-share — cache hard at the edge so repeated crawls are free.
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).send(composited);
  } catch (err) {
    console.error('og-share error:', err?.message);
    // On any failure, redirect to the static OG so the unfurl doesn't break.
    res.writeHead(302, { Location: `${origin}/og-image.png` });
    return res.end();
  }
}
