import { getCreditPackages } from './utils.js';

/**
 * GET /api/credits/packages
 * Get available credit packages for purchase
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const packages = getCreditPackages();

    return res.status(200).json({
      success: true,
      packages
    });
  } catch (error) {
    console.error('Get packages error:', error);
    return res.status(500).json({ error: 'Failed to get credit packages' });
  }
}
