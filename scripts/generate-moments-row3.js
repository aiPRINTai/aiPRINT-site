// scripts/generate-moments-row3.js
// Add a 3rd row of 4 emotionally-resonant Moments tiles. Each one targets
// a distinct heart moment the existing 8 don't cover: a new baby's arrival,
// a wedding/engagement day, the gift for a chosen-family best friend, and
// the shared origin spot of a couple.
//
// Same pipeline as the earlier Moments batch. Aspect 2:3 vertical to match
// the existing tile imagery.
//
// Run: node scripts/generate-moments-row3.js

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'ai-art', 'moments');
const ENV_FILE = path.join(ROOT, '.env.local');
const MAX_DIM = 1400;
const QUALITY = 82;
const ASPECT = '2:3';

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

const TILES = [
  {
    name: 'new-baby',
    alt: 'Soft watercolor of a sleeping newborn under a knit blanket with a stuffed bunny',
    prompt: 'Soft tender fine-art watercolor painting in vertical 2:3 composition: a peacefully sleeping newborn baby curled under a gauzy cream-white knit blanket, one tiny hand resting on a soft stuffed bunny, dappled warm morning sunlight, palette of soft cream, pale rose-pink, dusty peach, and gentle warm yellow, deeply tender and protective mood, painterly watercolor washes with soft ink lines, museum-quality nursery fine art. No text, no logos, no watermarks, no signs, no frames or borders, image fills the entire canvas edge-to-edge.'
  },
  {
    name: 'wedding-day',
    alt: 'Romantic painterly fine-art scene of a faceless bride and groom holding hands at sunset',
    prompt: 'Romantic painterly fine-art scene in vertical 2:3 composition: a bride and groom (faceless, from behind) holding hands at an outdoor sunset wedding ceremony, the bride in a flowing ivory gown, gentle flower petals drifting in warm air, soft warm golden-hour light, deep emotional warmth, painterly oil-on-canvas brushwork, palette of warm gold, blush pink, ivory, and soft sage greenery in soft focus, cinematic editorial fine-art quality. No text, no logos, no watermarks, no signs, no frames or borders, image fills the entire canvas edge-to-edge.'
  },
  {
    name: 'best-friend',
    alt: 'Two figures from behind walking together along a forest path at golden hour',
    prompt: 'Warm painterly fine-art scene in vertical 2:3 composition: two figures (faceless, walking from behind, side by side) walking together along a winding forest path at golden hour, soft warm light filtering through tall autumn trees, gentle drifts of fallen amber and rust leaves on the path, deep friendship and quiet warmth, painterly brushwork, palette of warm gold, deep forest green, amber, and rust, museum-quality emotional landscape. No text, no logos, no watermarks, no signs, no frames or borders, image fills the entire canvas edge-to-edge.'
  },
  {
    name: 'where-it-all-began',
    alt: 'Painterly quiet European cafe at golden hour with two empty chairs at a window table',
    prompt: 'Nostalgic painterly fine-art scene in vertical 2:3 composition: a quiet European corner cafe at golden hour, a small round table by a flower-filled window with two empty wooden chairs facing each other suggesting the memory of a first meeting, a single steaming cup of coffee on the table, soft warm afternoon light spilling through the window, painterly oil brushwork, palette of warm honey-gold, terracotta, soft cream, and gentle dusty rose flowers, deeply sentimental and atmospheric, museum-quality fine art. No text, no logos, no watermarks, no signs, no frames or borders, no people in frame, image fills the entire canvas edge-to-edge.'
  }
];

async function generateOne({ name, prompt, alt }, apiKey) {
  const t0 = Date.now();
  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: ASPECT }
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
  const outPath = path.join(OUT_DIR, `${name}.webp`);
  if (fs.existsSync(outPath)) {
    const backup = outPath + '.backup-' + Date.now();
    fs.copyFileSync(outPath, backup);
  }
  await sharp(png)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);
  const bytes = fs.statSync(outPath).size;
  return { name, alt, bytes, ms: Date.now() - t0 };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const apiKey = loadApiKey();
  console.log(`Generating ${TILES.length} new Moments tiles via Gemini 2.5 Flash Image (${ASPECT})…\n`);
  const results = [];
  for (const spec of TILES) {
    process.stdout.write(`  ${spec.name.padEnd(22)} … `);
    try {
      const r = await generateOne(spec, apiKey);
      results.push(r);
      console.log(`OK  ${(r.bytes / 1024).toFixed(0)} KB · ${(r.ms / 1000).toFixed(1)}s`);
    } catch (e) {
      console.log(`FAIL  ${e.message}`);
    }
  }
  console.log(`\nDone. Wrote ${results.length}/${TILES.length} files.`);
  if (results.length < TILES.length) {
    console.log('Some tiles failed — re-run the script to retry.');
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
