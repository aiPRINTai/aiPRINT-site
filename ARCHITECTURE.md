# aiPRINT.ai — Architecture & Operations Cheat Sheet

> **Living doc.** Update whenever something changes. Last edit: 2026-04-22.

---

## 1. The 30-second mental model

```
Customer browser
   │
   │  1. types prompt + picks options
   ▼
/api/generate-image  ──►  Google Gemini (text → image)
                             │
                             └──►  Vercel Blob (stores PNG, returns public URL)
                                       │
   ┌───────────────────────────────────┘
   ▼
Preview shown on /index.html  ──►  user clicks "Order this print"
   │
   ▼
/api/create-checkout-session  ──►  Stripe Checkout (hosted page)
                                      │
                                      │ payment succeeds
                                      ▼
                            Stripe sends webhook ──►  /api/webhook
                                                          │
                            ┌─────────────────────────────┼────────────────────────────┐
                            ▼                             ▼                            ▼
                    Vercel Postgres                Resend (customer)            Resend (you)
                    `orders` row inserted          confirmation email           fulfillment alert
                                                          │
                                                          ▼
                                          Customer redirected to /success.html
                                                          │
                                                          ▼
                                          /api/session looks up Stripe data
                                          + shows preview image again
```

Then **you** open `/admin/orders.html`, see new orders, mark them shipped, paste tracking #.

---

## 2. Stack inventory — what does what

| Service               | Role                                   | Where to manage                          | Env var(s) used                         |
|-----------------------|----------------------------------------|------------------------------------------|------------------------------------------|
| **Vercel**            | Hosts the site + serverless API routes | vercel.com → aiprint project             | (deploy config)                          |
| **Vercel Postgres** (Neon) | Database: users, orders, generations, credits | Vercel → Storage → Postgres → Neon dashboard | `POSTGRES_URL`                           |
| **Vercel Blob**       | Stores generated PNG images (public URLs) | Vercel → Storage → Blob                  | `BLOB_READ_WRITE_TOKEN` (auto-injected)  |
| **Google Gemini**     | Text-to-image generation               | aistudio.google.com                      | `GOOGLE_GEMINI_API_KEY`                  |
| **Stripe**            | Checkout, payments, tax                | dashboard.stripe.com                     | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Resend**            | Transactional email (HTTP API)         | resend.com                               | `RESEND_API_KEY`, `EMAIL_FROM`, `ORDERS_TO`, `CONTACT_TO` |
| **GoDaddy**           | Domain DNS (aiprint.ai)                | godaddy.com → domains                    | —                                        |
| **PostHog**           | Product analytics, funnels             | us.posthog.com                           | (public key in `/js/analytics.js`)       |
| **Admin password**    | Gates `/admin/orders` page             | Vercel env vars                          | `ADMIN_PASSWORD`                         |

---

## 3. Where every important file lives

### Frontend (`/public`)
| File                       | What it is                                                     |
|----------------------------|----------------------------------------------------------------|
| `index.html`               | Main app: prompt builder, generator, preview, checkout button  |
| `success.html`             | Post-purchase confirmation + in-room mockup                    |
| `account.html`             | User account + credit balance                                  |
| `faq.html`, `policies.html`, `contact.html` | Static info pages                              |
| `thank-you.html`           | Post-contact-form thank you                                    |
| `admin/orders.html`        | **Internal** order management dashboard (password-gated)       |
| `js/analytics.js`          | PostHog page-load + event tracking                             |
| `rooms/`                   | Room mockup background images (sofa, bedroom, etc.)            |
| `materials/`               | Material/finish swatch images                                  |
| `products.json`            | Stripe product → lookup_key → display name mapping             |

