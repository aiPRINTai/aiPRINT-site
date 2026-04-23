// Admin CSV export of all orders. Auth: Bearer ADMIN_PASSWORD.
import { listOrders, logAdminAction } from '../db/index.js';
import { requireAdmin } from './_auth.js';
import { getClientIp } from '../auth/utils.js';

function csvField(v) {
  if (v == null) return '';
  let s = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  // RFC 4180: wrap in quotes and escape inner quotes if contains comma/quote/newline
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const status = req.query.status || null;
    const orders = await listOrders({ limit: 5000, status });

    // Audit trail: bulk exports of customer data (PII, prompt text, shipping
    // addresses) are exactly the kind of operation you want logged. Best-
    // effort — a logging failure must not block the export.
    try {
      await logAdminAction({
        action: 'export_orders_csv',
        actor_ip: getClientIp(req),
        details: { status: status || 'all', count: orders.length }
      });
    } catch (_) { /* never fail the export on audit write */ }

    const headers = [
      'id', 'created_at', 'status', 'stripe_session_id',
      'customer_name', 'customer_email',
      'lookup_key', 'amount_total_cents', 'tax_amount_cents', 'currency',
      'tracking_number', 'carrier',
      'ship_line1', 'ship_line2', 'ship_city', 'ship_state', 'ship_postal_code', 'ship_country',
      'prompt',
      'print_master_url',  // ← clean, full-resolution, unwatermarked. THIS is what you print.
      'preview_url',       //   watermarked preview (handy for visual order review only)
      'admin_notes'
    ];

    const lines = [headers.join(',')];
    for (const o of orders) {
      const a = o.shipping_address || {};
      lines.push([
        o.id, o.created_at, o.status, o.stripe_session_id,
        o.customer_name, o.customer_email,
        o.lookup_key, o.amount_total, o.tax_amount, o.currency,
        o.tracking_number, o.carrier,
        a.line1, a.line2, a.city, a.state, a.postal_code, a.country,
        o.prompt,
        o.clean_url || o.preview_url, // print master (fallback for pre-feature orders)
        o.preview_url,
        o.admin_notes
      ].map(csvField).join(','));
    }

    const filename = `aiprint-orders-${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(lines.join('\n'));
  } catch (err) {
    console.error('CSV export error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
