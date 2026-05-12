// scripts/generate-gift-aisle.js
// Expand the /gifts page from 12 tiles to 48 — a real "gift card aisle"
// with 8 categories of 6 tiles each. 12 tiles already exist from earlier
// Moments rounds; this script generates the 36 NEW ones.
//
// Categories (existing tiles in parens):
//   1. For pet lovers    (pet-portrait)       — 5 new
//   2. For couples       (anniversary, wedding-day, where-it-all-began) — 3 new
//   3. For new parents   (new-baby, kids-room)— 4 new
//   4. For family        (for-mom-and-dad)    — 5 new
//   5. For their home    (housewarming)       — 5 new
//   6. For travelers     (travel-memory)      — 5 new
//   7. For milestones    (in-their-honor)     — 5 new
//   8. Hard-to-shop-for  (has-everything-gift, best-friend) — 4 new
// Total new: 36. All 2:3 vertical to match the existing tile grid.
//
// Run: node scripts/generate-gift-aisle.js

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

// 36 NEW tile specs. Each prompt sits in the same painterly fine-art register
// as the existing 12 tiles so the grid feels visually unified. No text, no
// logos, no borders, faces-from-behind or faceless wherever a human is in
// frame so any buyer can project themselves or someone they love into it.
const TILES = [
  // ── For pet lovers ────────────────────────────────────────────────────
  { name:'pet-memorial', prompt:'Soft tender painterly memorial scene in vertical 2:3 composition: a beloved pet\'s leather collar resting on a sun-dappled weathered wooden bench in a flowering garden at golden hour, soft warm light, gentle scattered fallen petals, deep nostalgic and peaceful mood, palette of warm gold, soft cream, dusty rose, sage green, museum-quality fine-art painting, photographic-painterly hybrid. No text, no logos, no watermarks, no frames or borders, no people, no pets in frame.' },
  { name:'two-best-friends', prompt:'Painterly fine-art tender scene in vertical 2:3 composition: two dogs (a golden retriever and a black labrador) nuzzling close together at golden hour in a soft-focus meadow, one gently resting their head on the other\'s back, deep trust and bond, soft warm sunset light catching the fur, painterly oil brushwork, palette of warm honey-gold, soft cream, deep amber, gentle sage. The dogs are the absolute focal hero of the frame. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'first-day-home', prompt:'Tender painterly fine-art scene in vertical 2:3 composition: a small wide-eyed golden retriever puppy curled in a soft cream knit blanket on a wood floor in a sunlit empty room, dappled afternoon window light, deeply curious and gentle mood, painterly watercolor textures, palette of soft cream, warm honey, gentle dusty rose, soft sage. The puppy is the absolute focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'rescue-story', prompt:'Tender painterly fine-art scene in vertical 2:3 composition: a faceless human hand reaching gently toward a hopeful loyal mixed-breed dog (seen from behind/side, just the head and shoulders) in soft warm golden hour light by an open doorway, deep loyalty and hope and quiet rescue moment, painterly oil brushwork, palette of warm honey-gold, soft amber, gentle cream, deep brown fur. The dog is the focal hero, the hand is in soft focus. No text, no logos, no watermarks, no frames or borders, no faces visible.' },
  { name:'quiet-companion', prompt:'Serene painterly fine-art scene in vertical 2:3 composition: a peaceful gray tabby cat sitting on a sunlit windowsill watching gentle rain fall outside, soft cool window light spilling onto the cat\'s fur, intimate calm mood, painterly oil brushwork, palette of soft pewter, pale dusty rose, gentle cream, cool blue rain outside. The cat is the absolute focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },

  // ── For couples ───────────────────────────────────────────────────────
  { name:'engagement', prompt:'Romantic painterly fine-art close-up in vertical 2:3 composition: faceless couple\'s hands (cropped to just the hands and wrists), one hand gently slipping a small gold ring onto the ring finger of the other, soft warm bokeh background of golden hour light, deeply tender and intimate moment, painterly oil brushwork, palette of warm gold, soft blush, gentle cream, soft amber bokeh. The hands and ring are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'first-dance', prompt:'Romantic painterly fine-art scene in vertical 2:3 composition: a faceless couple in formal wedding attire (the bride in flowing ivory, the groom in dark suit) dancing alone close together under a canopy of warm string lights at twilight, soft golden glow, deeply intimate first-dance moment, painterly oil brushwork, palette of warm gold, soft ivory, blush, deep amber lights. The couple is the focal hero, embracing as they dance, faceless from the side. No text, no logos, no watermarks, no frames or borders.' },
  { name:'adventures-together', prompt:'Nostalgic painterly fine-art scene in vertical 2:3 composition: a faceless couple seen from behind sitting close together on the hood of a vintage road-trip car parked on an open desert highway at golden hour, watching the warm sunset stretch ahead, deep shared-life and adventure mood, painterly oil brushwork, palette of warm gold, dusty rose, deep amber, soft pewter horizon. The couple and car are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },

  // ── For new parents ───────────────────────────────────────────────────
  { name:'babys-first-year', prompt:'Tender painterly watercolor scene in vertical 2:3 composition: a small soft pastel-frosted first-birthday cake with a single lit candle on a rustic wooden table beside a tiny pair of cream knit baby shoes, soft dappled warm afternoon light, deeply gentle and nostalgic mood, painterly watercolor washes, palette of soft cream, dusty pink, pale yellow, gentle sage. The cake and shoes are the focal hero. No text on the cake, no logos, no watermarks, no frames or borders, no people.' },
  { name:'big-sibling', prompt:'Soft tender watercolor scene in vertical 2:3 composition: a faceless older child (3-5 years old, from behind/side, in soft cream pajamas) gently leaning down to kiss the forehead of their newborn baby sibling wrapped in a cream knit blanket, soft warm window light, deeply tender sibling-love moment, painterly watercolor textures, palette of soft cream, dusty pink, pale yellow, gentle sage. The siblings are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'twins-siblings', prompt:'Tender painterly watercolor scene in vertical 2:3 composition: two newborn babies curled together asleep nose-to-nose on a soft cream knit blanket, faceless angle from above with just the tops of their tiny heads and tiny hands visible, soft dappled morning light, deeply gentle and protective mood, painterly watercolor washes, palette of soft cream, pale rose, dusty pink, gentle warm yellow. The twins are the focal hero. No text, no logos, no watermarks, no frames or borders.' },
  { name:'nursery-dreamscape', prompt:'Whimsical storybook fine-art scene in vertical 2:3 composition: a dreamy magical scene above a sleeping baby — soft pastel clouds, gentle crescent moon, scattered stars, a tiny paper hot-air balloon drifting through, the baby\'s small crib in the foreground in soft focus, deeply gentle fantasy storybook mood, painterly watercolor textures, palette of soft pastel pink, pale lavender, dusty mint, gentle cream, soft golden stars. No text, no logos, no watermarks, no frames or borders.' },

  // ── For family ────────────────────────────────────────────────────────
  { name:'for-mom', prompt:'Tender painterly impressionistic watercolor scene in vertical 2:3 composition: a mother\'s hands cradling her young child\'s small hands together in soft warm afternoon window light, faceless cropped to just hands and forearms, deeply tender unconditional-love mood, painterly watercolor washes with visible brushstrokes, palette of soft warm cream, dusty rose, gentle pale yellow, soft golden light. The hands are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'for-dad', prompt:'Warm painterly fine-art scene in vertical 2:3 composition: a faceless father seen from behind carrying his small child on his shoulders walking through a sunlit golden wheat meadow at golden hour, deep paternal warmth and adventure, the child reaching toward the sky, painterly oil brushwork, palette of warm honey-gold, deep amber, soft cream, gentle dusty rose sky. The father and child are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'for-grandparents', prompt:'Nostalgic painterly fine-art scene in vertical 2:3 composition: three generations seen from behind walking hand-in-hand together along a quiet beach at sunset — an older grandparent figure on one side, an adult parent in the middle, a small child on the other side, deep three-generations bond, painterly oil brushwork, palette of warm gold, dusty rose, soft amber sand, gentle pale-rose sky. The trio is the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'sibling-gift', prompt:'Warm painterly fine-art scene in vertical 2:3 composition: two faceless adult siblings seen from behind walking together arm-in-arm along a winding country path through autumn trees at golden hour, scattered amber and rust fallen leaves, deep sibling-bond warmth, painterly oil brushwork, palette of warm gold, deep amber, rust, soft cream sky. The siblings are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'family-tree', prompt:'Majestic painterly fine-art landscape in vertical 2:3 composition: a single ancient sprawling oak tree standing alone in a golden meadow at sunset, warm light streaming through the wide branches, deep symbolic family-heritage and rootedness mood, painterly oil brushwork, palette of deep emerald, warm gold, soft amber, golden sunset sky. The oak is the absolute focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },

  // ── For their home ────────────────────────────────────────────────────
  { name:'first-home-together', prompt:'Warm painterly fine-art scene in vertical 2:3 composition: a faceless couple seen from behind standing close together in front of their cozy first home at twilight, warm golden window-light glowing from inside, soft front-yard flowers, deeply emotional milestone mood, painterly oil brushwork, palette of warm gold, soft amber, dusty rose twilight sky, deep sage. The couple and home are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'dream-home', prompt:'Painterly fine-art scene in vertical 2:3 composition: a dreamy cottage with stone walls, climbing roses, golden window-light glowing from inside at twilight, a winding flower-lined garden path leading to the front door, deep fairytale aspirational mood, painterly oil brushwork, palette of soft pastel rose, warm gold, deep sage, gentle dusty lavender sky. The cottage is the absolute focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'cozy-corner', prompt:'Intimate painterly fine-art interior scene in vertical 2:3 composition: a perfect reading nook — a worn cognac-leather armchair beside a small wooden side table with a steaming ceramic mug and an open book, a glowing brass reading lamp casting warm light, soft cream throw blanket draped over the chair, deeply cozy lived-in mood, painterly oil brushwork, palette of warm amber, cognac, soft cream, deep walnut wood. The chair and lamp are the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'kitchen-art', prompt:'Warm painterly fine-art still-life in vertical 2:3 composition: a sun-dappled kitchen counter at morning light — a freshly-baked rustic loaf of bread on a wooden board, a small ceramic vase with sprigs of wildflowers, a hand-thrown coffee mug, soft dappled window light, deeply lived-in family-home mood, painterly oil brushwork, palette of warm honey-gold, soft cream, gentle sage, soft amber. The bread and flowers are the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'reading-nook-corner', prompt:'Serene painterly fine-art interior scene in vertical 2:3 composition: a quiet reading corner with a single rattan armchair, a stack of vintage hardback books beside it on a small woven rug, a tall floor lamp with soft warm glow, dappled afternoon window light, deeply calm meditative mood, painterly oil brushwork, palette of soft cream, warm honey, gentle dusty rose, deep walnut wood. The chair and books are the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },

  // ── For travelers ─────────────────────────────────────────────────────
  { name:'honeymoon', prompt:'Romantic painterly fine-art scene in vertical 2:3 composition: a faceless couple seen from behind walking hand-in-hand down a narrow Mediterranean village street at golden hour, terracotta walls, climbing pink bougainvillea, warm cobblestones, distant blue sea glimpse, deeply romantic travel mood, painterly oil brushwork, palette of warm terracotta, dusty pink, deep amber, soft cream walls. The couple is the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'dream-destination', prompt:'Dreamlike painterly fine-art scene in vertical 2:3 composition: a single faceless distant traveler walking toward a misty ancient Asian temple emerging from a sea of dawn clouds on a mountain top, soft atmospheric light, deeply aspirational dream-destination mood, painterly oil brushwork, palette of soft pearl-white mist, warm gold dawn, deep sage temple, cool teal mountain shadows. The temple is the focal hero with the figure tiny in the foreground. No text, no logos, no watermarks, no frames or borders, face not visible.' },
  { name:'hometown', prompt:'Nostalgic painterly fine-art scene in vertical 2:3 composition: a quiet small-town main street at golden hour, vintage storefronts, a single faceless figure walking the sidewalk, soft warm street-lamp glow, deeply nostalgic Americana mood, painterly oil brushwork, palette of warm gold, soft amber, deep cream brick, gentle dusty rose sky. The street is the focal hero. No text on the storefronts, no logos, no watermarks, no frames or borders, face not visible.' },
  { name:'beach-memory', prompt:'Nostalgic painterly fine-art scene in vertical 2:3 composition: a vintage striped beach umbrella over two empty cream wooden beach chairs facing the open ocean at sunset, soft warm golden hour light on the wet sand, gentle low waves in the distance, deeply nostalgic summer-memory mood, painterly oil brushwork, palette of warm coral, soft cream, deep amber, gentle teal sea. The umbrella and chairs are the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'mountain-memory', prompt:'Cinematic painterly fine-art landscape in vertical 2:3 composition: a single faceless hiker silhouette pausing on a winding mountain trail at sunset, vast layered valleys and distant peaks behind, deeply nostalgic mountain-adventure mood, painterly oil brushwork, palette of warm gold sunset, soft amber, cool teal mountain shadows, gentle pale-rose sky. The figure and trail are the focal hero. No text, no logos, no watermarks, no frames or borders, face not visible.' },

  // ── For milestones ────────────────────────────────────────────────────
  { name:'graduation', prompt:'Cinematic painterly fine-art scene in vertical 2:3 composition: a single faceless graduate silhouetted from behind in cap and flowing gown, mid-toss of their cap into a warm sunset sky, vast open horizon behind, deeply triumphant achievement mood, painterly oil brushwork, palette of warm gold sunset, deep amber, soft cream cap, gentle pink horizon. The figure is the focal hero. No text, no logos, no watermarks, no frames or borders, face not visible.' },
  { name:'retirement', prompt:'Peaceful painterly fine-art scene in vertical 2:3 composition: a wooden porch swing overlooking a still mirror-like sunset lake, two empty cushions side by side, soft warm golden hour light, deeply calm next-chapter mood, painterly oil brushwork, palette of warm gold, soft amber sky, deep teal lake, gentle dusty rose cloud reflections. The swing and lake are the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'new-job', prompt:'Painterly fine-art scene in vertical 2:3 composition: a clean modern office desk by a tall window with morning city light streaming in, a fresh leather-bound notebook beside a steaming ceramic coffee mug, a single small plant in a clay pot, deeply hopeful fresh-start mood, painterly oil brushwork, palette of soft cream, warm gold morning light, gentle sage plant, cool blue distant cityscape. The desk is the focal hero. No text on the notebook, no logos, no watermarks, no frames or borders, no people.' },
  { name:'achievement-summit', prompt:'Cinematic painterly fine-art landscape in vertical 2:3 composition: a single faceless figure standing at the highest peak of a rocky mountain at sunrise, arms slightly raised in quiet triumph, facing away from camera toward vast layered misty peaks below bathed in warm sunrise light, deeply triumphant achievement mood, painterly oil brushwork, palette of warm gold sunrise, soft pink horizon, cool teal mountain shadows. The figure is the focal hero against the vast landscape. No text, no logos, no watermarks, no frames or borders, face not visible.' },
  { name:'birthday', prompt:'Tender painterly fine-art still-life in vertical 2:3 composition: a beautiful soft pastel birthday cake with several lit candles glowing warmly on a rustic wooden table, soft warm dappled lamp light, scattered rose petals beside it, deeply tender intimate celebration mood, painterly oil brushwork, palette of soft pastel cream, dusty pink, warm gold candles, gentle dusty rose. The cake is the focal hero. No text on the cake, no logos, no watermarks, no frames or borders, no people.' },

  // ── For the hard-to-shop-for ──────────────────────────────────────────
  { name:'happy-place', prompt:'Dreamlike painterly fine-art landscape in vertical 2:3 composition: a small wooden cabin sitting in a quiet forest clearing at golden hour, soft smoke curling from the chimney, surrounded by tall pine trees with warm sunset light filtering through, deeply nostalgic personal-sanctuary mood, painterly oil brushwork, palette of warm gold, deep emerald, soft amber, gentle dusty rose sky. The cabin is the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'surreal-dream', prompt:'Surreal painterly fine-art scene in vertical 2:3 composition: floating islands drifting in pastel clouds at twilight, soft cascading waterfalls falling between them into infinite sky, deeply dreamlike fantasy mood, painterly oil brushwork in the spirit of Maxfield Parrish, palette of soft pastel pink, dusty lavender, deep teal sky, warm gold accents. The floating islands are the absolute focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'abstract-for-them', prompt:'Bold painterly abstract oil painting in vertical 2:3 composition: gestural palette-knife strokes layering warm gold, deep crimson, soft cream, deep teal, and rich amber across the canvas in dynamic energetic motion, deeply contemporary fine-art mood, museum-quality abstract painting with visible heavy brush and knife texture. The abstract gesture is the focal hero. No text, no logos, no watermarks, no frames or borders, no representational subjects.' },
  { name:'anything-you-describe', prompt:'Tender painterly fine-art still-life in vertical 2:3 composition: a vintage writer\'s wooden desk at dusk — a single tall lit candle in a brass holder, an open fountain pen resting on a half-written letter, a small leather-bound journal beside it, soft warm candle glow, deeply intimate creative mood, painterly oil brushwork, palette of warm gold candlelight, deep amber, soft cream paper, deep walnut wood. The desk scene is the focal hero. No readable text on the letter, no logos, no watermarks, no frames or borders, no people.' },
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
  const outPath = path.join(OUT_DIR, `${spec.name}.webp`);
  if (fs.existsSync(outPath)) {
    const backup = outPath + '.backup-' + Date.now();
    fs.copyFileSync(outPath, backup);
  }
  await sharp(png)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);
  const bytes = fs.statSync(outPath).size;
  return { name: spec.name, bytes, ms: Date.now() - t0 };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const apiKey = loadApiKey();
  console.log(`Generating ${TILES.length} new gift-aisle tiles via Gemini 2.5 Flash Image (${ASPECT})…\n`);
  const results = [];
  const failed = [];
  for (const spec of TILES) {
    process.stdout.write(`  ${spec.name.padEnd(24)} … `);
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
    console.log('Failed:');
    for (const f of failed) console.log(`  ${f.name}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
