// POST /api/auth/reset-password
// Body: { token, password }
//
// Validates the reset token against the user row (must be non-null and
// non-expired), hashes the new password, writes it, and clears the token.
// Also issues a fresh JWT so the user is signed in after reset.

import {
  getUserByResetToken,
  updateUserPassword,
  markEmailVerified
} from '../db/index.js';
import { hashPassword, isValidPassword, generateToken } from './utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');

    if (!token) {
      return res.status(400).json({ error: 'Reset link is missing its token.' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const user = await getUserByResetToken(token);
    if (!user) {
      return res.status(400).json({
        error: 'This reset link is invalid or has expired. Please request a new one.'
      });
    }

    const passwordHash = await hashPassword(password);
    await updateUserPassword(user.id, passwordHash);

    // If they could click the reset link, they control the inbox — auto-verify
    // while we're at it so they don't have to do a second round-trip.
    if (!user.email_verified) {
      try { await markEmailVerified(user.id); } catch (e) { /* non-fatal */ }
    }

    const jwtToken = generateToken({ id: user.id, email: user.email });

    return res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        credits_balance: user.credits_balance,
        email_verified: true
      }
    });
  } catch (err) {
    console.error('reset-password error:', err);
    return res.status(500).json({ error: 'Could not reset password. Please try again.' });
  }
}
