// scripts/generate-gift-aisle-v5.js
// Round 5 — 8 new tiles per category targeting the UNDER-USED MEDIUMS:
//   1. Pencil / Charcoal sketch
//   2. Ink / Pen drawing
//   3. Anime / Stylized (Ghibli-ish digital painting)
//   4. 3D Render / CGI
//   5. Pop Art / Graphic
//   6. Vintage Poster
//   7. Sculpture / 3D Model (bronze/marble/ceramic)
//   8. Mixed Media / Collage
//
// Goal: when a user lands on /gifts, every category visually represents the
// full medium menu — not just paintings and photos. This pairs with build-
// gifts-page.mjs picking up `medium`, `time`, `lighting`, `composition`,
// `expression` URL params so a click on, e.g., the pencil-sketch tile
// actually fills the Pencil / Charcoal Sketch dropdown on the homepage.
//
// 96 new tiles, all 2:3 vertical (except a couple of square poster mocks).
// Run:
//   node scripts/generate-gift-aisle-v5.js

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

// Shared anti-modifier — no text/borders/frames slip into the artwork.
const NO_JUNK = 'No text, no logos, no watermarks, no frames or borders.';

// Per-medium prompt tails ensure the image visibly reads as that medium.
const PENCIL = `Rendered as a real hand-drawn pencil and charcoal sketch on cream paper, visible graphite shading, fine cross-hatching, soft smudges, paper-grain texture — pencil drawing, not painting, not photograph. ${NO_JUNK}`;
const INK = `Rendered as a real black ink and pen line drawing on cream paper, clean confident linework, minimal shading with cross-hatching, no color, no fills — ink drawing, not painting, not photograph. ${NO_JUNK}`;
const ANIME = `Rendered in painterly Studio-Ghibli-style anime art, lush hand-painted backgrounds, soft cel-shading on characters, warm cinematic light, vibrant colors — anime/stylized illustration, not photograph. ${NO_JUNK}`;
const RENDER = `Rendered as a polished modern 3D CGI render, soft physically-based materials, clean studio lighting, gentle ambient occlusion, slight stylized look — 3D render, not photograph, not painting. ${NO_JUNK}`;
const POPART = `Rendered as bold pop-art screenprint in the spirit of Warhol/Lichtenstein, flat saturated color blocks, Ben-Day dots, thick black outlines, dynamic poster composition — pop-art print, not photograph, not painting. ${NO_JUNK}`;
const POSTER = `Rendered as a vintage mid-century travel/event poster, flat geometric shapes, screenprinted texture, retro typography stripped out, limited 4-color retro palette — vintage poster art, not photograph, not painting. ${NO_JUNK}`;
const SCULPT = `Rendered as a real sculpted figure — fine bronze or carved marble — three-quarter studio view, soft warm museum lighting, visible patina or chisel marks, deep shadows — sculpture photographed in a gallery, not painting, not 3D render. ${NO_JUNK}`;
const COLLAGE = `Rendered as a mixed-media paper collage — torn vintage paper, layered cut photographs, stamps, stitched thread, handwritten notes, washi tape, gentle drop shadow on each layer — collage art, not photograph, not painting. ${NO_JUNK}`;

