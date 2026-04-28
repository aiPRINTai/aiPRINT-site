// api/_shipping.js
// Tiered flat-rate shipping for the Stripe Checkout Session.
//
// Customer-facing rates are intentionally lower than the true lab-fulfillment
// shipping cost — we absorb the gap on the back end so the checkout feels
// friendly and doesn't sticker-shock first-time buyers.
//
// Tiers are computed from the SKU prefix (CAN/MET/ACR) + the dimensions
// embedded in the lookup_key. Acrylic facemounts are heaviest per sq inch
// (acrylic + dibond + foam packaging), metal (ChromaLuxe aluminum) is
// mid-weight, canvas is lightest. Every order pays its tier rate — there
// is no free-shipping threshold today (can be reintroduced by adding a
// 'free' tier and threshold check in buildShippingOptions).
//
// All amounts in USD cents.

const TIERS = {
  light:    { amount: 1000, display: 'Standard shipping (3–7 business days)' }, // $10
  standard: { amount: 1500, display: 'Standard shipping (3–7 business days)' }, // $15
  heavy:    { amount: 2500, display: 'Standard shipping (3–7 business days)' }, // $25
  oversize: { amount: 3500, display: 'Standard shipping (3–7 business days)' }  // $35
};

// Pull dimensions out of a lookup_key like "CAN-08x12-PT", "MET-12-SQ", "ACR-24x36-PT".
// Returns area in square inches, or null if we can't parse it (we then fall back
// to the 'standard' tier as a safe default).
function areaFromLookupKey(k) {
  if (typeof k !== 'string') return null;
  const up = k.toUpperCase();
  const rect = up.match(/(\d+)X(\d+)/);
  if (rect) return parseInt(rect[1], 10) * parseInt(rect[2], 10);
  const sq = up.match(/-(\d+)-SQ/);
  if (sq) {
    const s = parseInt(sq[1], 10);
    return s * s;
  }
  return null;
}

// Map (material, area) -> tier key. Keep these table-driven so the
// thresholds are easy to tune without re-reading the calling code.
function tierForLookupKey(lookup_key) {
  const area = areaFromLookupKey(lookup_key);
  if (area == null) return 'standard';
  const material = String(lookup_key).slice(0, 3).toUpperCase();

  // Acrylic facemount — heaviest, fragile, foam-crated.
  if (material === 'ACR') {
    if (area <= 144) return 'light';    // up to 12×12
    if (area <= 324) return 'standard'; // up to 18×18 incl. 12×18
    if (area <= 576) return 'heavy';    // up to 24×24 incl. 16×24
    return 'oversize';                  // 20×30 / 24×36 / 30×30 / 36×36 acrylic
  }
  // ChromaLuxe metal — mid weight (aluminum substrate).
  if (material === 'MET') {
    if (area <= 144) return 'light';    // up to 12×12
    if (area <= 432) return 'standard'; // up to 18×24 incl. 12×18, 18×18
    if (area <= 720) return 'heavy';    // up to 24×30 incl. 16×24, 24×24
    return 'oversize';                  // 24×36 / 30×30 / 36×36 metal
  }
  // Canvas (default) — lightest, stretched on bars in a tube/box.
  if (area <= 216) return 'light';      // up to 12×18 incl. 8×12, 12×12
  if (area <= 432) return 'standard';   // up to 18×24 incl. 16×24, 18×18
  if (area <= 720) return 'heavy';      // up to 24×30 incl. 24×24, 20×30
  return 'oversize';                    // 24×36 / 30×30 / 36×36 canvas
}

/**
 * Build the shipping_options[] array for a Stripe Checkout Session.
 * Returns a single flat-rate shipping option appropriate for the given product.
 *
 * @param {string} lookup_key  e.g. "CAN-16x24-PT"
 * @returns {Array}            shipping_options for stripe.checkout.sessions.create
 */
export function buildShippingOptions(lookup_key) {
  const tierKey = tierForLookupKey(lookup_key);
  const t = TIERS[tierKey] || TIERS.standard;
  return [{
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: t.amount, currency: 'usd' },
      display_name: t.display,
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 3 },
        maximum: { unit: 'business_day', value: 7 }
      },
      // Some US states tax shipping — let Stripe Tax decide based on the
      // ship-to address. 'exclusive' = the rate above is pre-tax, tax added
      // on top, mirroring how the line-item price is configured.
      tax_behavior: 'exclusive'
    }
  }];
}

/**
 * Build shipping_options[] for a multi-item cart checkout.
 * Strategy: pick the heaviest tier across all items in the cart — shipping
 * is per-package, not per-item, and the heaviest item dictates the box.
 * That's almost always cheaper for the customer than summing per-item rates,
 * and matches how the lab actually ships (one package, mixed sizes go in
 * the box sized for the largest piece).
 *
 * @param {string[]} lookupKeys  list of SKU lookup_keys in the cart
 * @returns {Array}              shipping_options for stripe.checkout.sessions.create
 */
export function buildCartShippingOptions(lookupKeys) {
  if (!Array.isArray(lookupKeys) || lookupKeys.length === 0) {
    return buildShippingOptions('');
  }
  // Tier weights — higher = more shipping cost, picked over lower.
  const RANK = { light: 1, standard: 2, heavy: 3, oversize: 4 };
  let topTier = 'standard';
  let topRank = RANK[topTier];
  for (const k of lookupKeys) {
    const t = tierForLookupKey(k);
    const r = RANK[t] || 0;
    if (r > topRank) { topRank = r; topTier = t; }
  }
  const t = TIERS[topTier] || TIERS.standard;
  return [{
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: t.amount, currency: 'usd' },
      display_name: t.display,
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 3 },
        maximum: { unit: 'business_day', value: 7 }
      },
      tax_behavior: 'exclusive'
    }
  }];
}

// Exposed for tests / admin tools if we want to display the tier table.
export const SHIPPING_TIERS = TIERS;
export { tierForLookupKey };
