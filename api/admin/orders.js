// Admin endpoint: list + update print orders.
// Auth: requires `Authorization: Bearer <ADMIN_PASSWORD>` header.
// Set ADMIN_PASSWORD in Vercel env vars (use a long random string).

import { listOrders, updateOrder, getOrderStats, getOrderById, setOrderShipping, logAdminAction } from '../db/index.js';
import { sendShippingNotificationEmail, sendOrderConfirmationEmail } from '../_email.js';
import { stripe } from '../_stripe.js';
import { getClientIp } from '../auth/utils.js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const status = req.query.status || null;
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const offset = parseInt(req.query.offset) || 0;
      const [orders, stats] = await Promise.all([
        listOrders({ limit, offset, status }),
        getOrderStats()
      ]);
      return res.status(200).json({ orders, stats });
    }

    if (req.method === 'POST') {
      // Side actions: { id, action: 'resend_confirmation' | 'resend_shipping' }
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { id, action } = body || {};
      if (!id || !action) return res.status(400).json({ error: 'Missing id or action' });

      const order = await getOrderById(id);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      if (action === 'resend_confirmation') {
        const r = await sendOrderConfirmationEmail(order);
        if (r?.error) return res.status(502).json({ error: r.error.message || 'Email failed' });
        await logAdminAction({
          action: 'resend_order_confirmation',
          target_order_id: id,
          target_user_id: order.user_id || null,
          actor_ip: getClientIp(req),
          details: { sent_to: order.customer_email, lookup_key: order.lookup_key }
        });
        return res.status(200).json({ ok: true, sent_to: order.customer_email });
      }
      if (action === 'resend_shipping') {
        if (!order.tracking_number) return res.status(400).json({ error: 'Order has no tracking number yet' });
        const r = await sendShippingNotificationEmail(order);
        if (r?.error) return res.status(502).json({ error: r.error.message || 'Email failed' });
        await logAdminAction({
          action: 'resend_shipping_notification',
          target_order_id: id,
          target_user_id: order.user_id || null,
          actor_ip: getClientIp(req),
          details: { sent_to: order.customer_email, tracking_number: order.tracking_number }
        });
        return res.status(200).json({ ok: true, sent_to: order.customer_email });
      }
      if (action === 'refresh_shipping') {
        // Re-pull the Checkout Session from Stripe and write the shipping
        // block back to the order. Repairs orders whose webhook stored a null
        // address (e.g. because of the Stripe API 2024-06-20 shipping field
        // move from `shipping_details` to `collected_information.shipping_details`).
        if (!order.stripe_session_id) {
          return res.status(400).json({ error: 'Order has no stripe_session_id' });
        }
        try {
          const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
            expand: ['collected_information']
          });
          const shipDetails =
            session?.collected_information?.shipping_details ||
            session?.shipping_details ||
            null;
          if (!shipDetails?.address) {
            return res.status(404).json({
              error: 'Stripe session has no shipping address — was shipping collection enabled at checkout?'
            });
          }
          const updated = await setOrderShipping(id, {
            customer_name: shipDetails.name || session?.customer_details?.name || null,
            shipping_address: shipDetails.address
          });
          await logAdminAction({
            action: 'refresh_shipping_from_stripe',
            target_order_id: id,
            target_user_id: order.user_id || null,
            actor_ip: getClientIp(req),
            details: { stripe_session_id: order.stripe_session_id }
          });
          return res.status(200).json({ ok: true, order: updated });
        } catch (err) {
          console.error('refresh_shipping error:', err?.message || err);
          return res.status(502).json({ error: err?.message || 'Stripe lookup failed' });
        }
      }
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    if (req.method === 'PATCH') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { id, status, tracking_number, carrier, admin_notes } = body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });

      // Detect "shipped" transition so we can send a tracking email
      let prevStatus = null;
      try {
        const before = getOrderById ? await getOrderById(id) : null;
        prevStatus = before?.status || null;
      } catch (_) { /* non-fatal */ }

      const updated = await updateOrder(id, { status, tracking_number, carrier, admin_notes });
      if (!updated) return res.status(404).json({ error: 'Order not found' });

      // Audit log: record what actually changed
      const changes = {};
      if (status != null && status !== prevStatus) changes.status = { from: prevStatus, to: status };
      if (tracking_number != null) changes.tracking_number = tracking_number;
      if (carrier != null) changes.carrier = carrier;
      if (admin_notes != null) changes.admin_notes_updated = true;
      if (Object.keys(changes).length > 0) {
        await logAdminAction({
          action: 'update_order',
          target_order_id: id,
          target_user_id: updated.user_id || null,
          actor_ip: getClientIp(req),
          details: changes
        });
      }

      // Fire shipping notification when transitioning into "shipped" with a tracking number
      const becameShipped = status === 'shipped' && prevStatus !== 'shipped';
      if (becameShipped && (updated.tracking_number || tracking_number)) {
        sendShippingNotificationEmail(updated)
          .then(r => { if (r?.error) console.error('❌ Shipping email failed:', r.error); })
          .catch(err => console.error('❌ Shipping email threw:', err));
      }

      return res.status(200).json({ order: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin orders error:', err);
    // Keep the detailed err.message server-side; return generic to caller
    // so we dont leak DB column names / stripe IDs / stack hints to anyone
    // who squeaks through (or who legitimately mistypes a query param).
    return res.status(500).json({ error: 'Server error' });
  }
}
