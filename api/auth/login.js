import { getUserByEmail } from '../db/index.js';
import { comparePassword, generateToken, isValidEmail, createAuthCookie } from './utils.js';

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Get user from database
    const user = await getUserByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Block unverified accounts
    if (user.email_verified === false) {
      return res.status(403).json({
        error: 'Please verify your email before signing in.',
        verificationRequired: true,
        email: user.email
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Set HTTP-only cookie
    res.setHeader('Set-Cookie', createAuthCookie(token));

    // Return user data (without password hash)
    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        credits_balance: user.credits_balance,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to login' });
  }
}
