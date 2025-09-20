import { stripe } from './_stripe.js';
import { json, allowCors } from './_util.js';

async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  // works on Vercel (req.query or URL fallback)
  const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
  if (!id) return json(res, 400, { error: 'Missing ?id=' });

  const session = await stripe.checkout.sessions.retrieve(id, {
    expand: ['total_details.breakdown', 'payment_intent', 'customer', 'line_items']
  });

  return json(res, 200, {
    id: session.id,
    amount_total: session.amount_total,
    currency: session.currency,
    customer_email: session.customer_details?.email || '',
    shipping: session.shipping_details || null,
    tax_amount: session.total_details?.amount_tax || 0,
    metadata: session.metadata || {},
    line_items: session.line_items?.data?.map(li => ({
      description: li.description,
      quantity: li.quantity,
      price: li.price?.unit_amount,
      currency: li.price?.currency
    })) || []
  });
}
export default allowCors(handler);
