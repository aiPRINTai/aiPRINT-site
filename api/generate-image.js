// /api/generate-image.js  (Vercel/Next.js serverless function)

export default async function handler(req, res) {
  // Only allow POST so people can't hit this from the address bar
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;           // required
  const orgId  = process.env.OPENAI_ORG_ID;            // optional but helps some accounts
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'Missing env OPENAI_API_KEY' });
  }

  // read body
  const { prompt, size = '1024x1024' } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: 'Please provide a prompt' });
  }

  // OpenAI image API only accepts these at the moment
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
        // NOTE: Do NOT send response_format here; many accounts only support Base64 default.
      })
    });

    const raw = await upstream.text();

    // The response should be JSON; capture any non-JSON for easier debugging
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        ok: false,
        error: 'Bad upstream JSON',
        details: raw.slice(0, 800)
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

    // OpenAI returns PNG for gpt-image-1 by default
    const imageDataUrl = `data:image/png;base64,${b64}`;

    return res.status(200).json({
      ok: true,
      image: imageDataUrl
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}
