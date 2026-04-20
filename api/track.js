import { getOrderByStripeSessionId } from './db/index.js';

const CARRIER_TRACKING_URLS = {
  ups:   n => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  fedex: n => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  usps:  n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  dhl:   n => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`
};

function trackingUrlFor(carrier, number) {
  if (!carrier || !number) return null;
  const fn = CARRIER_TRACKING_URLS[String(carrier).toLowerCase()];
  return fn ? fn(number) : null;
}

/**
 * GET /api/track?session_id=cs_...
 *
 * Public order-status endpoint. Returns minimal, non-sensitive information
 * about an order — enough for a customer to see "where is my print" without
 * needing to log in. Possession of the Stripe session_id (which only goes
 * to the customer in their confirmation emails) is the auth credential.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = (req.query.session_id || '').toString().trim();
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'Missing or invalid session_id' });
  }

  try {
    const order = await getOrderByStripeSessionId(sessionId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const a = order.shipping_address || {};
    const safe = {
      status: order.status || 'paid',
      created_at: order.created_at,
      updated_at: order.updated_at,
      lookup_key: order.lookup_key,
      preview_url: order.preview_url,
      amount_total: order.amount_total,
      tax_amount: order.tax_amount,
      currency: order.currency || 'usd',
      tracking_number: order.tracking_number || null,
      carrier: order.carrier || null,
      tracking_url: trackingUrlFor(order.carrier, order.tracking_number),
      ship_to: {
        name_initial: order.customer_name ? order.customer_name.trim().charAt(0).toUpperCase() + '.' : null,
        city: a.city || null,
        state: a.state || null,
        country: a.country || null
      }
    };

    return res.status(200).json({ order: safe });
  } catch (err) {
    console.error('Track endpoint error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
