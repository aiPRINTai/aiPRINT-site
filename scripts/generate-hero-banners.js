// scripts/generate-hero-banners.js
// One-shot: generate fresh hero banners for every public page via Gemini
// 2.5 Flash Image (the same model the live /api/generate-image route uses),
// then sharp-encode each to WebP at q80 with max 1600px on the long edge
// to match the rest of the image pipeline.
//
// Reads the API key from .env.local at the repo root. The key is never
// logged or echoed; only "OK" / "FAIL" appears on stdout.
//
// Run: node scripts/generate-hero-banners.js
//
// Each banner has its own unique prompt — no two pages share an image.
// All five banners are regenerated on every run so the visual story stays
// cohesive after a refresh. Existing JPGs in public/banners/ are kept as
// historical fallbacks; this script writes the WebP files only.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'banners');
const ENV_FILE = path.join(ROOT, '.env.local');
const MAX_DIM = 1600;
const QUALITY = 80;

// Pull GOOGLE_GEMINI_API_KEY out of .env.local without echoing it. Tolerant
// of quoted / unquoted values and BOM.
function loadApiKey() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`No .env.local at ${ENV_FILE}`);
  }
  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*GOOGLE_GEMINI_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) {
      let v = m[1];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (v && v !== '[YOUR_GOOGLE_API_KEY_HERE]') return v;
    }
  }
  throw new Error('GOOGLE_GEMINI_API_KEY not present in .env.local');
}

// Banner specs. Each one is unique — no shared subject, no shared palette
// signature. Aspect 3:2 (1536x1024) matches the wide hero crop used on the
// pages. The "alt" stays meaningful for accessibility + SEO.
const BANNERS = [
  {
    name: 'about-hero',
    alt: 'A fine-art photographer\'s studio bench in soft window light, a printed canvas leaning against the wall',
    prompt: 'A photographer\'s studio at golden hour: a worn wooden workbench, a single printed canvas leaning against a textured plaster wall, archival paper and a small light meter on the surface, warm directional window light from the left, shallow depth of field. Cinematic, intimate, premium fine-art editorial photography. No text, no logos, no people in frame.'
  },
  {
    name: 'contact-hero',
    alt: 'A handwritten letter on cream paper beside a brass pen and dried wildflowers, soft morning light',
    prompt: 'A handwritten letter on thick cream paper resting on a polished walnut desk, beside a slim brass pen and a small bouquet of dried lavender and wildflowers in a glass vase. Soft cool morning light from a nearby window, shallow depth of field, painterly editorial photography. No visible text on the letter, no logos, no people.'
  },
  {
    name: 'faq-hero',
    alt: 'An open leather-bound notebook with handwritten notes and a brass magnifying glass in warm library light',
    prompt: 'An open leather-bound notebook with cursive handwritten notes (illegible, suggestion of writing only), a brass magnifying glass resting beside it on a wide oak table. Warm afternoon light filtering through tall library windows in the background, depth of field. Quiet, scholarly, premium editorial style. No readable text, no logos.'
  },
  {
    name: 'policies-hero',
    alt: 'A pair of hands carefully wrapping a framed print in archival tissue and twine on a wooden bench',
    prompt: 'Close-up of a pair of careful hands wrapping a small framed art print in soft archival tissue paper and tying it with natural twine, on a worn pine workbench. Warm side light, shallow depth of field, signaling stewardship and craftsmanship. Cinematic editorial photography. No text, no logos, no faces in frame.'
  },
  {
    name: 'care-hero',
    alt: 'A microfiber cloth and soft brush beside a single mounted print under gentle gallery light',
    prompt: 'A minimalist gallery vignette: a single small mounted print on a clean cream-colored wall, with a folded microfiber cloth and a soft natural-bristle brush resting on a low wooden plinth in front. Single warm directional spotlight from above, soft shadow falloff, museum aesthetic, depth of field. No text on the print, no logos, no people.'
  }
];

const ASPECT = '3:2';

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
  // Backup the existing file (if any) once per run so we can roll back.
  if (fs.existsSync(outPath)) {
    const backup = outPath + '.backup-' + Date.now();
    fs.copyFileSync(outPath, backup);
  }
  await sharp(png)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);

  const bytes = fs.statSync(outPath).size;
  return { name, alt, bytes, ms: Date.now() - t0, outPath };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const apiKey = loadApiKey();
  console.log(`Generating ${BANNERS.length} fresh hero banners via Gemini 2.5 Flash Image (${ASPECT})…\n`);
  const results = [];
  for (const spec of BANNERS) {
    process.stdout.write(`  ${spec.name.padEnd(16)} … `);
    try {
      const r = await generateOne(spec, apiKey);
      results.push(r);
      console.log(`OK  ${(r.bytes / 1024).toFixed(0)} KB · ${r.ms} ms`);
    } catch (e) {
      console.log(`FAIL  ${e.message}`);
    }
  }
  console.log(`\nDone. Wrote ${results.length}/${BANNERS.length} files to public/banners/.`);
  console.log('Backups (if any) are saved as <name>.webp.backup-<timestamp>.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
