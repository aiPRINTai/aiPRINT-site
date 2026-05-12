// Build the social-share OG image: 1200x630 PNG.
// Composition:
//   - Right ~58%: cropped aurora artwork (scroll-stopping hero)
//   - Left ~42%: dark gradient panel with strong typography
//   - Subtle "edition stamp" mini-COA in bottom-right for craft signal
// Output: public/og-image.png (replaces existing)

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const W = 1200;
const H = 630;

const heroPath = resolve(ROOT, 'public/ai-art/art-aurora.webp');
const outPath = resolve(ROOT, 'public/og-image.png');

// Crop hero to fit the right 58% of canvas (700px wide, 630px tall).
// Aurora source is 1248x832 landscape — centre-crop & rescale to target.
const heroW = 700;
const heroFull = await sharp(heroPath)
  .resize({ width: heroW, height: H, fit: 'cover', position: 'centre' })
  .png()
  .toBuffer();

// Soft right-edge bleed: feather the aurora into the dark panel so left transition is organic.
// Build a horizontal gradient mask: opaque at left edge (0px) → fully visible at ~120px → carry to right.
const featherSvg = `
<svg width="${heroW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="white" stop-opacity="0"/>
      <stop offset="0.18" stop-color="white" stop-opacity="1"/>
      <stop offset="1" stop-color="white" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;

const featherMask = await sharp(Buffer.from(featherSvg)).png().toBuffer();
const heroFeathered = await sharp(heroFull)
  .composite([{ input: featherMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

// Build the SVG text overlay for the left panel.
// Brand colors aligned to site:
//   bg: #0a0f1d, ink: #e7eef8, accent purple: #818cf8 → #c084fc, gold: #fbbf24
const overlaySvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Dark panel base -->
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0a0f1d" stop-opacity="1"/>
      <stop offset="0.45" stop-color="#0a0f1d" stop-opacity="1"/>
      <stop offset="0.62" stop-color="#0a0f1d" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#0a0f1d" stop-opacity="0"/>
    </linearGradient>
    <!-- Headline gradient (matches site Tailwind indigo→purple) -->
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a5b4fc"/>
      <stop offset="0.55" stop-color="#818cf8"/>
      <stop offset="1" stop-color="#c084fc"/>
    </linearGradient>
    <!-- Soft inner glow under the headline for legibility over any aurora bleed -->
    <filter id="softshadow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="6"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
    </filter>
  </defs>

  <!-- Dark gradient panel (sits OVER feathered aurora to make text readable) -->
  <rect width="100%" height="100%" fill="url(#panel)"/>

  <!-- Logo lockup, top-left — real aiPRINT picture-frame favicon embedded inline, then wordmark -->
  <g transform="translate(60, 56)">
    <!-- Logo tile, scaled from 64×64 → 52×52, navy background visible through it -->
    <g transform="translate(0, 0) scale(0.8125)">
      <rect width="64" height="64" rx="13" fill="#0A0F1D"/>
      <path d="M20 12 L32 5 L44 12" fill="none" stroke="#8B8CF5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="7" y="12" width="50" height="46" rx="7" fill="#8B8CF5"/>
      <rect x="12" y="17" width="40" height="36" rx="3.5" fill="#0A0F1D"/>
      <path fill="#A5B4FC" d="M25.789 47.332L25.789 47.332Q24.012 47.332 22.626 46.726Q21.240 46.120 20.459 44.900Q19.679 43.680 19.679 41.854L19.679 41.854Q19.679 40.310 20.219 39.247Q20.758 38.185 21.721 37.521Q22.684 36.856 23.929 36.508Q25.174 36.159 26.585 36.043L26.585 36.043Q28.163 35.910 29.125 35.752Q30.088 35.595 30.537 35.279Q30.985 34.964 30.985 34.399L30.985 34.399L30.985 34.333Q30.985 33.686 30.686 33.237Q30.387 32.789 29.823 32.557Q29.258 32.324 28.461 32.324L28.461 32.324Q27.665 32.324 27.042 32.557Q26.419 32.789 26.021 33.221Q25.623 33.652 25.457 34.233L25.457 34.233L20.210 33.553Q20.576 31.959 21.646 30.755Q22.717 29.552 24.452 28.879Q26.187 28.207 28.511 28.207L28.511 28.207Q30.238 28.207 31.740 28.614Q33.243 29.021 34.372 29.809Q35.500 30.598 36.131 31.751Q36.762 32.905 36.762 34.399L36.762 34.399L36.762 47L31.317 47L31.317 44.394L31.167 44.394Q30.669 45.356 29.897 46.004Q29.125 46.651 28.104 46.992Q27.083 47.332 25.789 47.332ZM27.548 43.497L27.548 43.497Q28.528 43.497 29.316 43.099Q30.105 42.700 30.570 42.003Q31.035 41.306 31.035 40.393L31.035 40.393L31.035 38.616Q30.786 38.749 30.412 38.865Q30.039 38.981 29.590 39.073Q29.142 39.164 28.694 39.239Q28.246 39.313 27.831 39.380L27.831 39.380Q26.984 39.496 26.386 39.778Q25.789 40.061 25.473 40.509Q25.158 40.957 25.158 41.588L25.158 41.588Q25.158 42.202 25.473 42.625Q25.789 43.049 26.320 43.273Q26.851 43.497 27.548 43.497ZM45.891 47L40.097 47L40.097 28.439L45.891 28.439L45.891 47ZM42.986 26.265L42.986 26.265Q41.757 26.265 40.877 25.443Q39.998 24.621 39.998 23.476L39.998 23.476Q39.998 22.313 40.877 21.500Q41.757 20.687 42.986 20.687L42.986 20.687Q44.231 20.687 45.111 21.492Q45.991 22.297 45.991 23.476L45.991 23.476Q45.991 24.638 45.111 25.451Q44.231 26.265 42.986 26.265Z"/>
    </g>
    <!-- Wordmark to the right of the logo tile -->
    <text x="68" y="38" font-family="ui-sans-serif, system-ui, Helvetica, Arial" font-size="28" font-weight="800" fill="#e7eef8" letter-spacing="-0.5">aiPRINT.<tspan fill="#a5b4fc">ai</tspan></text>
  </g>

  <!-- Eyebrow — small but bumped from 16→22pt so it survives iMessage scaling -->
  <text x="60" y="186" font-family="ui-sans-serif, system-ui, Helvetica, Arial" font-size="22" font-weight="800" fill="#a5b4fc" letter-spacing="4">AI FINE-ART PRINTS</text>

  <!-- Big headline: tagline. Second line in accent gradient lands the punch word. -->
  <text x="60" y="282" font-family="ui-sans-serif, system-ui, Helvetica, Arial" font-size="74" font-weight="900" fill="#ffffff" letter-spacing="-2">Where pixels</text>
  <text x="60" y="362" font-family="ui-sans-serif, system-ui, Helvetica, Arial" font-size="74" font-weight="900" fill="url(#accent)" letter-spacing="-2.5">become permanent.</text>

  <!-- Supporting line — bumped from 22→32pt; readable at iMessage scale -->
  <text x="60" y="430" font-family="ui-sans-serif, system-ui, Helvetica, Arial" font-size="32" font-weight="600" fill="#e2e8f0" letter-spacing="-0.5">Type a prompt → print on your wall.</text>

  <!-- Trust pills row: price · materials · delivery; bigger and chunkier -->
  <g transform="translate(60, 478)">
    <!-- From $45 (gold anchor) — pill 56 tall, text 22pt -->
    <rect x="0" y="0" width="152" height="56" rx="28" fill="#fbbf24"/>
    <text x="76" y="36" font-family="ui-sans-serif, system-ui, Helvetica, Arial" font-size="22" font-weight="900" fill="#0a0f1d" text-anchor="middle">FROM $45</text>

    <!-- Materials pill — what we print on -->
    <rect x="166" y="0" width="282" height="56" rx="28" fill="none" stroke="#64748b" stroke-width="2"/>
    <text x="307" y="36" font-family="ui-sans-serif, system-ui, Helvetica, Arial" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">CANVAS · METAL · ACRYLIC</text>

    <!-- Delivery pill -->
    <rect x="462" y="0" width="186" height="56" rx="28" fill="none" stroke="#64748b" stroke-width="2"/>
    <text x="555" y="36" font-family="ui-sans-serif, system-ui, Helvetica, Arial" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">SHIPS 5–10 DAYS</text>
  </g>
</svg>`;

const overlay = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

// Compose final image
await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 10, g: 15, b: 29, alpha: 1 } },
})
  // Hero aurora on the right
  .composite([
    { input: heroFeathered, left: W - heroW, top: 0 },
    // Overlay text + gradient panel on top
    { input: overlay, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9, palette: false })
  .toFile(outPath);

console.log(`Wrote ${outPath}`);
