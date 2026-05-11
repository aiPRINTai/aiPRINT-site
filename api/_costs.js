// api/_costs.js
// Single source of truth for what aiPRINT.ai actually pays — print labs,
// payment processing, image generation, shipping. The /admin/finances.html
// dashboard reads from here and joins against products.json to compute
// per-SKU profit, margin, and per-order true P&L.
//
// EDIT THIS FILE WHEN A SUPPLIER QUOTES NEW RATES, then redeploy.
// (Same edit-and-deploy convention as `products.json` and `_shipping.js`.)
//
// Everything is in **cents** so all math stays in integers — no floats,
// no $0.42 vs $0.4200000001 surprises.

// ─────────────────────────────────────────────────────────────────────────
// 1. SUPPLIERS + LOGISTICS
// ─────────────────────────────────────────────────────────────────────────
//
// Operational rhythm:
//   - Friday evening: aiPRINT submits the week's print orders to both labs.
//   - Following week: Basilio's turnaround = 7 days. Shiny's turnaround = ~7 days.
//   - Pickup day (e.g. Monday after Basilio's batch is ready):
//       • Artful Printers (Miami) — Uber Courier same-day delivery to Jupiter, ~$70/run
//       • Shiny Prints (Jupiter) — Lawrence picks up free, no courier
//
// The $70 Miami courier is a fixed cost per pickup run, NOT per order.
// Amortized over the orders in that batch, the per-order inbound cost
// scales down as weekly volume grows:
//
//        orders/week  →  $/order inbound (Artful)
//             1               $70.00
//             3               $23.33
//             5               $14.00
//            10                $7.00
//            20                $3.50
//            50                $1.40
//
// The dashboard shows this sensitivity. The default assumes EXPECTED_BATCH_SIZE
// orders in the Friday submit; tune as real volume comes in.
export const EXPECTED_BATCH_SIZE = 5;   // assumed orders per weekly run

export const SUPPLIERS = {
  artful_printers: {
    name: 'Artful Printers',
    contact: 'Basilio',
    location: 'Miami, FL',
    handles: ['canvas', 'acrylic'],
    pickup_method: 'uber_courier',
    pickup_cost_per_run_cents: 7000,         // $70 same-day Miami → Jupiter
    turnaround_days: 7,
    notes: 'Submit Fri PM, pickup the following week via Uber Courier same-day.'
  },
  shiny_prints: {
    name: 'Shiny Prints',
    contact: '(866) 236-7035',
    location: 'Jupiter, FL',
    handles: ['metal'],
    pickup_method: 'self_pickup',
    pickup_cost_per_run_cents: 0,            // local — Lawrence picks up free
    turnaround_days: 7,
    notes: 'Submit Fri PM, pick up locally Monday at no cost.'
  }
};

// ─────────────────────────────────────────────────────────────────────────
// 2. PRINT LAB COST FORMULAS (per SKU, in cents)
// ─────────────────────────────────────────────────────────────────────────
// Each material's cost is computed from:
//   cost = (rate_per_sq_in_cents × area_sq_in) + flat_addon_cents
//
// Rates are conservative — slightly over actual for standard sizes where
// the supplier's tabular pricing is cheaper than the custom-size rate. We'd
// rather under-promise on margin than over-promise.
//
// 2026-04-28: rates from Basilio (Artful) verbal + Shiny Prints website.
export const LAB_RATES = {
  canvas: {
    supplier: 'artful_printers',
    rate_per_sq_in_cents: 14,        // $0.14/sq in
    flat_addon_cents: 0,             // canvas is rolled, no mount hardware
    notes: 'Stretched on bars, ready-to-hang.'
  },
  acrylic: {
    supplier: 'artful_printers',
    rate_per_sq_in_cents: 42,        // $0.42/sq in
    flat_addon_cents: 0,             // includes facemount + standoff hardware
    notes: 'Acrylic facemount, polished edges, hanging hardware included.'
  },
  metal: {
    supplier: 'shiny_prints',
    rate_per_sq_in_cents: 25,        // $0.25/sq in (Shiny "Custom Size" rate)
    flat_addon_cents: 1200,          // +$12 frame mount (hanging hardware)
    notes: 'ChromaLuxe metal print + frame-mount hardware. Standard sizes are slightly cheaper per sq in than the custom rate; this estimate is conservative.'
  }
};

// Maps the 3-char SKU prefix in lookup_key to a material key in LAB_RATES.
const SKU_PREFIX_TO_MATERIAL = {
  CAN: 'canvas',
  ACR: 'acrylic',
  MET: 'metal'
};

