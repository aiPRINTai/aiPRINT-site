// scripts/convert-to-webp.js
// One-shot: convert every JPG/PNG in public/{ai-art,gallery,rooms,banners}
// to WebP at quality 80, max 1600px on the long edge. Originals stay on
// disk as a fallback (and as the source if we ever need to re-encode).
//
// Run: node scripts/convert-to-webp.js
//
// After running, the build is just an HTML edit pass: swap every .jpg /
// .png src reference to .webp. Modern browsers (96%+ in 2026) handle
// WebP natively; the originals stay parked on Vercel for any odd request.

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [
  'public/ai-art',
  'public/gallery',
  'public/rooms',
  'public/banners'
];
const MAX_DIM = 1600;
const QUALITY = 80;

const EXTS = new Set(['.jpg', '.jpeg', '.png']);

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function convertOne(srcPath) {
  const dir = path.dirname(srcPath);
  const stem = path.basename(srcPath, path.extname(srcPath));
  const outPath = path.join(dir, `${stem}.webp`);

  const beforeBytes = fs.statSync(srcPath).size;

  // Read metadata so we can decide whether to downscale (only if larger
  // than MAX_DIM on the long edge — preserve smaller images verbatim).
  const img = sharp(srcPath);
  const meta = await img.metadata();
  const longEdge = Math.max(meta.width || 0, meta.height || 0);

  let pipeline = img;
  if (longEdge > MAX_DIM) {
    pipeline = pipeline.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true });
  }
  await pipeline.webp({ quality: QUALITY }).toFile(outPath);

  const afterBytes = fs.statSync(outPath).size;
  return { srcPath, outPath, beforeBytes, afterBytes, longEdge };
}

async function main() {
  let total = { count: 0, before: 0, after: 0 };
  console.log(`Converting JPG/PNG → WebP @ q${QUALITY}, max ${MAX_DIM}px long edge\n`);
  console.log(`${'File'.padEnd(50)} ${'Before'.padStart(10)} → ${'After'.padStart(10)}  ${'Saved'.padStart(8)}`);
  console.log('─'.repeat(90));
  for (const dir of TARGET_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const entries = fs.readdirSync(abs);
    for (const name of entries) {
      const ext = path.extname(name).toLowerCase();
      if (!EXTS.has(ext)) continue;
      const srcPath = path.join(abs, name);
      try {
        const r = await convertOne(srcPath);
        total.count++;
        total.before += r.beforeBytes;
        total.after += r.afterBytes;
        const saved = ((r.beforeBytes - r.afterBytes) / r.beforeBytes * 100).toFixed(0);
        const rel = path.relative(ROOT, r.outPath);
        console.log(`${rel.padEnd(50)} ${fmtBytes(r.beforeBytes).padStart(10)} → ${fmtBytes(r.afterBytes).padStart(10)}  ${(saved + '%').padStart(8)}`);
      } catch (e) {
        console.error(`✗ FAILED ${srcPath}: ${e.message}`);
      }
    }
  }
  console.log('─'.repeat(90));
  const savedPct = total.before > 0 ? ((total.before - total.after) / total.before * 100).toFixed(0) : 0;
  console.log(`${`TOTAL (${total.count} files)`.padEnd(50)} ${fmtBytes(total.before).padStart(10)} → ${fmtBytes(total.after).padStart(10)}  ${(savedPct + '%').padStart(8)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
