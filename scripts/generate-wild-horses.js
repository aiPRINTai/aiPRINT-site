// scripts/generate-wild-horses.js
// Swap the most-static hero tile (Summit at sunrise — lone figure standing
// still on rocks) for a high-energy scene that hits the three gaps the
// current hero has: greens missing, only one animal, and overall mood too
// quiet. Wild horses running through a misty green meadow at dawn lands
// all three at once — and still carries strong emotional weight (freedom,
// spirit, untamed).

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
    out: 'public/ai-art/art-wild-horses.webp',
    aspect: '2:3',
    alt: 'Wild horses running through a misty emerald-green meadow at dawn, manes flying',
    prompt: 'Cinematic fine-art photograph in vertical 2:3 composition: a small herd of three or four wild horses galloping together through a lush emerald-green meadow at dawn, manes and tails flying in motion, low warm golden sunrise light cutting through the trees and catching the dust and soft mist their hooves kick up, subtle motion blur in their legs to convey speed, deep saturated green grass with wildflowers, mist drifting between distant pine trees at the meadow edge, deeply emotional and freeing mood (spirit / untamed wildness), palette of lush emerald and sage green, warm honey-gold dawn light, soft white mist, gallery-quality fine-art editorial wildlife photography, photographic — not illustrated, the horses are the absolute focal hero of the frame. No text, no logos, no watermarks, no signs, no frames or borders, no people, no riders, image fills the entire vertical canvas edge-to-edge.'
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
  console.log(`Generating ${SPECS.length} new hero tile via Gemini 2.5 Flash Image…\n`);
  const results = [];
  for (const spec of SPECS) {
    const label = spec.out.replace(/^public\//, '').padEnd(36);
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
}

main().catch(e => { console.error(e.message); process.exit(1); });
