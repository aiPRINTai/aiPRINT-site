// scripts/generate-hero-umbrella.js
// Two-fer:
//   1. Replace the pop-art scarlet macaw in the hero with a more personal /
//      emotional tile: a woman in a red coat walking through a snowy Central
//      Park at dusk holding a vibrant red umbrella. Same hot-pop color hit
//      that the macaw was providing, but with a cinematic human story behind
//      it — much more on-brand for "memory, moment" framing.
//   2. Fill the empty slot in the rooms grid with a 12th interior mockup —
//      a bright Scandinavian-style kitchen with a fine-art canvas above the
//      counter (kitchens are a high-emotion family space, no overlap with
//      the existing 10 mockups).
//
// Run: node scripts/generate-hero-umbrella.js

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const MAX_DIM = 1600;
const QUALITY = 82;

function loadApiKey() {
  if (!fs.existsSync(ENV_FILE)) throw new Error(`No .env.local at ${ENV_FILE}`);
  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*GOOGLE_GEMINI_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) {
      let v = m[1];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v && v !== '[YOUR_GOOGLE_API_KEY_HERE]') return v;
    }
  }
  throw new Error('GOOGLE_GEMINI_API_KEY not present in .env.local');
}

const SPECS = [
  {
    out: 'public/ai-art/art-red-umbrella-park.webp',
    aspect: '2:3',
    alt: 'Woman in a red coat with a red umbrella walking through a snowy Central Park at dusk',
    prompt: 'Cinematic fine-art photographic scene in vertical 2:3 composition: a single woman in a deep crimson red wool coat (faceless, walking away from camera, slightly off-center) holding a vibrant red umbrella, walking down a tree-lined path through Central Park in New York during a gentle snowfall at dusk, soft warm gas-lamp glow on the wet path, snow-dusted bare tree branches arching overhead, a hint of distant NYC skyline through the trees in the deep background, deeply emotional and romantic mood, the red umbrella is the single brilliant color against a moody palette of slate-blue, soft pewter snow, warm amber lamp light, gallery-quality fine-art editorial photography in the spirit of Saul Leiter / Vivian Maier. No text, no logos, no watermarks, no signs, no frames or borders, image fills the entire canvas edge-to-edge.'
  },
  {
    out: 'public/gallery/12-kitchen-canvas.webp',
    aspect: '3:2',
    alt: 'Bright Scandinavian kitchen with a large fine-art canvas above the counter',
    prompt: 'Photorealistic editorial interior photograph of a bright modern Scandinavian-style kitchen: a large fine-art gallery-wrapped CANVAS print of a soft impressionist botanical garden scene (clearly mounted as a finished wall print, NO frame, just clean canvas) hanging on a white plaster wall above a long oak counter with a few small ceramic pots and a wooden cutting board. Pale wood floors, a single tall vase with fresh eucalyptus, soft natural morning light streaming through an off-frame window, a small espresso machine in the corner. Calm, warm, lived-in feel, premium interior photography style. The unframed canvas is the clear focal hero. No text, no logos, no watermarks, no signs, no people, no picture frame around the artwork.'
  }
];

async function generateOne(spec, apiKey) {
  const t0 = Date.now();
  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: spec.prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: spec.aspect }
        }
      })
    }
  );
  const text = await resp.text();
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { msg = JSON.parse(text)?.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Bad JSON from Gemini'); }
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts?.length) throw new Error('No parts in Gemini response');
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) throw new Error('No image data in response');

  const png = Buffer.from(imagePart.inlineData.data, 'base64');
  const outPath = path.join(ROOT, spec.out);
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(outPath)) {
    const backup = outPath + '.backup-' + Date.now();
    fs.copyFileSync(outPath, backup);
  }
  await sharp(png)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);
  const bytes = fs.statSync(outPath).size;
  return { name: spec.out, alt: spec.alt, bytes, ms: Date.now() - t0 };
}

async function main() {
  const apiKey = loadApiKey();
  console.log(`Generating ${SPECS.length} new images via Gemini 2.5 Flash Image…\n`);
  const results = [];
  for (const spec of SPECS) {
    const label = spec.out.replace(/^public\//, '').padEnd(42);
    process.stdout.write(`  ${label} (${spec.aspect}) … `);
    try {
      const r = await generateOne(spec, apiKey);
      results.push(r);
      console.log(`OK  ${(r.bytes / 1024).toFixed(0)} KB · ${(r.ms / 1000).toFixed(1)}s`);
    } catch (e) {
      console.log(`FAIL  ${e.message}`);
    }
  }
  console.log(`\nDone. Wrote ${results.length}/${SPECS.length} files.`);
  if (results.length < SPECS.length) {
    console.log('Some images failed — re-run to retry.');
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
