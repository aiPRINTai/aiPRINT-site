import crypto from 'node:crypto';
import { createUser, getUserByEmail } from '../db/index.js';
import { hashPassword, isValidEmail, isValidPassword } from './utils.js';
import { sendVerificationEmail } from '../_email.js';

/**
 * POST /api/auth/signup
 * Creates an unverified account. Sends a verification email. Does NOT issue a JWT.
 * User must click the email link before they can log in.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const cleanEmail = email.toLowerCase().trim();

    const existingUser = await getUserByEmail(cleanEmail);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await createUser(cleanEmail, passwordHash, {
      verificationToken,
      verificationExpires
    });

    const origin = process.env.CLIENT_URL
      || req.headers.origin
      || `https://${req.headers.host || 'aiprint.ai'}`;
    const verifyUrl = `${origin}/api/auth/verify?token=${verificationToken}`;

    try {
      const result = await sendVerificationEmail(cleanEmail, verifyUrl);
      if (result?.error) console.error('Verification email send returned error:', result);
    } catch (err) {
      console.error('Verification email threw:', err);
    }

    return res.status(201).json({
      success: true,
      verificationRequired: true,
      message: 'Account created. Please check your email to verify your account.',
      email: cleanEmail
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}
