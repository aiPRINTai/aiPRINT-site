// scripts/generate-image-refresh.js
// One-shot: refresh the hero showcase + add fresh in-room mockups, plus a
// clean replacement for the Cosmic Cliff hero tile (the previous render had a
// stray Photoshop "Ps" badge baked into the upper-left corner).
//
// Same pipeline as generate-moments-tiles.js: Gemini 2.5 Flash Image
// ("nano-banana"), then sharp-encoded to WebP. Each prompt is intentionally
// distinct — different rooms, different art styles, different lighting — so
// the resulting set feels like a coherent magazine spread rather than 6 sibling
// shots. Every prompt explicitly forbids text/logos/watermarks/badges to avoid
// another stray Adobe-icon situation.
//
// Run: node scripts/generate-image-refresh.js
//
// Outputs:
//   public/ai-art/art-cosmic-cliff.webp                 (overwrite — clean re-roll)
//   public/ai-art/hero/showcase-horizontal.webp         (NEW · 3:2)
//   public/ai-art/hero/showcase-vertical.webp           (NEW · 2:3)
//   public/gallery/06-living-room-canvas.webp           (NEW · 3:2)
//   public/gallery/07-nursery-whimsy.webp               (NEW · 3:2)
//   public/gallery/08-primary-bedroom-metal.webp        (NEW · 3:2)
//   public/gallery/09-dining-acrylic.webp               (NEW · 3:2)
//   public/gallery/10-office-triptych-metal.webp        (NEW · 3:2)
//   public/gallery/11-reading-nook-vertical.webp        (NEW · 3:2)

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

