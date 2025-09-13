// /api/generate-image.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const orgId  = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || '';
  const blobToken =
    process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN || '';

  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'Missing env OPENAI_API_KEY' });
  }

  const { prompt, size = '1024x1024' } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: 'Please provide a prompt' });
  }

  const allowedSizes = new Set(['1024x1024', '1024x1536', '1536x1024']);
  const safeSize = allowedSizes.has(size) ? size : '1024x1024';

  try {
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
      })
    });

    const raw = await upstream.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({ ok: false, error: 'Bad upstream JSON', details: raw.slice(0, 800) });
    }

    if (!upstream.ok) {
      const msg = data?.error?.message || `OpenAI error ${upstream.status}`;
      return res.status(upstream.status).json({ ok: false, error: msg });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ ok: false, error: 'No image returned from provider' });
    }

    // Try to host on Vercel Blob (optional)
    if (blobToken) {
      try {
        const { put } = await import('@vercel/blob');
        const file = `preview-${Date.now()}.png`;
        const buffer = Buffer.from(b64, 'base64');

        const uploaded = await put(file, buffer, {
          access: 'public',
          contentType: 'image/png',
          token: blobToken
        });

        return res.status(200).json({ ok: true, image: uploaded.url, hosted: true });
      } catch (err) {
        console.error('Blob upload failed:', err?.message || err);
      }
    }

    // Fallback: data URL
    const dataUrl = `data:image/png;base64,${b64}`;
    return res.status(200).json({ ok: true, image: dataUrl, hosted: false });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}
