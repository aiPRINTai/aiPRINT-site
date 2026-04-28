// Admin marketing dashboard endpoint.
// Auth: Bearer ADMIN_PASSWORD via the shared requireAdmin gate.
//
// GET /api/admin/marketing           → UTM-grouped order stats + daily trend
//       ?days=30                     → window length (1–365, default 30)
//
// Reads orders.utm_* columns populated by the webhook (which gets them from
// the Stripe session metadata, which gets them from the checkout request,
// which gets them from public/js/utm.js). Also returns a daily trend array
// for the line chart on the dashboard.

import { getMarketingStats, getMarketingTrend } from '../db/index.js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days) || 30));
    const [bySource, trend] = await Promise.all([
      getMarketingStats({ days }),
      getMarketingTrend({ days })
    ]);

    // Compact rollup: total orders + revenue across all sources in window.
    let total_orders = 0;
    let total_revenue_cents = 0;
    let total_gross_cents = 0;
    let total_shipping_cents = 0;
    for (const r of bySource) {
      total_orders += r.orders;
      total_revenue_cents += r.revenue_cents;
      total_gross_cents += r.gross_cents;
      total_shipping_cents += r.shipping_cents;
    }
    const blended_aov_cents = total_orders > 0 ? Math.round(total_revenue_cents / total_orders) : 0;

    return res.status(200).json({
      window_days: days,
      totals: {
        orders: total_orders,
        revenue_cents: total_revenue_cents,        // product revenue (subtotal)
        gross_cents: total_gross_cents,            // amount_total (incl. ship + tax)
        shipping_cents: total_shipping_cents,      // total shipping collected
        blended_aov_cents
      },
      by_source: bySource,
      trend
    });
  } catch (err) {
    console.error('admin/marketing error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
