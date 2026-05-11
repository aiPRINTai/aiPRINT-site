// api/_signature.js
// Server-side signature embedding. Takes the customer's clean (unwatermarked)
// image + their signature spec, converts the signature to SVG paths via
// opentype.js (NOT @font-face — see history below), composites with sharp,
// uploads the result to Vercel Blob, returns the new URL.
//
// History / why path-rendering instead of @font-face:
//   v1 of this module used @font-face data URIs to embed TTFs into the SVG.
//   It worked locally but produced TOFU BOXES on Vercel's serverless runtime
//   because Sharp uses libvips which uses librsvg, and librsvg's @font-face
//   handling is unreliable with base64 TTF data — version-dependent and
//   silently falls back to a default font that doesn't have the right
//   glyphs, producing □ rectangles.
//
//   v2 (this file) converts text to actual SVG vector paths using opentype.js.
//   No font loading at SVG render time. The TTF is read once at module load,
//   the customer's text is glyphified into <path d="..."> data, and that's
//   what gets composited. Pixel-perfect at any resolution; no runtime font
//   matching; works on any platform that can run sharp.
//
// Used by webhook.js after createOrder. Failures return null so the order
// still proceeds with clean_url alone — admin email shows whichever URLs
// are available.

import sharp from 'sharp';
import { put } from '@vercel/blob';
import opentype from 'opentype.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, 'fonts');

// Soft signature color palette — must match COLOR_HEX in the client side
// (applySignatureColor in public/index.html) so what the customer sees in
// preview is what gets burned into the print master. Pure white/black are
// avoided: pure white blooms against photographic skies, pure black reads
// as a magic marker rather than ink.
const COLOR_HEX = {
  white:  '#F5EFE0',   // soft ivory
  black:  '#2A2520',   // soft charcoal
  gold:   '#C9A35E',   // champagne gold
  silver: '#A8A39A',   // warm pewter
  // 'auto' picks ivory as a contrast-safe default; without per-image analysis
  // server-side we can't be smarter. The customer can override at preview.
  auto:   '#F5EFE0'
};

// Maps signature font key → bundled TTF filename.
// Legacy aliases (font-elegant, font-script, etc.) map to the same TTF as
// their nearest spiritual successor in the new 6-font lineup so any saved
// preview from before the font refresh still renders correctly.
const FONT_FILE = {
  // Canonical keys
  'font-allura':     'Allura-Regular.ttf',
  'font-vibes':      'GreatVibes-Regular.ttf',
  'font-pinyon':     'PinyonScript-Regular.ttf',
  'font-sacramento': 'Sacramento-Regular.ttf',
  'font-apple':      'HomemadeApple-Regular.ttf',
  'font-cormorant':  'CormorantGaramond-Italic.ttf',
  // Legacy aliases — preserve customer intent across the font refresh.
  'font-elegant':    'Allura-Regular.ttf',
  'font-script':     'GreatVibes-Regular.ttf',
  'font-classic':    'CormorantGaramond-Italic.ttf',
  'font-modern':     'Sacramento-Regular.ttf',
  'font-bold':       'HomemadeApple-Regular.ttf'
};

// Lazy-load + cache parsed opentype.Font objects per cold start. Parsing is
// non-trivial (~tens of ms for a complex script font) so we don't want to
// repeat it on every order in a warm function.
const fontCache = new Map();
function loadFont(filename) {
  if (!filename) return null;
  if (fontCache.has(filename)) return fontCache.get(filename);
  const fp = path.join(FONT_DIR, filename);
  if (!fs.existsSync(fp)) {
    console.error(`[signature] font file missing: ${fp}`);
    fontCache.set(filename, null);
    return null;
  }
  try {
    const buf = fs.readFileSync(fp);
    // opentype.parse expects an ArrayBuffer; Node Buffer's underlying buffer
    // works after we slice to the exact byte range.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const font = opentype.parse(ab);
    fontCache.set(filename, font);
    return font;
  } catch (err) {
    console.error(`[signature] failed to parse font ${filename}:`, err?.message || err);
    fontCache.set(filename, null);
    return null;
  }
}

/**
 * Compose a signature onto a clean image and upload the result to Vercel Blob.
 *
 * @param {string} cleanImageUrl  https URL of the clean (unwatermarked) original
 * @param {object} sigSpec        { text, font, color, size, position, opacity }
 *                                position: { preset: 'tc'|'bl'|'bc'|'br' } OR { x, y }
 *                                opacity:  number 0–100 (or 0–1 — both supported)
 * @returns {Promise<string|null>} signed_url, or null on any failure
 */
