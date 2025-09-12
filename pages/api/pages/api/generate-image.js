// /pages/api/generate-image.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  try {
    const apiKey = process.env.CLIENT_KEY_; // set in Vercel env
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: 'Missing env CLIENT_KEY_' });
    }

    const { prompt = '', negative_prompt = '' } = req.body || {};
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ ok: false, error: 'Please provide a prompt' });
    }

    // Choose the correct Stability endpoint
    const STABILITY_URL = 'https://api.stability.ai/v2beta/stable-image/generate/core';

    const body = {
      prompt,
      negative_prompt,
      mode: 'text-to-image',
      width: 1024,
      height: 1024,
      output_format: 'webp',
    };

    const upstream = await fetch(STABILITY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const raw = await upstream.text();

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Bad upstream JSON', raw: raw.slice(0, 1200) });
    }

    const imageB64 =
      data?.image_base64 ||
      data?.image?.base64 ||
      data?.images?.[0]?.base64 ||
      data?.result?.[0]?.image ||
      null;

    if (!imageB64) {
      return res.status(500).json({
        ok: false,
        error: 'No image returned from provider',
        preview: JSON.stringify(data).slice(0, 800),
      });
    }

    return res.status(200).json({
      ok: true,
      image: `data:image/webp;base64,${imageB64}`,
      format: data?.format || 'webp',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
