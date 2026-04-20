// Small helpers for Vercel serverless

// Defensive: env vars saved through the Vercel UI sometimes pick up trailing
// whitespace, literal "\n" escapes, or zero-width characters. Node's HTTP
// module then refuses any outbound header containing those chars with
// `ERR_INVALID_CHAR`, which crashes the function and surfaces as a bare
// 500 ("A server error has occurred") that breaks JSON parsing on the client.
function sanitizeHeaderValue(v) {
  if (!v) return '';
  return String(v)
    .replace(/\\[nrt]/g, '')                  // literal \n \r \t escapes
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, '') // real whitespace + zero-widths
    .replace(/\/+$/, '');                     // trailing slash(es)
}

export function json(res, code, data, extraHeaders = {}) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

export function allowCors(handler) {
  return async (req, res) => {
    // Sanitize CLIENT_URL before it crosses res.setHeader — otherwise a stray
    // newline in the env var crashes every request to this endpoint.
    const cleaned = sanitizeHeaderValue(process.env.CLIENT_URL);
    const origin = /^https?:\/\/[^\s]+$/i.test(cleaned) ? cleaned : '*';
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
