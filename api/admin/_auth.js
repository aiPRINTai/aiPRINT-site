// api/admin/_auth.js
// Shared admin-endpoint gate. Two jobs:
//   1. Constant-time compare of the presented bearer token against
//      ADMIN_PASSWORD. A naive `===` string compare leaks byte-by-byte
//      match progress via timing differences. Over enough samples an
//      attacker can recover the password one character at a time even
//      across internet latency.
//   2. Per-IP rate limit. Admin endpoints are high-value targets, and
//      without a limit a script can try thousands of passwords per
//      minute. 30/min/IP is generous for legit admin use, tight enough
//      that a brute-force of even a short password is infeasible.
//
// Usage:
//   import { requireAdmin } from './_auth.js';
//   export default async function handler(req, res) {
//     if (!requireAdmin(req, res)) return;
//     // ...your handler...
//   }

import crypto from 'node:crypto';
import { enforceRateLimit } from '../_rate-limit.js';

function timingSafeStringEqual(a, b) {
  // timingSafeEqual requires equal-length buffers or it throws. Pad to a
  // fixed 64-byte buffer so the comparison itself runs identically for
  // any input shape — no early-return on length mismatch.
  const A = Buffer.alloc(64);
  const B = Buffer.alloc(64);
  Buffer.from(String(a || ''), 'utf8').copy(A);
  Buffer.from(String(b || ''), 'utf8').copy(B);
  // Still compare real lengths to reject truncated tokens, but only AFTER
  // the constant-time byte compare has already run.
  const bytesMatch = crypto.timingSafeEqual(A, B);
  const lenMatch = String(a || '').length === String(b || '').length;
  return bytesMatch && lenMatch;
}

/**
 * Rate-limits then authenticates an admin request. On failure, sends the
 * appropriate 401/429 response and returns false. On success, returns true
 * and the caller continues.
 *
 * @returns {boolean} `true` if authenticated; `false` if the response has
 *                    already been sent with a 401/429.
 */
export function requireAdmin(req, res) {
  // Rate limit FIRST so even a malformed auth header is counted toward
  // the brute-force budget.
  const rl = enforceRateLimit(req, res, {
    bucket: 'admin-auth',
    limit: 30,
    windowMs: 60_000
  });
  if (!rl.ok) return false;

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.error('requireAdmin: ADMIN_PASSWORD not set — refusing all admin access');
    res.status(500).json({ error: 'Admin auth not configured' });
    return false;
  }

  const auth = req.headers.authorization || '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!timingSafeStringEqual(presented, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}
