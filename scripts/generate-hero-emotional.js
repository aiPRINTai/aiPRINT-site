// scripts/generate-hero-emotional.js
// Re-roll the 3 hero tiles that are pretty-but-story-less (Tuscan landscape,
// Misty mountain valley, Anime blossoms) with photoreal cinematic scenes that
// each carry a clear emotional anchor — a single focal human moment a buyer
// can feel within half a second of seeing it.
//
// New tiles:
//   art-couple-beach.webp     — anniversary / love / "the walk we take"
//   art-summit-sunrise.webp   — triumph / dreams / "the view we earned"
//   art-child-wheat.webp      — joy / childhood / "run free, little one"
//
// All 2:3 vertical to match the rest of the hero grid. Photographic style,
// not illustrated, to match the Tokyo / Wolf / Red-umbrella tiles the user
// explicitly kept.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const MAX_DIM = 1600;
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

const SPECS = [
  {
    out: 'public/ai-art/art-couple-beach.webp',
    alt: 'Silhouette of a couple holding hands walking along a glassy beach at sunset',
    prompt: 'Cinematic fine-art photograph in vertical 2:3 composition: two silhouetted figures (a couple, faceless, walking hand in hand away from camera) along a quiet glassy wet-sand beach at golden-hour sunset, soft warm amber and rose light reflected in the shallow water at their feet, gentle low waves in the distance, faint pale clouds, deeply emotional and romantic mood, the couple is the small but absolute focal hero of the frame, palette of warm gold, soft coral, dusty rose, and deep teal water, gallery-quality fine-art editorial photography style, photographic — not illustrated. No text, no logos, no watermarks, no signs, no frames or borders, faces not visible, image fills the entire vertical canvas edge-to-edge.'
  },
  {
    out: 'public/ai-art/art-summit-sunrise.webp',
    alt: 'Lone hiker silhouette standing on a rocky mountain peak facing layered misty peaks at sunrise',
    prompt: 'Cinematic fine-art photograph in vertical 2:3 composition: a lone hiker silhouette standing tall on a rocky mountain summit at sunrise, facing away from camera toward a vast layered range of distant misty peaks bathed in warm pink and gold sunrise light, soft atmospheric haze receding into the deep distance, the hiker is small in the lower third of the frame but is the absolute focal hero, deeply emotional and aspirational mood, palette of soft pink dawn, warm gold, and cool deep teal mountain shadows, gallery-quality fine-art editorial landscape photography, photographic — not illustrated. No text, no logos, no watermarks, no signs, no frames or borders, face not visible, image fills the entire vertical canvas edge-to-edge.'
  },
  {
    out: 'public/ai-art/art-child-wheat.webp',
    alt: 'Young child running joyfully through tall golden wheat at sunset, arms outstretched',
    prompt: 'Cinematic fine-art photograph in vertical 2:3 composition: a young child running joyfully through tall golden wheat at sunset, arms outstretched wide, shot from behind so the child faces away into the warm horizon, the wheat brushing past their hands, dust motes catching the warm low-angle sunlight, faint distant tree line, deeply nostalgic and freeing mood, palette of warm honey-gold, deep amber, soft cream wheat, and gentle peach sky, the child is the focal hero of the frame, gallery-quality fine-art editorial photography, photographic — not illustrated. No text, no logos, no watermarks, no signs, no frames or borders, face not visible, image fills the entire vertical canvas edge-to-edge.'
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
  console.log(`Generating ${SPECS.length} new emotional hero tiles via Gemini 2.5 Flash Image (${ASPECT})…\n`);
  const results = [];
  for (const spec of SPECS) {
    const label = spec.out.replace(/^public\//, '').padEnd(36);
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
}

main().catch(e => { console.error(e.message); process.exit(1); });
