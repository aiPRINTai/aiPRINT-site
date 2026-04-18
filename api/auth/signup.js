import { createUser, getUserByEmail } from '../db/index.js';
import { hashPassword, generateToken, isValidEmail, isValidPassword, createAuthCookie } from './utils.js';

/**
 * POST /api/auth/signup
 * Create a new user account with 10 free credits
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

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with 10 free credits
    const user = await createUser(email.toLowerCase(), passwordHash);

    // Generate JWT token
    const token = generateToken(user);

    // Set HTTP-only cookie
    res.setHeader('Set-Cookie', createAuthCookie(token));

    // Return user data (without password hash)
    return res.status(201).json({
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
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}