// Each spec routes to its own output directory so the new files don't all pile
// into /ai-art/. Aspect ratio matches the visual slot in the page.
const SPECS = [
  // ── Hero refresh ──────────────────────────────────────────────
  {
    out: 'public/ai-art/art-cosmic-cliff.webp',
    aspect: '1:1',
    alt: 'Lone figure on a cliff under a swirling cosmic nebula',
    prompt: 'Cinematic fine-art square composition (gallery-quality): a lone silhouetted figure standing on the edge of a high stone cliff staring up at a vast cosmic nebula vista, a swirling spiral galaxy filling the upper portion of the sky, painterly atmospheric night scene with deep purples, teals, and warm cosmic gold accents, soft layered clouds below the cliff line. Completely clean image with no badges, no icons, no UI overlays, no Adobe Photoshop icon, no text of any kind, no logos, no watermarks, no signature. Pure fine-art print, museum quality.'
  },
  {
    out: 'public/ai-art/hero/showcase-horizontal.webp',
    aspect: '3:2',
    alt: 'Sweeping desert canyon at golden hour',
    prompt: 'Cinematic fine-art horizontal landscape (gallery-quality): a sweeping deep-red desert canyon at golden hour, layered atmospheric haze, distant mesas receding into warm dust, soft directional sunlight catching the canyon walls, painterly editorial photography style suitable for a wide panoramic wall print. No text, no logos, no watermarks, no signs, no people.'
  },
  {
    out: 'public/ai-art/hero/showcase-vertical.webp',
    aspect: '2:3',
    alt: 'Ancient redwood rising into a misty morning forest',
    prompt: 'Fine-art vertical landscape (gallery-quality): a single ancient redwood tree rising tall into a misty morning forest, soft cinematic light shafts cutting diagonally through fog from the upper left, mossy forest floor in the foreground, painterly atmospheric brushwork. Vertical composition emphasizing the trees full height, suitable for a tall portrait-orientation wall print. No text, no logos, no watermarks, no signs, no people.'
  },

  // ── New room mockups ─────────────────────────────────────────
  {
    out: 'public/gallery/06-living-room-canvas.webp',
    aspect: '3:2',
    alt: 'Large mountain landscape canvas above a cognac leather sofa in a modern living room',
    prompt: 'Photorealistic editorial interior photograph of a modern living room: a large gallery-wrapped fine-art canvas of a misty mountain landscape (clearly hung as a finished wall print) mounted centered on a cream plaster wall above a low cognac-leather sofa, soft wool area rug, brass floor lamp casting warm side light, a small monstera plant in the corner. Natural daylight from off-frame windows, shallow depth of field, premium interior photography style. The art print is the focal hero. No text, no logos, no watermarks, no signs, no people.'
  },
  {
    out: 'public/gallery/07-nursery-whimsy.webp',
    aspect: '3:2',
    alt: 'Whimsical hot-air-balloon canvas above a white crib in a sage-green nursery',
    prompt: 'Photorealistic editorial interior photograph of a modern nursery: a whimsical pastel fine-art canvas of hot-air balloons drifting over rolling hills (clearly hung as a finished wall print) hanging on a soft sage-green plaster wall above a clean white wooden crib with a folded gauze blanket. A small cream rocking chair, a plush stuffed bear on the floor, soft morning sunlight filtering through sheer linen curtains. Calm, warm, peaceful, premium interior photography style. The art print is the focal hero. No text, no logos, no watermarks, no signs, no people.'
  },
  {
    out: 'public/gallery/08-primary-bedroom-metal.webp',
    aspect: '3:2',
    alt: 'Polished metal print of desert dunes above a low platform bed in a moody bedroom',
    prompt: 'Photorealistic editorial interior photograph of a moody primary bedroom: a polished aluminum metal fine-art print of a sweeping desert dunes landscape (clearly hung as a finished wall print with thin float mount) mounted above a low platform bed with charcoal linen bedding and a single sage throw pillow. Warm wide-plank oak floors, a single black bedside table with a matte ceramic lamp glowing warm, gentle evening lamp light, deep velvety shadows in the corners. Moody, premium interior photography style. The art print is the focal hero. No text, no logos, no watermarks, no signs, no people.'
  },
  {
    out: 'public/gallery/09-dining-acrylic.webp',
    aspect: '3:2',
    alt: 'Acrylic facemount of an abstract ocean scene behind a walnut dining table',
    prompt: 'Photorealistic editorial interior photograph of a refined dining nook: a museum-grade clear acrylic facemount fine-art print of a moody abstract ocean scene (clearly hung as a finished wall print with visible acrylic depth and clean polished edges) mounted as the focal wall art behind a round walnut dining table set with four matte black wishbone chairs. A low brass pendant light hangs above the table, white plaster walls, neutral palette, late afternoon natural daylight from off-frame. Refined, premium interior photography style. The art print is the focal hero. No text, no logos, no watermarks, no signs, no people.'
  },
  {
    out: 'public/gallery/10-office-triptych-metal.webp',
    aspect: '3:2',
    alt: 'Three matching metal prints of a mountain panorama above a clean home-office desk',
    prompt: 'Photorealistic editorial interior photograph of a serene home office: three matching aluminum metal fine-art prints (a triptych showing a continuous cinematic mountain panorama spanning the three panels, clearly hung as finished wall prints with thin float mounts) mounted side by side above a clean white minimalist desk holding a single closed laptop, a small brass desk lamp, and an open leather notebook. Wide-plank pale oak floors, a tall slim bookcase off to one side, soft morning daylight from an off-frame window, productive and serene mood, premium interior photography style. The art prints are the focal hero. No text, no logos, no watermarks, no signs, no people.'
  },
  {
    out: 'public/gallery/11-reading-nook-vertical.webp',
    aspect: '3:2',
    alt: 'Tall vertical canvas of a misty Japanese garden path in a Japandi reading nook',
    prompt: 'Photorealistic editorial interior photograph of a calm Japandi-style reading nook: a tall vertical fine-art canvas of a misty Japanese garden path with stone lanterns (clearly hung as a finished portrait-oriented wall print, gallery-wrapped) hanging on a soft warm cream plaster wall beside a low oak reading chair with a folded woven mustard throw. A small round side table holds a small unglazed clay teapot and a thick hardback book. Wide-plank pale wood floor, a low ceramic vase with a single dried branch, warm soft light filtering through an off-frame paper-screen window. Calm, meditative, premium interior photography style. The art print is the focal hero. No text, no logos, no watermarks, no signs, no people.'
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
  console.log(`Generating ${SPECS.length} fresh images via Gemini 2.5 Flash Image…\n`);
  const results = [];
  for (const spec of SPECS) {
    const label = spec.out.replace(/^public\//, '').padEnd(48);
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
