import { getUserCreditHistory, getUserById } from '../db/index.js';
import { getUserFromRequest, isTokenFresh } from '../auth/utils.js';

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

    // One extra DB hit to enforce the password-reset session invalidation
    // invariant. Without this, a stale JWT could still read credit history
    // (PII: purchase amounts, timestamps) after the user rotated their
    // password to lock out an attacker.
    const user = await getUserById(tokenData.userId);
    if (!user || !isTokenFresh(tokenData, user)) {
      return res.status(401).json({ error: 'Session expired — please log in again.' });
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
