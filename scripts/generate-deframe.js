// scripts/generate-deframe.js
// Audit pass: replace the two homepage mockups where Gemini snuck a picture
// frame around the artwork. We sell gallery-wrapped canvas, metal float-mount,
// and acrylic facemount only — never framed prints — so any framed mockup
// reads as fake to a buyer who actually orders one and gets something
// different.
//
// Targets:
//   1. public/illustrations/step-3.webp           — "HANG" step illustration
//      (currently shows a heavy black-framed seascape in a living room)
//   2. public/gallery/06-living-room-canvas.webp  — Modern living room
//      (currently shows a thin gold-framed misty mountain canvas)
//
// Both are regenerated as photoreal interiors with the artwork explicitly
// as a frameless gallery-wrapped canvas (visible side-wrap depth, no frame,
// no matting, no glass).

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
    out: 'public/illustrations/step-3.webp',
    aspect: '3:2',
    alt: 'Modern living room with a large frameless gallery-wrapped canvas of a moody seascape above a low credenza',
    prompt: 'Photorealistic editorial interior photograph of a serene modern living room at golden hour: a LARGE gallery-wrapped CANVAS print of a moody painterly seascape (deep blue and silver palette) hanging centered on a warm cream-beige plaster wall above a low walnut credenza. CRITICAL: the canvas has NO FRAME, NO MATTING, NO BORDER — it is a clean gallery-wrapped canvas with visible 1.5-inch deep side edge wrapping the print, mounted flush to the wall. A small brass table lamp and a ceramic vase with dried pampas grass on the credenza, two cream boucle armchairs and a low concrete coffee table holding an open book, soft warm directional window light from off-frame left casting gentle shadows, wide-plank oak floors, a pale wool rug. Calm, premium, lived-in feel, editorial interior photography style. The unframed canvas is the focal hero. No text, no logos, no watermarks, no signs, no people, ABSOLUTELY NO PICTURE FRAME, no thin black border, no white matting, no glass, no wooden frame edge around the artwork.'
  },
  {
    out: 'public/gallery/06-living-room-canvas.webp',
    aspect: '3:2',
    alt: 'Modern living room with a large frameless gallery-wrapped canvas of a misty mountain landscape above a cognac leather sofa',
    prompt: 'Photorealistic editorial interior photograph of a modern living room: a large gallery-wrapped CANVAS print of a misty mountain landscape (cool blue-grey atmospheric peaks emerging from fog) hanging centered on a cream plaster wall above a low cognac-leather sofa. CRITICAL: the canvas is a clean gallery-wrapped canvas with visible 1.5-inch deep side edge wrapping the print — NO FRAME, NO MATTING, NO BORDER around the artwork. A brass arc floor lamp casting warm side light, a small monstera plant in the corner, soft wool area rug, a wide low oak coffee table. Soft natural daylight from off-frame windows, shallow depth of field, premium interior photography style. The unframed canvas is the focal hero. No text, no logos, no watermarks, no signs, no people, ABSOLUTELY NO PICTURE FRAME — no thin gold or wooden frame edge, no thin black border, no white matting, no glass over the canvas.'
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
  console.log(`Regenerating ${SPECS.length} mockup(s) without picture frames via Gemini 2.5 Flash Image…\n`);
  const results = [];
  for (const spec of SPECS) {
    const label = spec.out.replace(/^public\//, '').padEnd(40);
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
