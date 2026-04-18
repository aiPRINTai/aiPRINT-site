// api/generate-image.js - Google Gemini (Nano Banana) Version with Credits
import { put } from '@vercel/blob';
import { canUserGenerate, deductCreditsForGeneration } from './credits/utils.js';
import { recordGeneration } from './db/index.js';
import { getUserFromRequest, getClientIp } from './auth/utils.js';

const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);

// Map sizes to Gemini aspect ratios
const SIZE_TO_ASPECT_RATIO = {
  '1024x1024': '1:1',
  '1536x1024': '3:2',
  '1024x1536': '2:3'
};

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'image';
}

async function generateImage({ prompt, size, apiKey, signal }) {
  const aspectRatio = SIZE_TO_ASPECT_RATIO[size] || '1:1';

  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          responseModalities: ['IMAGE'],
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
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Bad upstream JSON: ${text.slice(0, 500)}`);
  }

  if (!resp.ok) {
    const errorMsg = data?.error?.message || data?.error?.details?.[0]?.message || `Gemini API error ${resp.status}`;
    throw new Error(errorMsg);
  }

  // Extract base64 image from Gemini response
  // Response format: { candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('No image returned from Gemini API');
  }

  // Find the image part (Gemini may return text + image)
  const imagePart = parts.find(part => part.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) {
    throw new Error('No image data found in Gemini response');
  }

  const b64 = imagePart.inlineData.data;
  return Buffer.from(b64, 'base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'Missing env GOOGLE_GEMINI_API_KEY' });
  }

  const { prompt: rawPrompt, size: rawSize = '1024x1024' } = req.body || {};
  const prompt = (rawPrompt || '').trim();

  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'Please provide a prompt' });
  }

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

  // Timeout + retry (2 tries)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);

  let buffer;
  try {
    try {
      buffer = await generateImage({ prompt, size, apiKey, signal: ctrl.signal });
    } catch (e) {
      // Quick retry once
      console.log('First attempt failed, retrying:', e.message);
      buffer = await generateImage({ prompt, size, apiKey, signal: ctrl.signal });
    }
  } catch (err) {
    clearTimeout(timer);
    console.error('Generate image error:', err);
    return res.status(502).json({
      ok: false,
      error: err.message || 'Upstream error'
    });
  }
  clearTimeout(timer);

  try {
    // Upload to Vercel Blob
    const base = `previews/${Date.now()}-${slugify(prompt)}`;
    const pngKey = `${base}.png`;

    const { url } = await put(pngKey, buffer, {
      access: 'public',
      contentType: 'image/png',
      cacheControlMaxAge: 31536000
    });

    // Save metadata
    const metadata = {
      model: 'gemini-2.5-flash-image',
      prompt,
      size,
      width: w,
      height: h,
      created_at: new Date().toISOString(),
      image_url: url
    };

    const metaKey = `${base}-meta.json`;
    await put(metaKey, JSON.stringify(metadata, null, 2), {
      access: 'public',
      contentType: 'application/json'
    });

    // Deduct credits and record generation
    const tokenData = getUserFromRequest(req);
    const ipAddress = getClientIp(req);

    const creditResult = await deductCreditsForGeneration(req, {
      prompt,
      imageUrl: url,
      size,
      sessionId: req.body.sessionId
    });

    // Record generation in database
    await recordGeneration(
      tokenData?.userId || null,
      ipAddress,
      prompt,
      url,
      size,
      0.035 // Cost per generation
    );

    return res.status(200).json({
      ok: true,
      image: url,
      url,
      width: w,
      height: h,
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
