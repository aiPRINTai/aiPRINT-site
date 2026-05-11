// scripts/generate-moments-tiles.js
// One-shot: generate fresh, fully-unique tile images for the "Made for Moments"
// section of the homepage. Each tile gets a dedicated 2:3 portrait image that
// matches its emotional eyebrow — pet portrait, anniversary, kids' room, etc.
//
// Same model and pipeline as the live /api/generate-image route: Gemini 2.5
// Flash Image ("nano-banana"), then sharp-encoded to WebP at q82 with 1400px
// long edge (tiles render small; no need for 1600px).
//
// Run: node scripts/generate-moments-tiles.js
//
// Outputs:   public/ai-art/moments/<slug>.webp   (8 files, no repeats)
// Backups:   <file>.webp.backup-<timestamp> if a previous file exists.

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

// 8 tiles — each prompt is intentionally distinct in subject, palette, and
// composition so no two outputs feel like sibling images. No text, no logos,
// no faces in frame where avoidable, all painterly fine-art rather than photo.
const TILES = [
  {
    name: 'pet-portrait',
    alt: 'A regal Dutch-master-style oil portrait of a noble golden retriever in a velvet coat',
    prompt: 'Regal Renaissance Dutch-master-style oil portrait of a noble, wise golden retriever seated upright, wearing a deep maroon velvet collar and a small brass medallion, soft directional window light from the left, painterly brushwork visible in the fur and background, dignified upright composition, rich jewel-tone palette of warm browns, gold, deep maroon, and amber, museum-quality fine-art animal portrait in the style of a 17th-century aristocratic painting. No text, no logos, no human figures.'
  },
  {
    name: 'anniversary',
    alt: 'Romantic painterly silhouettes of two figures walking a sunset beach',
    prompt: 'Romantic painterly fine-art scene: two distant silhouetted figures (from behind, faceless) holding hands walking along the wet sand of a quiet sunset beach, deep warm golden-hour light spilling across glassy calm water, soft film-grain texture, hazy distant horizon, painterly oil-on-canvas brushwork, deeply emotional and tender, warm palette of amber, coral, soft pink, and dusty rose. No text, no logos, faces not visible.'
  },
  {
    name: 'kids-room',
    alt: 'Whimsical storybook hot-air balloons drifting over pastel hills at dawn',
    prompt: 'Whimsical storybook fine-art illustration: a cluster of magical pastel-striped hot-air balloons drifting peacefully high above rolling soft-green spring hills at gentle dawn, dreamy cotton-candy clouds, pastel pink-lavender-cream sky, tiny birds in the distance, fantasy children\'s-book wonder, soft painterly brushwork, fine-art print quality. No text, no logos, no people visible.'
  },
  {
    name: 'travel-memory',
    alt: 'Painterly Mediterranean coastal village at golden hour',
    prompt: 'Painterly fine-art Mediterranean coastal village at golden hour: terracotta and pastel rooftops cascading down a cliffside to a sparkling turquoise sea, a few small wooden fishing boats anchored in the cove, sun-bleached cream and ochre buildings, climbing bougainvillea, nostalgic warm light, impressionist visible brushwork reminiscent of Cinque Terre, deeply atmospheric. No text, no logos, no visible people.'
  },
  {
    name: 'housewarming',
    alt: 'Cozy painterly still-life of a warm coffee mug and open book in afternoon light',
    prompt: 'Cozy painterly fine-art still-life: a warm steaming ceramic coffee mug, an open hardback book with softly worn pages, a single dried garden rose laid beside it, and a small bowl of cinnamon sticks, on a rustic warm-wood table; rich golden afternoon window light streaming from the left, muted earthy tones with warm amber and cream highlights, soft inviting textures, oil-painting style fine art interior scene. No text, no logos.'
  },
  {
    name: 'has-everything-gift',
    alt: 'Surreal dreamlike hidden lagoon glowing beneath twin pale moons',
    prompt: 'Surreal painterly dreamlike imagined coastline that does not exist on earth: an ethereal hidden lagoon glowing softly beneath two pale rising moons, gentle floating wisps of cloud, otherworldly water reflecting jewel tones, deep teal sea blending into violet sky with hints of gold, painterly surrealism in the spirit of Gustave Doré crossed with Maxfield Parrish, gallery fine-art quality. No text, no logos, no figures.'
  },
  {
    name: 'in-their-honor',
    alt: 'Tender serene memorial scene of a willow beside a still pond at dawn',
    prompt: 'Tender serene memorial fine-art landscape: a single peaceful weeping willow tree on a quiet shore beside a perfectly still mirror-like pond at dawn, soft warm light filtering through low morning mist, faint reflections of the tree in the water, dignified and gentle mood, painterly oil brushwork, palette of soft cream, sage green, dusty pale blue, and gold, museum-quality landscape, deeply calm. No text, no logos, no figures, no graves.'
  },
  {
    name: 'for-mom-and-dad',
    alt: 'Nostalgic watercolor of a childhood-home garden in spring',
    prompt: 'Nostalgic soft watercolor fine-art painting of a childhood-home garden in late spring: overflowing white daisies, soft pink garden roses, foxglove spires, dappled afternoon sunlight falling on a worn red-brick walking path leading toward a small wooden garden gate, warm honey-gold glow, loose impressionist watercolor washes with subtle ink linework, deeply sentimental, evokes Beatrix Potter and English-cottage gardens. No text, no logos, no people.'
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
  return { name, alt, bytes, ms: Date.now() - t0, outPath };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const apiKey = loadApiKey();
  console.log(`Generating ${TILES.length} unique Made-for-Moments tile images via Gemini 2.5 Flash Image (${ASPECT})…\n`);
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
  console.log(`\nDone. Wrote ${results.length}/${TILES.length} files to public/ai-art/moments/.`);
  if (results.length < TILES.length) {
    console.log('Some tiles failed — re-run the script to retry the failed ones.');
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
