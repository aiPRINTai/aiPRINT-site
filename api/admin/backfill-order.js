// Admin one-shot: backfill an order that Stripe charged but the webhook
// failed to record. Pulls the session from Stripe by id, then runs the same
// createOrder + email + CAPI path the webhook would have run. Idempotent —
// if the order already exists in the DB, returns the existing row without
// duplicating anything.
//
// POST /api/admin/backfill-order
//   body: { session_id: "cs_live_..." }
//   auth: Bearer ADMIN_PASSWORD
//
// Use after fixing a webhook bug to recover the affected charge(s).

import { stripe } from '../_stripe.js';
import { json } from '../_util.js';
import { createOrder, getOrderByStripeSessionId, getOrdersByStripeSessionId } from '../db/index.js';
import { sendOrderConfirmationEmail, sendFulfillmentAlertEmail, sendCartOrderConfirmationEmail, sendCartFulfillmentAlertEmail } from '../_email.js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = req.body || {};
  const sessionId = (body.session_id || '').toString().trim();
  if (!sessionId.startsWith('cs_')) return json(res, 400, { error: 'Missing or invalid session_id' });

  try {
    const existing = await getOrdersByStripeSessionId(sessionId);
    if (existing.length > 0) {
      return json(res, 200, { ok: true, status: 'already_exists', orders: existing.length });
    }

    // Re-fetch the session from Stripe with line_items so we can route
    // single-item vs cart correctly.
    const s = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'line_items.data.price.product']
    });

    if (s.payment_status !== 'paid') {
      return json(res, 400, { error: 'Session is not paid', payment_status: s.payment_status });
    }

    const m = s.metadata || {};
    const isCartCheckout = m.type === 'cart_checkout';

    const shipDetails = s.collected_information?.shipping_details
      || s.shipping_details || null;
    const customer_email   = s.customer_details?.email || '';
    const customer_name    = shipDetails?.name || s.customer_details?.name || '';
    const shipping_address = shipDetails?.address || s.customer_details?.address || null;
    const tax_amount       = Number(s.total_details?.amount_tax || 0);
    const shipping_amount  = Number(s.total_details?.amount_shipping || 0);
    const subtotal_amount  = Math.max(0, (Number(s.amount_total) || 0) - tax_amount - shipping_amount);

    // Find the user_id if metadata captured it (when buyer was logged in).
    const user_id = m.user_id || null;

    if (isCartCheckout) {
      // Multi-item cart — metadata.items_json holds the per-line snapshot.
      let items = [];
      try { items = JSON.parse(m.items_json || '[]'); } catch { items = []; }
      if (!Array.isArray(items) || items.length === 0) {
        return json(res, 422, { error: 'Cart session metadata missing items_json' });
      }

      // Reconstruct per-line orders. shipping_amount applies to first line only.
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        const lineQty = Math.max(1, parseInt(it.quantity, 10) || 1);
        const lineSubtotal = Math.max(0, (Number(it.unit_amount) || 0) * lineQty);
        await createOrder({
          stripe_session_id: s.id,
          user_id,
          customer_email,
          customer_name,
          shipping_address,
          line_item_index: i,
          lookup_key: it.lookup_key,
          preview_url: it.preview_url,
          clean_url: it.clean_url || it.preview_url,
          prompt: it.prompt,
          options: it.options || {},
          amount_total: lineSubtotal + (i === 0 ? (shipping_amount + tax_amount) : 0),
          tax_amount: i === 0 ? tax_amount : 0,
          shipping_amount: i === 0 ? shipping_amount : 0,
          subtotal_amount: lineSubtotal,
          quantity: lineQty,
          utm_source:   m.utm_source   || null,
          utm_medium:   m.utm_medium   || null,
          utm_campaign: m.utm_campaign || null,
          utm_content:  m.utm_content  || null,
          utm_term:     m.utm_term     || null
        });
      }
      const allRows = await getOrdersByStripeSessionId(s.id);
      await Promise.allSettled([
        sendCartOrderConfirmationEmail(allRows),
        sendCartFulfillmentAlertEmail(allRows)
      ]);
      return json(res, 200, { ok: true, status: 'backfilled_cart', orders: allRows.length });
    }

    // Single-item flow — all creative settings come straight off session.metadata.
    const order = {
      stripe_session_id: s.id,
      user_id,
      customer_email,
      customer_name,
      shipping_address,
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
      amount_total: Number(s.amount_total) || 0,
      tax_amount,
      shipping_amount,
      subtotal_amount,
      quantity: (() => {
        const n = parseInt(m.quantity, 10);
        if (!Number.isFinite(n) || n < 1) return 1;
        return Math.min(n, 10);
      })(),
      utm_source:   m.utm_source   || null,
      utm_medium:   m.utm_medium   || null,
      utm_campaign: m.utm_campaign || null,
      utm_content:  m.utm_content  || null,
      utm_term:     m.utm_term     || null
    };
    await createOrder(order);
    await Promise.allSettled([
      sendOrderConfirmationEmail(order),
      sendFulfillmentAlertEmail(order)
    ]);
    return json(res, 200, { ok: true, status: 'backfilled_single', orders: 1 });
  } catch (err) {
    console.error('backfill-order error:', err);
    return json(res, 500, { error: 'Server error', detail: err.message });
  }
}
