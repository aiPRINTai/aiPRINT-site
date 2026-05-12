// scripts/generate-gift-aisle-v3.js
// Round 3 — 4 NEW tiles per category to push each category from 12 -> 16.
// User mandate: more realism, palettes we haven't hit (cool/monochrome/
// sepia/high-contrast/pastel), more fun & cool. Each category gets a
// distinct new angle the existing 12 miss.
//
// 48 new tiles total. Each 2:3 vertical. Same painterly fine-art register
// where it fits, but several tiles intentionally lean PHOTOREALISTIC,
// MONOCHROME, or POP/GRAPHIC for palette + style variety.
//
// Run: node scripts/generate-gift-aisle-v3.js

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
  // ── For pet lovers (+4) — fun, monochrome, outdoor ────────────────────
  { name:'pet-hiking', prompt:'PHOTOREALISTIC fine-art photograph in vertical 2:3 composition: a happy adventurous dog (a husky or border collie) seen from behind sitting next to its faceless human owner at a mountain overlook at sunrise, deeply emotional adventure-buddy mood, cool dawn palette of soft pink, dusty teal mountains, warm gold sun, photographic — not painterly. The dog and view are the focal hero. No text, no logos, no watermarks, no frames or borders, face not visible.' },
  { name:'pet-bw-portrait', prompt:'MONOCHROME black-and-white fine-art photograph in vertical 2:3 composition: a dramatic close-up portrait of a dignified dog in classic Ansel-Adams-style high-contrast black-and-white, soft window light catching the eyes, deeply intimate dignified mood, photographic studio portrait quality, palette of deep glossy black, soft pearl white, gentle silver mid-tones, NO color at all. The dog is the absolute focal hero. No text, no logos, no watermarks, no frames or borders.' },
  { name:'pet-in-costume', prompt:'PLAYFUL FUN painterly fine-art scene in vertical 2:3 composition: a happy small dog wearing a tiny knitted sweater of vibrant rainbow stripes, sitting on a soft cream rug in warm afternoon light, deeply joyful playful mood, painterly oil brushwork, palette of VIBRANT rainbow stripes, soft cream, warm gold light. The dog is the absolute focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'pet-cozy-sweater', prompt:'COZY warm painterly fine-art scene in vertical 2:3 composition: a fluffy cat curled up wearing a tiny knitted scarf next to a steaming mug of tea on a soft cream blanket by a window, autumn leaves visible outside, deeply cozy autumn mood, painterly oil brushwork, palette of warm amber, dusty cream, soft sage, deep burgundy scarf. The cat is the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },

  // ── For couples (+4) — long-distance, fireworks, snow, vineyard ─────
  { name:'long-distance-call', prompt:'TENDER cool painterly fine-art scene in vertical 2:3 composition: a small glowing phone screen on a wooden table at night showing two faceless silhouetted hands reaching toward each other across the screen, surrounded by a steaming mug and an open journal, soft warm lamp light, deeply tender long-distance mood, painterly oil brushwork, palette of cool slate-blue night, warm amber lamp, soft cream screen glow. No readable text on the screen, no logos, no watermarks, no frames or borders, no faces visible.' },
  { name:'couple-fireworks', prompt:'VIBRANT romantic painterly fine-art scene in vertical 2:3 composition: a faceless couple seen from behind sitting close together on a rooftop watching vibrant exploding fireworks light up the sky in magenta, gold, and emerald, deeply joyful celebratory romantic mood, painterly oil brushwork, palette of VIBRANT magenta and gold fireworks, deep navy sky, soft cream silhouettes, deep walnut rooftop. The couple and fireworks are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'snow-day-couple', prompt:'COOL whimsical painterly fine-art scene in vertical 2:3 composition: a faceless couple in matching wool scarves and beanies seen from behind walking hand in hand down a snow-covered tree-lined street at twilight, soft warm streetlamp glow ahead, gentle falling snow, deeply tender winter-walk mood, painterly oil brushwork, palette of cool dusty blue snow, warm amber lamp glow, deep cranberry scarves, soft pearl mist. The couple is the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'wine-country-couple', prompt:'WARM rich painterly fine-art scene in vertical 2:3 composition: a faceless couple seen from behind sitting at a small bistro table on a vineyard terrace at golden hour, two glasses of red wine catching the warm light, rows of grapevines stretching to a Tuscan villa in the distance, deeply romantic wine-country mood, painterly oil brushwork, palette of warm gold, deep cranberry wine, soft amber stone, gentle sage vineyard. The couple and wine are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },

  // ── For new parents (+4) — announcement, name, hand, generational ────
  { name:'pregnancy-announcement', prompt:'TENDER painterly fine-art still-life in vertical 2:3 composition: a small chalkboard sign resting against a wooden bench beside a tiny pair of cream knit baby shoes and a small bouquet of soft pastel flowers, soft warm afternoon light, deeply joyful pregnancy-announcement mood, painterly watercolor textures, palette of soft cream, dusty pink, gentle sage, warm gold light. The sign and shoes are the focal hero. No readable text on the chalkboard, no logos, no watermarks, no frames or borders, no people.' },
  { name:'baby-monogram', prompt:'WHIMSICAL painterly fine-art still-life in vertical 2:3 composition: a soft watercolor of an ornate decorative single capital initial letter (any letter) surrounded by gentle pastel flowers, baby blocks, and a tiny knit bunny, soft warm window light, deeply tender baby-nursery mood, painterly watercolor washes, palette of soft pastel pink, baby blue, gentle cream, soft mint. The composition is the focal hero. No readable text other than the single decorative letter, no logos, no watermarks, no frames or borders, no people.' },
  { name:'baby-hand-in-parent', prompt:'TENDER close-up painterly fine-art scene in vertical 2:3 composition: an extreme close-up of a tiny newborn baby hand wrapped around a faceless adult finger, soft warm window light catching the skin texture, deeply tender first-bond mood, painterly oil brushwork, palette of soft cream skin tones, warm gold light, gentle dusty pink. The hands are the absolute focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'baby-with-grandparent', prompt:'TENDER painterly fine-art scene in vertical 2:3 composition: a faceless grandparent\'s aged hands carefully cradling a tiny sleeping newborn baby wrapped in a soft cream blanket, soft warm afternoon window light, deeply tender three-generation mood, painterly watercolor textures, palette of soft cream, warm gold, gentle dusty rose, soft amber light. The hands and baby are the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },

  // ── For family (+4) — silhouette portrait, picnic, roadtrip, album ───
  { name:'family-silhouette', prompt:'WARM cinematic painterly fine-art scene in vertical 2:3 composition: a faceless family silhouette (two adults, two children, one dog) seen from behind standing together on a hilltop watching a vibrant sunset, deeply tender family-portrait mood, painterly oil brushwork, palette of warm gold sunset, soft coral, deep amber silhouettes, gentle dusty rose sky. The family is the focal hero. No text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'family-picnic', prompt:'BRIGHT JOYFUL painterly fine-art scene in vertical 2:3 composition: a sunny park picnic spread on a checkered red-and-white blanket — a basket of fresh fruit, sandwiches wrapped in paper, glass jars of lemonade, scattered wildflowers, soft warm afternoon sun, deeply joyful family-picnic mood, painterly oil brushwork, palette of VIBRANT cherry red, sunshine yellow, deep sage grass, soft cream blanket. The picnic is the focal hero. No people, no text, no logos, no watermarks, no frames or borders.' },
  { name:'family-roadtrip', prompt:'WARM nostalgic painterly fine-art scene in vertical 2:3 composition: a vintage station wagon with luggage strapped to the roof rack parked at a desert overlook at golden hour, vast canyons stretching ahead, deeply joyful family-roadtrip mood, painterly oil brushwork, palette of warm gold sunset, soft amber desert, deep cranberry car, gentle dusty rose sky. The car and view are the focal hero. No people, no readable text or logos on the car, no watermarks, no frames or borders.' },
  { name:'family-photo-album', prompt:'NOSTALGIC painterly fine-art still-life in vertical 2:3 composition: a vintage open leather photo album on a wooden table, scattered Polaroid-style photos of family memories visible (faces blurred), soft warm afternoon window light, deeply nostalgic family-history mood, painterly oil brushwork, palette of warm cream paper, deep cognac leather, soft amber light, gentle dusty rose. The album is the focal hero. No readable text or visible faces on the photos, no logos, no watermarks, no frames or borders.' },

  // ── For their home (+4) — porch swing, gallery wall, dining nook, MCM ─
  { name:'porch-swing', prompt:'WARM painterly fine-art scene in vertical 2:3 composition: a classic white wooden porch swing with soft striped cushions hanging from chains on a wraparound porch at golden hour, a sweating glass of lemonade on a small side table, deeply peaceful Americana mood, painterly oil brushwork, palette of warm gold, soft cream porch, deep amber sun, gentle sage garden beyond. The swing is the focal hero. No people, no text, no logos, no watermarks, no frames or borders.' },
  { name:'gallery-wall', prompt:'BRIGHT painterly fine-art scene in vertical 2:3 composition: a stylish hallway gallery wall display with a curated arrangement of various art pieces in coordinating gold and walnut frames against a soft cream wall, warm pendant light overhead, deeply curated design-lover mood, painterly oil brushwork, palette of warm gold frames, soft cream wall, gentle sage accents, warm amber light. The gallery wall is the focal hero. No readable text on the artwork, no logos, no watermarks, no outer frames or borders around the image, no people.' },
  { name:'sunlit-dining-nook', prompt:'BRIGHT painterly fine-art scene in vertical 2:3 composition: a cozy breakfast nook with a small round wooden table beside a tall window, a ceramic vase with fresh tulips, a bowl of bright oranges, warm morning sun streaming in, deeply joyful morning mood, painterly impressionist oil brushwork, palette of warm gold sun, VIBRANT yellow tulips, deep orange fruit, soft cream walls. The nook is the focal hero. No people, no text, no logos, no watermarks, no frames or borders.' },
  { name:'mid-century-living-room', prompt:'STYLISH painterly fine-art scene in vertical 2:3 composition: a sophisticated mid-century modern living room with a deep teal velvet sofa, vintage walnut credenza, sculptural floor lamp, a single round mirror on the wall, warm afternoon light, deeply curated retro-design mood, painterly oil brushwork, palette of deep teal, warm walnut, soft cream, gentle brass accents. The living room is the focal hero. No people, no text, no logos, no watermarks, no frames or borders, no wall art in the scene.' },

  // ── For travelers (+4) — Greek islands, Northern Lights, Africa, train ─
  { name:'greek-santorini', prompt:'VIBRANT painterly fine-art scene in vertical 2:3 composition: classic Santorini Greek-island whitewashed houses with vibrant blue domed roofs cascading down a cliffside to the deep cobalt Aegean sea, soft warm afternoon Mediterranean sun, deeply joyful travel-destination mood, painterly oil brushwork, palette of VIBRANT cobalt blue domes, soft cream walls, deep azure sea, warm gold sun. The houses are the focal hero. No people, no text, no logos, no watermarks, no frames or borders.' },
  { name:'northern-lights-cabin', prompt:'COOL DRAMATIC painterly fine-art scene in vertical 2:3 composition: a small wooden cabin in deep snowy woods at night under a vibrant emerald-green and violet aurora borealis dancing across the deep navy starry sky, soft warm amber light glowing from the cabin windows, deeply magical Northern-Lights-trip mood, painterly oil brushwork, palette of VIBRANT emerald aurora, deep violet sky, cool dusty blue snow, warm amber cabin glow. The cabin and aurora are the focal hero. No people, no text, no logos, no watermarks, no frames or borders.' },
  { name:'african-market', prompt:'VIBRANT painterly fine-art scene in vertical 2:3 composition: a bustling Moroccan or West-African outdoor market alley with stalls displaying vibrant woven baskets, mounds of colorful spices in red, yellow, and orange, hanging textiles, warm afternoon sun filtering through, deeply joyful travel-discovery mood, painterly impressionist oil brushwork, palette of VIBRANT saturated red and yellow spices, deep cobalt textiles, warm cream walls, gentle amber light. The market is the focal hero. No people, no readable text on signs, no logos, no watermarks, no frames or borders.' },
  { name:'swiss-train-window', prompt:'COOL serene painterly fine-art scene in vertical 2:3 composition: the view through a vintage train window — vibrant green Swiss Alps meadows, distant snow-capped peaks, a tiny chalet far below, soft warm afternoon light, deeply nostalgic classic-train-travel mood, painterly oil brushwork, palette of VIBRANT emerald meadows, cool dusty blue peaks, soft cream snow, warm amber sun. The view is the focal hero, with subtle train window framing. No people, no text or logos on the window, no watermarks, no outer frames or borders.' },

  // ── For milestones (+4) — long marriage, first car, book launch, finish line ─
  { name:'golden-anniversary', prompt:'WARM elegant painterly fine-art still-life in vertical 2:3 composition: a pair of worn gold wedding bands resting on a faceless aged piece of cream lace beside a single dried rose, soft warm afternoon window light, deeply tender 50-year-anniversary mood, painterly oil brushwork, palette of warm gold, soft cream lace, gentle dusty rose, deep amber light. The rings are the absolute focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'first-car-keys', prompt:'BRIGHT JOYFUL painterly fine-art still-life in vertical 2:3 composition: a single set of shiny car keys with a small keychain resting on a sunlit empty driveway pavement, blurred behind it the silhouette of a first car, soft warm morning light, deeply joyful first-car milestone mood, painterly oil brushwork, palette of warm gold morning, soft cream keys, deep amber pavement, gentle dusty rose sky. The keys are the focal hero. No readable text on the keychain, no logos, no watermarks, no frames or borders, no people.' },
  { name:'book-launch', prompt:'WARM elegant painterly fine-art still-life in vertical 2:3 composition: a single hardback book with a soft cream dust jacket resting on a wooden table beside a fountain pen and a glass of celebratory wine, soft warm afternoon library light, deeply tender author milestone mood, painterly oil brushwork, palette of warm cream paper, deep walnut wood, gentle gold pen, soft burgundy wine. The book is the focal hero. No readable title or author on the book, no logos, no watermarks, no frames or borders, no people.' },
  { name:'finish-line', prompt:'BRIGHT JOYFUL painterly fine-art scene in vertical 2:3 composition: a single faceless runner silhouette crossing a finish-line banner with arms raised in triumph, soft warm golden-hour light, deeply joyful athletic-achievement mood, painterly cinematic oil brushwork, palette of VIBRANT warm gold sun, deep amber silhouette, soft cream banner, gentle dusty rose sky. The runner is the focal hero. No readable text on the banner, no logos, no watermarks, no frames or borders, face not visible.' },

  // ── Hard-to-shop-for (+4) — vaporwave, scandi minimal, quote, watercolor abstract ─
  { name:'vaporwave', prompt:'VIBRANT NEON painterly fine-art scene in vertical 2:3 composition: a retro vaporwave aesthetic with a low-poly geometric crystal mountain reflecting in a still pink lagoon under a giant magenta gradient sun, vibrant retro 80s synthwave mood, palette of VIBRANT magenta, cool electric cyan, soft pastel pink, deep violet. The vaporwave scene is the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'scandi-minimal', prompt:'MINIMALIST painterly fine-art scene in vertical 2:3 composition: an ultra-clean Scandinavian-minimalist still-life of a single dried eucalyptus branch in a tall slim ceramic vase against a soft cream wall, gentle morning shadow, deeply calm minimalist mood, painterly oil brushwork, palette of soft cream, gentle sage eucalyptus, deep pearl-gray vase, soft warm shadow. The composition is the focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'typography-quote', prompt:'WARM elegant painterly fine-art still-life in vertical 2:3 composition: a single piece of letterpressed cream paper with elegant ornamental flourishes (no readable words) framed by a sprig of dried lavender and a fountain pen, soft warm window light, deeply contemplative literary mood, painterly oil brushwork, palette of warm cream paper, deep walnut pen, soft dusty lavender, gentle gold flourishes. The paper is the focal hero. No readable text or words anywhere, no logos, no watermarks, no outer frames or borders.' },
  { name:'watercolor-abstract', prompt:'SOFT painterly watercolor abstract composition in vertical 2:3: gentle flowing washes of soft dusty pink, sage green, pale lavender, and gentle gold bleeding into each other like a sunset cloud abstract, deeply soothing meditative abstract mood, painterly watercolor textures with visible paper grain, palette of soft dusty pink, sage green, pale lavender, gentle gold. The abstract composition fills the canvas. No representational subjects, no text, no logos, no watermarks, no frames or borders, no people.' },

  // ── For book & coffee (+4) — Italian espresso, typewriter, rose book, library window ─
  { name:'italian-espresso', prompt:'WARM painterly fine-art scene in vertical 2:3 composition: a small Italian piazza espresso bar at golden hour with a tiny porcelain demitasse of espresso on a polished marble counter, scattered cobblestones outside through an open doorway, deeply joyful Italian-travel-coffee mood, painterly oil brushwork, palette of warm gold sun, deep cognac wood, soft cream marble, gentle dusty rose cobblestones. The espresso scene is the focal hero. No readable Italian signs or text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'antique-typewriter', prompt:'WARM painterly fine-art still-life in vertical 2:3 composition: an antique brass typewriter on a worn wooden desk with a half-typed cream page in the carriage, a steaming mug of tea, a single rose stem laid beside it, soft warm afternoon window light, deeply nostalgic writer mood, painterly oil brushwork, palette of warm gold, deep walnut wood, soft cream paper, gentle dusty rose. The typewriter is the focal hero. No readable typed text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'open-book-rose', prompt:'ROMANTIC tender painterly fine-art still-life in vertical 2:3 composition: an open hardback book lying flat on a wooden table with scattered soft pink rose petals across the open pages, a single full rose laid across the spine, soft warm afternoon window light, deeply tender romantic-reader mood, painterly oil brushwork, palette of soft cream pages, dusty pink petals, deep crimson rose, gentle warm gold light. The book and rose are the focal hero. No readable text on the pages, no logos, no watermarks, no frames or borders, no people.' },
  { name:'library-window-seat', prompt:'COOL serene painterly fine-art scene in vertical 2:3 composition: a deep upholstered library window seat with a soft cream cushion, a stack of three hardback books, a steaming mug of tea, and a single open book resting against the windowsill, soft cool afternoon window light, deeply calm reader-sanctuary mood, painterly oil brushwork, palette of cool slate-blue cushion, soft cream pages, warm gold tea, gentle dusty rose books. The window seat is the focal hero. No readable text, no logos, no watermarks, no frames or borders, no people.' },

  // ── For music (+4) — festival sunset, cello, retro boombox, DJ booth ──
  { name:'festival-sunset', prompt:'BRIGHT VIBRANT painterly fine-art scene in vertical 2:3 composition: a sunset music festival crowd from behind with raised hands silhouetted against a vibrant pink and orange sunset sky, distant stage lights glowing magenta and gold, deeply joyful festival mood, painterly cinematic oil brushwork, palette of VIBRANT magenta and orange sunset, soft pink sky, deep silhouette black crowd, warm amber stage glow. The crowd and sky are the focal hero. No readable text, no logos, no watermarks, no frames or borders, faces not visible.' },
  { name:'cello-window', prompt:'COOL elegant painterly fine-art still-life in vertical 2:3 composition: a beautiful wooden cello resting against a tall window with cool morning blue-gray light streaming in, polished bow leaning beside it, sheet music on a stand, deeply elegant classical-music mood, painterly oil brushwork, palette of warm cognac cello wood, cool slate-blue window light, soft cream sheet music, gentle pewter walls. The cello is the absolute focal hero. No readable text on the sheet music, no logos, no watermarks, no frames or borders, no people.' },
  { name:'retro-boombox', prompt:'VIBRANT FUN painterly fine-art still-life in vertical 2:3 composition: a vintage 1980s boombox stereo with chunky buttons and large speakers, sitting on a sunny pastel-painted wall corner with scattered vinyl records, deeply joyful retro 80s playful mood, painterly pop-art oil brushwork, palette of VIBRANT pastel pink wall, soft cream boombox, deep magenta records, gentle teal accents. The boombox is the focal hero. No readable text or brand logos, no watermarks, no frames or borders, no people.' },
  { name:'dj-booth-lights', prompt:'VIBRANT DRAMATIC painterly fine-art scene in vertical 2:3 composition: a moody DJ booth from behind with the DJ silhouetted, vibrant club lights beaming magenta, cyan, gold, and emerald onto the crowd silhouettes below, deeply energetic nightlife mood, painterly cinematic oil brushwork, palette of VIBRANT magenta, electric cyan, warm gold, deep glossy black silhouettes. The DJ booth and lights are the focal hero. No readable text, no logos, no watermarks, no frames or borders, face not visible.' },

  // ── For nature (+4) — surfer dawn, whales, hot air balloon, treehouse ──
  { name:'surfer-dawn', prompt:'COOL CINEMATIC painterly fine-art scene in vertical 2:3 composition: a single faceless surfer silhouetted from behind paddling out into glassy dawn waves, soft warm pink-and-gold dawn sky, deeply meditative surfer-life mood, painterly oil brushwork, palette of soft pink dawn, warm gold horizon, deep teal water, dusty pearl wave-spray. The surfer is the focal hero. No text, no logos, no watermarks, no frames or borders, face not visible.' },
  { name:'whales-breaching', prompt:'COOL DRAMATIC painterly fine-art scene in vertical 2:3 composition: two majestic humpback whales breaching together out of a deep cobalt ocean at sunset, vibrant warm coral and amber sky behind them, deeply awe-inspiring wildlife mood, painterly oil brushwork, palette of deep cobalt sea, warm coral sky, soft cream whale spray, gentle amber sunset. The whales are the absolute focal hero. No people, no boats, no text, no logos, no watermarks, no frames or borders.' },
  { name:'hot-air-balloon', prompt:'BRIGHT VIBRANT painterly fine-art scene in vertical 2:3 composition: a single colorful striped hot-air balloon drifting over a vast canyon at golden hour, layers of warm red rock walls below, deeply joyful adventure mood, painterly oil brushwork, palette of VIBRANT rainbow balloon stripes, warm gold canyon, soft pink sky, deep amber rock shadows. The balloon and canyon are the focal hero. No readable text or logos on the balloon, no watermarks, no frames or borders, no people.' },
  { name:'forest-treehouse', prompt:'WHIMSICAL warm painterly fine-art scene in vertical 2:3 composition: a charming wooden treehouse nestled high in the canopy of an old oak tree, soft warm window light glowing from inside, deep emerald leaves all around, deeply joyful fantasy-childhood mood, painterly oil brushwork, palette of warm gold window glow, deep emerald canopy, soft cream wood, gentle dusty amber. The treehouse is the focal hero. No people, no text, no logos, no watermarks, no frames or borders.' },

  // ── For seasons (+4) — spring blossom, summer lemonade, first snowfall, fall drive ─
  { name:'spring-blossom-branch', prompt:'MINIMALIST painterly fine-art still-life in vertical 2:3 composition: a single delicate cherry blossom branch in a tall slim ceramic vase against a soft pale wall, gentle warm afternoon light casting soft shadow, deeply calm minimalist spring mood, painterly oil brushwork, palette of soft pastel pink blossoms, deep walnut branch, gentle cream wall, soft warm shadow. The branch is the absolute focal hero. No text, no logos, no watermarks, no frames or borders, no people.' },
  { name:'summer-lemonade', prompt:'BRIGHT JOYFUL painterly fine-art still-life in vertical 2:3 composition: a sweating glass pitcher of fresh lemonade with floating slices of lemon and sprigs of mint, beside a small bowl of bright fresh blueberries on a sunlit picnic table, deeply joyful summer mood, painterly impressionist oil brushwork, palette of VIBRANT sunshine yellow lemon, deep teal blueberries, soft cream pitcher, gentle sage mint, warm gold sun. The lemonade is the focal hero. No people, no text, no logos, no watermarks, no frames or borders.' },
  { name:'first-snowfall', prompt:'COOL whimsical painterly fine-art scene in vertical 2:3 composition: a quiet snow-covered tree-lined street at twilight with soft warm streetlamp light casting a glow on gently falling snowflakes, a single window of a house glowing warm in the background, deeply tender first-snowfall mood, painterly oil brushwork, palette of cool dusty blue twilight, warm amber lamps and window, soft pearl snowfall, deep navy sky. The street is the focal hero. No people, no text, no logos, no watermarks, no frames or borders.' },
  { name:'fall-foliage-drive', prompt:'WARM VIBRANT painterly fine-art landscape in vertical 2:3 composition: a winding country road cutting through vibrant autumn trees ablaze in deep red, warm orange, and golden yellow leaves, soft golden afternoon light filtering through, deeply nostalgic autumn-drive mood, painterly oil brushwork, palette of VIBRANT autumn red, warm orange, deep gold, gentle cream road, soft dusty rose sky. The road is the focal hero. No cars, no people, no text, no logos, no watermarks, no frames or borders.' },
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
  console.log(`Generating ${TILES.length} NEW v3 gift-aisle tiles via Gemini 2.5 Flash Image (${ASPECT})…`);
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
