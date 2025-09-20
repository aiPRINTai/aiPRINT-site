// /api/generate-image.js — OpenAI image -> Vercel Blob (public URL) with retry + metadata
import { put } from '@vercel/blob';

const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);
const MODEL = 'gpt-image-1';

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'image';
}

async function generateImage({ prompt, size, apiKey, orgId, signal }) {
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(orgId ? { 'OpenAI-Organization': orgId } : {})
    },
    body: JSON.stringify({ model: MODEL, prompt, size }),
    signal
  });

  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error(`Bad upstream JSON: ${text.slice(0, 500)}`);
  }
  if (!resp.ok) {
    throw new Error(data?.error?.message || `OpenAI error ${resp.status}`);
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned from provider');
  return Buffer.from(b64, 'base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  const orgId  = process.env.OPENAI_ORG_ID || '';
  if (!apiKey) return res.status(500).json({ ok: false, error: 'Missing env OPENAI_API_KEY' });

  const { prompt: rawPrompt, size: rawSize = '1024x1024' } = req.body || {};
  const prompt = (rawPrompt || '').trim();
  if (!prompt) return res.status(400).json({ ok: false, error: 'Please provide a prompt' });

  const size = ALLOWED_SIZES.has(rawSize) ? rawSize : '1024x1024';
  const [w, h] = size.split('x').map(n => parseInt(n, 10));

  // Timeout + retry (2 tries)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), 45_000);
  let buffer;
  try {
    try {
      buffer = await generateImage({ prompt, size, apiKey, orgId, signal: ctrl.signal });
    } catch (e) {
      // quick retry once
      buffer = await generateImage({ prompt, size, apiKey, orgId, signal: ctrl.signal });
    }
  } catch (err) {
    clearTimeout(timer);
    return res.status(502).json({ ok: false, error: err.message || 'Upstream error' });
  }
  clearTimeout(timer);

  const base = `previews/${Date.now()}-${slugify(prompt)}`;
  const pngKey = `${base}.png`;
  const metaKey = `${base}.json`;

  // Upload image
  const { url } = await put(pngKey, buffer, {
    access: 'public',
    contentType: 'image/png',
    cacheControl: 'public, max-age=31536000, immutable',
    addRandomSuffix: true
  });

  // Upload tiny sidecar metadata (optional)
  const metadata = {
    model: MODEL,
    prompt,
    size,
    width: w,
    height: h,
    created_at: new Date().toISOString(),
    image_url: url
  };
  await put(metaKey, JSON.stringify(metadata, null, 2), {
    access: 'public',
    contentType: 'application/json',
    cacheControl: 'public, max-age=31536000, immutable',
    addRandomSuffix: false
  });

  return res.status(200).json({ ok: true, image: url, url, width: w, height: h, prompt, size });
}
