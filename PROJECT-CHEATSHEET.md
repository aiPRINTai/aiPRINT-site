# aiPRINT.ai — Project Cheat Sheet & Punch List

> Companion to `ARCHITECTURE.md` (which is the technical source of truth).
> This doc = **what you owe the site** (copy + images) and **what's still worth polishing**.
> Last edit: 2026-04-28.

---

## 1. Send-me-this checklist (images + copy)

These are the placeholders sitting in the live site right now. Once you send the assets, I'll drop them in.

### Images to source / shoot

| # | Asset | Where it goes | Current state | Spec / notes |
|---|-------|---------------|---------------|--------------|
| 1 | **Founder portrait** | `/public/about.html` (founder block) + small thumb on `/index.html` "Meet the founder" section | Placeholder gradient/initials | Square crop ≥ 800×800, JPG, natural light, looking at camera. Casual > corporate. |
| 2 | **Studio / workspace shot** | `/index.html` founder section background, `/about.html` | Missing — section reads "studio location: TBD" | Wide 16:9, ≥ 1600px wide. Desk + monitor + a printed piece on the wall is ideal. |
| 3 | **Real customer print photos (×6–8)** | `/index.html` gallery grid | Currently Unsplash placeholders (`photo-1547891654-...`, etc.) | In-room shots: print framed on a wall above a sofa / bed / console. Square or 4:5. The "lifestyle" framing matters more than the art itself. |
| 4 | **Open Graph share image** | All pages (`<meta property="og:image">`) | Currently points at a placeholder | 1200×630 PNG. Site logo + tagline + one hero piece of art. This is what shows up when someone shares the link in iMessage / Slack / Twitter. |
| 5 | **Material swatch close-ups** (optional upgrade) | `/public/materials/` | Existing swatches OK but flat | Macro shots of canvas weave / matte paper texture / metal print edge. Square, 600×600. |
| 6 | **Favicon / app icon** | `<link rel="icon">` | Default | 512×512 PNG with transparent corners. |

### Copy to write

| # | Block | Where | What's there now | What I need from you |
|---|-------|-------|------------------|----------------------|
| 1 | **Founder bio (long)** | `/public/about.html` ~line 118 | Generic placeholder paragraph | 150–250 words: why you started, what you obsess over, one specific detail (a print that took 11 tries, etc.) |
| 2 | **Founder one-liner** | `/index.html` founder section | "Designed and printed in [TBD]" | One sentence + city/region. |
| 3 | ~~**Real testimonials (×3)**~~ | ✅ Done 2026-05-09 — homepage testimonials section is real | — | — |
| 4 | **Shipping timing — single source of truth** | FAQ + policies + product page | Three different numbers across pages (3–5, 5–7, 7–10 days) | Pick ONE production + ONE shipping window. I'll propagate. |
| 5 | **Returns wording** | `/policies.html` | Generic | Your actual policy on misprints vs buyer's remorse. |
| 6 | **About-the-paper / about-the-canvas microcopy** | Material picker on `/index.html` | One generic line per material | 1–2 sentences each on weight, finish, why you chose it. |

---

## 2. Front + back cheat sheet (the "how this site is wired" doc)

The full version lives in **`ARCHITECTURE.md`** at the project root — open that any time you forget which env var does what or where a file lives. The 60-second version:

**Customer side** (browser → `index.html`)
- Lands on the page → `public/js/utm.js` reads any `utm_*` query params and stows them in `localStorage` for 30 days
- Picks options + types prompt → `POST /api/generate-image`
- Gemini generates → image stored in Vercel Blob → URL returned to browser
- Customer either:
  - Clicks "Order this print" → `POST /api/create-checkout-session` (single-item, with stowed UTMs)
  - **OR** clicks "Add to cart" → item lands in `window.aiprintCart` (localStorage, max 10 distinct, qty 1–10 each); when ready, "Checkout" → `POST /api/create-cart-checkout-session` (multi-line-item Stripe session)
