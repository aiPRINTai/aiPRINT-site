import { stripe } from './_stripe.js';
import { json, allowCors, readJson } from './_util.js';

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { lookup_key, preview } = await readJson(req);
  if (!lookup_key)       return json(res, 400, { error: 'Missing lookup_key' });
  if (!preview?.image)   return json(res, 400, { error: 'Missing preview (image required)' });

  // Find active price by lookup key
  const prices = await stripe.prices.list({
    lookup_keys: [lookup_key],
    active: true,
    limit: 1,
    expand: ['data.product']
  });
  const price = prices.data[0];
  if (!price) return json(res, 404, { error: `No active price for ${lookup_key}` });

  // Attach your creative selections (used later in success & webhook)
  const metadata = {
    lookup_key,
    preview_url: preview.image,
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
    success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/`
  });

  return json(res, 200, { url: session.url });
}
export default allowCors(handler);
