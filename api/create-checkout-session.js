// /api/create-checkout-session.js
import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Defensive: parse JSON safely (avoid "Unexpected token …")
  let body;
  try {
    // Vercel already gives JSON for app/json requests, but be tolerant:
    if (typeof req.body === 'string') body = JSON.parse(req.body || '{}');
    else body = req.body || {};
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { lookup_key, preview } = body || {};
  if (!lookup_key) return res.status(400).json({ error: 'Missing lookup_key' });
  if (!preview?.image) return res.status(400).json({ error: 'Missing preview.image' });

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return res.status(500).json({ error: 'Server misconfigured (no STRIPE_SECRET_KEY)' });

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });

  try {
    // Lookup by lookup_key
    const prices = await stripe.prices.list({
      lookup_keys: [lookup_key],
      active: true,
      expand: ['data.product'],
      limit: 1
    });

    const price = prices.data[0];
    if (!price) {
      return res.status(404).json({ error: `No active price found for lookup_key ${lookup_key}` });
    }

    const metadata = {
      lookup_key,
      preview_url: preview.image || '',
      prompt: preview.prompt || '',
      ratio: preview.size || '',
      style: preview.style || '',
      mood: preview.mood || '',
      light: preview.light || '',
      composition: preview.comp || '',
      medium: preview.medium || '',
      signature_json: preview.sig ? JSON.stringify(preview.sig) : ''
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price.id, quantity: 1 }],
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: ['US'] },
      metadata,
      // IMPORTANT: set this to your deployed domain in Vercel env CLIENT_URL
      success_url: `${process.env.CLIENT_URL || ''}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || ''}/#order`
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    // Bubble a clean error to the client (prevents FUNCTION_INVOCATION_FAILED popup)
    return res.status(500).json({ error: err?.message || 'Server error' });
  }
}