### Backend (`/api`)
| File                                | What it does                                                       |
|-------------------------------------|--------------------------------------------------------------------|
| `generate-image.js`                 | POST → calls Gemini, stores PNG in Blob, deducts credit            |
| `save-preview.js`, `get-preview.js` | Persists preview metadata across page reloads                      |
| `create-checkout-session.js`        | Builds Stripe Checkout session with image + options as metadata    |
| `webhook.js`                        | **Stripe webhook receiver** — saves order, sends emails            |
| `session.js`                        | Reads Stripe session for the success page                          |
| `_email.js`                         | Resend wrapper. Templates: verification, order confirmation, fulfillment alert, **shipping notification**, **credit purchase receipt** |
| `_stripe.js`                        | Stripe SDK init                                                    |
| `_util.js`                          | Shared helpers (rawBody for webhook, json response)                |
| `admin/orders.js`                   | Admin API: list orders, update status/tracking                     |
| `auth/`                             | Sign-up, login, JWT session for accounts                           |
| `credits/`                          | Credit balance + deduction logic                                   |
| `db/index.js`                       | All Postgres queries (single source of truth)                      |
| `db/schema.sql`                     | Database schema (re-runnable; uses `IF NOT EXISTS`)                |

### Tooling
| File                  | Purpose                                                       |
|-----------------------|---------------------------------------------------------------|
| `scripts/migrate.js`  | One-shot: applies `schema.sql` to the live database           |
| `vercel.json`         | Vercel deploy config                                          |
| `package.json`        | Node deps                                                     |

---

## 4. Database tables (Postgres / Neon)

| Table                    | What it stores                                                  |
|--------------------------|-----------------------------------------------------------------|
| `users`                  | Email, password hash, credit balance                            |
| `credit_transactions`    | Every credit purchase / deduction                               |
| `generations`            | Every image generation (logged-in users)                        |
| `anonymous_generations`  | IP-based rate limiting for non-logged-in users                  |
| `orders`                 | Print orders (one row per Stripe `checkout.session.completed`)  |

`orders` columns: `id, stripe_session_id (UNIQUE), user_id, customer_email, customer_name, shipping_address (JSONB), lookup_key, preview_url, prompt, options (JSONB), amount_total, tax_amount, currency, status, tracking_number, carrier, admin_notes, updated_at, created_at`.

**To re-apply schema:** `POSTGRES_URL="..." node scripts/migrate.js` (safe — uses `IF NOT EXISTS`).

---

## 5. The order flow, step by step

1. **Customer designs art** on `/` → `POST /api/generate-image` → Gemini → Vercel Blob → preview URL returned.
2. **Customer clicks "Order"** → `POST /api/create-checkout-session` builds a Stripe Checkout session with:
   - Line item (Stripe product, looked up by `lookup_key`)
   - Metadata: `preview_url`, `prompt`, `style`, `mood`, `light`, `composition`, `medium`, `signature_json`
3. **Customer pays on Stripe's hosted page** (Stripe collects address + tax).
4. **Stripe POSTs to `/api/webhook`** with event `checkout.session.completed`. The webhook:
   - Verifies signature using `STRIPE_WEBHOOK_SECRET`
   - Checks if `stripe_session_id` already exists (idempotency — Stripe retries)
   - Inserts row into `orders`
   - Fires both Resend emails (`Promise.allSettled`, never blocks the 200 ack)
5. **Customer is redirected to `/success.html?session_id=...`**, which calls `/api/session` to fetch the Stripe session, then renders the order details + preview image + in-room mockup.
6. **You get the fulfillment email**, log into `/admin/orders`, mark it `in_production` → print → mark `shipped` + add tracking → ship.

---

## 6. Admin dashboard

**URL:** `https://aiprint.ai/admin/orders.html`
**Auth:** prompts for `ADMIN_PASSWORD` (Vercel env var). Stored in `sessionStorage` — closes tab = signed out.
**API:** `GET /api/admin/orders` (list + stats), `PATCH /api/admin/orders` (update status/tracking).
**Image storage:** images shown in admin are the same Vercel Blob URLs saved in `orders.preview_url`. Click "Open full size" to download the PNG for printing.

