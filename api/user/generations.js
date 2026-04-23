import { getUserGenerations, getUserById } from '../db/index.js';
import { getUserFromRequest, isTokenFresh } from '../auth/utils.js';

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

    // Generations contain prompt text (often PII-adjacent — kids, pets,
    // home descriptions). Enforce session freshness so stale JWTs can't
    // exfiltrate prompt history after a password reset.
    const user = await getUserById(tokenData.userId);
    if (!user || !isTokenFresh(tokenData, user)) {
      return res.status(401).json({ error: 'Session expired — please log in again.' });
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
