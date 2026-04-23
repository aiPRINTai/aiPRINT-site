// scripts/build-og-brand-strip.mjs
// Pre-renders /public/og-brand-strip.png — a 1200x110 opaque brand band
// that /api/og-share.js places DIRECTLY BELOW the preview (not as an
// overlay). This way the canvas height adapts to the preview aspect, so
// square/vertical/horizontal shares all look right — no cropping, no
// wasted space.
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
const H = 110;

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
  <rect x="0" y="0" width="${W}" height="${H}" fill="#0A0F1D"/>

  <!-- Thin accent line at top -->
  <rect x="0" y="0" width="${W}" height="3" fill="url(#accent)"/>

  <!-- Logo tile (mini favicon) -->
  <g transform="translate(28, 20)">
    <rect width="70" height="70" rx="14" fill="#0A0F1D" stroke="#242a45" stroke-width="1"/>
    <path d="M22 16 L35 9 L48 16" fill="none" stroke="url(#frame)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="9" y="16" width="52" height="47" rx="7" fill="url(#frame)"/>
    <rect x="13" y="20" width="44" height="39" rx="3.5" fill="#0A0F1D"/>
    <text x="35" y="50" text-anchor="middle" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="900" font-size="25" fill="url(#ink)">ai</text>
  </g>

  <!-- Wordmark + tagline (left) -->
  <text x="118" y="56" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="800" font-size="34" fill="#ffffff" letter-spacing="-1">aiPRINT<tspan fill="#A5B4FC">.ai</tspan></text>
  <text x="118" y="85" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="500" font-size="18" fill="#94a3b8">Premium AI-generated fine art prints</text>

  <!-- Right: share message -->
  <text x="${W - 30}" y="56" text-anchor="end" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="700" font-size="28" fill="#ffffff">Shared with you</text>
  <text x="${W - 30}" y="85" text-anchor="end" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="500" font-size="18" fill="#cbd5e1">Tap to view &amp; order — canvas · metal · acrylic</text>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log('Wrote', OUT);
