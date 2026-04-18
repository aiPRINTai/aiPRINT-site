import { getUserGenerations } from '../db/index.js';
import { getUserFromRequest } from '../auth/utils.js';

/**
 * GET /api/user/generations
 * Get user's generation history
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
    const generations = await getUserGenerations(tokenData.userId, limit);

    return res.status(200).json({
      success: true,
      generations
    });
  } catch (error) {
    console.error('Get generations error:', error);
    return res.status(500).json({ error: 'Failed to get generations' });
  }
}