export async function composeSignature(cleanImageUrl, sigSpec) {
  try {
    if (!cleanImageUrl || !sigSpec) return null;
    const text = String(sigSpec.text || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 64);
    if (!text) return null;

    // Resolve the font file + opentype object up front. If the font isn't
    // available we bail rather than fall back silently (which would render
    // a different font than the customer designed in preview).
    const fontKey  = String(sigSpec.font || 'font-allura').toLowerCase();
    const filename = FONT_FILE[fontKey] || FONT_FILE['font-allura'];
    const font = loadFont(filename);
    if (!font) {
      console.error(`[signature] could not load font for key ${fontKey}`);
      return null;
    }

    // Fetch the clean image bytes and read its real dimensions.
    const res = await fetch(cleanImageUrl);
    if (!res.ok) {
      console.error('[signature] failed to fetch clean image', res.status);
      return null;
    }
    const imageBuf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(imageBuf).metadata();
    const W = meta.width  || 1024;
    const H = meta.height || 1024;

    // Color
    const colorKey = String(sigSpec.color || 'white').toLowerCase();
    const color = COLOR_HEX[colorKey] || COLOR_HEX.white;

    // Opacity may arrive as 0–100 (slider) or 0–1 (legacy). Coerce to 0.3–1.
    let opacity = Number(sigSpec.opacity);
    if (!Number.isFinite(opacity)) opacity = 1;
    if (opacity > 1) opacity = opacity / 100;
    opacity = Math.max(0.3, Math.min(1, opacity));

    // Font size: the slider stores 12–36, expressed in *preview pixels*.
    // Scale to actual image width using the canonical 1024px preview width.
    // Cap so giant images don't render giant text either.
    const previewSize = parseInt(sigSpec.size, 10) || 18;
    const fontSize = Math.max(14, Math.min(Math.round(W * 0.06), Math.round(previewSize * (W / 1024))));

    // Compute the text's rendered metrics so we can position it correctly.
    // opentype's getPath uses the BASELINE as y, so for bottom-anchored
    // placement we need to push y up to leave room for descenders.
    const ascender  = (font.ascender  || 1000) * fontSize / (font.unitsPerEm || 1000);
    const descender = Math.abs((font.descender || -300) * fontSize / (font.unitsPerEm || 1000));
    const advance   = font.getAdvanceWidth(text, fontSize);  // visible text width

    // 4% inset matches the client's `applySignaturePosition` padding so the
    // printed signature lands in the same spot as the customer's preview.
    // Wider keeps signatures off the canvas gallery-wrap edge too.
    const pad = Math.round(W * 0.04);
    const pos = sigSpec.position || { preset: 'br' };

    let x, y;  // x = left edge of text, y = baseline
    if (pos && pos.preset) {
      switch (pos.preset) {
        case 'tc':
          x = (W - advance) / 2;
          y = pad + ascender;
          break;
        case 'bl':
          x = pad;
          y = H - pad - descender;
          break;
        case 'bc':
          x = (W - advance) / 2;
          y = H - pad - descender;
          break;
        case 'br':
        default:
          x = W - pad - advance;
          y = H - pad - descender;
          break;
      }
    } else if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      // Drag coords from preview — scale roughly assuming 1024px preview width.
      const scaleX = W / 1024;
      const scaleY = H / 1024;
      x = Math.round(pos.x * scaleX);
      y = Math.round(pos.y * scaleY) + ascender;
    } else {
      // Fallback: bottom-right
      x = W - pad - advance;
      y = H - pad - descender;
    }

    // Clamp x so we never render off-canvas if the customer typed an
    // exceptionally long signature relative to image width.
    if (x < pad) x = pad;
    if (x + advance > W - pad) x = W - pad - advance;

    // Convert the text to an SVG path. This is the magic — instead of relying
    // on librsvg to load and shape a font at render time, we precompute the
    // exact glyph outlines and ship them as static path data. No font cache,
    // no fallback, no tofu.
    const opath = font.getPath(text, x, y, fontSize);
    const pathData = opath.toPathData(2);  // 2 decimal places — plenty for print

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <path d="${pathData}" fill="${color}" fill-opacity="${opacity}"/>
</svg>`;

    const composedBuf = await sharp(imageBuf)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png({ compressionLevel: 9 })
      .toBuffer();

    // Upload as a NEW blob — keeps the original clean_url intact so admin
    // can always fall back to the unsigned print master if they want.
    const stem = `signed-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const { url } = await put(`originals/${stem}.png`, composedBuf, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'image/png',
      cacheControlMaxAge: 31536000   // 1y
    });
    return url;
  } catch (err) {
    console.error('[signature] composeSignature failed:', err?.message || err);
    return null;
  }
}
