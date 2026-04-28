// api/_shipping.js
// Tiered flat-rate shipping for the Stripe Checkout Session.
//
// Customer-facing rates are intentionally lower than the true lab-fulfillment
// shipping cost — we absorb the gap on the back end so the checkout feels
// friendly and doesn't sticker-shock first-time buyers. The goal is "cheap-
// feeling" plus a generous free-shipping threshold that nudges AOV upward.
//
// Tiers are computed from the SKU prefix (CAN/MET/ACR) + the dimensions
// embedded in the lookup_key. Acrylic facemounts are heaviest per sq inch
// (acrylic + dibond + foam packaging), metal (ChromaLuxe aluminum) is
// mid-weight, canvas is lightest. Free shipping kicks in once the line-item
// price is at or above the threshold below.
//
// All amounts in USD cents.

const FREE_SHIPPING_THRESHOLD_CENTS = 9900; // $99 retail

const TIERS = {
  light:    { amount: 1000, display: 'Standard shipping (3–7 business days)' }, // $10
  standard: { amount: 1500, display: 'Standard shipping (3–7 business days)' }, // $15
  heavy:    { amount: 2500, display: 'Standard shipping (3–7 business days)' }, // $25
  oversize: { amount: 3500, display: 'Standard shipping (3–7 business days)' }, // $35
  free:     { amount: 0,    display: 'Free shipping (3–7 business days)' }
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
 * Returns a single rate appropriate for the given product, with a free-shipping
 * override when the line-item retail price is at or above the threshold.
 *
 * @param {string} lookup_key       e.g. "CAN-16x24-PT"
 * @param {number} unitAmountCents  line-item unit amount in cents (price.unit_amount)
 * @returns {Array}                 shipping_options for stripe.checkout.sessions.create
 */
export function buildShippingOptions(lookup_key, unitAmountCents) {
  const eligibleForFree = Number.isFinite(unitAmountCents)
    && unitAmountCents >= FREE_SHIPPING_THRESHOLD_CENTS;
  const tierKey = eligibleForFree ? 'free' : tierForLookupKey(lookup_key);
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

// Exposed for the customer-facing UI (trust badge / FAQ / etc.) so the
// threshold message stays in sync with the checkout logic.
export const SHIPPING_FREE_THRESHOLD_USD = FREE_SHIPPING_THRESHOLD_CENTS / 100;

// Exposed for tests / admin tools if we want to display the tier table.
export const SHIPPING_TIERS = TIERS;
export { tierForLookupKey };
