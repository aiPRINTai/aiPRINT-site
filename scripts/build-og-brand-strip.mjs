// scripts/build-og-brand-strip.mjs
// Pre-renders /public/og-brand-strip.png — a 1200x630 transparent PNG with
// the aiPRINT.ai brand strip baked across the bottom. /api/og-share.js
// composites this over the per-share preview at request time, so no fonts
// need to resolve in the Vercel serverless runtime.
//
// Run: `node scripts/build-og-brand-strip.mjs`

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/og-brand-strip.png');

const W = 1200;
const H = 630;

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
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

  <!-- bottom fade so text is readable on any preview -->
  <rect x="0" y="380" width="${W}" height="${H - 380}" fill="url(#fade)"/>

  <!-- Logo tile (mini favicon) -->
  <g transform="translate(40, 510)">
    <rect width="80" height="80" rx="16" fill="#0A0F1D" stroke="#1a1f33" stroke-width="1"/>
    <path d="M25 18 L40 10 L55 18" fill="none" stroke="url(#frame)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="10" y="18" width="60" height="54" rx="8" fill="url(#frame)"/>
    <rect x="15" y="23" width="50" height="44" rx="4" fill="#0A0F1D"/>
    <text x="40" y="58" text-anchor="middle" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="900" font-size="28" fill="url(#ink)">ai</text>
  </g>

  <!-- Wordmark + tagline (left) -->
  <text x="140" y="548" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="800" font-size="40" fill="#ffffff" letter-spacing="-1">aiPRINT<tspan fill="#A5B4FC">.ai</tspan></text>
  <text x="140" y="582" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="500" font-size="22" fill="#cbd5e1">Premium AI-generated fine art prints</text>

  <!-- Right: share message -->
  <text x="${W - 40}" y="548" text-anchor="end" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="700" font-size="30" fill="#ffffff">Shared with you</text>
  <text x="${W - 40}" y="582" text-anchor="end" font-family="'Helvetica Neue','Inter',Arial,sans-serif" font-weight="500" font-size="22" fill="#cbd5e1">Tap to view &amp; order — canvas · metal · acrylic</text>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log('Wrote', OUT);
