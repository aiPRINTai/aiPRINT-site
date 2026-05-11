// scripts/generate-couple-beach-v2.js
// Re-roll the "Holding hands, sunset beach" hero tile with more visual
// interest. User loves the reflection but wants the frame more alive:
//   - Keep the silhouetted couple holding hands + the wet-sand reflection
//   - Add visible water/foam lapping in
//   - Add visible damp sand texture (ripples, shells)
//   - Add an out-of-focus foreground of vibrant purple morning glories
//     (trumpet-shaped blooms on a low dune) for color depth and bokeh
//
// Same path so the index.html reference doesn't need to change.

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
    out: 'public/ai-art/art-couple-beach.webp',
    aspect: '2:3',
    alt: 'Silhouette of a couple holding hands walking a wet-sand beach at sunset, with out-of-focus purple morning glories in the foreground',
    prompt: 'Cinematic fine-art photograph in vertical 2:3 composition with shallow depth of field: in the MID-DISTANCE, two silhouetted figures (a couple, faceless, walking hand in hand away from camera) along a quiet wet-sand beach at golden-hour sunset, a beautiful mirror-like reflection of them visible in the glassy wet sand at their feet, gentle low foam-edged waves lapping in from the right side onto the sand, visible damp sand texture (ripples, a few small shells, faint footprints), warm sunset light catching the water and damp sand. In the FOREGROUND, an artful out-of-focus bokeh layer of vibrant deep-purple MORNING GLORY flowers (trumpet-shaped purple-violet blooms with green vining leaves) blooming on a small beach dune just below the camera, soft creamy bokeh blur, the purple flowers framing the bottom and sides of the composition. Deeply emotional and romantic mood, palette of warm gold, soft coral, dusty rose, deep teal water, glowing wet sand, and vibrant violet-purple foreground accent. Gallery-quality fine-art editorial photography style, photographic — not illustrated. The couple is the focal hero of the frame. No text, no logos, no watermarks, no signs, no frames or borders around the image, faces not visible. Image fills the entire vertical canvas edge-to-edge.'
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
  console.log(`Regenerating ${SPECS.length} tile via Gemini 2.5 Flash Image…\n`);
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