- Stripe Checkout collects address + tax + tiered flat-rate shipping ($10 light / $15 standard / $25 heavy / $35 oversize), computed per material+size in `api/_shipping.js`. Cart shipping uses the heaviest item's tier (one box, sized for the largest piece)
- For logged-in users, cart syncs cross-device via `GET/PUT /api/cart` (JWT-auth, server-sanitized, separate "saved for later" bucket up to 30 items)

**Stripe → you**
- On `checkout.session.completed`, Stripe POSTs `/api/webhook`
- Webhook: verify signature → check idempotency (no double-insert) → insert into `orders` (with `shipping_amount`, `subtotal_amount`, `utm_*`; cart orders write one row per line item) → fire **server-side conversion events to Meta + Pinterest CAPI** (deduped vs. browser pixels via shared `event_id = purchase_${session.id}`) → fire Resend emails (customer confirmation + your fulfillment alert; cart orders get one combined email each, not N copies)
- Customer redirected to `/success.html?session_id=…`

**Fulfillment (you)**
- Open `/admin/orders.html` (password-gated by `ADMIN_PASSWORD`)
- New order shows `paid` → mark `in_production` → print → mark `shipped` + paste tracking → **shipping email auto-sends to customer**

**Marketing visibility (you)**
- `/admin/marketing.html` — orders + revenue grouped by UTM source/medium/campaign, daily revenue chart, CAC calculator
- `/admin/finances.html` — per-SKU cost vs price vs margin matrix, interactive per-order P&L calculator with ad-spend dial, supplier roll-up (Artful Printers Miami for canvas/acrylic, Shiny Prints Jupiter for metal), CSV export. Single source of truth for cost data is `api/_costs.js`.
- `/admin/security.html` — env-var posture, audit log, retention stats

**Stack at a glance**
- **Vercel** = hosting + serverless API
- **Vercel Postgres (Neon)** = users, orders, generations, credits, cart sync
- **Vercel Blob** = generated PNGs (public URLs, 1y cache)
- **Google Gemini** = text → image
- **Stripe** = checkout + payments + tax + tiered flat-rate shipping (single-item and multi-item cart flows)
- **Resend** = all transactional email (single-item + cart variants of order confirm + fulfillment alert; verification, shipping notification, credit purchase receipt)
- **PostHog** = product analytics + funnel
- **Meta Pixel + CAPI** = browser pixel ID `2679208262451729` + server-side `api/_meta-capi.js` firing from Stripe webhook on Purchase
- **Pinterest Tag + CAPI** = browser tag ID `2613756746292` + server-side `api/_pinterest-capi.js` firing from Stripe webhook on Checkout. Events wired: PageVisit, Signup, AddToCart, Checkout. Enhanced match (email) passed after login
- **Instagram (Professional account)** = `@aiprintai`, linked to `AiPrint.ai` Facebook Page via Meta Business Suite (so IG ads run through the same Ads Manager as Meta Pixel/CAPI)
- **GoDaddy** = DNS for aiprint.ai

**Env vars you must keep alive in Vercel:** `POSTGRES_URL`, `BLOB_READ_WRITE_TOKEN`, `GOOGLE_GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ORDERS_TO` (orders@), `CONTACT_TO` (info@), `ADMIN_PASSWORD`, `CRON_SECRET`, `JWT_SECRET`, `META_CAPI_ACCESS_TOKEN`, `PINTEREST_CAPI_TOKEN`, `PINTEREST_AD_ACCOUNT_ID`. (Mirror in `.env.example`. Legacy `FULFILLMENT_TO` is still honored as a fallback for `CONTACT_TO`. CAPI tokens are optional — the helpers no-op cleanly if missing.)

---

## 3. Full-sweep findings — what's still worth fixing

I did a top-to-bottom proof + UX pass. Items below are bucketed by impact, not effort.

### 🔴 HIGH — affects trust, conversion, or correctness

