// api/generate-image.js - Google Gemini Image Generation with Credits
import { put } from '@vercel/blob';
import { canUserGenerate, deductCreditsForGeneration } from './credits/utils.js';
import { recordGeneration } from './db/index.js';
import { getUserFromRequest, getClientIp } from './auth/utils.js';
import { makeWatermarkedPreview, PREVIEW_WATERMARK_VERSION } from './_watermark.js';

const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);

const SIZE_TO_ASPECT_RATIO = {
  '1024x1024': '1:1',
  '1536x1024': '3:2',
  '1024x1536': '2:3'
};

// Reference-image limits (server-side mirror of the client's caps; the client
// already resizes to ~1024px JPEG before upload).
const REF_MAX_COUNT = 3;
const REF_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
// 4 MB of base64 per ref ≈ 3 MB of binary; with a 4.5 MB Vercel body cap
// this gives us comfortable headroom even for 3 references.
const REF_MAX_BASE64_LEN = 4 * 1024 * 1024;

function sanitizeReferenceImages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (const item of raw.slice(0, REF_MAX_COUNT)) {
    if (!item || typeof item !== 'object') continue;
    const mimeType = String(item.mimeType || '').toLowerCase();
    const data = typeof item.data === 'string' ? item.data : '';
    if (!REF_ALLOWED_MIME.has(mimeType)) continue;
    if (!data || data.length > REF_MAX_BASE64_LEN) continue;
    // Cheap sanity check: base64 chars only.
    if (!/^[A-Za-z0-9+/=\s]+$/.test(data)) continue;
    out.push({ mimeType, data });
  }
  return out;
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'image';
}

