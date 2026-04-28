// /api/create-cart-checkout-session.js
// Multi-item Stripe Checkout Session for the localStorage cart flow.
//
// Body shape (from public/js/cart-ui.js):
//   {
//     items: [
//       {
//         preview_url: 'https://...',
//         clean_url:   null | 'https://...',
//         prompt: '...',
//         options: { ratio, style, mood, light, comp, medium, sig },
//         lookup_key: 'CAN-16x24-PT',
//         quantity: 1..10
//       },
//       ...
//     ],
//     utm: { utm_source, utm_medium, utm_campaign, utm_content, utm_term }
//   }
//
// Per-item creative settings live on each line_item's product_data.metadata
// (the only Stripe field that survives multi-line iteration on the webhook
// side). Session-level metadata holds the cart flag, item count, and UTMs.

import Stripe from 'stripe';
import { getCleanUrlForPreview } from './db/index.js';
import { buildCartShippingOptions } from './_shipping.js';

const MAX_ITEMS = 10;
const MAX_QTY = 10;

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

  const { items, utm } = body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  if (items.length > MAX_ITEMS) {
    return res.status(400).json({ error: `Cart has too many items (max ${MAX_ITEMS}).` });
  }

  // Validate each item up front before any Stripe round-trip.
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') return res.status(400).json({ error: `Invalid cart item at index ${i}.` });
    if (typeof it.lookup_key !== 'string' || !it.lookup_key) {
      return res.status(400).json({ error: `Cart item ${i} missing lookup_key.` });
    }
    if (typeof it.preview_url !== 'string' || !/^https:\/\//i.test(it.preview_url)) {
      return res.status(400).json({ error: `Cart item ${i} missing or invalid preview_url.` });
    }
    if (it.clean_url && (typeof it.clean_url !== 'string' || !/^https:\/\//i.test(it.clean_url))) {
      return res.status(400).json({ error: `Cart item ${i} clean_url is not a valid https URL.` });
    }
  }

  // UTM sanitize (mirrored from create-checkout-session.js).
  function sanitizeUtm(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 200);
  }
  const utmSafe = {
    utm_source:   sanitizeUtm(utm?.utm_source),
    utm_medium:   sanitizeUtm(utm?.utm_medium),
    utm_campaign: sanitizeUtm(utm?.utm_campaign),
    utm_content:  sanitizeUtm(utm?.utm_content),
    utm_term:     sanitizeUtm(utm?.utm_term)
  };

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return res.status(500).json({ error: 'Server misconfigured (no STRIPE_SECRET_KEY)' });
  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });

  try {
    // Look up Stripe Prices for every distinct lookup_key in one round-trip
    // each. Could parallelize, but cart sizes are small (≤10) and this keeps
    // failure modes legible if one SKU is missing.
    const priceCache = new Map();
    for (const it of items) {
      if (priceCache.has(it.lookup_key)) continue;
      const r = await stripe.prices.list({
        lookup_keys: [it.lookup_key], active: true, expand: ['data.product'], limit: 1
      });
      const p = r.data[0];
      if (!p) {
        return res.status(404).json({ error: `Unknown product: ${it.lookup_key}` });
      }
      priceCache.set(it.lookup_key, p);
    }

    // Stripe metadata values must be strings; cap at 500 chars each.
    const cap = (v, n = 500) => (v == null ? '' : String(v).slice(0, n));

    // Build line_items. Per-item creative settings live on product_data.metadata.
    const line_items = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const price = priceCache.get(it.lookup_key);
      const product = price.product || {};

      // Resolve the clean (unwatermarked) URL server-side. Browser only ever
      // has the watermarked preview_url; the print master comes from the
      // generations table lookup. Falls back to the preview if not found
      // (admin can hand-correct from the dashboard).
      let cleanUrl = it.clean_url;
      if (!cleanUrl) {
        try { cleanUrl = await getCleanUrlForPreview(it.preview_url); }
        catch (_) { cleanUrl = null; }
      }

      // Quantity clamp 1..10.
      const qty = (() => {
        const n = Math.floor(Number(it.quantity));
        if (!Number.isFinite(n) || n < 1) return 1;
        return Math.min(n, MAX_QTY);
      })();

      // Stripe accepts up to 8 image URLs per product, max 2048 chars each.
      const productImages = [];
      if (typeof it.preview_url === 'string' && it.preview_url.length <= 2048) {
        productImages.push(it.preview_url);
      }

      const opts = it.options || {};
      line_items.push({
        quantity: qty,
        price_data: {
          currency: price.currency,
          unit_amount: price.unit_amount,
          tax_behavior: price.tax_behavior || 'exclusive',
          product_data: {
            name: product.name || 'aiPRINT — Custom Print',
            ...(product.description ? { description: product.description } : {}),
            ...(productImages.length ? { images: productImages } : {}),
            ...(product.tax_code ? { tax_code: product.tax_code } : {}),
            metadata: {
              // line_item_index is what the webhook uses to build distinct
              // orders rows per item with a (stripe_session_id, line_item_index)
              // composite uniqueness check.
              line_item_index: String(i),
              lookup_key:  cap(it.lookup_key),
              preview_url: cap(it.preview_url),
              clean_url:   cap(cleanUrl || it.preview_url),
              prompt:      cap(it.prompt),
              ratio:       cap(opts.ratio),
              style:       cap(opts.style),
              mood:        cap(opts.mood),
              light:       cap(opts.light),
              composition: cap(opts.comp),
              medium:      cap(opts.medium),
              signature_json: opts.sig ? cap(JSON.stringify(opts.sig)) : '',
              quantity:    String(qty)
            }
          }
        }
      });
    }

    // Origin resolution mirrors create-checkout-session.js.
    const sanitize = (v) => {
      if (!v) return '';
      return String(v).replace(/\\[nrt]/g, '').replace(/[\s​-‍﻿]+/g, '').replace(/\/+$/, '');
    };
    const candidates = [
      sanitize(process.env.CLIENT_URL),
      sanitize(req.headers.origin),
      req.headers.host ? `https://${sanitize(req.headers.host)}` : '',
      'https://aiprint.ai'
    ];
    const origin = candidates.find((u) => /^https:\/\/[^\s]+$/i.test(u)) || 'https://aiprint.ai';

    // Highest shipping tier across all items (one package, biggest item
    // dictates the box) — see api/_shipping.js for the rationale.
    const shipping_options = buildCartShippingOptions(items.map(it => it.lookup_key));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options,
      // Surfaces the "Add promo code" link on the Stripe Checkout page —
      // applies to the whole cart subtotal. Codes managed in Stripe
      // Dashboard → Coupons / Promotion codes (no redeploy to issue).
      allow_promotion_codes: true,
      metadata: {
        // Webhook-side flag so we can route this as a cart vs single-item.
        type: 'cart',
        item_count: String(items.length),
        utm_source:   utmSafe.utm_source,
        utm_medium:   utmSafe.utm_medium,
        utm_campaign: utmSafe.utm_campaign,
        utm_content:  utmSafe.utm_content,
        utm_term:     utmSafe.utm_term
      },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/#order`
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(JSON.stringify({
      tag: 'create-cart-checkout-session',
      stripe_type: err?.type, stripe_code: err?.code, stripe_param: err?.param,
      stripe_doc_url: err?.doc_url, status: err?.statusCode, message: err?.message
    }));
    if (err?.raw) console.error('stripe raw:', JSON.stringify(err.raw).slice(0, 800));
    const safeStripeType = err?.type && /^Stripe(Invalid|Permission|Rate|Idempotency|Authentication|Card)/i.test(err.type);
    const payload = { error: 'Unable to start checkout. Please try again.' };
    if (safeStripeType && err?.message) payload.detail = err.message;
    return res.status(500).json(payload);
  }
}
