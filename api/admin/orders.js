// Admin endpoint: list + update print orders.
// Auth: requires `Authorization: Bearer <ADMIN_PASSWORD>` header.
// Set ADMIN_PASSWORD in Vercel env vars (use a long random string).

import { listOrders, updateOrder, getOrderStats, getOrderById } from '../db/index.js';
import { sendShippingNotificationEmail, sendOrderConfirmationEmail } from '../_email.js';

function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized' });
}

function checkAuth(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token && token === expected;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!checkAuth(req)) return unauthorized(res);

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
        return res.status(200).json({ ok: true, sent_to: order.customer_email });
      }
      if (action === 'resend_shipping') {
        if (!order.tracking_number) return res.status(400).json({ error: 'Order has no tracking number yet' });
        const r = await sendShippingNotificationEmail(order);
        if (r?.error) return res.status(502).json({ error: r.error.message || 'Email failed' });
        return res.status(200).json({ ok: true, sent_to: order.customer_email });
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
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
