// scripts/build-og-brand-strip.mjs
// Pre-renders /public/og-brand-strip.png — a 1200x180 opaque brand band
// that /api/og-share.js places DIRECTLY BELOW the preview (not as an
// overlay).
//
// Design notes:
//   - The strip deliberately DOES NOT include an "aiPRINT.ai" wordmark.
//     Every unfurl host (iMessage, Slack, Twitter, email) appends our
//     domain/site_name below the image automatically, so a wordmark in
//     the strip was just being triplicated with the host's own domain
//     line. The favicon tile at left is the only brand anchor.
//   - Message hierarchy is therefore inverted vs. the original: headline
//     "Shared with you" on the left, CTA "Tap to view & order" on the
//     right, with short support copy underneath each.
//
// Baked at build time with my local fonts (Inter/Helvetica Neue) so no
// fonts need to resolve in the Vercel serverless runtime.
//
// Run: `node scripts/build-og-brand-strip.mjs`

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/og-brand-strip.png');

const W = 1200;
const H = 180;

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
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
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6366F1"/>
      <stop offset="0.5" stop-color="#A855F7"/>
      <stop offset="1" stop-color="#EC4899"/>
    </linearGradient>
  </defs>

  <!-- Solid dark band -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="#000000"/>

  <!-- Thicker accent line at top — reads even when iMessage scales the card -->
  <rect x="0" y="0" width="${W}" height="5" fill="url(#accent)"/>

  <!-- Logo tile (mini favicon) — 120x120 -->
  <g transform="translate(32, 30)">
    <rect width="120" height="120" rx="22" fill="#000000" stroke="#242a45" stroke-width="1"/>
    <path d="M38 28 L60 16 L82 28" fill="none" stroke="url(#frame)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="16" y="28" width="88" height="80" rx="11" fill="url(#frame)"/>
    <rect x="22" y="34" width="76" height="68" rx="6" fill="#000000"/>
    <text x="60" y="86" text-anchor="middle" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="900" font-size="44" fill="url(#ink)">ai</text>
  </g>

  <!-- Three-zone layout at 1200x180:
         LEFT    — logo tile + "Shared with you" headline + subtitle
         CENTER  — aiPRINT.ai wordmark (single brand anchor, keeps the
                   strip tied to the site so the image stands alone even
                   when reposted outside a chat context)
         RIGHT   — "Tap to view & order" CTA + materials
       Side fonts were shrunk vs. the previous layout (54→42 and 44→36)
       to carve out horizontal space for the center wordmark without
       growing the strip height. -->

  <!-- Left -->
  <text x="170" y="92" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="800" font-size="42" fill="#ffffff" letter-spacing="-1.2">Shared with you</text>
  <text x="170" y="130" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="500" font-size="22" fill="#94a3b8">A custom AI-generated fine art print</text>

  <!-- Center wordmark, optically centered between left and right zones -->
  <text x="684" y="118" text-anchor="middle" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="800" font-size="44" fill="#ffffff" letter-spacing="-1.4">aiPRINT<tspan fill="#A5B4FC">.ai</tspan></text>

  <!-- Right -->
  <text x="${W - 32}" y="92" text-anchor="end" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="700" font-size="36" fill="#ffffff">Tap to view &amp; order</text>
  <text x="${W - 32}" y="130" text-anchor="end" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="500" font-size="22" fill="#cbd5e1">canvas · metal · acrylic</text>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log('Wrote', OUT);
