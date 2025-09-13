// /api/generate-image.js — generates an image with OpenAI and saves it to Vercel Blob

import { put } from '@vercel/blob';

// helper: makes a safe filename from prompt text
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // replace non-alphanumeric with hyphen
    .replace(/(^-|-$)/g, '')       // trim leading/trailing dashes
    .slice(0, 60) || 'image';      // max 60 chars, fallback to 'image'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;        // required
  const orgId  = process.env.OPENAI_ORG_ID || '';   // optional

  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'Missing env OPENAI_API_KEY' });
  }

  const { prompt, size = '1024x1024' } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: 'Please provide a prompt' });
  }

  // restrict to supported sizes
  const allowedSizes = new Set(['1024x1024', '1024x1536', '1536x1024']);
  const safeSize = allowedSizes.has(size) ? size : '1024x1024';

  try {
    // 1) Request image from OpenAI
    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(orgId ? { 'OpenAI-Organization': orgId } : {})
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt.trim(),
        size: safeSize
        // NOTE: no response_format → defaults to b64_json
      })
    });

    const raw = await upstream.text();

    // try parsing JSON
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        ok: false,
        error: 'Bad upstream JSON',
        details: raw.slice(0, 500)
      });
    }

    if (!upstream.ok) {
      const msg = data?.error?.message || `OpenAI error ${upstream.status}`;
      return res.status(upstream.status).json({ ok: false, error: msg });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ ok: false, error: 'No image returned from provider' });
    }

    // 2) Save image to Vercel Blob (permanent CDN URL)
    const buffer = Buffer.from(b64, 'base64');
    const key = `previews/${Date.now()}-${slugify(prompt)}.png`;

    const { url } = await put(key, buffer, {
      access: 'public',
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
      addRandomSuffix: true
    });

    // 3) Return JSON response
    return res.status(200).json({
      ok: true,
      image: url,   // frontend uses this for <img>
      url
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}
