import { getUserById } from '../db/index.js';
import { getUserFromRequest } from '../auth/utils.js';

/**
 * GET /api/credits/balance
 * Get current user's credit balance
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tokenData = getUserFromRequest(req);

    if (!tokenData || !tokenData.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await getUserById(tokenData.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      balance: user.credits_balance
    });
  } catch (error) {
    console.error('Get balance error:', error);
    return res.status(500).json({ error: 'Failed to get credit balance' });
  }
}
