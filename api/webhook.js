// IMPORTANT: This endpoint must receive the RAW body for Stripe signature verification
import { stripe } from './_stripe.js';
import { json, rawBody } from './_util.js';
import { addCreditsToUser } from './credits/utils.js';
import { createOrder, getOrderByStripeSessionId, getOrdersByStripeSessionId, getCreditTransactionByStripePaymentId, setOrderSignedUrl } from './db/index.js';
import { sendOrderConfirmationEmail, sendFulfillmentAlertEmail, sendCreditPurchaseEmail, sendCartOrderConfirmationEmail, sendCartFulfillmentAlertEmail } from './_email.js';
import { getUserById } from './db/index.js';
import { sendMetaEvent } from './_meta-capi.js';
import { sendPinterestEvent } from './_pinterest-capi.js';
import { composeSignature } from './_signature.js';
import crypto from 'crypto';

function splitName(full) {
  if (!full) return { firstName: undefined, lastName: undefined };
  const parts = String(full).trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined };
}

async function firePurchaseCAPI({ session, value, contentName, contentIds }) {
  const shipDetails = session.collected_information?.shipping_details
    || session.shipping_details || null;
  const { firstName, lastName } = splitName(shipDetails?.name || session.customer_details?.name);
  const addr = shipDetails?.address || session.customer_details?.address || {};
  const eventId = `purchase_${session.id}`;
  const eventSourceUrl = session.success_url || 'https://aiprint.ai/success.html';
  const currency = (session.currency || 'usd').toUpperCase();
  const valueDollars = Number(((value || 0) / 100).toFixed(2));
  const userData = {
    email: session.customer_details?.email,
    phone: session.customer_details?.phone,
    firstName,
    lastName,
    city: addr.city,
    state: addr.state,
    zip: addr.postal_code,
    country: addr.country
  };

  // Meta CAPI
  try {
    await sendMetaEvent({
      eventName: 'Purchase',
      eventId,
      eventSourceUrl,
      userData,
      customData: {
        currency,
        value: valueDollars,
        content_name: contentName,
        content_ids: contentIds,
        content_type: 'product'
      }
    });
  } catch (err) {
    console.error('❌ Meta CAPI Purchase failed:', err);
  }

  // Pinterest CAPI — same event_id so the browser tag and CAPI dedupe.
  // Pinterest's standard "checkout" event = purchase completed.
  try {
    await sendPinterestEvent({
      eventName: 'checkout',
      eventId,
      eventSourceUrl,
      userData: { ...userData, externalId: session.customer_details?.email },
      customData: {
        currency,
        value: String(valueDollars),
        order_id: session.id,
        content_ids: contentIds,
        content_name: contentName,
        num_items: Array.isArray(contentIds) ? contentIds.length : 1
      }
    });
  } catch (err) {
    console.error('❌ Pinterest CAPI Purchase failed:', err);
  }
}


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
        // Idempotency: Stripe can retry; skip if we've already processed this
        // session. For both single-item and cart sessions, the existence of
        // ANY orders row means we've already run.
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

        // Economic breakdown from Stripe. amount_total is the gross paid;
        // we split out shipping and tax so the marketing dashboard can
        // compute true product margin (subtotal_amount). The Stripe
        // shipping field moved between API versions — check both shapes.
        const tax_amount = s.total_details?.amount_tax || 0;
        const shipping_amount = s.shipping_cost?.amount_total
          ?? s.total_details?.amount_shipping
          ?? 0;
        const subtotal_amount = Number.isFinite(s.amount_subtotal)
          ? s.amount_subtotal
          : Math.max(0, (s.amount_total || 0) - tax_amount - shipping_amount);

        // Customer/shipping info is shared across all line items.
        // user_id (if present in metadata) links this order to the logged-in
        // account at the moment of checkout — survives the case where Stripe
        // Link auto-fills a different email than the site account email.
        const customerInfo = {
          user_id: m.user_id || null,
          customer_email: s.customer_details?.email || '',
          customer_name: shipDetails?.name || s.customer_details?.name || '',
          shipping_address: shipDetails?.address || null,
          currency: s.currency || 'usd',
          utm_source:   m.utm_source   || null,
          utm_medium:   m.utm_medium   || null,
          utm_campaign: m.utm_campaign || null,
          utm_content:  m.utm_content  || null,
          utm_term:     m.utm_term     || null
        };

        // Cart sessions: m.type === 'cart'. Pull line_items + their per-line
        // metadata via stripe.checkout.sessions.retrieve(... expand=...) so
        // each line gets its own orders row. Single-item sessions stay on the
        // original code path (creative settings on session.metadata).
        if (m.type === 'cart') {
          const full = await stripe.checkout.sessions.retrieve(s.id, {
            expand: ['line_items.data.price.product']
          });
          const lineItems = full.line_items?.data || [];
          if (lineItems.length === 0) {
            console.error(`❌ Cart session ${s.id} returned no line_items`);
            return res.status(200).json({ received: true, error: 'no line items' });
          }

          // Allocate the shared session-level shipping + tax to the first
          // item only — all line_items share one shipment, but the orders
          // table is line-item-grained. Subtotal per line is amount_total
          // for that line (Stripe gives us this via the line_items expansion).
          for (let i = 0; i < lineItems.length; i++) {
            const li = lineItems[i];
            const lineMeta = li.price?.product?.metadata || {};
            const lineQty = (() => {
              const n = parseInt(lineMeta.quantity || li.quantity, 10);
              if (!Number.isFinite(n) || n < 1) return li.quantity || 1;
              return Math.min(n, 10);
            })();
            const idx = parseInt(lineMeta.line_item_index, 10);
            const lineIndex = Number.isFinite(idx) ? idx : i;

            const lineSubtotal = li.amount_subtotal ?? li.amount_total ?? 0;
            const isFirst = i === 0;

            const order = {
              ...customerInfo,
              stripe_session_id: s.id,
              line_item_index: lineIndex,
              lookup_key:  lineMeta.lookup_key  || '',
              preview_url: lineMeta.preview_url || '',
              clean_url:   lineMeta.clean_url   || lineMeta.preview_url || '',
              prompt:      lineMeta.prompt      || '',
              options: {
                ratio: lineMeta.ratio, style: lineMeta.style, mood: lineMeta.mood,
                light: lineMeta.light, composition: lineMeta.composition,
                medium: lineMeta.medium,
                signature: lineMeta.signature_json ? JSON.parse(lineMeta.signature_json) : null
              },
              // Per-line economics. Tax + shipping are session-level, so we
              // attach them to the first line and zero them on the rest —
              // sums across all rows then add up to the session total.
              amount_total:    isFirst ? (lineSubtotal + tax_amount + shipping_amount) : lineSubtotal,
              tax_amount:      isFirst ? tax_amount : 0,
              shipping_amount: isFirst ? shipping_amount : 0,
              subtotal_amount: lineSubtotal,
              quantity: lineQty
            };
            await createOrder(order);
          }
          console.log(`✅ Cart order saved: ${s.id} (${customerInfo.customer_email}) · ${lineItems.length} items`);

          await firePurchaseCAPI({
            session: s,
            value: s.amount_total,
            contentName: `Cart: ${lineItems.length} items`,
            contentIds: lineItems.map(li => li.price?.product?.metadata?.lookup_key).filter(Boolean)
          });

          // Fire ONE combined customer confirmation + ONE combined fulfillment
          // alert covering every item in the cart. The cart-aware email
          // templates iterate the rows internally so the customer doesn't
          // get N copies of the same email.
          const allRows = await getOrdersByStripeSessionId(s.id);

          // Embed signatures for any lines that have one. Each line is
          // independent — a cart of 3 items might have signatures on 2 of
          // them. Run sequentially to avoid hammering Vercel Blob in
          // parallel; this happens AFTER createOrder so the order rows
          // are already safe in the DB. Mutate `row.signed_url` in-place so
          // the email blocks below render both download links per line.
          for (const row of allRows) {
            if (row?.options?.signature?.text && row.clean_url) {
              try {
                const signedUrl = await composeSignature(row.clean_url, row.options.signature);
                if (signedUrl) {
                  await setOrderSignedUrl(row.id, signedUrl);
                  row.signed_url = signedUrl;
                }
              } catch (sigErr) {
                console.error(`⚠️  Cart signature embedding failed for ${s.id} line ${row.line_item_index}:`, sigErr?.message || sigErr);
              }
            }
          }
          await Promise.allSettled([
            sendCartOrderConfirmationEmail(allRows),
            sendCartFulfillmentAlertEmail(allRows)
          ]).then(results => {
            results.forEach((r, i) => {
              if (r.status === 'rejected') console.error(`❌ Cart email ${i} failed:`, r.reason);
            });
          });
        } else {
          // Single-item flow (legacy): all creative settings live on session.metadata.
          const order = {
            ...customerInfo,
            stripe_session_id: s.id,
            line_item_index: 0,
            lookup_key: m.lookup_key,
            preview_url: m.preview_url,
            clean_url: m.clean_url || m.preview_url,
            prompt: m.prompt,
            options: {
              ratio: m.ratio, style: m.style, mood: m.mood, light: m.light,
              composition: m.composition, medium: m.medium,
              signature: m.signature_json ? JSON.parse(m.signature_json) : null
            },
            amount_total: s.amount_total,
            tax_amount,
            shipping_amount,
            subtotal_amount,
            quantity: (() => {
              const n = parseInt(m.quantity, 10);
              if (!Number.isFinite(n) || n < 1) return 1;
              return Math.min(n, 10);
            })()
          };
          await createOrder(order);
          console.log(`✅ Order saved: ${s.id} (${customerInfo.customer_email})`);

          // If the customer added a signature, composite it onto the clean
          // image and stamp the resulting signed_url onto the order row.
          // Failure here is non-fatal — admin can still ship from clean_url.
          // We also stamp signed_url onto the in-memory order object so the
          // fulfillment email below shows BOTH download links.
          if (order.options?.signature?.text) {
            try {
              const signedUrl = await composeSignature(order.clean_url, order.options.signature);
              if (signedUrl) {
                const [savedRow] = await getOrdersByStripeSessionId(s.id);
                if (savedRow?.id) {
                  await setOrderSignedUrl(savedRow.id, signedUrl);
                  console.log(`✅ Signed URL saved for ${s.id}`);
                }
                order.signed_url = signedUrl;
              }
            } catch (sigErr) {
              console.error(`⚠️  Signature embedding failed for ${s.id}:`, sigErr?.message || sigErr);
            }
          }

          await firePurchaseCAPI({
            session: s,
            value: s.amount_total,
            contentName: m.lookup_key || 'aiPRINT order',
            contentIds: m.lookup_key ? [m.lookup_key] : []
          });

          await Promise.allSettled([
            sendOrderConfirmationEmail(order),
            sendFulfillmentAlertEmail(order)
          ]).then(results => {
            results.forEach((r, i) => {
              if (r.status === 'rejected') console.error(`❌ Email ${i} failed:`, r.reason);
            });
          });
        }
      } catch (err) {
        console.error('❌ Error processing print order:', err);
        // Still ack to Stripe; we have the event in their dashboard for retry
      }
    }
  }

  res.status(200).json({ received: true });
}
