import { clearAuthCookie } from './utils.js';

/**
 * POST /api/auth/logout
 * Clear authentication cookie
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear the auth cookie
  res.setHeader('Set-Cookie', clearAuthCookie());

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
}
