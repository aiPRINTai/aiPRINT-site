// POST /api/auth/resend-verification { email }
// Issues a new verification token + email. Always returns 200 (never reveals
// whether the email is registered) to prevent enumeration.

import crypto from 'node:crypto';
import { getUserByEmail, setVerificationToken } from '../db/index.js';
import { isValidEmail } from './utils.js';
import { sendVerificationEmail } from '../_email.js';
import { enforceRateLimit } from '../_rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Two-layer: IP cap catches broad abuse, per-email cap stops inbox bombing
  // of a specific target. Legit users click "resend" 0–3 times total; 10/hour
  // per IP and 3/hour per email are well above any honest use.
  const ipRl = enforceRateLimit(req, res, {
    bucket: 'auth-resend-ip',
    limit: 10,
    windowMs: 60 * 60_000
  });
  if (!ipRl.ok) return;

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const email = (body?.email || '').toLowerCase().trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    // Per-email cap applied after validation so malformed input doesn't
    // burn a targeted victim's bucket.
    const emailRl = enforceRateLimit(req, res, {
      bucket: 'auth-resend-email',
      limit: 3,
      windowMs: 60 * 60_000,
      key: email
    });
    if (!emailRl.ok) return;

    const user = await getUserByEmail(email);
    if (user && user.email_verified === false) {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await setVerificationToken(user.id, verificationToken, verificationExpires);

      const origin = process.env.CLIENT_URL
        || req.headers.origin
        || `https://${req.headers.host || 'aiprint.ai'}`;
      const verifyUrl = `${origin}/api/auth/verify?token=${verificationToken}`;

      try {
        const result = await sendVerificationEmail(email, verifyUrl);
        if (result?.error) console.error('Resend verification email error response:', result);
      } catch (err) {
        console.error('Resend verification email threw:', err);
      }
    }

    // Always succeed — don't leak account existence
    return res.status(200).json({
      success: true,
      message: 'If that account exists and is unverified, we just sent a new link.'
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
