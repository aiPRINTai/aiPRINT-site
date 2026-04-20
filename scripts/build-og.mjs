#!/usr/bin/env node
// Build the OG / Twitter social share card.
// Outputs: public/og-image.png (1200×630)
// Run: node scripts/build-og.mjs
//
// Design philosophy: share cards render TINY in iMessage/X previews.
// The whole thing has to read in under a second. So:
//   • ONE big image (actual art, not decoration)
//   • ONE big headline
//   • ONE short tagline
//   • Logo + accent, nothing else
// Cut: eyebrow pill, subtitle, trust chips — those live on the site.
//
// Accent is warm amber (not hot pink) — pairs with deep indigo for a
// gallery-grade twilight feel.

import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');

const W = 1200;
const H = 630;

const AMBER      = '#FBBF24';
const AMBER_DIM  = '#F59E0B';
const AMBER_SOFT = '#FCD34D';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0"    stop-color="#0A0F1D"/>
      <stop offset="0.55" stop-color="#1E1B4B"/>
      <stop offset="1"    stop-color="#4C1D95"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.92" cy="1.05" r="0.75">
      <stop offset="0"   stop-color="${AMBER}" stop-opacity="0.18"/>
      <stop offset="0.5" stop-color="#a78bfa" stop-opacity="0.14"/>
      <stop offset="1"   stop-color="#a78bfa" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="-0.05" cy="-0.15" r="0.6">
      <stop offset="0" stop-color="#818cf8" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#818cf8" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="wmLetters" x1="0.15" y1="0.1" x2="0.85" y2="0.95">
      <stop offset="0"    stop-color="#E9E5FF"/>
      <stop offset="0.45" stop-color="#A5B4FC"/>
      <stop offset="1"    stop-color="#5B5FEF"/>
    </linearGradient>
    <linearGradient id="wmFrame" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0"    stop-color="#C4B5FD"/>
      <stop offset="0.55" stop-color="#8B8CF5"/>
      <stop offset="1"    stop-color="#6366F1"/>
    </linearGradient>

    <!-- HERO ART: twilight sky -->
    <linearGradient id="artSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#1E1B4B"/>
      <stop offset="0.35" stop-color="#4C1D95"/>
      <stop offset="0.65" stop-color="#9D174D"/>
      <stop offset="0.82" stop-color="#DC2626"/>
      <stop offset="0.92" stop-color="#F59E0B"/>
      <stop offset="1"    stop-color="#FCD34D"/>
    </linearGradient>
    <radialGradient id="artSun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0"    stop-color="#FEF3C7"/>
      <stop offset="0.35" stop-color="${AMBER_SOFT}"/>
      <stop offset="0.7"  stop-color="${AMBER_DIM}"/>
      <stop offset="1"    stop-color="${AMBER_DIM}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="artSunHalo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0"   stop-color="${AMBER}" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#EC4899" stop-opacity="0.18"/>
      <stop offset="1"   stop-color="#EC4899" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="artMist" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#FDE68A" stop-opacity="0.25"/>
      <stop offset="1"   stop-color="#FDE68A" stop-opacity="0"/>
    </linearGradient>

    <!-- Larger polaroid: 288×376. Art window inset 18 from edges. -->
    <clipPath id="artClip">
      <rect x="18" y="18" width="252" height="290"/>
    </clipPath>

    <pattern id="grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="rgba(255,255,255,0.035)" stroke-width="1"/>
    </pattern>
    <radialGradient id="gridFade" cx="0.5" cy="0.5" r="0.65">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="gridMask">
      <rect width="${W}" height="${H}" fill="url(#gridFade)"/>
    </mask>
  </defs>

  <!-- Backdrop -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#gridMask)"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>

  <!-- ============================================================ -->
  <!-- HERO: larger gallery print on the right — twilight landscape -->
  <!-- ============================================================ -->
  <g transform="translate(830, 105) rotate(5)">
    <!-- Drop shadow -->
    <rect x="8" y="14" width="288" height="400" rx="6" fill="rgba(0,0,0,0.45)"/>
    <!-- Paper -->
    <rect width="288" height="400" rx="6" fill="#F8FAFC"/>

    <!-- Art window (scaled up proportionally) -->
    <g clip-path="url(#artClip)">
      <rect x="18" y="18" width="252" height="290" fill="url(#artSky)"/>
      <circle cx="160" cy="196" r="150" fill="url(#artSunHalo)"/>
      <g fill="#F5F3FF" opacity="0.85">
        <circle cx="44"  cy="44"  r="1.2"/>
        <circle cx="82"  cy="28"  r="0.9"/>
        <circle cx="124" cy="56"  r="1.4"/>
        <circle cx="182" cy="34"  r="1.0"/>
        <circle cx="224" cy="68"  r="1.2"/>
        <circle cx="254" cy="40"  r="0.8"/>
        <circle cx="56"  cy="84"  r="1.0"/>
        <circle cx="100" cy="108" r="0.9"/>
        <circle cx="238" cy="112" r="1.0"/>
        <circle cx="34"  cy="126" r="0.9"/>
        <circle cx="262" cy="154" r="0.9"/>
      </g>
      <!-- Sun -->
      <circle cx="160" cy="196" r="32" fill="url(#artSun)"/>

      <!-- Far range (hazy violet) -->
      <path d="M 18 232
               L 46 208
               L 72 222
               L 102 200
               L 130 218
               L 160 198
               L 190 214
               L 220 200
               L 248 218
               L 270 210
               L 270 308
               L 18 308 Z"
            fill="#7C3AED" opacity="0.55"/>

      <!-- Mid range -->
      <path d="M 18 260
               L 38 242
               L 64 256
               L 92 232
               L 118 250
               L 148 230
               L 176 250
               L 210 234
               L 238 256
               L 270 240
               L 270 308
               L 18 308 Z"
            fill="#4C1D95" opacity="0.85"/>

      <!-- Horizon mist -->
      <rect x="18" y="268" width="252" height="16" fill="url(#artMist)"/>

      <!-- Front ridge -->
      <path d="M 18 290
               L 32 278
               L 54 286
               L 78 268
               L 106 282
               L 138 264
               L 172 280
               L 206 266
               L 244 282
               L 270 274
               L 270 308
               L 18 308 Z"
            fill="#0B1020"/>

      <!-- Lone pine (scale cue) -->
      <g transform="translate(70, 276)" fill="#050714">
        <rect x="-1.4" y="7" width="2.8" height="18"/>
        <path d="M -9 11 L 0 -7 L 9 11 Z"/>
        <path d="M -8 4 L 0 -11 L 8 4 Z"/>
        <path d="M -7 -3 L 0 -16 L 7 -3 Z"/>
      </g>
    </g>

    <!-- Window inner edge -->
    <rect x="18" y="18" width="252" height="290" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>

    <!-- Caption -->
    <text x="144" y="350" text-anchor="middle"
          font-family="'Playfair Display', Georgia, serif"
          font-style="italic" font-size="22" fill="#0B1020">Dusk Over the Valley</text>

    <!-- Edition pill -->
    <g transform="translate(144, 366)">
      <rect x="-60" y="-2" width="120" height="20" rx="10" fill="#0B1020"/>
      <text x="0" y="12" text-anchor="middle"
            font-family="ui-sans-serif, system-ui, Arial, sans-serif"
            font-size="11" font-weight="700" letter-spacing="3" fill="${AMBER}">NO. 037 / 250</text>
    </g>
  </g>

  <!-- ============================================================ -->
  <!-- Wordmark (top-left) -->
  <!-- ============================================================ -->
  <g transform="translate(64, 64)">
    <g transform="scale(0.875)">
      <rect width="64" height="64" rx="13" fill="#0A0F1D"/>
      <path d="M20 12 L32 5 L44 12" fill="none" stroke="url(#wmFrame)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="7" y="12" width="50" height="46" rx="7" fill="url(#wmFrame)"/>
      <rect x="12" y="17" width="40" height="36" rx="3.5" fill="#0A0F1D"/>
      <path fill="url(#wmLetters)" d="M25.789 47.332L25.789 47.332Q24.012 47.332 22.626 46.726Q21.240 46.120 20.459 44.900Q19.679 43.680 19.679 41.854L19.679 41.854Q19.679 40.310 20.219 39.247Q20.758 38.185 21.721 37.521Q22.684 36.856 23.929 36.508Q25.174 36.159 26.585 36.043L26.585 36.043Q28.163 35.910 29.125 35.752Q30.088 35.595 30.537 35.279Q30.985 34.964 30.985 34.399L30.985 34.399L30.985 34.333Q30.985 33.686 30.686 33.237Q30.387 32.789 29.823 32.557Q29.258 32.324 28.461 32.324L28.461 32.324Q27.665 32.324 27.042 32.557Q26.419 32.789 26.021 33.221Q25.623 33.652 25.457 34.233L25.457 34.233L20.210 33.553Q20.576 31.959 21.646 30.755Q22.717 29.552 24.452 28.879Q26.187 28.207 28.511 28.207L28.511 28.207Q30.238 28.207 31.740 28.614Q33.243 29.021 34.372 29.809Q35.500 30.598 36.131 31.751Q36.762 32.905 36.762 34.399L36.762 34.399L36.762 47L31.317 47L31.317 44.394L31.167 44.394Q30.669 45.356 29.897 46.004Q29.125 46.651 28.104 46.992Q27.083 47.332 25.789 47.332ZM27.548 43.497L27.548 43.497Q28.528 43.497 29.316 43.099Q30.105 42.700 30.570 42.003Q31.035 41.306 31.035 40.393L31.035 40.393L31.035 38.616Q30.786 38.749 30.412 38.865Q30.039 38.981 29.590 39.073Q29.142 39.164 28.694 39.239Q28.246 39.313 27.831 39.380L27.831 39.380Q26.984 39.496 26.386 39.778Q25.789 40.061 25.473 40.509Q25.158 40.957 25.158 41.588L25.158 41.588Q25.158 42.202 25.473 42.625Q25.789 43.049 26.320 43.273Q26.851 43.497 27.548 43.497ZM45.891 47L40.097 47L40.097 28.439L45.891 28.439L45.891 47ZM42.986 26.265L42.986 26.265Q41.757 26.265 40.877 25.443Q39.998 24.621 39.998 23.476L39.998 23.476Q39.998 22.313 40.877 21.500Q41.757 20.687 42.986 20.687L42.986 20.687Q44.231 20.687 45.111 21.492Q45.991 22.297 45.991 23.476L45.991 23.476Q45.991 24.638 45.111 25.451Q44.231 26.265 42.986 26.265Z"/>
    </g>
    <text x="70" y="39"
          font-family="ui-sans-serif, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="28" font-weight="800" letter-spacing="-0.3"
          fill="#ffffff">aiPRINT<tspan fill="${AMBER}">.ai</tspan></text>
  </g>

  <!-- ============================================================ -->
  <!-- HEADLINE — the whole message -->
  <!-- ============================================================ -->
  <g transform="translate(64, 252)">
    <text font-family="ui-sans-serif, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-weight="900" font-size="104" letter-spacing="-3.5" fill="#ffffff">
      <tspan x="0" y="0">Imagine it.</tspan>
      <tspan x="0" y="108">Print it.</tspan>
      <tspan x="0" y="216" fill="${AMBER}">Hang it.</tspan>
    </text>
  </g>

  <!-- ============================================================ -->
  <!-- One-line tagline — fast credibility, no noise -->
  <!-- ============================================================ -->
  <g transform="translate(64, 578)">
    <text font-family="ui-sans-serif, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="18" font-weight="600" letter-spacing="2"
          fill="rgba(231,238,248,0.72)">GALLERY-QUALITY · ARCHIVAL · NUMBERED</text>
  </g>
</svg>`;

async function main() {
  const out = join(PUBLIC, 'og-image.png');
  await sharp(Buffer.from(svg)).resize(W, H).png({ compressionLevel: 9 }).toFile(out);
  console.log(`✓ og-image.png (${W}×${H})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
