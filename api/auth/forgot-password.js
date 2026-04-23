// POST /api/auth/forgot-password
// Body: { email }
//
// Always returns 200 with a generic message, regardless of whether the email
// exists. This prevents account-enumeration (attacker tries 10k emails, sees
// which ones produce "sent" responses).
//
// If the email DOES exist, we generate a reset token, store it on the user
// row, and send the reset link via Resend.

import crypto from 'node:crypto';
import { getUserByEmail, setResetToken } from '../db/index.js';
import { isValidEmail } from './utils.js';
import { sendPasswordResetEmail } from '../_email.js';
import { enforceRateLimit } from '../_rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // IP-level cap on reset requests. Legit users hit this 0–2 times/month;
  // a bomber trying to flood someone's inbox makes hundreds of requests.
  const ipRl = enforceRateLimit(req, res, {
    bucket: 'auth-forgot-ip',
    limit: 10,
    windowMs: 60 * 60_000 // 10/hour
  });
  if (!ipRl.ok) return;

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

    const email = String(body?.email || '').trim().toLowerCase();

    // Generic accept response — used for bad email format too, so attackers
    // can't tell the difference between "invalid format" and "no account".
    const genericOk = () => res.status(200).json({
      success: true,
      message: 'If that email has an account, we\'ve sent a password reset link.'
    });

    if (!email || !isValidEmail(email)) {
      return genericOk();
    }

    // Per-email cap: at most 3 reset emails / hour to any one address.
    // Runs AFTER the format check so an attacker can't probe for existence
    // via timing or rate-limit deltas between valid/invalid email shapes.
    //
    // Important: we silently return genericOk() on limit breach instead of
    // a 429 — otherwise the rate-limit response itself leaks that the email
    // is either valid-format-but-spammy, which is a minor enumeration hint.
    // enforceRateLimit normally sends 429 with its own body, so we bypass
    // it by checking first with a custom bucket inspection... except the
    // helper doesn't expose that. Compromise: accept the small enumeration
    // signal in exchange for clear UX (user sees why it failed). Most
    // real apps do this.
    const emailRl = enforceRateLimit(req, res, {
      bucket: 'auth-forgot-email',
      limit: 3,
      windowMs: 60 * 60_000,
      key: email
    });
    if (!emailRl.ok) return;

    const user = await getUserByEmail(email);
    if (!user) {
      return genericOk();
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await setResetToken(user.id, token, expires);

    const origin = process.env.CLIENT_URL
      || req.headers.origin
      || `https://${req.headers.host || 'aiprint.ai'}`;
    const resetUrl = `${origin}/reset-password.html?token=${token}`;

    try {
      const result = await sendPasswordResetEmail(email, resetUrl);
      if (result?.error) console.error('Password reset email returned error:', result);
    } catch (err) {
      console.error('Password reset email threw:', err);
    }

    return genericOk();
  } catch (err) {
    console.error('forgot-password error:', err);
    // Still return 200 so we don't leak the failure to attackers
    return res.status(200).json({
      success: true,
      message: 'If that email has an account, we\'ve sent a password reset link.'
    });
  }
}
