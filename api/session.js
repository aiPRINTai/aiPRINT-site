import { stripe } from './_stripe.js';
import { json, allowCors } from './_util.js';

// Resolve shipping for both old (pre-2024-06-20) and new Stripe Checkout API
// shapes. In API version 2024-06-20+, `session.shipping_details` is deprecated
// in favor of `session.collected_information.shipping_details`. Try the new
// path first, fall back to the legacy field so we keep working either way.
function resolveShipping(session) {
  return (
    session?.collected_information?.shipping_details ||
    session?.shipping_details ||
    null
  );
}

async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  // works on Vercel (req.query or URL fallback)
  const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
  if (!id) return json(res, 400, { error: 'Missing ?id=' });

  try {
    const session = await stripe.checkout.sessions.retrieve(id, {
      expand: [
        'total_details.breakdown',
        'payment_intent',
        'customer',
        'line_items',
        'collected_information'
      ]
    });

    return json(res, 200, {
      id: session.id,
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_details?.email || '',
      shipping: resolveShipping(session),
      tax_amount: session.total_details?.amount_tax || 0,
      metadata: session.metadata || {},
      line_items: session.line_items?.data?.map(li => ({
        description: li.description,
        quantity: li.quantity,
        price: li.price?.unit_amount,
        currency: li.price?.currency
      })) || []
    });
  } catch (err) {
    // Always return JSON so the success page can render a clean message
    // instead of choking on Vercel's plain-text "A server error has occurred".
    console.error(JSON.stringify({
      tag: 'api/session',
      session_id: id,
      stripe_type: err?.type,
      stripe_code: err?.code,
      message: err?.message
    }));
    const status = err?.statusCode === 404 ? 404 : 500;
    return json(res, status, {
      error: err?.message || 'Failed to load session',
      type: err?.type || null,
      code: err?.code || null
    });
  }
}
export default allowCors(handler);
