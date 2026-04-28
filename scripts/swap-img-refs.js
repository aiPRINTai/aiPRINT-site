// scripts/swap-img-refs.js
// Update HTML files to reference .webp versions of images we just generated.
// Only swaps references inside the four asset dirs (ai-art, gallery, rooms,
// banners) — leaves favicons, og-image, marks SVGs, etc. untouched.
//
// Verifies the target .webp file exists on disk before each swap so a typo
// can never produce a broken reference. Reports diff per file.
//
// Run: node scripts/swap-img-refs.js
//
// Idempotent — running twice is a no-op (.jpg → .webp, then nothing left
// matching the regex).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Paths matching /ai-art/, /gallery/, /rooms/, /banners/ followed by a name + jpg|png.
// Captures: 1=full match, 2=path-up-to-extension, 3=ext
const PATH_RE = /(\/(?:ai-art|gallery|rooms|banners)\/[^"'`\s)]+?)\.(jpe?g|png)/gi;

function listHtmlFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      // skip node_modules + hidden
      if (name === 'node_modules' || name.startsWith('.')) continue;
      out.push(...listHtmlFiles(abs));
    } else if (name.endsWith('.html')) {
      out.push(abs);
    }
  }
  return out;
}

function swapInFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  let swaps = 0;
  let missing = 0;
  const out = src.replace(PATH_RE, (full, pathStem, ext) => {
    const webpRel = `${pathStem}.webp`;
    const onDisk = path.join(ROOT, 'public', webpRel);
    if (!fs.existsSync(onDisk)) {
      missing++;
      return full; // keep original — converter must have skipped this one
    }
    swaps++;
    return webpRel;
  });
  if (swaps > 0) {
    fs.writeFileSync(file, out, 'utf8');
  }
  return { swaps, missing };
}

const files = listHtmlFiles(ROOT);
let totalSwaps = 0;
let totalMissing = 0;
console.log(`Scanning ${files.length} HTML files for image refs to swap → .webp\n`);
for (const f of files) {
  const { swaps, missing } = swapInFile(f);
  if (swaps > 0 || missing > 0) {
    const rel = path.relative(ROOT, f);
    console.log(`  ${rel.padEnd(40)} swapped: ${String(swaps).padStart(3)}  missing-webp: ${missing}`);
    totalSwaps += swaps;
    totalMissing += missing;
  }
}
console.log(`\nDone. Total references swapped: ${totalSwaps}. Missing .webp targets: ${totalMissing}.`);
if (totalMissing > 0) {
  console.log('(Refs left as JPG — most likely the converter skipped them. Re-run convert-to-webp.js if unexpected.)');
}
