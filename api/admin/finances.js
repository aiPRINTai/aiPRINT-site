// Admin finances dashboard endpoint.
// Auth: Bearer ADMIN_PASSWORD via the shared requireAdmin gate.
//
// GET /api/admin/finances        → per-SKU cost matrix + supplier rates +
//                                  rolling true-margin stats from real orders
//
// Reads:
//   - api/_costs.js for supplier rates, per-order costs, stripe fees
//   - public/products.json for the SKU catalog and retail prices
//   - orders table (when there are real orders) to compute YTD true margin
//
// Returns a single JSON payload the dashboard can render top-to-bottom
// without a second round-trip.

import fs from 'node:fs';
import path from 'node:path';
import { sql } from '@vercel/postgres';
import { requireAdmin } from './_auth.js';
import {
  SUPPLIERS,
  LAB_RATES,
  PER_ORDER_COSTS,
  CUSTOMER_SHIPPING_CENTS,
  EXPECTED_BATCH_SIZE,
  computeOrderEconomics,
  inboundPerOrderCents
} from '../_costs.js';

// Resolve products.json relative to repo root (Vercel ships /public alongside /api).
function readProducts() {
  const candidates = [
    path.join(process.cwd(), 'public', 'products.json'),
    path.join(process.cwd(), 'aiPRINT-site', 'public', 'products.json')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error('products.json not found');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const products = readProducts();

    // Caller can override the assumed weekly batch size via ?batch=N to see
    // how per-order inbound courier cost amortizes at different volumes.
    const batchSize = Math.max(1, Math.min(200, parseInt(req.query.batch) || EXPECTED_BATCH_SIZE));

    // 1) Build the per-SKU economics matrix at $0 ad spend (margin BEFORE ads).
    //    Caller can re-run the same computation client-side for any ad spend.
    const skuMatrix = [];
    for (const c of products.collections) {
      for (const p of c.products) {
        const econ = computeOrderEconomics(
          {
            lookup_key: p.lookup_key,
            w: p.size_w_in,
            h: p.size_h_in,
            retail_cents: Math.round(p.price_usd * 100)
          },
          0,
          batchSize
        );
        skuMatrix.push({
          lookup_key: p.lookup_key,
          product_name: p.product_name,
          finish: p.finish,
          orientation: p.orientation,
          w: p.size_w_in,
          h: p.size_h_in,
          area_sq_in: econ.area_sq_in,
          retail_cents: Math.round(p.price_usd * 100),
          ...econ
        });
      }
    }

    // 2) Supplier roll-up: how many SKUs per supplier, average margin %, etc.
    const supplierRoll = {};
    for (const key of Object.keys(SUPPLIERS)) {
      supplierRoll[key] = {
        ...SUPPLIERS[key],
        sku_count: 0,
        total_retail_cents: 0,
        total_lab_cost_cents: 0,
        avg_margin_pct: 0
      };
    }
    for (const row of skuMatrix) {
      const rate = LAB_RATES[row.material];
      if (!rate) continue;
      const sup = supplierRoll[rate.supplier];
      if (!sup) continue;
      sup.sku_count++;
      sup.total_retail_cents += row.retail_cents;
      sup.total_lab_cost_cents += row.costs.lab_cost_cents;
    }
    for (const key of Object.keys(supplierRoll)) {
      const s = supplierRoll[key];
      if (s.total_retail_cents > 0) {
        s.avg_margin_pct = ((s.total_retail_cents - s.total_lab_cost_cents) / s.total_retail_cents) * 100;
      }
    }

    // 3) Catalog roll-up summary stats.
    const summary = {
      sku_count: skuMatrix.length,
      avg_retail_cents: skuMatrix.length ? Math.round(skuMatrix.reduce((a, r) => a + r.retail_cents, 0) / skuMatrix.length) : 0,
      avg_lab_cost_cents: skuMatrix.length ? Math.round(skuMatrix.reduce((a, r) => a + r.costs.lab_cost_cents, 0) / skuMatrix.length) : 0,
      avg_margin_pct_before_ads: skuMatrix.length ? skuMatrix.reduce((a, r) => a + r.profit.margin_pct, 0) / skuMatrix.length : 0,
      lowest_margin: skuMatrix.reduce((min, r) => (min === null || r.profit.margin_pct < min.margin_pct ? { sku: r.lookup_key, margin_pct: r.profit.margin_pct } : min), null),
      highest_margin: skuMatrix.reduce((max, r) => (max === null || r.profit.margin_pct > max.margin_pct ? { sku: r.lookup_key, margin_pct: r.profit.margin_pct } : max), null)
    };

    // 4) Real-order rollup (only meaningful once orders exist). If the table
    //    is empty or the query fails, we just skip this section gracefully.
    let realOrderStats = null;
    try {
      const r = await sql`
        SELECT
          COUNT(*)::int AS orders,
          COALESCE(SUM(subtotal_amount), 0)::int AS subtotal_cents,
          COALESCE(SUM(shipping_amount), 0)::int AS shipping_cents,
          COALESCE(SUM(amount_total), 0)::int AS gross_cents
        FROM orders
        WHERE status NOT IN ('canceled', 'refunded')
          AND created_at >= NOW() - INTERVAL '90 days'
      `;
      if (r.rows && r.rows.length) {
        realOrderStats = {
          window_days: 90,
          ...r.rows[0],
          note: 'subtotal = product revenue; shipping = customer-paid; gross = product + shipping + tax'
        };
      }
    } catch (e) {
      realOrderStats = { error: 'orders table not yet populated or query failed', detail: e.message };
    }

    // Compute inbound-per-order for each material at this batch size so the UI
    // can display the courier amortization breakdown without re-deriving it.
    const inbound_per_order_at_batch = {
      canvas:  inboundPerOrderCents('canvas',  batchSize),
      acrylic: inboundPerOrderCents('acrylic', batchSize),
      metal:   inboundPerOrderCents('metal',   batchSize)
    };

    return res.status(200).json({
      generated_at: new Date().toISOString(),
      batch_size: batchSize,
      default_batch_size: EXPECTED_BATCH_SIZE,
      suppliers: SUPPLIERS,
      lab_rates: LAB_RATES,
      per_order_costs: PER_ORDER_COSTS,
      customer_shipping_cents: CUSTOMER_SHIPPING_CENTS,
      inbound_per_order_at_batch,
      summary,
      sku_matrix: skuMatrix,
      supplier_roll: supplierRoll,
      real_order_stats: realOrderStats
    });
  } catch (err) {
    console.error('admin/finances error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
