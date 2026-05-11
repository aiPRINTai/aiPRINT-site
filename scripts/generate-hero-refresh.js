// scripts/generate-hero-refresh.js
// Replace the two cosmic-leaning hero tiles (Aurora + Cosmic Cliff) with
// photorealistic landscape photography, and re-roll the nursery room mockup
// without a picture frame around the canvas. Sticks to 1:1 for the hero
// tiles to match the existing 2x2 hero grid; 3:2 for the room mockup.
//
// All prompts explicitly forbid frames around the artwork (we sell
// gallery-wrapped canvas, metal float-mount, and acrylic facemount — never
// framed prints) and forbid text/logos/watermarks/badges.
//
// Run: node scripts/generate-hero-refresh.js

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
    out: 'public/ai-art/art-mountain-mist.webp',
    aspect: '1:1',
    alt: 'Misty mountain valley at sunrise with low-lying fog between pine-covered ridges',
    prompt: 'Photorealistic fine-art landscape photograph, square 1:1 composition: a misty mountain valley at sunrise, low-lying soft fog drifting between layered pine-covered ridges, warm orange and pink sunrise light spilling over distant snow-capped peaks, deeply atmospheric, sharp foreground pines, atmospheric depth into the distance, gallery-quality nature photography (Pacific Northwest / Patagonia aesthetic). Realistic photographic look — not painterly, not illustrated. No text, no logos, no watermarks, no signs, no people, no frames or borders around the image, no UI elements.'
  },
  {
    out: 'public/ai-art/art-coastal-cliffs.webp',
    aspect: '1:1',
    alt: 'Dramatic North Atlantic basalt sea cliffs with crashing surf and moody overcast light',
    prompt: 'Photorealistic fine-art landscape photograph, square 1:1 composition: dramatic North Atlantic basalt sea cliffs with thunderous surf crashing against the dark rocks, low moody overcast light, deep teal and slate-grey ocean, faint mist rising from the impact, atmospheric and powerful, gallery-quality fine-art seascape photography (Iceland or Faroe Islands aesthetic). Realistic photographic look with crisp detail in the spray and stone. No text, no logos, no watermarks, no signs, no people, no boats, no frames or borders around the image, no UI elements.'
  },
  {
    out: 'public/gallery/07-nursery-whimsy.webp',
    aspect: '3:2',
    alt: 'Frameless gallery-wrapped canvas of hot-air balloons hanging above a white crib in a sage nursery',
    prompt: 'Photorealistic editorial interior photograph: a modern nursery with a single whimsical pastel gallery-wrapped CANVAS print of hot-air balloons drifting over rolling hills hanging on a soft sage-green plaster wall above a clean white wooden crib with a folded gauze blanket. CRITICAL: the canvas is gallery-wrapped (printed edge-to-edge with a 1.5-inch deep side edge visible) and has NO PICTURE FRAME, NO BORDER, NO MATTING around it — the painted image goes right to the canvas edge. A small cream rocking chair, a plush stuffed bear on the floor, soft morning sunlight filtering through sheer linen curtains. Calm, warm, peaceful, premium interior photography style. The unframed gallery-wrapped canvas is the focal hero. No text, no logos, no watermarks, no signs, no people, and absolutely no frame, no thin black border, no white matting, no glass — just a clean gallery-wrapped canvas.'
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
  console.log(`Generating ${SPECS.length} replacement images via Gemini 2.5 Flash Image…\n`);
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
  if (results.length < SPECS.length) {
    console.log('Some images failed — re-run to retry.');
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