const TILES = [
  // ── 1. Pet lovers (8) ──────────────────────────────────────────────────
  { name:'pet-pencil-sketch',   prompt:`A hand-drawn pencil and charcoal portrait of a noble adult golden retriever on cream paper, soft expressive eyes, visible graphite shading on the fur. ${PENCIL}` },
  { name:'pet-ink-linework',    prompt:`A black ink line drawing of a sitting cat in profile on cream paper, single confident contour line, minimal cross-hatching detail. ${INK}` },
  { name:'pet-anime-companion', prompt:`A Studio-Ghibli-style anime scene of a young child sitting in a sunlit meadow hugging a small fluffy dog, soft painterly clouds, warm wind, vibrant green grass. ${ANIME}` },
  { name:'pet-3d-render',       prompt:`A stylized 3D CGI render of a small fluffy puppy sitting on a soft pastel pedestal, soft studio lighting, clean modern look like a Pixar short, cream background. ${RENDER}` },
  { name:'pet-popart',          prompt:`A pop-art quadrant screenprint of the same dog portrait repeated in 4 panels, each panel a different bold color combo — magenta/yellow, cyan/red, lime/black, orange/blue, thick outlines. ${POPART}` },
  { name:'pet-vintage-poster',  prompt:`A vintage mid-century travel-style poster of a happy dog running through tall grass, retro flat shapes, limited 4-color palette of teal, mustard, cream, brick-red, screenprinted texture. ${POSTER}` },
  { name:'pet-sculpture',       prompt:`A small bronze sculpture of a sitting Labrador on a wooden gallery pedestal, soft warm museum lighting, visible patina on the bronze, dark gallery background. ${SCULPT}` },
  { name:'pet-mixed-media',     prompt:`A mixed-media collage memorial of a beloved pet — torn vintage paper background, layered Polaroid photos of the dog, dried flowers, a leather collar, stitched thread, handwritten name across the bottom. ${COLLAGE}` },

  // ── 2. Couples (8) ─────────────────────────────────────────────────────
  { name:'couple-pencil-sketch',   prompt:`A hand-drawn pencil portrait of two intertwined hands on cream paper, soft graphite shading on the skin and wedding bands, fine cross-hatching. ${PENCIL}` },
  { name:'couple-ink-linework',    prompt:`A black ink line drawing of a faceless couple dancing — single confident contour line, minimal interior detail, on cream paper. ${INK}` },
  { name:'couple-anime-festival',  prompt:`A Studio-Ghibli-style anime scene of a young couple watching summer fireworks from a hilltop, warm pink-orange sky, vibrant lanterns, soft cel-shaded characters from behind, painterly background. ${ANIME}` },
  { name:'couple-3d-silhouette',   prompt:`A stylized 3D CGI render of two abstract figures holding hands silhouetted against a soft pastel-gradient sky, polished matte materials, gentle ambient occlusion, modern Pixar-clean look. ${RENDER}` },
  { name:'couple-popart-kiss',     prompt:`A pop-art screenprint of a couple silhouette kissing in profile, bold magenta and yellow blocks, Ben-Day dots in the background, thick black outlines, retro 1960s. ${POPART}` },
  { name:'couple-vintage-poster',  prompt:`A vintage mid-century travel poster of a couple walking hand-in-hand toward a Mediterranean coastline, retro flat shapes, limited 4-color palette of coral, teal, cream, navy. ${POSTER}` },
  { name:'couple-sculpture',       prompt:`A carved white marble sculpture of two embracing faceless figures on a gallery pedestal, soft warm museum lighting, dark background, visible chisel marks. ${SCULPT}` },
  { name:'couple-mixed-media',     prompt:`A mixed-media love-letter collage — torn cream paper background, layered handwritten love-letter fragments, a pressed rose, a vintage stamp, a small Polaroid of intertwined hands, washi tape, stitched red thread. ${COLLAGE}` },

  // ── 3. New parents (8) ─────────────────────────────────────────────────
  { name:'baby-pencil-sketch',    prompt:`A hand-drawn pencil portrait of a sleeping newborn baby on cream paper, soft graphite shading on the cheek and blanket, tender expression. ${PENCIL}` },
  { name:'baby-ink-linework',     prompt:`A black ink line drawing of a tiny newborn hand wrapped around a parent finger on cream paper, single confident contour line. ${INK}` },
  { name:'baby-anime-nursery',    prompt:`A Studio-Ghibli-style anime scene of a soft cozy nursery — wooden crib, plush stuffed animals, hanging mobile, warm window light, vibrant colors, painterly clouds visible outside. ${ANIME}` },
  { name:'baby-3d-toys',          prompt:`A stylized 3D CGI render of a soft pastel still-life — a wooden rocking horse, a tiny plush bear, three building blocks spelling out "BABY", clean studio lighting, cream background. ${RENDER}` },
  { name:'baby-popart-prints',    prompt:`A pop-art screenprint of four tiny baby-shoe silhouettes in a 2x2 grid, each panel a different bold color combo — pastel pink/red, cyan/yellow, mint/black, lavender/orange, thick outlines. ${POPART}` },
  { name:'baby-vintage-poster',   prompt:`A vintage nursery alphabet-style poster — a single ornate capital "B" surrounded by retro stylized animals, balloons, and stars, limited 4-color palette of soft pastel pink, cream, mint, mustard. ${POSTER}` },
  { name:'baby-sculpture',        prompt:`A small bronze sculpture of a mother cradling a newborn baby on a wooden gallery pedestal, soft warm museum lighting, visible patina on the bronze, dark background. ${SCULPT}` },
  { name:'baby-mixed-media',      prompt:`A mixed-media baby-announcement collage — torn cream paper background, a tiny knit baby sock, a hospital wristband, a pressed daisy, a small Polaroid of newborn feet, washi tape, stitched pink thread. ${COLLAGE}` },

  // ── 4. Family (8) ──────────────────────────────────────────────────────
  { name:'family-pencil-sketch',  prompt:`A hand-drawn pencil sketch of a family of four standing together in soft pose on cream paper, faceless silhouetted style, graphite shading and cross-hatching. ${PENCIL}` },
  { name:'family-ink-linework',   prompt:`A black ink line drawing of a family tree — a stylized branching tree with five small portraits hanging like leaves on cream paper, confident linework. ${INK}` },
  { name:'family-anime-porch',    prompt:`A Studio-Ghibli-style anime scene of a family gathered on a wraparound porch at golden hour — grandparents, parents, kids — string lights overhead, painterly garden, warm cinematic light. ${ANIME}` },
  { name:'family-3d-isometric',   prompt:`A stylized 3D isometric CGI render of a cutaway dollhouse showing a family home — kitchen, living room, bedroom, garden — tiny figures inside, soft pastel palette, clean modern stylized look. ${RENDER}` },
  { name:'family-popart',         prompt:`A pop-art screenprint of a family Sunday-dinner table from above — plates, hands reaching in, bowls of food — bold flat colors of red, mustard, teal, cream, Ben-Day dots, thick outlines. ${POPART}` },
  { name:'family-vintage-poster', prompt:`A vintage 1970s family-road-trip poster — a station wagon at a desert overlook with a family silhouetted, retro flat shapes, limited 4-color palette of orange, brown, mustard, cream, screenprinted texture. ${POSTER}` },
  { name:'family-sculpture',      prompt:`A bronze sculpture of a family huddle — four faceless figures embracing in a tight circle — on a wooden gallery pedestal, soft warm museum lighting, dark background. ${SCULPT}` },
  { name:'family-mixed-media',    prompt:`A mixed-media family heirloom collage — torn vintage paper background, three layered black-and-white family photos across generations, a pressed flower, handwritten names, washi tape, stitched gold thread. ${COLLAGE}` },

  // ── 5. Their home (8) ─────────────────────────────────────────────────
  { name:'home-pencil-sketch',    prompt:`A hand-drawn architectural pencil sketch of a charming family home with a wraparound porch and front garden on cream paper, fine linework, soft graphite shading, hand-drafted feel. ${PENCIL}` },
  { name:'home-ink-linework',     prompt:`A black ink line drawing of a cozy kitchen interior — countertop with a coffee pot, hanging pendant lamp, open shelving with mugs — confident linework, no fills, on cream paper. ${INK}` },
  { name:'home-anime-cottage',    prompt:`A Studio-Ghibli-style anime scene of a small cottage in a flower garden at golden hour, vibrant climbing roses, painterly clouds, warm window light glowing from inside, soft cinematic. ${ANIME}` },
  { name:'home-3d-isometric',     prompt:`A stylized 3D isometric CGI render of a cutaway modern apartment showing a living room, kitchen, and bedroom in cross-section, tiny plants and books, soft pastel palette, clean modern look. ${RENDER}` },
  { name:'home-popart-interior',  prompt:`A pop-art screenprint of a stylized living-room interior — armchair, lamp, side table with a coffee mug — bold flat colors of teal, mustard, cream, brick-red, Ben-Day dots, thick outlines. ${POPART}` },
  { name:'home-vintage-poster',   prompt:`A vintage mid-century-modern poster of a stylized home exterior — flat geometric shapes, retro chimney with smoke, a tree, a sun — limited 4-color palette of mustard, teal, brown, cream, screenprinted texture. ${POSTER}` },
  { name:'home-sculpture-vase',   prompt:`A still-life of a handmade ceramic vase with a single dried branch on a gallery pedestal, soft warm museum lighting, visible thumbprint texture on the clay, dark background, fine-art sculpture photography. ${SCULPT}` },
  { name:'home-mixed-media',      prompt:`A mixed-media home-moodboard collage — torn architectural blueprint paper background, fabric swatches, a pressed leaf, a polaroid of a window, paint chips in cream/sage/terracotta, stitched thread. ${COLLAGE}` },

  // ── 6. Travelers (8) ──────────────────────────────────────────────────
  { name:'travel-pencil-sketch',  prompt:`A hand-drawn pencil sketch of a quiet Paris side-street cafe with cobblestones and a bistro table, soft graphite shading, fine architectural linework, on cream paper. ${PENCIL}` },
  { name:'travel-ink-citymap',    prompt:`A black ink line drawing of a stylized city map — winding streets, tiny landmarks, a river, a bridge — confident hand-drafted linework on cream paper, no fills. ${INK}` },
  { name:'travel-anime-train',    prompt:`A Studio-Ghibli-style anime scene of a young traveler watching the countryside roll past from a vintage train window — golden fields, distant mountains, painterly clouds, warm cinematic light. ${ANIME}` },
  { name:'travel-3d-globe',       prompt:`A stylized 3D CGI render of a soft pastel globe on a wooden desk with tiny golden push-pins marking destinations, soft studio lighting, clean modern look. ${RENDER}` },
  { name:'travel-popart-city',    prompt:`A pop-art screenprint of the New York skyline — bold flat colors of magenta, yellow, cyan, black — repeating panels with Ben-Day-dot sky, thick outlines, retro 1960s. ${POPART}` },
  { name:'travel-vintage-poster', prompt:`A vintage 1930s Italian-coastline travel poster — flat geometric coastline, terracotta rooftops, a small sailboat, retro flat shapes, limited 4-color palette of teal, terracotta, cream, mustard, screenprinted texture. ${POSTER}` },
  { name:'travel-sculpture',      prompt:`A small bronze sculpture of a stylized world monument silhouette on a wooden gallery pedestal, soft warm museum lighting, visible patina, dark background. ${SCULPT}` },
  { name:'travel-mixed-media',    prompt:`A mixed-media travel-scrapbook collage — torn map background, layered vintage postcards, train tickets, stamped passport pages, a pressed flower from a foreign country, washi tape, stitched thread. ${COLLAGE}` },

  // ── 7. Milestones (8) ─────────────────────────────────────────────────
  { name:'milestone-pencil-sketch',  prompt:`A hand-drawn pencil sketch of a graduate in cap and gown holding a diploma on cream paper, soft graphite shading, tender expressive linework. ${PENCIL}` },
  { name:'milestone-ink-cake',       prompt:`A black ink line drawing of a single tall birthday cake with lit candles on cream paper, confident linework, minimal cross-hatching, no fills. ${INK}` },
  { name:'milestone-anime-school',   prompt:`A Studio-Ghibli-style anime scene of a child on the first day of school, backpack on, walking down a path with cherry blossoms falling, warm painterly cinematic. ${ANIME}` },
  { name:'milestone-3d-trophy',      prompt:`A stylized 3D CGI render of a gold trophy on a wooden pedestal with confetti frozen in mid-air around it, soft studio lighting, clean modern Pixar-clean look. ${RENDER}` },
  { name:'milestone-popart-confetti',prompt:`A pop-art screenprint of celebratory confetti and balloons exploding outward, bold flat colors of magenta, yellow, cyan, lime, Ben-Day-dot background, thick outlines. ${POPART}` },
  { name:'milestone-vintage-poster', prompt:`A vintage mid-century "Congratulations!" poster — flat geometric ribbon banner, a stylized champagne glass, retro flat shapes, limited 4-color palette of gold, cream, navy, coral, screenprinted texture. ${POSTER}` },
  { name:'milestone-sculpture',      prompt:`A small bronze sculpture of a laurel-wreath crown on a wooden gallery pedestal, soft warm museum lighting, visible patina on the bronze, dark background. ${SCULPT}` },
  { name:'milestone-mixed-media',    prompt:`A mixed-media milestone collage — torn cream paper background, a printed diploma corner, a pressed flower, a polaroid of a celebratory toast, gold-foil confetti, washi tape, stitched gold thread. ${COLLAGE}` },

  // ── 8. Hard-to-shop-for (8) ───────────────────────────────────────────
  { name:'hardshop-pencil-sketch',  prompt:`A hand-drawn pencil sketch of an abstract face emerging from clouds on cream paper, dreamy soft graphite shading, expressive surreal linework. ${PENCIL}` },
  { name:'hardshop-ink-pattern',    prompt:`A black ink line drawing of an intricate ornamental mandala pattern on cream paper, confident hand-drafted geometric linework, no fills. ${INK}` },
  { name:'hardshop-anime-figure',   prompt:`A Studio-Ghibli-style anime scene of a mysterious lone figure on a hilltop at twilight, soft painterly clouds, glowing fireflies, vibrant teal and amber palette, cinematic. ${ANIME}` },
  { name:'hardshop-3d-crystal',     prompt:`A stylized 3D CGI render of a single floating translucent crystal cluster on a soft gradient pastel background, polished refractive materials, gentle ambient occlusion, modern Pixar-clean look. ${RENDER}` },
  { name:'hardshop-popart-psyche',  prompt:`A pop-art psychedelic screenprint of swirling concentric circles and abstract shapes in bold magenta, lime, cyan, and yellow, Ben-Day dots, thick outlines, retro 1960s. ${POPART}` },
  { name:'hardshop-vintage-poster', prompt:`A vintage art-deco-style cocktail poster — flat geometric stylized cocktail glass with olives, retro typography stripped out, limited 4-color palette of black, gold, cream, deep red, screenprinted texture. ${POSTER}` },
  { name:'hardshop-sculpture',      prompt:`An abstract bronze sculpture of swirling intertwined ribbons on a wooden gallery pedestal, soft warm museum lighting, visible patina, dark background, modern fine-art piece. ${SCULPT}` },
  { name:'hardshop-mixed-media',    prompt:`A mixed-media abstract art collage — torn book pages, layered paint swatches in jewel tones, gold-leaf fragments, a stitched grid, washi tape, fine ink scribbles on top. ${COLLAGE}` },

  // ── 9. Book & coffee (8) ──────────────────────────────────────────────
  { name:'bookcoffee-pencil-sketch', prompt:`A hand-drawn pencil sketch of a stack of vintage hardback books with a steaming mug on top on cream paper, soft graphite shading, fine linework. ${PENCIL}` },
  { name:'bookcoffee-ink-cup',       prompt:`A black ink line drawing of a single coffee cup with steam curling up, beside an open book on cream paper, confident linework, no fills. ${INK}` },
  { name:'bookcoffee-anime-cafe',    prompt:`A Studio-Ghibli-style anime scene of a cozy bookstore-cafe interior at rainy twilight, warm window light, towering bookshelves, a tabby cat napping on a chair, painterly. ${ANIME}` },
  { name:'bookcoffee-3d-stack',      prompt:`A stylized 3D CGI render of a neat stack of pastel-colored hardback books with a tiny ceramic coffee cup balanced on top, soft studio lighting, cream background, clean modern look. ${RENDER}` },
  { name:'bookcoffee-popart-mug',    prompt:`A pop-art screenprint of a steaming coffee mug, bold flat colors of red, mustard, cream, black, Ben-Day-dot background, thick outlines, retro 1960s. ${POPART}` },
  { name:'bookcoffee-vintage-poster',prompt:`A vintage 1950s espresso-bar poster — a stylized cup with curling steam, flat geometric shapes, retro typography stripped out, limited 4-color palette of cream, deep brown, terracotta, mustard, screenprinted texture. ${POSTER}` },
  { name:'bookcoffee-sculpture',     prompt:`A marble bust of a classical reader holding an open book on a wooden gallery pedestal, soft warm museum lighting, visible chisel marks, dark background. ${SCULPT}` },
  { name:'bookcoffee-mixed-media',   prompt:`A mixed-media literary collage — torn vintage book pages background, dried tea leaves, a coffee-stained letter, a pressed leaf, handwritten quotes in ink, washi tape, stitched thread. ${COLLAGE}` },

  // ── 10. Music (8) ─────────────────────────────────────────────────────
  { name:'music-pencil-sketch',  prompt:`A hand-drawn pencil sketch of a faceless violinist playing on cream paper, soft graphite shading, fine cross-hatching on the instrument and folds of clothing. ${PENCIL}` },
  { name:'music-ink-guitar',     prompt:`A black ink line drawing of an acoustic guitar leaning against a chair on cream paper, confident linework, minimal interior detail. ${INK}` },
  { name:'music-anime-concert',  prompt:`A Studio-Ghibli-style anime scene of a sunset music festival — faceless crowd silhouettes with raised hands, vibrant pink-orange sky, painterly clouds, warm cinematic light, stage lights in distance. ${ANIME}` },
  { name:'music-3d-headphones',  prompt:`A stylized 3D CGI render of premium pastel-colored over-ear headphones floating on a soft gradient background, polished matte materials, soft studio lighting, modern Pixar-clean look. ${RENDER}` },
  { name:'music-popart-records', prompt:`A pop-art screenprint of four vinyl records in a 2x2 grid, each a different bold color combo — magenta/yellow center, cyan/red, lime/black, orange/blue — thick outlines, Ben-Day dots, Warhol-style. ${POPART}` },
  { name:'music-vintage-poster', prompt:`A vintage 1950s jazz-club poster — a stylized silhouetted saxophone player under a spotlight, flat geometric shapes, retro typography stripped out, limited 4-color palette of black, gold, cream, deep red, screenprinted texture. ${POSTER}` },
  { name:'music-sculpture',      prompt:`A bronze sculpture of a single hand playing a piano keyboard on a wooden gallery pedestal, soft warm museum lighting, visible patina, dark background. ${SCULPT}` },
  { name:'music-mixed-media',    prompt:`A mixed-media music collage — torn yellowed sheet-music background, a pressed flower, a vintage concert ticket, a guitar pick, handwritten lyric fragments in ink, washi tape, stitched thread. ${COLLAGE}` },

  // ── 11. Nature (8) ────────────────────────────────────────────────────
  { name:'nature-pencil-sketch',  prompt:`A hand-drawn pencil sketch of a mountain landscape with a foreground pine tree on cream paper, soft graphite shading, fine cross-hatching, atmospheric depth. ${PENCIL}` },
  { name:'nature-ink-bird',       prompt:`A black ink line drawing of a single songbird perched on a leafy branch on cream paper, confident hand-drafted linework, no fills. ${INK}` },
  { name:'nature-anime-forest',   prompt:`A Studio-Ghibli-style anime scene of a sun-dappled forest clearing with a small glowing forest spirit, painterly leaves and moss, vibrant greens, warm cinematic light filtering through the canopy. ${ANIME}` },
  { name:'nature-3d-mountain',   prompt:`A stylized 3D CGI render of a low-poly mountain landscape with a small lake, soft pastel sunset palette of peach, lavender, teal, clean modern look. ${RENDER}` },
  { name:'nature-popart-wildlife',prompt:`A pop-art screenprint of a stylized bear silhouette, bold flat colors of teal, mustard, cream, black, Ben-Day-dot background, thick outlines, retro 1960s wildlife. ${POPART}` },
  { name:'nature-vintage-poster', prompt:`A vintage 1930s national-park travel poster — a stylized mountain peak with a small pine tree in foreground, retro flat shapes, limited 4-color palette of teal, mustard, brown, cream, screenprinted texture. ${POSTER}` },
  { name:'nature-sculpture',      prompt:`A bronze sculpture of a leaping deer on a wooden gallery pedestal, soft warm museum lighting, visible patina on the bronze, dark background. ${SCULPT}` },
  { name:'nature-mixed-media',    prompt:`A mixed-media botanical collage — torn vintage botanical-illustration pages background, pressed real leaves and flowers, a feather, hand-labeled botanical names in ink, washi tape, stitched green thread. ${COLLAGE}` },

  // ── 12. Seasons (8) ───────────────────────────────────────────────────
  { name:'seasons-pencil-winter',  prompt:`A hand-drawn pencil sketch of a snowy winter cottage with smoke from the chimney on cream paper, soft graphite shading, fine cross-hatching on the snow. ${PENCIL}` },
  { name:'seasons-ink-leaves',     prompt:`A black ink line drawing of three different fallen autumn leaves laid out on cream paper, confident botanical linework, fine vein detail, no fills. ${INK}` },
  { name:'seasons-anime-spring',   prompt:`A Studio-Ghibli-style anime scene of a path beneath a tunnel of full-bloom cherry-blossom trees, petals falling like snow, vibrant pink and soft blue sky, painterly. ${ANIME}` },
  { name:'seasons-3d-snowglobe',   prompt:`A stylized 3D CGI render of a winter snow-globe on a wooden table — tiny cottage inside, falling snow, soft warm interior glow, polished glass globe, soft studio lighting. ${RENDER}` },
  { name:'seasons-popart-summer',  prompt:`A pop-art screenprint of stylized summer beach umbrellas in a row, bold flat colors of magenta, yellow, cyan, orange against a Ben-Day-dot sky, thick outlines. ${POPART}` },
  { name:'seasons-vintage-poster', prompt:`A vintage 1950s seasonal poster set in autumn — a stylized tree with falling leaves, a pumpkin, a coffee cup, retro flat shapes, limited 4-color palette of mustard, brick-red, cream, deep brown, screenprinted texture. ${POSTER}` },
  { name:'seasons-sculpture',      prompt:`A bronze relief sculpture of the four seasons in four panels — a budding branch, a sunflower, a fallen leaf, a pinecone — on a gallery wall, soft warm museum lighting, visible patina. ${SCULPT}` },
  { name:'seasons-mixed-media',    prompt:`A mixed-media seasonal nature collage — torn cream paper background, a pressed cherry-blossom petal, a tiny dried autumn leaf, a small pinecone, a single tulip pressing, handwritten season names, washi tape. ${COLLAGE}` },
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
  console.log(`Generating ${TILES.length} medium-variety tiles via Gemini 2.5 Flash Image (${ASPECT})…`);
  const results = []; const failed = [];
  let i = 0;
  for (const spec of TILES) {
    i++;
    process.stdout.write(`  [${String(i).padStart(2,'0')}/${TILES.length}] ${spec.name.padEnd(32)} … `);
    try {
      const r = await generateOne(spec, apiKey);
      results.push(r);
      console.log(`OK  ${Math.round(r.bytes/1024)} KB · ${(r.ms/1000).toFixed(1)}s`);
    } catch (err) {
      console.log(`FAIL ${err.message}`);
      failed.push({ name: spec.name, err: err.message });
    }
  }
  console.log(`\nDone. Wrote ${results.length}/${TILES.length} files.`);
  if (failed.length) {
    console.log('Failed:'); for (const f of failed) console.log(`  - ${f.name}: ${f.err}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
