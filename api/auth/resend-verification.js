// POST /api/auth/resend-verification { email }
// Issues a new verification token + email. Always returns 200 (never reveals
// whether the email is registered) to prevent enumeration.

import crypto from 'node:crypto';
import { getUserByEmail, setVerificationToken } from '../db/index.js';
import { isValidEmail } from './utils.js';
import { sendVerificationEmail } from '../_email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const email = (body?.email || '').toLowerCase().trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

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
