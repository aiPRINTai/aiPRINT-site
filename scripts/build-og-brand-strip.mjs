// scripts/build-og-brand-strip.mjs
// Pre-renders /public/og-brand-strip.png — a 1200x180 opaque brand band
// that /api/og-share.js places DIRECTLY BELOW the preview (not as an
// overlay). Height and type were bumped after testing on iMessage: at
// mobile unfurl widths a 110px strip with 34pt type rendered too small
// to read, so we went 180px tall with 48pt wordmark + 40pt CTA.
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
  <rect x="0" y="0" width="${W}" height="${H}" fill="#0A0F1D"/>

  <!-- Thicker accent line at top — reads even when iMessage scales the card -->
  <rect x="0" y="0" width="${W}" height="5" fill="url(#accent)"/>

  <!-- Logo tile (mini favicon) — 120x120 -->
  <g transform="translate(32, 30)">
    <rect width="120" height="120" rx="22" fill="#0A0F1D" stroke="#242a45" stroke-width="1"/>
    <path d="M38 28 L60 16 L82 28" fill="none" stroke="url(#frame)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="16" y="28" width="88" height="80" rx="11" fill="url(#frame)"/>
    <rect x="22" y="34" width="76" height="68" rx="6" fill="#0A0F1D"/>
    <text x="60" y="86" text-anchor="middle" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="900" font-size="44" fill="url(#ink)">ai</text>
  </g>

  <!-- Wordmark + tagline (left) -->
  <text x="170" y="92" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="800" font-size="54" fill="#ffffff" letter-spacing="-1.5">aiPRINT<tspan fill="#A5B4FC">.ai</tspan></text>
  <text x="170" y="134" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="500" font-size="26" fill="#94a3b8">Premium AI-generated fine art prints</text>

  <!-- Right: share message -->
  <text x="${W - 32}" y="92" text-anchor="end" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="700" font-size="44" fill="#ffffff">Shared with you</text>
  <text x="${W - 32}" y="134" text-anchor="end" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="500" font-size="26" fill="#cbd5e1">Tap to view &amp; order — canvas · metal · acrylic</text>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log('Wrote', OUT);
