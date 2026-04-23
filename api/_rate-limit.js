// api/_rate-limit.js
// Small in-memory token-bucket rate limiter keyed by client IP.
//
// Intent: defend narrow, expensive or abuse-prone endpoints (image gen,
// share-link mint, slug lookups) from trivial scripted abuse. This is NOT
// a distributed limiter — Vercel serverless instances each keep their own
// counters, so a determined attacker can punch through by landing on
// different regions/instances. That's acceptable here: the purpose is to
// cut off dumb abuse loops, not to replace the paid layer (credits, Stripe)
// that gates the real cost.
//
// Usage:
//   import { enforceRateLimit } from './_rate-limit.js';
//   const rl = enforceRateLimit(req, res, { bucket: 'shares-post', limit: 30, windowMs: 60_000 });
//   if (!rl.ok) return; // response already sent
//
// On allow, sets standard headers:
//   X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset (unix seconds)
// On deny, sends 429 with Retry-After (seconds) and a JSON error body, then
// returns { ok: false }.

const BUCKETS = new Map(); // key -> { hits: number[], windowMs, limit }
const MAX_KEYS = 10_000;   // hard cap so a botnet can't OOM the instance

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function prune(bucket, now) {
  // Drop timestamps older than the window so the array stays bounded.
  const cutoff = now - bucket.windowMs;
  while (bucket.hits.length && bucket.hits[0] <= cutoff) bucket.hits.shift();
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{ bucket: string, limit: number, windowMs: number, key?: string }} opts
 * @returns {{ ok: boolean, remaining?: number }}
 */
export function enforceRateLimit(req, res, opts) {
  const { bucket: bucketName, limit, windowMs } = opts;
  const key = `${bucketName}:${opts.key || getClientIp(req)}`;
  const now = Date.now();

  // Evict oldest entries if the map gets too big. O(n) but n is capped.
  if (BUCKETS.size > MAX_KEYS) {
    const oldest = BUCKETS.keys().next().value;
    if (oldest) BUCKETS.delete(oldest);
  }

  let b = BUCKETS.get(key);
  if (!b) {
    b = { hits: [], windowMs, limit };
    BUCKETS.set(key, b);
  }
  prune(b, now);

  const remaining = Math.max(0, limit - b.hits.length);
  const resetSec = Math.ceil((now + windowMs) / 1000);

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining - 1)));
  res.setHeader('X-RateLimit-Reset', String(resetSec));

  if (b.hits.length >= limit) {
    const oldestHit = b.hits[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestHit + windowMs - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: retryAfterSec
    });
    return { ok: false };
  }

  b.hits.push(now);
  return { ok: true, remaining: remaining - 1 };
}

// Exported for tests / explicit flushes during local iteration. Never called
// from production code paths.
export function _resetAllBucketsForTests() {
  BUCKETS.clear();
}
