import { getOrdersByUserId, getOrdersByEmail, getUserById } from '../db/index.js';
import { getUserFromRequest, isTokenFresh } from '../auth/utils.js';

/**
 * GET /api/user/orders
 * Returns the print orders belonging to the authenticated user.
 * Matches by user_id first; falls back to email match for orders placed
 * before the user signed up (same email at checkout).
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

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const [byId, user] = await Promise.all([
      getOrdersByUserId(tokenData.userId, { limit }),
      getUserById(tokenData.userId)
    ]);

    // Orders contain shipping addresses and prompt text — high-value PII.
    // Reject stale tokens before returning anything.
    if (!user || !isTokenFresh(tokenData, user)) {
      return res.status(401).json({ error: 'Session expired — please log in again.' });
    }

    let merged = byId;
    if (user?.email) {
      const byEmail = await getOrdersByEmail(user.email, { limit });
      const seen = new Set(byId.map(o => o.id));
      for (const o of byEmail) {
        if (!seen.has(o.id)) merged.push(o);
      }
      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return res.status(200).json({ success: true, orders: merged });
  } catch (error) {
    console.error('Get user orders error:', error);
    return res.status(500).json({ error: 'Failed to get orders' });
  }
}
