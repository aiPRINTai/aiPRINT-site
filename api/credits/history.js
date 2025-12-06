import { getUserCreditHistory } from '../db/index.js';
import { getUserFromRequest } from '../auth/utils.js';

/**
 * GET /api/credits/history
 * Get user's credit transaction history
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

    const limit = parseInt(req.query.limit) || 50;
    const history = await getUserCreditHistory(tokenData.userId, limit);

    return res.status(200).json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Get history error:', error);
    return res.status(500).json({ error: 'Failed to get credit history' });
  }
}
