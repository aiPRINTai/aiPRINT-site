import Stripe from 'stripe';

// Defensive: env vars saved through the Vercel UI sometimes pick up trailing
// whitespace, literal "\n" escapes, or zero-width characters. Node's HTTP
// module then refuses the outbound `Authorization: Bearer …` header with
// `ERR_INVALID_CHAR`, which surfaces as a bare 500 (and breaks /api/session,
// /api/webhook, etc.). Strip those before handing the key to the SDK.
function sanitizeKey(v) {
  if (!v) return '';
  return String(v)
    .replace(/\\[nrt]/g, '')                  // literal \n \r \t escapes
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, ''); // real whitespace + zero-widths
}

const stripeSecret = sanitizeKey(process.env.STRIPE_SECRET_KEY);

export const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });
