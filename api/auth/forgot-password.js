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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
