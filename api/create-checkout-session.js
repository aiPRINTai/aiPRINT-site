// /api/create-checkout-session.js
// Builds a Stripe Checkout Session with the customer's preview_url + creative
// settings as metadata, so the webhook + DB + emails + admin + success page
// all have everything they need.
//
// Note on the watermark architecture: the browser only ever sees `preview_url`
// (the watermarked, downsized version). Here we look up the matching clean
// (unwatermarked, full-resolution) URL from the `generations` table and pass
// it through Stripe metadata to the webhook, which stores it on the order.
// Admin export + post-payment customer emails read `clean_url` for the print
// master. The clean URL never crosses the wire to the browser.
import Stripe from 'stripe';
import { getCleanUrlForPreview } from './db/index.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    if (typeof req.body === 'string') body = JSON.parse(req.body || '{}');
    else body = req.body || {};
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { lookup_key, preview } = body || {};
  if (!lookup_key || typeof lookup_key !== 'string') return res.status(400).json({ error: 'Missing lookup_key' });
  if (!preview?.image || typeof preview.image !== 'string') return res.status(400).json({ error: 'Missing preview.image' });
  // Only accept https URLs for preview to avoid javascript:/data: schemes leaking into Stripe metadata
  if (!/^https:\/\//i.test(preview.image)) return res.status(400).json({ error: 'Invalid preview.image URL' });

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return res.status(500).json({ error: 'Server misconfigured (no STRIPE_SECRET_KEY)' });

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });

  try {
    const prices = await stripe.prices.list({
      lookup_keys: [lookup_key],
      active: true,
      expand: ['data.product'],
      limit: 1
    });

    const price = prices.data[0];
    if (!price) {
      return res.status(404).json({ error: `No active price found for lookup_key ${lookup_key}` });
    }

    // Server-side lookup of the clean (unwatermarked) original.
    // If we can't find a match (e.g. a stale preview from before this feature
    // shipped), fall back to the preview URL — the order still goes through,
    // and admin can hand-correct via the dashboard.
    let cleanUrl = null;
    try {
      cleanUrl = await getCleanUrlForPreview(preview.image);
    } catch (e) {
      console.warn('[checkout] clean_url lookup failed, falling back to preview:', e?.message);
    }

    // Stripe metadata values must be strings; cap at 500 chars each.
    const cap = (v, n = 500) => (v == null ? '' : String(v).slice(0, n));

    const metadata = {
      lookup_key,
      preview_url: cap(preview.image),
      clean_url:   cap(cleanUrl || preview.image),
      prompt:      cap(preview.prompt),
      ratio:       cap(preview.size),
      style:       cap(preview.style),
      mood:        cap(preview.mood),
      light:       cap(preview.light),
      composition: cap(preview.comp),
      medium:      cap(preview.medium),
      signature_json: preview.sig ? cap(JSON.stringify(preview.sig)) : '',
      product_name:        cap(price.product?.name),
      product_description: cap(price.product?.description)
    };

    // Resolve origin defensively — we've been burned by env vars that got saved
    // with trailing whitespace / literal "\n" escapes, which silently produce
    // "https://aiprint.ai\n/success.html" and make Stripe reject the URL.
    const sanitize = (v) => {
      if (!v) return '';
      return String(v)
        .replace(/\\[nrt]/g, '')            // literal \n \r \t escapes saved in env UI
        .replace(/[\s\u200B-\u200D\uFEFF]+/g, '') // real whitespace + zero-widths
        .replace(/\/+$/, '');               // trailing slash(es)
    };
    const candidates = [
      sanitize(process.env.CLIENT_URL),
      sanitize(req.headers.origin),
      req.headers.host ? `https://${sanitize(req.headers.host)}` : '',
      'https://aiprint.ai',
    ];
    const origin = candidates.find((u) => /^https:\/\/[^\s]+$/i.test(u)) || 'https://aiprint.ai';

    // Build the line item inline (price_data) instead of referencing the
    // pre-existing Stripe Price by id. This lets us set `images` per session
    // so the customer sees their actual generated artwork in the Checkout
    // thumbnail, not the static product photo. Everything else
    // (currency / unit_amount / tax_behavior / tax_code) is mirrored from
    // the original Price+Product so automatic_tax + reporting stay identical.
    const product = price.product || {};
    const productImages = [];
    // Stripe accepts up to 8 image URLs, max 2048 chars each, https only.
    if (typeof preview.image === 'string' && preview.image.length <= 2048) {
      productImages.push(preview.image);
    }

    const line_item = {
      quantity: 1,
      price_data: {
        currency: price.currency,
        unit_amount: price.unit_amount,
        // automatic_tax requires a tax_behavior on price_data. Mirror the
        // original Price; if it's somehow missing, default to 'exclusive'
        // (US-style — tax added on top, matches what Stripe shows today).
        tax_behavior: price.tax_behavior || 'exclusive',
        product_data: {
          name: product.name || 'aiPRINT — Custom Print',
          ...(product.description ? { description: product.description } : {}),
          ...(productImages.length ? { images: productImages } : {}),
          // Preserve the product's tax_code so Stripe Tax keeps classifying
          // this as the same kind of good (otherwise rates can shift).
          ...(product.tax_code ? { tax_code: product.tax_code } : {}),
          metadata: { lookup_key }
        }
      }
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [line_item],
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: ['US'] },
      metadata,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/#order`
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    // Log a structured record so Stripe's real complaint shows up in the
    // runtime-log table even when the line is truncated in the UI.
    console.error(JSON.stringify({
      tag: 'create-checkout-session',
      lookup_key,
      stripe_type: err?.type,
      stripe_code: err?.code,
      stripe_param: err?.param,
      stripe_doc_url: err?.doc_url,
      status: err?.statusCode,
      message: err?.message,
    }));
    if (err?.raw) {
      console.error('stripe raw:', JSON.stringify(err.raw).slice(0, 800));
    }

    // Bubble up Stripe's own message when it's a user-facing problem so we're
    // not hiding "tax registration required" / "shipping country not allowed"
    // behind a generic 500. Keep unknown errors generic.
    const safeStripeType = err?.type && /^Stripe(Invalid|Permission|Rate|Idempotency|Authentication|Card)/i.test(err.type);
    const payload = { error: 'Unable to start checkout. Please try again.' };
    if (safeStripeType && err?.message) payload.detail = err.message;
    return res.status(500).json(payload);
  }
}
