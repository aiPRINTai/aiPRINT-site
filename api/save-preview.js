// /api/save-preview.js
// Save a preview JSON to Vercel Blob and return a short id
import crypto from 'crypto';
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { preview } = req.body || {};
    if (!preview?.image) return res.status(400).json({ error: 'Missing preview' });

    // Tiny ID
    const id = crypto.randomBytes(5).toString('hex'); // e.g. "a1b2c3d4e5"
    const key = `previews-json/${id}.json`;

    const { url } = await put(key, Buffer.from(JSON.stringify(preview)), {
      access: 'public',
      contentType: 'application/json',
      cacheControl: 'public, max-age=31536000, immutable',
      addRandomSuffix: false
    });

    return res.status(200).json({ id, url });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
