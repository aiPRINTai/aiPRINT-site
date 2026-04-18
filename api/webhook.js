// IMPORTANT: This endpoint must receive the RAW body for Stripe signature verification
import { stripe } from './_stripe.js';
import { json, rawBody } from './_util.js';
import { addCreditsToUser } from './credits/utils.js';

export const config = { api: { bodyParser: false } }; // Vercel/Next tells not to parse

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  const buf = await rawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return json(res, 400, { error: `Webhook signature verification failed: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const m = s.metadata || {};

    // Handle credit purchases
    if (m.type === 'credit_purchase') {
      try {
        const userId = m.user_id;
        const creditsAmount = parseInt(m.credits_amount);
        const packageId = m.package_id;

        if (!userId || !creditsAmount) {
          console.error('❌ Invalid credit purchase metadata:', m);
          return res.status(200).json({ received: true, error: 'Invalid metadata' });
        }

        // Add credits to user account
        await addCreditsToUser(
          userId,
          creditsAmount,
          `Purchased ${creditsAmount} credits (${packageId})`,
          s.id
        );

        console.log(`✅ Credits added: ${creditsAmount} credits to user ${userId} (payment: ${s.id})`);
      } catch (error) {
        console.error('❌ Error adding credits:', error);
        // Still return 200 to acknowledge webhook receipt
      }
    }
    // Handle print product orders
    else {
      const order = {
        order_id: s.id,
        lookup_key: m.lookup_key,
        preview_url: m.preview_url,
        prompt: m.prompt,
        options: {
          ratio: m.ratio, style: m.style, mood: m.mood, light: m.light,
          composition: m.composition, medium: m.medium,
          signature: m.signature_json ? JSON.parse(m.signature_json) : null
        },
        customer: {
          email: s.customer_details?.email || '',
          name: s.shipping_details?.name || '',
          address: s.shipping_details?.address || null
        },
        amount_total: s.amount_total,
        tax_amount: s.total_details?.amount_tax || 0,
        created: Date.now()
      };
      // TODO: Save `order` (DB/Sheets/Notion) or email yourself
      console.log('✅ Order captured:', order);
    }
  }

  res.status(200).json({ received: true });
}
