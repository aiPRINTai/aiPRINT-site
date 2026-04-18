import { getUserById } from '../db/index.js';
import { getUserFromRequest } from './utils.js';

/**
 * GET /api/auth/me
 * Get current authenticated user's information
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from JWT token
    const tokenData = getUserFromRequest(req);

    if (!tokenData || !tokenData.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get fresh user data from database
    const user = await getUserById(tokenData.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        credits_balance: user.credits_balance,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to get user information' });
  }
}
