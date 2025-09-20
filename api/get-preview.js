// /api/get-preview.js
// Fetch a saved preview JSON (by id) and return it
export default async function handler(req, res) {
  try {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'Missing id' });

    // We stored it at previews-json/{id}.json
    const url = `https://blob.vercel-storage.com/previews-json/${encodeURIComponent(id)}.json`;
    const r = await fetch(url);
    if (!r.ok) return res.status(404).json({ error: 'Not found' });

    const json = await r.json();
    return res.status(200).json({ ok: true, preview: json });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
