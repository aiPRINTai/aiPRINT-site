#!/usr/bin/env node
// Build PNG favicons and apple-touch-icon from the master favicon.svg.
// Run: node scripts/build-favicons.mjs
//
// Single source of truth: public/favicon.svg. We render it at multiple
// sizes with sharp+librsvg, so any tweak to the SVG propagates to every
// PNG without needing to edit this script.

import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const MASTER = join(PUBLIC, 'favicon.svg');

async function render(svgBuffer, size, filename) {
  const out = join(PUBLIC, filename);
  await sharp(svgBuffer, { density: Math.max(72, size * 4) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`✓ ${filename} (${size}×${size})`);
}

async function main() {
  const svg = await readFile(MASTER);

  await render(svg, 32, 'favicon-32.png');
  await render(svg, 180, 'apple-touch-icon.png');
  await render(svg, 192, 'icon-192.png');
  await render(svg, 512, 'icon-512.png');

  // Write a PWA manifest alongside
  const manifest = {
    name: 'aiPRINT.ai',
    short_name: 'aiPRINT',
    description: 'Turn any idea into a gallery-worthy print.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f1d',
    theme_color: '#0a0f1d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
  await writeFile(
    join(PUBLIC, 'site.webmanifest'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );
  console.log('✓ site.webmanifest');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