// ─────────────────────────────────────────────────────────────────────────
// 3. OTHER PER-ORDER COSTS
// ─────────────────────────────────────────────────────────────────────────
export const PER_ORDER_COSTS = {
  // Google Gemini 2.5 Flash Image — per generated image. Customer typically
  // generates 2–4 images per order before they pick one. Conservative budget.
  generation_avg_cents: 14,                // ~4 generations × $0.035

  // Stripe US card transaction fee. Same for single-item and cart checkouts.
  stripe_fee_pct: 2.9,
  stripe_fee_flat_cents: 30,

  // Packaging consumables averaged across canvas/metal/acrylic. Lawrence to
  // refine after first 50 orders. Set to 0 if you don't want it modeled.
  packaging_cents: 200,                    // $2.00 estimate

  // Inbound shipping from lab → aiPRINT studio (the leg the customer never sees).
  // Per-order inbound cost is COMPUTED dynamically from the SUPPLIERS config
  // above by amortizing the courier run cost across EXPECTED_BATCH_SIZE
  // orders. Use `inboundPerOrderCents(material)` below to get the actual
  // value for a given material — this constant is kept for backward compat
  // but no longer drives the math.
  inbound_lab_to_studio_cents: 0,          // see inboundPerOrderCents() instead

  // Outbound shipping from studio → customer. Customer-paid rates are in
  // _shipping.js (TIERS). Actual carrier cost to aiPRINT may be higher than
  // what we charge the customer (we absorb the gap). Estimated below per
  // tier — refine after first 50 orders with real carrier invoices.
  outbound_studio_to_customer_cents: {
    light:    1500,    // ~$15 — we charge $10
    standard: 2200,    // ~$22 — we charge $15
    heavy:    3500,    // ~$35 — we charge $25
    oversize: 5500     // ~$55 — we charge $35 (acrylic 36×36 freight)
  }
};

// What we charge the customer for shipping (mirrors _shipping.js TIERS so
// the finances page can show the customer-paid vs aiPRINT-paid gap clearly).
export const CUSTOMER_SHIPPING_CENTS = {
  light:    1000,    // $10
  standard: 1500,    // $15
  heavy:    2500,    // $25
  oversize: 3500     // $35
};

// ─────────────────────────────────────────────────────────────────────────
// 4. HELPERS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Detect the material for a SKU's lookup_key (e.g. "CAN-16x24-PT" → "canvas").
 * Returns null if the prefix is unrecognized.
 */
export function materialFromLookupKey(lookup_key) {
  const prefix = String(lookup_key || '').slice(0, 3).toUpperCase();
  return SKU_PREFIX_TO_MATERIAL[prefix] || null;
}

/**
 * Compute lab cost in cents for a given lookup_key + dimensions.
 * dims is { w, h } in inches.
 *
 * Returns { material, area_sq_in, lab_cost_cents, breakdown }
 * where breakdown is human-readable for the dashboard.
 */
export function computeLabCost(lookup_key, dims) {
  const material = materialFromLookupKey(lookup_key);
  if (!material) {
    return { material: null, area_sq_in: 0, lab_cost_cents: 0, breakdown: 'unknown SKU prefix' };
  }
  const rate = LAB_RATES[material];
  const area = (dims?.w || 0) * (dims?.h || 0);
  const variableCents = rate.rate_per_sq_in_cents * area;
  const total = variableCents + rate.flat_addon_cents;
  const breakdown = rate.flat_addon_cents > 0
    ? `${area} sq in × $${(rate.rate_per_sq_in_cents / 100).toFixed(2)} + $${(rate.flat_addon_cents / 100).toFixed(2)} mount = $${(total / 100).toFixed(2)}`
    : `${area} sq in × $${(rate.rate_per_sq_in_cents / 100).toFixed(2)} = $${(total / 100).toFixed(2)}`;
  return { material, area_sq_in: area, lab_cost_cents: total, breakdown };
}

/**
 * Compute the customer-shipping tier for a SKU. Mirrors the logic in
 * `_shipping.js` so the finances page agrees with what the customer actually
 * pays at checkout.
 */
export function shippingTierFor(lookup_key, dims) {
  const material = materialFromLookupKey(lookup_key);
  const area = (dims?.w || 0) * (dims?.h || 0);
  if (!material || area === 0) return 'standard';

  if (material === 'acrylic') {
    if (area <= 144) return 'light';
    if (area <= 324) return 'standard';
    if (area <= 576) return 'heavy';
    return 'oversize';
  }
  if (material === 'metal') {
    if (area <= 144) return 'light';
    if (area <= 432) return 'standard';
    if (area <= 720) return 'heavy';
    return 'oversize';
  }
  // canvas
  if (area <= 216) return 'light';
  if (area <= 432) return 'standard';
  if (area <= 720) return 'heavy';
  return 'oversize';
}

