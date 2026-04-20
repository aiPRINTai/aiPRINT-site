// IMPORTANT: This endpoint must receive the RAW body for Stripe signature verification
import { stripe } from './_stripe.js';
import { json, rawBody } from './_util.js';
import { addCreditsToUser } from './credits/utils.js';
import { createOrder, getOrderByStripeSessionId, getCreditTransactionByStripePaymentId } from './db/index.js';
import { sendOrderConfirmationEmail, sendFulfillmentAlertEmail, sendCreditPurchaseEmail } from './_email.js';
import { getUserById } from './db/index.js';

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

        // Idempotency: if we've already credited this Stripe session, skip
        const alreadyCredited = await getCreditTransactionByStripePaymentId(s.id);
        if (alreadyCredited) {
          console.log(`ℹ️  Credit purchase ${s.id} already processed — skipping duplicate webhook`);
          return res.status(200).json({ received: true, duplicate: true });
        }

        // Add credits to user account
        const result = await addCreditsToUser(
          userId,
          creditsAmount,
          `Purchased ${creditsAmount} credits (${packageId})`,
          s.id
        );

        console.log(`✅ Credits added: ${creditsAmount} credits to user ${userId} (payment: ${s.id})`);

        // Send purchase confirmation email
        try {
          const user = await getUserById(userId);
          await sendCreditPurchaseEmail({
            email: s.customer_details?.email || user?.email,
            name: s.customer_details?.name || user?.name,
            creditsAmount,
            amountTotal: s.amount_total,
            currency: s.currency,
            newBalance: result?.newBalance,
            sessionId: s.id
          });
        } catch (emailErr) {
          console.error('❌ Credit purchase email failed:', emailErr);
        }
      } catch (error) {
        console.error('❌ Error adding credits:', error);
        // Still return 200 to acknowledge webhook receipt
      }
    }
    // Handle print product orders
    else {
      try {
        // Idempotency: Stripe can retry; skip if we've already processed this session
        const existing = await getOrderByStripeSessionId(s.id);
        if (existing) {
          console.log(`ℹ️  Order ${s.id} already recorded — skipping duplicate webhook`);
          return res.status(200).json({ received: true, duplicate: true });
        }

        // In Stripe API 2024-06-20+, shipping moved from `shipping_details`
        // to `collected_information.shipping_details`. Webhook payloads still
        // sometimes ship the legacy field too, so we check both.
        const shipDetails = s.collected_information?.shipping_details
          || s.shipping_details
          || null;

        const order = {
          stripe_session_id: s.id,
          customer_email: s.customer_details?.email || '',
          customer_name: shipDetails?.name || s.customer_details?.name || '',
          shipping_address: shipDetails?.address || null,
          lookup_key: m.lookup_key,
          preview_url: m.preview_url,
          // clean_url = the unwatermarked print master. For pre-watermark-feature
          // orders, m.clean_url won't be set; fall back to preview_url so admin
          // export still has *something*.
          clean_url: m.clean_url || m.preview_url,
          prompt: m.prompt,
          options: {
            ratio: m.ratio, style: m.style, mood: m.mood, light: m.light,
            composition: m.composition, medium: m.medium,
            signature: m.signature_json ? JSON.parse(m.signature_json) : null
          },
          amount_total: s.amount_total,
          tax_amount: s.total_details?.amount_tax || 0,
          currency: s.currency || 'usd'
        };

        await createOrder(order);
        console.log(`✅ Order saved: ${s.id} (${order.customer_email})`);

        // Fire emails — failures here shouldn't fail the webhook
        await Promise.allSettled([
          sendOrderConfirmationEmail(order),
          sendFulfillmentAlertEmail(order)
        ]).then(results => {
          results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`❌ Email ${i} failed:`, r.reason);
          });
        });
      } catch (err) {
        console.error('❌ Error processing print order:', err);
        // Still ack to Stripe; we have the event in their dashboard for retry
      }
    }
  }

  res.status(200).json({ received: true });
}
