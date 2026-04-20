#!/usr/bin/env node
// Generate warm, human-feeling photographs for the homepage "How it works"
// cards using the same Gemini 2.5 Flash Image model that powers the site's
// customer-facing generator. Also renders a simple, navy-dark OG card that
// matches the original site aesthetic (bold sans headline, no Playfair).
//
// Run: node scripts/build-step-photos.mjs
// Env: GOOGLE_GEMINI_API_KEY must be set (read from .env.local if present)

import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

// Tiny .env.local loader so we don't need dotenv as a dep.
async function loadEnvLocal() {
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) return;
  const raw = await readFile(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

async function genGemini({ prompt, aspectRatio = '3:2' }) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY is required');

  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio },
        },
      }),
    },
  );

  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Bad JSON from Gemini: ${text.slice(0, 300)}`); }
  if (!resp.ok) {
    const msg = data?.error?.message || `Gemini API error ${resp.status}`;
    throw new Error(msg);
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  const imagePart = parts?.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) throw new Error('Gemini returned no image');
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

// Deliberately photographic, warm, and low-key — not illustration-y. Each
// prompt calls out composition + mood so the three images feel like a set.
const STEP_PROMPTS = {
  'step-1': `A cinematic, moody editorial photograph shot on medium-format film. A person's hands typing on a sleek modern laptop in a warm home studio. Soft golden-hour window light from the left, dust motes in the air. A small indigo mug and a notebook with a fountain pen nearby. A window view hints at a calm city evening. Negative space on the right side of the frame. Muted palette of deep navy, warm amber, and a gentle indigo rim light. Shallow depth of field, f/2.8. Tasteful, premium, human. No on-screen UI visible.`,
  'step-2': `A cinematic, moody editorial photograph. A close-up of a large-format fine-art inkjet printer in a working artist's studio, an archival print of abstract twilight-blue landscape art just emerging from the rollers. Warm lamp on the left, printer's soft indigo status LED glow. Visible paper texture. Clean, organized studio with a wooden workbench in the background, slightly out of focus. Deep navy walls, warm amber accents, subtle indigo highlights. Shallow depth of field, shot on a 50mm lens. Tactile, quiet, premium.`,
  'step-3': `A cinematic, editorial interior photograph of a styled modern living room. A single large framed fine-art print — a serene abstract dusk landscape in blues and violets — hangs centered above a low walnut console. Beneath it, a brass table lamp, a ceramic vase with dried pampas, and an open hardcover book. Warm natural daylight streams in from a window on the left. Walls in warm neutral plaster. Oak floor. No people. Wide shot with architectural composition. Muted, premium, like an Architectural Digest frame. Shot on a 35mm lens, f/4.`,
};

async function saveJpeg(buf, filename, { width = 1600 } = {}) {
  const out = join(PUBLIC, 'illustrations', filename);
  await sharp(buf).resize(width, null, { withoutEnlargement: true }).jpeg({ quality: 86, progressive: true, mozjpeg: true }).toFile(out);
  const sz = (await import('node:fs')).default.statSync(out).size;
  console.log(`✓ ${filename}  ${(sz / 1024).toFixed(0)} KB`);
  return out;
}

async function buildStepPhotos() {
  for (const [name, prompt] of Object.entries(STEP_PROMPTS)) {
    console.log(`→ generating ${name}...`);
    const raw = await genGemini({ prompt, aspectRatio: '3:2' });
    await saveJpeg(raw, `${name}.jpg`, { width: 1600 });
  }
}

// Simple OG: navy canvas, bold sans headline with sky-blue ".ai" accent,
// subtle indigo/violet gradient — no Playfair, no floating art frame.
async function buildSimpleOg() {
  const W = 1200;
  const H = 630;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0A0F1D"/>
        <stop offset="1" stop-color="#0B1020"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.85" cy="1.1" r="0.8">
        <stop offset="0" stop-color="#6366f1" stop-opacity="0.45"/>
        <stop offset="0.5" stop-color="#a78bfa" stop-opacity="0.2"/>
        <stop offset="1" stop-color="#a78bfa" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <g transform="translate(72, 100)">
      <text font-family="ui-sans-serif, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="-0.5" fill="#ffffff">aiPRINT<tspan fill="#7DD3FC">.ai</tspan></text>
    </g>
    <g transform="translate(72, 260)">
      <text font-family="ui-sans-serif, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="76" font-weight="900" letter-spacing="-2" fill="#ffffff">
        <tspan x="0" y="0">Turn any idea into a</tspan>
        <tspan x="0" y="92" fill="#a5b4fc">gallery-worthy print.</tspan>
      </text>
    </g>
    <g transform="translate(72, ${H - 64})">
      <text font-family="ui-sans-serif, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="20" font-weight="500" fill="rgba(231,238,248,0.78)">Made in the USA · Archival materials · Numbered Certificate of Authenticity</text>
    </g>
    <g transform="translate(${W - 72}, ${H - 64})">
      <text text-anchor="end" font-family="ui-sans-serif, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="6" fill="#7DD3FC">aiprint.ai</text>
    </g>
  </svg>`;
  const out = join(PUBLIC, 'og-image.png');
  await sharp(Buffer.from(svg)).resize(W, H).png({ compressionLevel: 9 }).toFile(out);
  console.log(`✓ og-image.png (simple, sans-serif)`);
}

async function main() {
  await loadEnvLocal();
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error('Missing GOOGLE_GEMINI_API_KEY');
    process.exit(1);
  }
  await buildStepPhotos();
  await buildSimpleOg();
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