1. ~~**Shipping timing inconsistency** — FAQ says "3–5 days," product card says "5–7," policies page says "7–10."~~ ✅ **Resolved 2026-04-28.** Tiered flat-rate shipping ($10/$15/$25/$35 by material+size) all display "Standard shipping (3–7 business days)" — single source of truth in `api/_shipping.js`. Verify FAQ + policies copy still reads "3–7" and propagate if any page still says otherwise.
2. **Founder placeholder is visible on the live site** — The "Meet the founder" block on `/index.html` and the bio on `/about.html` are clearly placeholders. Either swap to real content or hide the section until ready.
3. **Gallery is 100% Unsplash stock** — Selling AI prints with stock photos in the gallery undermines the pitch. Even 2–3 real customer photos > 8 stock.
4. ~~**Testimonials are fictional**~~ ✅ Resolved 2026-05-09 — homepage testimonials are now real, treat as done.
5. **No customer-facing order history** — `/account.html` shows credits but not past orders. Returning customers will email you asking "where's my order?" Worth building before the first wave of repeat buyers.
6. **No public order-tracking page** — Customer who lost the email has no way to check status. A `/track?session_id=…` page (no login required) closes the loop. *(Note: `track.html` exists in the public dir — verify it's wired to a session lookup endpoint.)*

### 🟡 MEDIUM — UX polish, mostly invisible until you notice them

7. **Footer year is hardcoded `2024` on every page** — You asked for this, so leaving it. Just flagging: change it once a year or switch back to dynamic.
8. **Several pages reference `<span id="y">` that doesn't exist** (`verified.html`, `account.html`, `thank-you.html`, `success.html`, `admin/orders.html`) — silent JS error. Either add the span or remove the script tag on those pages.
9. **OG image is a placeholder** — Sharing the site link in iMessage/Slack right now shows nothing nice. (See image checklist #4.)
10. **No "Resend confirmation email" button in admin** — When (not if) a customer says "I never got the email," you currently have to re-fire it from Resend dashboard. 30-min add to the admin page.
11. **No CSV export from admin** — Once you have 50+ orders you'll want this for tax / accounting.
12. **Mobile: prompt builder gets cramped** — On 375px-wide screens the option pills wrap awkwardly. A tab/accordion pattern would breathe better.
13. **Material swatches don't show pricing delta** — User picks "metal print" without knowing it adds $X. Add the price diff inline.
14. **No "free shipping over $X" or shipping cost preview** — Sticker shock at Stripe Checkout is a real cart-abandon driver.

### 🟢 LOW — nice-to-have, deferred

15. **Trust badges** (Stripe-verified, money-back, secure-checkout) below the order button.
16. **Real Trustpilot widget** once you have ≥10 real reviews.
17. **Abandoned-preview email** — capture email when generating, nudge if they don't checkout. Needs a privacy review first.
18. **COA (certificate of authenticity)** mention or PDF on order — adds collectibility framing.
19. **Pricing comparison table** (vs. Etsy custom-art / vs. Society6) — only worth it if you want to compete on price.
20. **Accessibility pass** — color contrast on some muted text fails WCAG AA; some buttons missing `aria-label`.
21. **`/admin/orders` keyboard shortcut** to mark shipped (currently 3 clicks per order).
22. **Site-wide dark / light mode** (seedance2.ai-style moon/sun toggle). CSS custom-property theme tokens + `html[data-theme="..."]` override block + pre-paint inline script to prevent flash. Rolled across all 14 HTML pages. Deferred by operator decision — see SITE-MANUAL.md §11 "deferred" list.

### ✅ Recently shipped (so you know what NOT to retest)

**2026-05-09 — signature feature complete, account UX overhaul, schema fixes**

*Signature compositor (server-side, end-to-end)*
- 6 premium Google Fonts curated for fine-art print signatures — Allura, Great Vibes, Pinyon Script, Sacramento, Homemade Apple, Cormorant Garamond Italic — replacing the prior 5 (Playfair / Dancing Script / Arial / Cormorant / Impact). All 6 TTFs bundled in `api/fonts/`.
- Soft color palette — ivory `#F5EFE0`, charcoal `#2A2520`, champagne `#C9A35E`, pewter `#A8A39A`. Pure white/black retired (they bloom on photo art / read as marker).
- Opacity slider added (30–100%, default 100), live preview, server respects same value.
- Position padding bumped from 2.5% to 4% (cleaner gallery margin, off-edge of canvas wraps).
- `api/_signature.js` composites server-side using **opentype.js → SVG vector paths**, not @font-face data URIs (those produce tofu boxes via librsvg on Vercel — see `site-learnings.md`).
- New `orders.signed_url` column via self-heal. Webhook calls `composeSignature` after `createOrder`. Admin fulfillment email shows BOTH download links — "with signature" and "without signature (clean)".

*Account / customer UX*
- Account dropdown rewritten — premium typography, no icons, sectioned (Identity → My Stuff → Quick Actions → Sign out). Inline "+ Buy" credit-purchase shortcut in header. Open-order badge (lazy-fetched, 60s session cache) on "My Orders". Width capped to `100vw - 1rem` for mobile.
- Deep-link anchors added to `/account.html`: `#designs`, `#orders`, `#credits` with `scroll-mt-24`.
- Empty states rewritten — warmer copy, custom SVG icons, action-oriented CTAs (`/#create`).
- Login → "Continue where you left off": `showLoginModal({onSuccess})` callback re-fires the Buy click after auth so customers don't have to find the button twice.

*User-account linkage at checkout*
- Both checkout endpoints now read JWT from `Authorization` header, capture `user_id` in Stripe metadata, webhook writes `orders.user_id`. Frontend sends `Bearer <token>` on checkout fetches. Fixes Stripe-Link-vs-site-account email mismatch where orders were orphaned from the customer's account history.

*DB schema resilience*
- All 4 order read functions (`getOrderByStripeSessionId`, `getOrdersByStripeSessionId`, `getOrdersByUserId`, `getOrdersByEmail`) wrapped in `withOrderColumnHeal()`. Previously self-heal fired only from `createOrder`, leaving the webhook's idempotency check vulnerable to missing-column errors → silent webhook failures → ghost orders.
- New `api/admin/backfill-order` endpoint for recovering Stripe-charged orders whose webhook failed.

*Logistics doc + customer-facing wiring*
- Order-confirmation email now shows dynamic Friday production-start date (5 PM ET cutoff, computed from order timestamp).
- Operational rhythm + volume math documented in `INTERNAL-FULFILLMENT.md`.
- `AD-LAUNCH.md` — new runbook with UTM templates, pre-launch checklist, Day-0/Day-1/Week-1 monitoring rhythm.

*Site-wide polish*
- Standardized "7–14 business days" everywhere (was inconsistent across 8 spots).
- Removed all "hand-reviewed by founder" overclaims from meta tags + JSON-LD.
- Custom-select dropdown stacking-context fix — portal to `<body>` + `position: fixed` so script-font menus never get clipped by transformed ancestors.
- 9 more JPGs → WebP (materials, studio, illustrations); 5 orphaned WebP/JPG pairs deleted.

**2026-04-28 — multi-item cart, tiered shipping, full marketing-pixel suite**

*Cart & checkout*
- **Multi-item cart** (`public/js/cart.js`, `public/js/cart-ui.js`): localStorage-backed, max 10 distinct items, per-item quantity 1–10, snapshot prices at add-time, drawer + badge + toast UI. Public API on `window.aiprintCart`.
- **Cross-device cart sync** (`api/cart.js`, `public/js/cart-sync.js`): JWT-auth `GET/PUT /api/cart`, server sanitizes every field (string caps, qty clamp, https-only URLs, drop unknown keys). Stale token rejection — leaked tokens stop syncing after a password reset.
- **"Saved for later"** bucket: separate from cart, capped at 30 items.
- **Cart Stripe Checkout** (`api/create-cart-checkout-session.js`): multi-line-item Stripe session, one DB row per line item.
- **Cart-aware emails** (`api/_email.js`): `sendCartOrderConfirmationEmail` + `sendCartFulfillmentAlertEmail` — one combined email per cart order regardless of N items.

*Shipping*
- **Tiered flat-rate shipping** (`api/_shipping.js`): 4 tiers — light $10 / standard $15 / heavy $25 / oversize $35 — picked from material (CAN/MET/ACR) + dimensions in `lookup_key`. Acrylic heaviest, metal mid, canvas lightest. Cart shipping uses heaviest item's tier (one box). Stripe Tax handles taxable-shipping states. All tiers display 3–7 business-day estimate (single source of truth, replaces the old 3–5 / 5–7 / 7–10 inconsistency).

*Marketing pixels & CAPI*
- **Meta Pixel + Conversions API**: browser pixel `2679208262451729` already wired; server-side `api/_meta-capi.js` fires `Purchase` from Stripe webhook with SHA256-hashed PII, deduped via `event_id = purchase_${session.id}`. Env var: `META_CAPI_ACCESS_TOKEN`.
- **Pinterest Tag + Conversions API**: browser tag `2613756746292` (in `public/js/analytics.js`) firing `pagevisit`, `signup` (in `auth.js`), `addtocart` (in `index.html`), `checkout` (in `success.html`). Enhanced match passes login email via `pintrk('set', {em})`. Server-side `api/_pinterest-capi.js` mirrors the Meta CAPI pattern, fires `checkout` from the Stripe webhook with the same `event_id` so the browser+server events dedupe automatically. Env vars: `PINTEREST_CAPI_TOKEN`, `PINTEREST_AD_ACCOUNT_ID`.
- **Webhook helper renamed**: `fireMetaPurchase` → `firePurchaseCAPI` since it now fires both Meta and Pinterest server-side.

*Social presence*
- **Instagram converted to Professional account** (`@aiprintai`): category Art (hidden from profile for premium feel), Email button on profile (`info@aiPRINT.ai`), no public phone/address.
- **Instagram ↔ Facebook Page linked** via Meta Business Suite under the AiPrint business portfolio. Unlocks Instagram ads through Meta Ads Manager (same Ads Manager that owns the Pixel/CAPI), Instagram Shopping eligibility (when product catalog is built), and unified IG+FB inbox.

**2026-04-22 — visual-polish / UX pass**
- Custom-select component for font + prompt dropdowns (rendered label respects the actual font; native `<option>` styling is Firefox-only, so we overlay).
- Open dropdown lifts above the preview image (z-index stacking context escape).
- Wall-preview mockup refreshes against the new artwork when the user regenerates without closing the room section.
- Mobile-tightened hero copy ("Prompt → Generate → Print → Ship → Hang").
- Symmetric 4-tile `aspect-square` hero grid (retired the desert-canyon anchor layout).
- Hero ↔ gallery image duplicates removed — 16 unique images verified.
- Admin Revenue stat now excludes `canceled` orders.
- Palette emoji replaced with custom framed-art SVG on the Color Palette dropdown.

**Earlier shipped**
- Shipping notification email (auto-fires when admin flips to `shipped` with tracking)
- Credit purchase receipt email
- Webhook idempotency for credit purchases (was a real double-credit bug)
- Atomic credit deduction (race-safe)
- Mobile hamburger menu on `/index.html`
- SEO: OG/Twitter cards, robots.txt, sitemap.xml, JSON-LD Org schema
- Admin: search, toast notifications, ship-confirm dialog
- Section dividers on home page
- "How it works" redesign with photo-led cards

---

## 4. Suggested order of operations for you

Roughly this gives you the most lift per hour:

1. **Send me the founder portrait + bio + studio location** → unblocks the highest-impact placeholders.
2. **Pick a single shipping timeline** (one number for production, one for transit) → I propagate.
3. **First time you ship a print, photograph it in-situ** → start the real-gallery flywheel. Ask buyer for a photo too.
4. **Tell me which MEDIUM items above you want next** — order history page and "Resend confirmation email" button are both small and high-leverage.

Everything else here is mine to chip away at while you work on copy + photos.
