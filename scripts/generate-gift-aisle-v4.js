// scripts/generate-gift-aisle-v4.js
// Round 4 — 4 PHOTOREALISTIC tiles per category. The first 144+ skewed
// painterly oils / impressionist watercolor / cinematic-editorial. This
// round is explicitly photography: DSLR, hyperreal, sharp focus, real
// optics. No painterly modifiers anywhere in these prompts.
//
// 48 new tiles, all 2:3 vertical, all photographic. Run:
//   node scripts/generate-gift-aisle-v4.js

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

// Every prompt below leads with HYPERREALISTIC PHOTOGRAPH and ends with
// camera/lens metadata + an explicit "not painterly / not illustrated /
// not stylized" anti-modifier so the model commits to photography.
const PHOTO_TAIL = 'Shot on full-frame DSLR with 50mm prime, sharp focus, natural light, real photographic grain, 8K detail. Photograph — not painterly, not oil, not watercolor, not illustrated, not anime. No text, no logos, no watermarks, no frames or borders.';

const TILES = [
  // ── Pet lovers (4 photoreal) ───────────────────────────────────────────
  { name:'pet-studio-portrait', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a noble adult golden retriever in soft studio light against a deep charcoal background, eyes catching the light, fur texture razor-sharp, photographic editorial pet portrait in the style of National Geographic. ${PHOTO_TAIL}` },
  { name:'cat-eye-macro', prompt:`HYPERREALISTIC MACRO PHOTOGRAPH, vertical 2:3: an extreme close-up of a cat\\'s eye, every detail of the iris pattern and surrounding fur razor-sharp, soft natural window light catching the reflection, photographic macro detail. ${PHOTO_TAIL}` },
  { name:'dog-beach-action', prompt:`HYPERREALISTIC ACTION PHOTOGRAPH, vertical 2:3: a happy golden retriever mid-run on a wet beach at golden hour, water splashing around the paws, motion blur on legs, frozen droplets, sharp focus on the dog, real photographic sports/wildlife photography. ${PHOTO_TAIL}` },
  { name:'pet-sunbeam', prompt:`HYPERREALISTIC LIFESTYLE PHOTOGRAPH, vertical 2:3: a sleeping tabby cat curled on a wood floor in a single shaft of warm afternoon sunbeam streaming through a window, dust motes visible in the air, soft shallow depth of field, real photographic interior lifestyle photography. ${PHOTO_TAIL}` },

  // ── Couples (4 photoreal) ──────────────────────────────────────────────
  { name:'couple-hands-goldenhour', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: an extreme close-up of two intertwined hands resting on a soft cream linen blanket in warm golden-hour light, every skin texture and wedding-band detail sharp, soft shallow depth of field, photographic editorial intimate detail. ${PHOTO_TAIL}` },
  { name:'candlelit-dinner', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a candlelit dining table set for two with a glass of red wine, a hand-thrown ceramic plate with a fresh meal, warm candle glow, deeply intimate restaurant photography, sharp focus on the wine glass with soft bokeh background. ${PHOTO_TAIL}` },
  { name:'forehead-kiss', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a tender close-up of two faceless people forehead-to-forehead, faces cropped out of frame above the eyebrows, soft warm window light catching their hair, deeply intimate documentary-style photography, sharp focus on hair texture. ${PHOTO_TAIL}` },
  { name:'couple-wildflowers', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a faceless couple seen from behind walking hand in hand through a real wildflower meadow at golden hour, lupines and daisies brushing past their hands, soft shallow depth of field, real lifestyle/landscape photography. ${PHOTO_TAIL}` },

  // ── New parents (4 photoreal) ──────────────────────────────────────────
  { name:'newborn-feet', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: an extreme close-up of tiny perfect newborn baby feet on a soft cream knit blanket, every wrinkle and skin detail razor-sharp, soft warm window light, real photographic newborn editorial photography. ${PHOTO_TAIL}` },
  { name:'mom-and-baby-window', prompt:`HYPERREALISTIC LIFESTYLE PHOTOGRAPH, vertical 2:3: a faceless mother in a soft cream linen shirt holding her newborn baby against her chest by a tall window with cool morning light, the baby\\'s tiny hand visible against the mother\\'s shoulder, deeply tender real photography. ${PHOTO_TAIL}` },
  { name:'crib-morning-light', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a soft wooden crib with cream linen sheets and a tiny sleeping baby curled inside, warm golden morning light streaming through nearby window, faceless angle from above, sharp focus on the texture of the linen and a tiny hand, real lifestyle/editorial photography. ${PHOTO_TAIL}` },
  { name:'hand-holding-foot', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: an extreme close-up of a parent\\'s hand gently cradling a tiny newborn baby foot, soft warm window light catching the skin texture and tiny toes, real photographic intimate detail. ${PHOTO_TAIL}` },

  // ── Family (4 photoreal) ───────────────────────────────────────────────
  { name:'family-beach-photo', prompt:`HYPERREALISTIC LIFESTYLE PHOTOGRAPH, vertical 2:3: a faceless family of four (two adults, two children) walking hand in hand along a wet beach at golden hour, all seen from behind, footprints in wet sand behind them, soft shallow depth of field, real beach photography. ${PHOTO_TAIL}` },
  { name:'family-cooking', prompt:`HYPERREALISTIC LIFESTYLE PHOTOGRAPH, vertical 2:3: a family kitchen scene with a faceless parent\\'s hands kneading dough on a wooden counter, a small child\\'s hands beside helping, flour on the surface, warm afternoon window light, real intimate documentary photography. ${PHOTO_TAIL}` },
  { name:'three-gen-hands', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a stack of three hands on a wooden table — a young child\\'s tiny hand on the bottom, an adult\\'s hand on top of it, and an aged grandparent\\'s wrinkled hand on top — soft warm window light, deeply tender three-generation photography. ${PHOTO_TAIL}` },
  { name:'family-couch-laugh', prompt:`HYPERREALISTIC LIFESTYLE PHOTOGRAPH, vertical 2:3: a faceless family lounging together on a cream sofa with a soft throw blanket, kids tangled with parents reading, soft warm afternoon light, candid real documentary photography style, faces cropped out or turned away. ${PHOTO_TAIL}` },

  // ── Their home (4 photoreal) ──────────────────────────────────────────
  { name:'home-exterior-dusk', prompt:`HYPERREALISTIC ARCHITECTURAL PHOTOGRAPH, vertical 2:3: a modern Scandinavian-style home exterior at twilight with warm amber lights glowing from inside, lush front-yard garden, deep blue dusk sky, real architectural editorial photography. ${PHOTO_TAIL}` },
  { name:'kitchen-morning-real', prompt:`HYPERREALISTIC LIFESTYLE PHOTOGRAPH, vertical 2:3: a modern kitchen morning scene with sunlight streaming through tall windows, a marble countertop, a single steaming pour-over coffee, fresh sourdough on a wooden board, real editorial home photography. ${PHOTO_TAIL}` },
  { name:'bedroom-real-linen', prompt:`HYPERREALISTIC INTERIOR PHOTOGRAPH, vertical 2:3: a real bedroom scene with rumpled soft cream linen sheets on an unmade bed, warm morning sunlight streaming across them, an open book and steaming mug on the bedside table, real editorial home photography. ${PHOTO_TAIL}` },
  { name:'backyard-hammock', prompt:`HYPERREALISTIC LIFESTYLE PHOTOGRAPH, vertical 2:3: a backyard scene with a striped fabric hammock strung between two trees, an open paperback book resting on the hammock, dappled afternoon sun, lush green grass below, real outdoor lifestyle photography. ${PHOTO_TAIL}` },

  // ── Travelers (4 photoreal) ───────────────────────────────────────────
  { name:'paris-real', prompt:`HYPERREALISTIC TRAVEL PHOTOGRAPH, vertical 2:3: the Eiffel Tower seen from a quiet Paris side street at golden hour, soft pink sky, Haussmann buildings framing the view, real travel editorial photography. ${PHOTO_TAIL}` },
  { name:'iceland-real-landscape', prompt:`HYPERREALISTIC TRAVEL LANDSCAPE PHOTOGRAPH, vertical 2:3: Iceland\\'s dramatic Skogafoss waterfall plunging into a basalt valley, mist rising, soft overcast light, real National-Geographic-style landscape photography. ${PHOTO_TAIL}` },
  { name:'kyoto-cherry-blossoms', prompt:`HYPERREALISTIC TRAVEL PHOTOGRAPH, vertical 2:3: a path through a tunnel of cherry blossom trees in full bloom in Kyoto at soft early morning light, petals scattered on the path, real travel editorial photography. ${PHOTO_TAIL}` },
  { name:'serengeti-elephant', prompt:`HYPERREALISTIC WILDLIFE PHOTOGRAPH, vertical 2:3: a single magnificent African elephant walking across the Serengeti plain at golden hour, acacia trees in the distance, soft warm light, real wildlife photography in the style of National Geographic. ${PHOTO_TAIL}` },

  // ── Milestones (4 photoreal) ──────────────────────────────────────────
  { name:'grad-cap-toss-real', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a graduation cap mid-toss frozen in the air against a vibrant golden-hour sky, gold tassel flying, real sports/event editorial photography style. ${PHOTO_TAIL}` },
  { name:'rings-on-book', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a pair of gold wedding bands resting on an open vintage hardback book, soft warm window light catching the gold and pages, real photographic still-life. ${PHOTO_TAIL}` },
  { name:'moving-boxes-real', prompt:`HYPERREALISTIC LIFESTYLE PHOTOGRAPH, vertical 2:3: stacked cardboard moving boxes in an empty sunlit apartment, bare hardwood floors, a single set of keys on top, tall windows letting in warm morning light, real editorial photography. ${PHOTO_TAIL}` },
  { name:'finish-line-real', prompt:`HYPERREALISTIC SPORTS PHOTOGRAPH, vertical 2:3: a marathon runner mid-stride crossing a real finish line tape, arms raised in triumph, motion blur on the background, sharp focus on the runner, real athletic editorial photography. ${PHOTO_TAIL}` },

  // ── Hard-to-shop-for (4 photoreal) ────────────────────────────────────
  { name:'mountain-reflection-real', prompt:`HYPERREALISTIC LANDSCAPE PHOTOGRAPH, vertical 2:3: a mirror-perfect alpine lake reflecting jagged snowy peaks at golden hour, deep teal water, real National-Geographic-style landscape photography. ${PHOTO_TAIL}` },
  { name:'ocean-wave-real', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a powerful ocean wave caught mid-curl with bright sunlight illuminating the translucent water, foam at the crest, deep teal and turquoise, real surf/ocean photography. ${PHOTO_TAIL}` },
  { name:'dewdrops-macro', prompt:`HYPERREALISTIC MACRO PHOTOGRAPH, vertical 2:3: extreme close-up of dewdrops on green grass blades at sunrise, each droplet refracting the warm light, razor-sharp focus, real macro nature photography. ${PHOTO_TAIL}` },
  { name:'city-skyline-night', prompt:`HYPERREALISTIC NIGHT PHOTOGRAPH, vertical 2:3: a major city skyline at deep blue hour with thousands of warm window lights glowing, smooth water reflection in the foreground, real long-exposure cityscape photography. ${PHOTO_TAIL}` },

  // ── Book & coffee (4 photoreal) ───────────────────────────────────────
  { name:'espresso-pour', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a beautiful pour of espresso into a small glass cup, crema swirling, steam visible, sharp focus on the falling stream, deep glossy black coffee, real food/beverage editorial photography. ${PHOTO_TAIL}` },
  { name:'library-architecture-real', prompt:`HYPERREALISTIC ARCHITECTURAL PHOTOGRAPH, vertical 2:3: a grand library interior with floor-to-ceiling oak bookshelves, a tall ladder, an ornate spiral staircase visible, warm afternoon light, real architectural editorial photography. ${PHOTO_TAIL}` },
  { name:'open-book-macro', prompt:`HYPERREALISTIC MACRO PHOTOGRAPH, vertical 2:3: extreme close-up of an open vintage hardback book showing the texture of yellowed pages and a faint pressed flower between them, soft warm window light, real photographic detail. ${PHOTO_TAIL}` },
  { name:'latte-topdown-real', prompt:`HYPERREALISTIC FOOD PHOTOGRAPH, vertical 2:3: a top-down view of a perfect rosetta latte-art coffee on a white ceramic saucer with a tiny spoon and a small almond biscotti beside it, soft natural light, real food editorial photography. ${PHOTO_TAIL}` },

  // ── Music (4 photoreal) ───────────────────────────────────────────────
  { name:'turntable-real', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a vintage turntable spinning a vinyl record close-up, soft warm tungsten light catching the chrome tonearm, real product/lifestyle photography. ${PHOTO_TAIL}` },
  { name:'piano-keys-hands', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a close-up of an adult\\'s hands playing a black grand piano keyboard, faceless cropped to just hands and forearms, soft warm side light, real editorial music photography. ${PHOTO_TAIL}` },
  { name:'guitar-strings-macro', prompt:`HYPERREALISTIC MACRO PHOTOGRAPH, vertical 2:3: an extreme close-up of guitar strings vibrating mid-strum, fingers cropped just visible in soft focus at the edge, sharp detail on the strings, real music photography. ${PHOTO_TAIL}` },
  { name:'studio-mic-real', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a vintage chrome studio microphone on a stand in a recording booth, soft warm tungsten key light, blurred acoustic foam panels behind, real product photography. ${PHOTO_TAIL}` },

  // ── Nature & adventure (4 photoreal) ──────────────────────────────────
  { name:'aurora-real', prompt:`HYPERREALISTIC LANDSCAPE PHOTOGRAPH, vertical 2:3: a real long-exposure photograph of vivid green and violet aurora borealis dancing over a snowy Iceland landscape, with a tiny silhouetted lone figure on the horizon, real night-sky photography. ${PHOTO_TAIL}` },
  { name:'deer-forest-real', prompt:`HYPERREALISTIC WILDLIFE PHOTOGRAPH, vertical 2:3: a single elegant deer standing alert in a misty pine forest at dawn, warm shafts of sunlight cutting through the trees, sharp focus on the deer, real wildlife editorial photography. ${PHOTO_TAIL}` },
  { name:'waterfall-real', prompt:`HYPERREALISTIC LANDSCAPE PHOTOGRAPH, vertical 2:3: a powerful waterfall cascading down lush green moss-covered rocks in a Pacific Northwest forest, long-exposure silky water, mist rising, real landscape photography. ${PHOTO_TAIL}` },
  { name:'patagonia-real', prompt:`HYPERREALISTIC LANDSCAPE PHOTOGRAPH, vertical 2:3: Patagonia\\'s dramatic Torres del Paine peaks at sunrise reflected in a perfectly still lake, real National-Geographic-style landscape photography. ${PHOTO_TAIL}` },

  // ── Seasons (4 photoreal) ─────────────────────────────────────────────
  { name:'snowy-forest-real', prompt:`HYPERREALISTIC LANDSCAPE PHOTOGRAPH, vertical 2:3: a quiet path winding through a snow-covered pine forest at sunrise, soft pink and gold dawn light catching the snow, real winter landscape photography. ${PHOTO_TAIL}` },
  { name:'autumn-leaves-real', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a close-up of fallen autumn leaves on wet pavement in vivid red, orange, and yellow, soft afternoon light catching the leaf veins, real seasonal photography. ${PHOTO_TAIL}` },
  { name:'cherry-tree-real', prompt:`HYPERREALISTIC PHOTOGRAPH, vertical 2:3: a real flowering cherry blossom tree in full pink bloom against a soft blue sky, scattered petals falling, real spring travel photography. ${PHOTO_TAIL}` },
  { name:'summer-beach-real', prompt:`HYPERREALISTIC LANDSCAPE PHOTOGRAPH, vertical 2:3: a real summer beach scene at sunset with smooth wet sand reflecting a vibrant orange and pink sky, gentle low waves rolling in, real travel landscape photography. ${PHOTO_TAIL}` },
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
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: ASPECT } }
      })
    }
  );
  const text = await resp.text();
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { msg = JSON.parse(text)?.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  let data; try { data = JSON.parse(text); } catch { throw new Error('Bad JSON from Gemini'); }
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts?.length) throw new Error('No parts in Gemini response');
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) throw new Error('No image data in response');
  const png = Buffer.from(imagePart.inlineData.data, 'base64');
  const outPath = path.join(OUT_DIR, `${spec.name}.webp`);
  if (fs.existsSync(outPath)) {
    const backup = outPath + '.backup-' + Date.now();
    fs.copyFileSync(outPath, backup);
  }
  await sharp(png).resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(outPath);
  return { name: spec.name, bytes: fs.statSync(outPath).size, ms: Date.now() - t0 };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const apiKey = loadApiKey();
  console.log(`Generating ${TILES.length} PHOTOREALISTIC tiles via Gemini 2.5 Flash Image (${ASPECT})…`);
  const results = []; const failed = [];
  let i = 0;
  for (const spec of TILES) {
    i++;
    process.stdout.write(`  [${String(i).padStart(2,'0')}/${TILES.length}] ${spec.name.padEnd(28)} … `);
    try {
      const r = await generateOne(spec, apiKey);
      results.push(r);
      console.log(`OK  ${(r.bytes / 1024).toFixed(0)} KB · ${(r.ms / 1000).toFixed(1)}s`);
    } catch (e) {
      failed.push({ name: spec.name, error: e.message });
      console.log(`FAIL  ${e.message}`);
    }
  }
  console.log(`\nDone. Wrote ${results.length}/${TILES.length} files.`);
  if (failed.length) {
    console.log('Failed:'); for (const f of failed) console.log(`  ${f.name}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