**Order statuses:** `paid` (new) → `in_production` → `shipped` → `delivered`. Plus `canceled` if needed.

---

## 7. Environment variables (Vercel → Settings → Environment Variables)

**Required for production:**
- `POSTGRES_URL` — auto-set by Vercel Postgres integration
- `BLOB_READ_WRITE_TOKEN` — auto-set by Vercel Blob
- `GOOGLE_GEMINI_API_KEY`
- `STRIPE_SECRET_KEY` (live mode `sk_live_...`)
- `STRIPE_WEBHOOK_SECRET` (live mode `whsec_...`)
- `RESEND_API_KEY`
- `EMAIL_FROM` — e.g. `aiPRINT <orders@aiprint.ai>`
- `ORDERS_TO` — fulfillment inbox (default `orders@aiprint.ai`). New-order alerts + reply-to on order/shipping/credit emails.
- `CONTACT_TO` — general inbox (default `info@aiprint.ai`). Contact form + reply-to on verification / password-reset emails. Legacy `FULFILLMENT_TO` is honored as a fallback.
- `ADMIN_PASSWORD` — long random string for `/admin/orders` access
- `JWT_SECRET` — for user auth tokens

If any is missing, the related feature degrades gracefully (e.g. missing `RESEND_API_KEY` → emails skip, console warning, order still saves).

---

## 8. Common ops tasks

| Task                                  | How                                                                                               |
|---------------------------------------|---------------------------------------------------------------------------------------------------|
| Deploy latest code                    | `cd aiPRINT-site && npx vercel deploy --prod --yes`                                               |
| See orders                            | Open `/admin/orders.html`                                                                         |
| Check why an order didn't email       | Vercel → Logs → search `Resend` or the Stripe session ID                                          |
| Re-send a customer email              | (not built yet — could add a "Resend confirmation" button on admin page)                          |
| Inspect raw DB                        | Vercel → Storage → Postgres → "Open in Neon" → SQL editor                                         |
| Roll Stripe webhook secret            | Stripe Dashboard → Developers → Webhooks → click endpoint → "Roll secret" → paste into Vercel env |
| Roll admin password                   | Update `ADMIN_PASSWORD` in Vercel env → redeploy → all open admin sessions get signed out         |
| Add a new print product/size          | Create product in Stripe with a unique `lookup_key` → add it to `/public/products.json`           |

---

## 9. Known gaps / future work

