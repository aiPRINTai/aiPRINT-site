// scripts/generate-hero-variety.js
// Rebalance the hero gallery: add 3 fresh tiles that contrast against the
// existing cool/moody set. Goals: more warm tones, more stylistic variety,
// no two tiles reading as the same "moody photoreal landscape."
//
// New tiles:
//   art-tuscan-sunset.webp     — warm classical landscape (contrasts the cool mountain)
//   art-pop-bird.webp           — vibrant graphic / pop-art (contrasts photoreal sets)
//   art-wolf-snow.webp          — wildlife portrait (living subject, distinct from pets/anime)
//
// All 1:1 to match the hero's square 3x2 grid. Every prompt forbids text /
// logos / watermarks / borders / frames.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const MAX_DIM = 1400;
const QUALITY = 82;
const ASPECT = '1:1';

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
    out: 'public/ai-art/art-tuscan-sunset.webp',
    alt: 'Painterly Tuscan hills at golden hour with cypress trees and a stone farmhouse',
    prompt: 'Painterly fine-art classical landscape in square 1:1 composition: rolling Tuscan hills at golden hour, dark green cypress trees punctuating warm honey-gold fields, an ancient terracotta-roofed stone farmhouse in the middle distance, soft warm sunset light bathing the entire landscape in amber, painterly oil brushwork with visible texture, palette of honey-gold, terracotta, deep amber, soft sage green, and rich red-orange, deeply nostalgic, museum-quality classical landscape painting in the spirit of the Italian Romantics. No text, no logos, no watermarks, no signs, no frames, no borders, no UI elements, image fills the entire square canvas edge-to-edge.'
  },
  {
    out: 'public/ai-art/art-pop-bird.webp',
    alt: 'Bold pop-art scarlet macaw with saturated color blocks and contemporary graphic styling',
    prompt: 'Bold vibrant pop-art illustration in square 1:1 composition: a stylized close-up of a scarlet macaw parrot with brilliant saturated color blocks (deep scarlet red, sunshine yellow, electric blue, vivid green), bold black outlines, contemporary graphic-poster aesthetic blending Andy Warhol pop-art sensibility with modern editorial illustration, the bird filling the frame against a flat saturated background. Punchy, energetic, gallery-quality contemporary graphic art. No text, no logos, no watermarks, no signs, no frames, no borders, image fills the entire square canvas edge-to-edge.'
  },
  {
    out: 'public/ai-art/art-wolf-snow.webp',
    alt: 'Photorealistic portrait of a lone gray wolf in a snowy forest at golden hour',
    prompt: 'Photorealistic fine-art wildlife portrait in square 1:1 composition: a single dignified gray wolf standing alert in a snowy pine forest at golden hour, soft warm sunset light catching the fur and rim-lighting the silhouette, gentle falling snow drifting in the air, atmospheric depth into the distance, palette of cool snow-white and slate blue with warm golden highlights on the wolf, gallery-quality wildlife photography style, the wolf is the clear focal hero. No text, no logos, no watermarks, no signs, no frames, no borders, no people, image fills the entire square canvas edge-to-edge.'
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
  console.log(`Generating ${SPECS.length} new hero tiles via Gemini 2.5 Flash Image (${ASPECT})…\n`);
  const results = [];
  for (const spec of SPECS) {
    const label = spec.out.replace(/^public\//, '').padEnd(40);
    process.stdout.write(`  ${label} … `);
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