/**
 * Per-order inbound (lab → studio) cost in cents, given the material and the
 * assumed batch size. Self-pickup labs return 0; courier-pickup labs return
 * the courier cost amortized over the batch.
 *
 * @param {string} material  'canvas' | 'acrylic' | 'metal'
 * @param {number} batchSize orders sharing the courier run (default = EXPECTED_BATCH_SIZE)
 */
export function inboundPerOrderCents(material, batchSize = EXPECTED_BATCH_SIZE) {
  const rate = LAB_RATES[material];
  if (!rate) return 0;
  const sup = SUPPLIERS[rate.supplier];
  if (!sup) return 0;
  const runCost = sup.pickup_cost_per_run_cents || 0;
  if (runCost === 0) return 0;
  const safeBatch = Math.max(1, Math.floor(batchSize));
  return Math.round(runCost / safeBatch);
}

/**
 * Stripe fee on a given gross amount (cents).
 *   gross_cents = product price + customer-paid shipping + tax
 * Tax: Stripe collects, but the fee applies to the full gross including tax.
 * For pre-tax modeling we pass gross_cents = retail + customer_shipping.
 */
export function stripeFeeCents(gross_cents) {
  return Math.round(gross_cents * (PER_ORDER_COSTS.stripe_fee_pct / 100)) + PER_ORDER_COSTS.stripe_fee_flat_cents;
}

/**
 * Compute full per-order economics — every cent in, every cent out.
 *
 * Inputs:
 *   sku: { lookup_key, w, h, retail_cents }
 *   adSpendCents: optional advertising attributed to this order (CAC component)
 *   batchSize:   optional weekly courier batch size (default EXPECTED_BATCH_SIZE)
 *
 * Returns a fully itemized P&L.
 */
export function computeOrderEconomics(sku, adSpendCents = 0, batchSize = EXPECTED_BATCH_SIZE) {
  const lab = computeLabCost(sku.lookup_key, { w: sku.w, h: sku.h });
  const tier = shippingTierFor(sku.lookup_key, { w: sku.w, h: sku.h });
  const customer_shipping_paid = CUSTOMER_SHIPPING_CENTS[tier] || CUSTOMER_SHIPPING_CENTS.standard;
  const outbound_carrier_cost = PER_ORDER_COSTS.outbound_studio_to_customer_cents[tier]
    || PER_ORDER_COSTS.outbound_studio_to_customer_cents.standard;
  const inbound = inboundPerOrderCents(lab.material, batchSize);
  const generation = PER_ORDER_COSTS.generation_avg_cents;
  const packaging = PER_ORDER_COSTS.packaging_cents;
  const gross_in = sku.retail_cents + customer_shipping_paid;
  const stripe_fee = stripeFeeCents(gross_in);

  const total_costs =
      lab.lab_cost_cents
    + inbound
    + outbound_carrier_cost
    + generation
    + packaging
    + stripe_fee
    + adSpendCents;

  const gross_profit_cents = gross_in - total_costs - adSpendCents;
  const gross_profit_before_ads_cents = gross_in - (total_costs - adSpendCents);
  const margin_pct = gross_in > 0 ? (gross_profit_before_ads_cents / gross_in) * 100 : 0;

  return {
    sku: sku.lookup_key,
    material: lab.material,
    area_sq_in: lab.area_sq_in,
    shipping_tier: tier,
    revenue: {
      retail_cents: sku.retail_cents,
      customer_shipping_cents: customer_shipping_paid,
      gross_in_cents: gross_in
    },
    costs: {
      lab_cost_cents: lab.lab_cost_cents,
      lab_breakdown: lab.breakdown,
      inbound_lab_to_studio_cents: inbound,
      outbound_to_customer_cents: outbound_carrier_cost,
      shipping_subsidy_cents: outbound_carrier_cost - customer_shipping_paid, // can be negative when we charge more than carrier costs
      generation_cents: generation,
      packaging_cents: packaging,
      stripe_fee_cents: stripe_fee,
      ad_spend_cents: adSpendCents,
      total_costs_cents: total_costs
    },
    profit: {
      before_ads_cents: gross_profit_before_ads_cents,
      after_ads_cents: gross_profit_cents,
      margin_pct
    }
  };
}
