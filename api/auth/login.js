import { getUserByEmail } from '../db/index.js';
import { comparePassword, generateToken, isValidEmail, createAuthCookie } from './utils.js';
import { enforceRateLimit } from '../_rate-limit.js';

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Two-layer brute-force defense:
  //   Layer 1 (IP): 20 login attempts / 5 min per source IP. Cuts off
  //     a single attacker trying many emails from one box.
  //   Layer 2 (email): 5 attempts / 15 min per email. Cuts off a
  //     botnet (many IPs) pounding one known-good account.
  // Both must pass. Either one exceeded returns 429.
  const ipRl = enforceRateLimit(req, res, {
    bucket: 'auth-login-ip',
    limit: 20,
    windowMs: 5 * 60_000
  });
  if (!ipRl.ok) return;

  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Layer 2: per-email. The `key` override replaces IP in the bucket key
    // so the counter follows the targeted email instead of the caller.
    const emailRl = enforceRateLimit(req, res, {
      bucket: 'auth-login-email',
      limit: 5,
      windowMs: 15 * 60_000,
      key: cleanEmail
    });
    if (!emailRl.ok) return;

    // Get user from database
    const user = await getUserByEmail(cleanEmail);
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
