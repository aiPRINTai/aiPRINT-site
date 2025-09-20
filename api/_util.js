// Small helpers for Vercel serverless
export function json(res, code, data, extraHeaders = {}) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

export function allowCors(handler) {
  return async (req, res) => {
    const origin = process.env.CLIENT_URL || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Stripe-Signature');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return handler(req, res);
  };
}

// Read raw body from a Node stream (needed for Stripe webhook)
export async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Read JSON body safely
export async function readJson(req) {
  const buf = await rawBody(req);
  try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { return {}; }
}
