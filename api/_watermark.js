// api/_watermark.js
// Server-side preview watermarking + downscaling.
// Takes the clean image buffer and produces a watermarked, resolution-capped
// version safe to expose publicly. The clean original is uploaded separately
// and only ever revealed to the admin (for printing) and to the customer
// after they've paid.

import sharp from 'sharp';

// Max edge length for watermarked previews. Big enough to look great in the
// browser preview pane, too small to print at 18×18" or larger without going
// soft. Tweak if needed.
const PREVIEW_MAX_EDGE = 1100;

// SVG watermark — single subtle diagonal "PREVIEW" stamp across the image
// plus a small bottom-right corner mark. ASCII-only to avoid font-fallback
// "tofu boxes" in librsvg (which is what Sharp uses to render SVGs).
function buildWatermarkSvg(width, height) {
  const cornerFont = Math.max(14, Math.round(Math.min(width, height) / 48));
  // Big diagonal "PREVIEW" centered — just one, very subtle.
  const bigFont = Math.max(60, Math.round(Math.min(width, height) / 7));

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Single big diagonal PREVIEW across the middle — subtle, not tiled -->
  <g transform="translate(${width / 2}, ${height / 2}) rotate(-28)" text-anchor="middle">
    <text x="0" y="0"
          font-family="Helvetica, Arial, sans-serif"
          font-size="${bigFont}" font-weight="800"
          fill="rgba(255,255,255,0.10)"
          letter-spacing="${Math.round(bigFont / 6)}"
          dominant-baseline="middle">PREVIEW</text>
  </g>

  <!-- Bottom-right corner stamp: small, clean, ASCII only -->
  <g transform="translate(${width - 18}, ${height - 16})" text-anchor="end">
    <text x="0" y="0"
          font-family="Helvetica, Arial, sans-serif"
          font-size="${cornerFont}" font-weight="700"
          fill="rgba(255,255,255,0.75)"
          stroke="rgba(0,0,0,0.5)" stroke-width="${Math.max(1, cornerFont/14)}"
          paint-order="stroke">aiPRINT.ai</text>
  </g>
</svg>`.trim();
}

/**
 * Build a watermarked + downsized JPEG from a clean image buffer.
 * Returns { buffer, width, height, contentType }.
 */
export async function makeWatermarkedPreview(cleanBuffer) {
  // Step 1: load + downscale the clean original. Keep aspect ratio,
  // never enlarge (withoutEnlargement). Output as JPEG (smaller, fine for previews).
  const downsized = await sharp(cleanBuffer)
    .rotate() // honor EXIF orientation if any
    .resize({
      width: PREVIEW_MAX_EDGE,
      height: PREVIEW_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true
    })
    .toBuffer({ resolveWithObject: true });

  const { data: baseBuf, info } = downsized;
  const { width, height } = info;

  // Step 2: composite the SVG watermark on top.
  const svg = Buffer.from(buildWatermarkSvg(width, height));
  const watermarked = await sharp(baseBuf)
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  return {
    buffer: watermarked,
    width,
    height,
    contentType: 'image/jpeg'
  };
}

export const PREVIEW_WATERMARK_VERSION = 'v2-2026-04-clean';