**Done since last revision:**
- [x] Shipping notification email (auto-fires when admin flips status to `shipped` with a tracking #)
- [x] Credit purchase confirmation email (fires from webhook on `credit_purchase`)
- [x] Webhook idempotency for credit purchases (was a real bug — Stripe retries would have double-credited)
- [x] Atomic credit deduction (race-safe `UPDATE ... WHERE balance >= 1`)
- [x] Mobile hamburger menu on `/index.html`
- [x] SEO: OG/Twitter cards on all pages, `robots.txt`, `sitemap.xml`, JSON-LD Org schema
- [x] Admin: search box, toast notifications, ship-confirm dialog
- [x] Section dividers on home page
- [x] Custom-select component for signature-font + prompt dropdowns (Chrome/Safari ignore `font-family` on native `<option>`). 2026-04-22.
- [x] Open dropdown lifts above preview image (z-index stacking fix). 2026-04-22.
- [x] Wall-preview refreshes against regenerated image without requiring tab-click. 2026-04-22.
- [x] Hero grid unified to symmetric 4-tile `aspect-square` layout; mobile-tightened hero copy. 2026-04-22.
- [x] All hero↔gallery image duplicates removed. 2026-04-22.
- [x] Admin Revenue stat excludes `canceled` orders. 2026-04-22.

**Still open:**
- [ ] Founder photo + studio location (placeholders on home)
- [ ] Real customer testimonials (current 3 are realistic-but-fictional placeholders)
- [ ] Gallery hero images are Unsplash placeholders — swap to real prints
- [ ] Customer-facing order-history page (account page doesn't list orders yet)
- [ ] "Resend confirmation email" button on admin page
- [ ] Abandoned-cart capture (no preview-without-purchase nudge yet)
- [ ] CSV export from admin
- [ ] Real "Trustpilot" / external-review widget once you have real reviews
- [ ] Order-tracking page customers can hit without logging in (just session_id)

---

## 10. Quick troubleshooting

**"Webhook signature verification failed"** → `STRIPE_WEBHOOK_SECRET` in Vercel doesn't match the secret Stripe is signing with. Roll in Stripe → paste new value → redeploy.

**Order paid in Stripe but not in `orders` table** → Webhook didn't hit, or it errored before the DB insert. Check Vercel logs for `/api/webhook`. Stripe → Webhooks → click endpoint → "Recent deliveries" → resend the event.

**Image broken on success page or admin** → Blob URL expired? They shouldn't (we set `cacheControlMaxAge: 1y`). More likely: the `preview_url` wasn't passed through Stripe metadata. Check the metadata on the Stripe session.

**Admin says "Wrong password"** → `ADMIN_PASSWORD` env var either isn't set in Vercel, or you typed it wrong. Re-check Vercel → Settings → Environment Variables → Production.

---

## 11. Frontend patterns worth knowing (added 2026-04-22)

### 11.1 Custom-select dropdown component

Chrome and Safari ignore `font-family` and `color` styling on native
`<option>` elements (Firefox respects them). The signature-font picker and
the prompt-builder dropdowns on `/index.html` use a custom overlay:

- The native `<select>` stays in the DOM for accessibility + form semantics
  but is visually hidden; a `.custom-select` wrapper renders the label and
  `.custom-select-menu` renders the options.
- `openMenu()`/`closeMenu()` toggle `wrap.dataset.open = 'true'/'false'`.
- CSS lifts the **entire wrapper's** stacking context when open so the menu
  escapes sibling stacking contexts from the preview image:
  ```css
  .custom-select[data-open="true"] { z-index: 9999; }
  .custom-select-menu { z-index: 9999; ... }
  ```
- The label-building `enhance()` helper must NOT interpolate `opt.style.fontFamily`
  directly into a template string — CSS font-family values contain embedded
  double-quotes (e.g. `"Playfair Display", Georgia, serif`). Build the label
  via `document.createElement('span') + setAttribute + outerHTML` instead.

### 11.2 Wall-preview refresh on regenerate

`showArtworkInRoom()` reads `currentPreview.url`, so refreshing the mockup
just means calling `updateMockup()` against the now-current state. After a
successful regenerate in `index.html`, if the room mockup section is already
visible we refresh it:

```js
const roomSection = $('#roomMockupSection');
if (roomSection && !roomSection.classList.contains('hidden')) {
  const activeRoom = document.querySelector('.room-tab.active')?.dataset.room || 'room1';
  renderSizePills();
  updateMockup(activeRoom, currentMockupSize || '24x24');
}
```

Without this, the wall keeps showing the previous artwork next to the new
preview until the user clicks a room tab.

### 11.3 Hero image grid

The hero on `/index.html` uses a 2×2 `aspect-square` CSS grid of four unique
tiles (desktop + mobile both). The 500px "canyon" anchor + small-tile layout
is retired. Keep hero tiles + gallery tiles distinct — we dedupe on filename
to avoid the same image appearing above and below the fold.

### 11.4 Mobile-first hero copy

Hero paragraph uses Tailwind responsive-prefix swaps:

- Desktop (`hidden md:block`): long narrative paragraph.
- Mobile (`md:hidden`): telegraphic — `Prompt → Generate → Print → Ship → Hang`.

This is the pattern to follow when any content block feels "too wordy on
phone": keep a rich desktop version and a punchy mobile version in the same
section, both always rendered in markup, let Tailwind hide the other one.