async function generateImage({ prompt, size, apiKey, signal, referenceImages = [] }) {
  const aspectRatio = SIZE_TO_ASPECT_RATIO[size] || '1:1';

  // Build the request parts array: text prompt first, then any reference
  // images as inlineData parts. Gemini 2.5 Flash Image (Nano Banana) supports
  // multi-image input natively in a single request.
  // Named `reqParts` to avoid colliding with the response `parts` below.
  const reqParts = [{ text: prompt }];
  for (const ref of referenceImages) {
    reqParts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }

  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: reqParts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio
          }
        }
      }),
      signal
    }
  );

  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Bad upstream JSON: ${text.slice(0, 500)}`); }

  if (!resp.ok) {
    const errorMsg = data?.error?.message || data?.error?.details?.[0]?.message || `Gemini API error ${resp.status}`;
    throw new Error(errorMsg);
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts?.length) throw new Error('No image returned from Gemini API');

  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) throw new Error('No image data found in Gemini response');

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'Missing env GOOGLE_GEMINI_API_KEY' });
  }

  const {
    prompt: rawPrompt,
    size: rawSize = '1024x1024',
    referenceImages: rawRefs,
    referenceConsent
  } = req.body || {};
  const prompt = (rawPrompt || '').trim();

  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'Please provide a prompt' });
  }

  // Reference images: validate, then require explicit consent if any are present.
  const referenceImages = sanitizeReferenceImages(rawRefs);
  if (referenceImages.length > 0 && referenceConsent !== true) {
    return res.status(400).json({
      ok: false,
      error: 'Please confirm the reference-image consent checkbox before generating.'
    });
  }
  // Lightly augment the prompt so the model treats the inputs as references
  // rather than as the canvas to edit.
  const enhancedPrompt = referenceImages.length > 0
    ? `${prompt}\n\n[The attached image(s) are visual references — use the people, pets, objects, or styles shown as inspiration in this new scene. Do not copy them verbatim; produce an original artwork based on the description.]`
    : prompt;

  // Check if user can generate (has credits or within anonymous limit)
  const creditCheck = await canUserGenerate(req);

  if (!creditCheck.allowed) {
    const statusCode = creditCheck.reason === 'Insufficient credits' ? 402 : 429;
    return res.status(statusCode).json({
      ok: false,
      error: creditCheck.reason,
      needsCredits: creditCheck.reason === 'Insufficient credits',
      needsSignup: creditCheck.isAnonymous && creditCheck.remainingGenerations === 0,
      remainingCredits: creditCheck.remainingCredits,
      remainingGenerations: creditCheck.remainingGenerations
    });
  }

  const size = ALLOWED_SIZES.has(rawSize) ? rawSize : '1024x1024';
  const [w, h] = size.split('x').map(n => parseInt(n, 10));

  // Timeout + retry (2 tries). Multi-image input requests can be slower, so
  // give the upstream a longer window when references are attached.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), referenceImages.length > 0 ? 55000 : 45000);

  let buffer;
  try {
    try {
      buffer = await generateImage({ prompt: enhancedPrompt, size, apiKey, signal: ctrl.signal, referenceImages });
    } catch (e) {
      // Quick retry once
      if (process.env.DEBUG_LOGS) console.log('First attempt failed, retrying:', e.message);
      buffer = await generateImage({ prompt: enhancedPrompt, size, apiKey, signal: ctrl.signal, referenceImages });
    }
  } catch (err) {
    clearTimeout(timer);
    console.error('Generate image error:', err?.message || err);
    return res.status(502).json({
      ok: false,
      error: 'Image generation is temporarily unavailable. Please try again in a moment.'
    });
  }
  clearTimeout(timer);

  try {
    // ── 1. Build the watermarked preview FIRST (catches sharp errors before any uploads) ──
    let preview;
    try {
      preview = await makeWatermarkedPreview(buffer);
    } catch (wmErr) {
      console.error('Watermark error:', wmErr?.message || wmErr);
      // If watermarking somehow fails, refuse to upload — never expose a clean
      // image as the preview by accident.
      return res.status(500).json({
        ok: false,
        error: 'Image post-processing failed. Please try again.'
      });
    }

    // ── 2. Upload BOTH images to Vercel Blob ──
    // - clean: full-resolution PNG, the print master. Lives at a non-guessable
    //   path (random suffix). Only revealed to admin (CSV export) and to the
    //   customer in their post-payment confirmation email.
    // - preview: downsized + watermarked JPEG. This is what the browser shows
    //   and what's safe to expose publicly.
    const base = `${Date.now()}-${slugify(prompt)}`;
    const cleanKey = `originals/${base}.png`;
    const previewKey = `previews/${base}.jpg`;

    // Upload originals with addRandomSuffix so the URL is non-guessable.
    const cleanUpload = await put(cleanKey, buffer, {
      access: 'public',
      contentType: 'image/png',
      cacheControlMaxAge: 31536000,
      addRandomSuffix: true
    });
    const cleanUrl = cleanUpload.url;

    const previewUpload = await put(previewKey, preview.buffer, {
      access: 'public',
      contentType: preview.contentType,
      cacheControlMaxAge: 31536000
    });
    const previewUrl = previewUpload.url;

    // ── 3. Save metadata json (helpful for ad-hoc inspection) ──
    const metadata = {
      model: 'gemini-2.5-flash-image',
      prompt,
      size,
      width: w,
      height: h,
      created_at: new Date().toISOString(),
      preview_url: previewUrl,
      clean_url: cleanUrl,
      preview_dimensions: { width: preview.width, height: preview.height },
      watermark_version: PREVIEW_WATERMARK_VERSION
    };

    const metaKey = `meta/${base}.json`;
    await put(metaKey, JSON.stringify(metadata, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: true
    });

    // ── 4. Deduct credits + record generation ──
    const tokenData = getUserFromRequest(req);
    const ipAddress = getClientIp(req);

    const creditResult = await deductCreditsForGeneration(req, {
      prompt,
      imageUrl: previewUrl, // store preview url in credit log; clean stays in generations table
      size,
      sessionId: req.body.sessionId
    });

    // Record generation in database — both URLs.
    await recordGeneration(
      tokenData?.userId || null,
      ipAddress,
      prompt,
      previewUrl,
      size,
      0.035, // Cost per generation
      cleanUrl
    );

    // ── 5. Respond — only the previewUrl is sent to the browser ──
    // The cleanUrl is intentionally NOT in the JSON response, so it never
    // leaks to the client. The server pulls it from the DB at order time.
    return res.status(200).json({
      ok: true,
      image: previewUrl,
      url: previewUrl,
      width: preview.width,
      height: preview.height,
      // Native (clean original) dimensions — useful for the room-mockup math
      // and for showing customers what their print resolution will be. The URL
      // itself is withheld; only the size leaks.
      nativeWidth: w,
      nativeHeight: h,
      prompt,
      size,
      credits: {
        newBalance: creditResult.newBalance,
        creditsUsed: creditResult.creditsUsed,
        remainingGenerations: creditResult.remainingGenerations,
        isAnonymous: creditResult.isAnonymous
      }
    });

  } catch (uploadErr) {
    console.error('Upload error:', uploadErr);
    return res.status(500).json({
      ok: false,
      error: 'Failed to save image'
    });
  }
}
