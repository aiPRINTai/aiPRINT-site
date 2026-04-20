# aiPRINT.ai — Project Cheat Sheet & Punch List

> Companion to `ARCHITECTURE.md` (which is the technical source of truth).
> This doc = **what you owe the site** (copy + images) and **what's still worth polishing**.
> Last edit: 2026-04-19.

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
| 3 | **Real testimonials (×3)** | `/index.html` testimonials section | 3 realistic-but-fictional placeholders | First name + last initial, city, 1–2 sentence quote, the print they bought. Photo of them with the print = gold. |
| 4 | **Shipping timing — single source of truth** | FAQ + policies + product page | Three different numbers across pages (3–5, 5–7, 7–10 days) | Pick ONE production + ONE shipping window. I'll propagate. |
| 5 | **Returns wording** | `/policies.html` | Generic | Your actual policy on misprints vs buyer's remorse. |
| 6 | **About-the-paper / about-the-canvas microcopy** | Material picker on `/index.html` | One generic line per material | 1–2 sentences each on weight, finish, why you chose it. |

---

## 2. Front + back cheat sheet (the "how this site is wired" doc)

The full version lives in **`ARCHITECTURE.md`** at the project root — open that any time you forget which env var does what or where a file lives. The 60-second version:

**Customer side** (browser → `index.html`)
- Picks options + types prompt → `POST /api/generate-image`
- Gemini generates → image stored in Vercel Blob → URL returned to browser
- Customer clicks "Order this print" → `POST /api/create-checkout-session`
- Bounced to Stripe Checkout (Stripe collects address + tax)

**Stripe → you**
- On `checkout.session.completed`, Stripe POSTs `/api/webhook`
- Webhook: verify signature → check idempotency (no double-insert) → insert into `orders` → fire two Resend emails (customer confirmation, your fulfillment alert)
- Customer redirected to `/success.html?session_id=…`

**Fulfillment (you)**
- Open `/admin/orders.html` (password-gated by `ADMIN_PASSWORD`)
- New order shows `paid` → mark `in_production` → print → mark `shipped` + paste tracking → **shipping email auto-sends to customer**

**Stack at a glance**
- **Vercel** = hosting + serverless API
- **Vercel Postgres (Neon)** = users, orders, generations, credits
- **Vercel Blob** = generated PNGs (public URLs, 1y cache)
- **Google Gemini** = text → image
- **Stripe** = checkout + payments + tax
- **Resend** = all transactional email (5 templates: verification, order confirm, fulfillment alert, shipping notification, credit purchase receipt)
- **PostHog** = product analytics
- **GoDaddy** = DNS for aiprint.ai

**Env vars you must keep alive in Vercel:** `POSTGRES_URL`, `BLOB_READ_WRITE_TOKEN`, `GOOGLE_GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `FULFILLMENT_TO`, `ADMIN_PASSWORD`, `JWT_SECRET`. (Mirror in `.env.example`.)

---

## 3. Full-sweep findings — what's still worth fixing

I did a top-to-bottom proof + UX pass. Items below are bucketed by impact, not effort.

### 🔴 HIGH — affects trust, conversion, or correctness

1. **Shipping timing inconsistency** — FAQ says "3–5 days," product card says "5–7," policies page says "7–10." Pick one and I'll standardize.
2. **Founder placeholder is visible on the live site** — The "Meet the founder" block on `/index.html` and the bio on `/about.html` are clearly placeholders. Either swap to real content or hide the section until ready.
3. **Gallery is 100% Unsplash stock** — Selling AI prints with stock photos in the gallery undermines the pitch. Even 2–3 real customer photos > 8 stock.
4. **Testimonials are fictional** — Same trust issue. Once you have one real buyer, even one quote is better than three fake ones. (Or hide the section until you have real ones.)
5. **No customer-facing order history** — `/account.html` shows credits but not past orders. Returning customers will email you asking "where's my order?" Worth building before the first wave of repeat buyers.
6. **No public order-tracking page** — Customer who lost the email has no way to check status. A `/track?session_id=…` page (no login required) closes the loop.

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

### ✅ Recently shipped (so you know what NOT to retest)

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
