# aiPRINT.ai — Site Operator Manual

> **What this is.** Single-source operator manual for the aiPRINT.ai website.
> Covers what the site does, how every moving part fits together, how each
> integration works, where mail lands, and what to do when something breaks.
>
> **How to use.** Skim §1 once to get the mental model. Jump to §2 for
> diagrams. Use §3–§8 as reference when you're actively working on the site.
> §9 is the "something is on fire" section.
>
> **Keep in sync with Google Drive.** This file is the source of truth. When
> you upload to Drive, paste the URL back into §0.2 of this file so everyone
> knows which copy is authoritative.
>
> **Related docs (all at project root):**
> - `ARCHITECTURE.md` — technical deep-dive for developers
> - `OPERATIONS.md` — secret rotation runbook + incident response
> - `PROJECT-CHEATSHEET.md` — copy/image punch list + open UX work
> - `DEPLOYMENT_CHECKLIST.md` — pre-deploy gate
> - `LAUNCH-CHECKLIST.md` — go-live verification
> - `CREDITS_SETUP.md` — credit-system reference
> - `README.md` — one-paragraph summary for strangers

---

## 0. Meta

### 0.1 Versioning

| Field | Value |
|---|---|
| Doc version | 1.0 |
| Last edit | 2026-04-21 |
| Source repo | `github.com/aiPRINTai/aiPRINT-site` |
| Primary maintainer | Lawrence |

### 0.2 Copies of this doc

| Location | Purpose | URL |
|---|---|---|
| Git repo (canonical) | `/SITE-MANUAL.md` | `github.com/aiPRINTai/aiPRINT-site/blob/main/SITE-MANUAL.md` |
| Google Drive | Shareable operator copy | _(paste link after uploading)_ |
| Local laptop | Working copy | `~/Claude COWORK/AIPrint - Claude/aiPRINT-site/SITE-MANUAL.md` |

---

## 1. What aiPRINT.ai is, in one paragraph

aiPRINT.ai is a direct-to-consumer print shop where customers describe a
piece of art in words, an AI generates it on the spot, the customer picks a
finish and size, pays, and we ship them a framed / mounted print. The whole
"design-to-order" loop happens in a single browser session on the home page
— no signup required to generate a preview. The business exists inside one
Vercel project, one Neon Postgres database, and a handful of third-party
services glued together by ~20 serverless functions.

**Customer's experience:** type a prompt → see an image → pick a finish + size
→ checkout → receive an email → 3–7 business days later a print shows up.

**Operator's experience:** email alerts you a new order dropped → open
`/admin/orders.html` → the image + shipping address + finish is waiting →
send to the printer → mark `shipped` + paste tracking → done.

---

## 2. Visual architecture

### 2.1 The whole system on one page

```
                          ┌─────────────────────────────────────────┐
                          │            aiprint.ai (Vercel)          │
                          │                                         │
                          │   Frontend (HTML + Tailwind CDN)        │
                          │   Backend (Node.js serverless fns)      │
                          └───┬───────────────────────────────┬─────┘
                              │                               │
        ┌─────────────────────┼───────────────────────────────┼──────────────────────┐
        │                     │                               │                      │
        ▼                     ▼                               ▼                      ▼
 ┌─────────────┐     ┌───────────────┐            ┌─────────────────┐      ┌─────────────┐
 │   Google    │     │  Neon /       │            │     Stripe      │      │   Resend    │
 │   Gemini    │     │  Vercel       │            │   (checkout +   │      │  (email)    │
 │ (img gen)   │     │  Postgres     │            │    webhooks)    │      │             │
 └─────────────┘     └───────────────┘            └─────────────────┘      └──────┬──────┘
        │                     ▲                           │                      │
        ▼                     │                           ▼                      │
 ┌─────────────┐              │                    ┌─────────────┐                │
 │   Vercel    │              │                    │    You      │                │
 │    Blob     │──────────────┘                    │ (admin page │                │
 │  (images)   │                                   │  + printer) │                │
 └─────────────┘                                   └─────────────┘                │
                                                                                  │
                                                           ┌──────────────────────┤
                                                           ▼                      ▼
                                                  orders@aiprint.ai      info@aiprint.ai
                                                  (fulfillment)          (support / contact)
```

### 2.2 The customer journey, step-by-step

```
 ┌─── BROWSER ───────────────────────────────────────────────────────────────┐
 │                                                                           │
 │  [1] Lands on aiprint.ai/                                                 │
 │       │                                                                   │
 │       ▼                                                                   │
 │  [2] Types prompt + picks style/mood/medium                               │
 │       │                                                                   │
 │       ▼                                                                   │
 │  [3] Clicks "Generate"   ──▶  POST /api/generate-image                    │
 │       │                            │                                      │
 │       │                            ▼                                      │
 │       │                       Gemini (image gen)                          │
 │       │                            │                                      │
 │       │                            ▼                                      │
 │       │                       Vercel Blob (stores PNG)                    │
 │       │                            │                                      │
 │       │                        returns preview URL                        │
 │       │◀───────────────────────────┘                                      │
 │       ▼                                                                   │
 │  [4] Sees watermarked preview, picks finish + size                        │
 │       │                                                                   │
 │       ▼                                                                   │
 │  [5] Clicks "Order this print"  ──▶  POST /api/create-checkout-session    │
 │       │                                    │                              │
 │       │                                    ▼                              │
 │       │                          Stripe Checkout session (with metadata)  │
 │       │                                    │                              │
 │       ▼                                    ▼                              │
 │  [6] Redirected to Stripe's hosted checkout page                          │
 │       │                                                                   │
 │       │  (Stripe collects email, shipping address, payment, tax)          │
 │       │                                                                   │
 │       ▼                                                                   │
 │  [7] Pays ─────────────────────────────┐                                  │
 │                                         │                                 │
 └─────────────────────────────────────────┼─────────────────────────────────┘
                                           │
                                           ▼
                                ┌──────────────────────┐
                                │  Stripe → webhook    │
                                │  /api/webhook        │
                                └──────────┬───────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
  ┌──────────────┐                ┌─────────────────┐              ┌─────────────────┐
  │ Neon Postgres│                │ Resend → you    │              │ Resend → customer│
  │ INSERT orders│                │ "🖨 New order"  │              │ "Order confirmed"│
  └──────────────┘                │ to: orders@     │              │ to: customer     │
                                  └─────────────────┘              │ replyto: orders@ │
                                                                   └────────┬─────────┘
                                                                            │
                                                                            ▼
                                                             [8] Customer lands on
                                                                 /success.html
                                                                 (order details +
                                                                  in-room mockup)
```

### 2.3 The fulfillment loop (you)

```
     ┌──── You get "🖨 New order" email at orders@aiprint.ai
     │
     ▼
 ┌──────────────────────┐
 │ Open /admin/orders   │
 │ (Bearer: ADMIN_PW)   │
 └──────────┬───────────┘
            │  see order: image, address, finish, prompt
            ▼
 ┌──────────────────────┐
 │ Flip status:         │
 │ paid → in_production │
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ Send print master to │
 │ printer (Blob URL)   │
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ Print & pack         │
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ In admin: paste      │
 │ tracking # + carrier │
 │ flip to "shipped"    │
 └──────────┬───────────┘
            │
            ▼  Webhook in admin/orders.js auto-fires:
            │
 ┌──────────────────────┐
 │ Resend → customer    │
 │ "Your aiPRINT just   │
 │  shipped 📦"         │
 │ replyto: orders@     │
 └──────────────────────┘
```

---

## 3. Tech stack & integrations

### 3.1 Inventory

| # | Service | Role | Dashboard | Env vars |
|---|---|---|---|---|
| 1 | **Vercel** | Hosting + serverless functions | vercel.com | _deploy config_ |
| 2 | **Neon Postgres** (via Vercel) | Users, orders, generations, credits, audit log | Vercel → Storage → Postgres | `POSTGRES_*` (auto) |
| 3 | **Vercel Blob** | Generated PNGs (public URLs, 1y cache) | Vercel → Storage → Blob | `BLOB_READ_WRITE_TOKEN` |
| 4 | **Google Gemini** | Text → image generation | aistudio.google.com | `GOOGLE_GEMINI_API_KEY` |
| 5 | **Stripe** | Checkout, payments, tax, address collection | dashboard.stripe.com | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| 6 | **Resend** | Transactional email (HTTP API) | resend.com | `RESEND_API_KEY`, `EMAIL_FROM`, `ORDERS_TO`, `CONTACT_TO` |
| 7 | **GoDaddy** | DNS for aiprint.ai | godaddy.com | — |
| 8 | **PostHog** | Product analytics, funnels | us.posthog.com | public key in `/js/analytics.js` |
| 9 | **GitHub** | Source control + CI deploy trigger | github.com/aiPRINTai/aiPRINT-site | (repo secrets) |

### 3.2 What each service does (one line each)

- **Vercel** serves every HTML page and every function in `api/`. A `git push` to `main` triggers a build and is live ~45s later.
- **Neon Postgres** is the only stateful system. If Neon is down, the site still generates previews (they're stateless), but checkout/orders fail.
- **Vercel Blob** stores every generated PNG. URLs are public + long-cached. No deletion job — expect storage to grow slowly.
- **Gemini** is the brain. Used in exactly one function: `api/generate-image.js`.
- **Stripe** collects money, shipping address, and sales tax. We never see card numbers.
- **Resend** sends all transactional email. All templates live in `api/_email.js`.
- **GoDaddy** just points `aiprint.ai` at Vercel. DNS changes rarely.
- **PostHog** tracks funnels (home → generate → checkout → success). Public key, not a secret.
- **GitHub** is source of truth for code and the deploy trigger for Vercel.

---

## 4. Email — mail routing (the new thing)

### 4.1 Two inboxes, clearly separated

```
                         ┌──────────────────────────┐
                         │     aiprint.ai domain    │
                         └────────────┬─────────────┘
                                      │
                ┌─────────────────────┴──────────────────────┐
                ▼                                            ▼
       ┌──────────────────┐                         ┌──────────────────┐
       │ orders@          │                         │ info@            │
       │ aiprint.ai       │                         │ aiprint.ai       │
       │ (fulfillment)    │                         │ (support/general)│
       └──────────────────┘                         └──────────────────┘
                ▲                                            ▲
     "anything to do with an order"             "anything else customers need"
```

### 4.2 Routing matrix — which mail goes where

```
╔═══════════════════════════════════╦══════════════╦═══════════════╗
║ Mail type                         ║ lands at     ║ reply-to      ║
╠═══════════════════════════════════╬══════════════╬═══════════════╣
║ 🖨 New order fulfillment alert    ║ orders@      ║ (customer)    ║
║ ✅ Order confirmation (customer)  ║ (customer)   ║ orders@       ║
║ 📦 Shipping notification          ║ (customer)   ║ orders@       ║
║ ⚡ Credit purchase receipt        ║ (customer)   ║ orders@       ║
║ ───────────────────────────────── ║ ──────────── ║ ───────────── ║
║ 📨 Contact form submission        ║ info@        ║ (submitter)   ║
║ 👋 Email verification (customer)  ║ (customer)   ║ info@         ║
║ 🔐 Password reset (customer)      ║ (customer)   ║ info@         ║
╚═══════════════════════════════════╩══════════════╩═══════════════╝
```

**Rule of thumb:** anything about a *purchase* flows through **orders@**.
Anything about an *account or general inquiry* flows through **info@**.

### 4.3 Why split mail at all

Two reasons:
1. **Focus.** Order questions ("where's my print?") don't get buried under
   support questions ("do you do bulk?"). Each inbox has one job.
2. **Future-proofing.** As we grow we'll add more mailboxes
   (`returns@`, `press@`, `wholesale@`). The routing pattern already
   supports it — add an env var, wire it into `api/_email.js`, done.

### 4.4 How it's wired in code

```
┌─────────────────────── api/_email.js ───────────────────────┐
│                                                             │
│   function ordersTo()  →  process.env.ORDERS_TO             │
│                           || "orders@aiprint.ai"            │
│                                                             │
│   function contactTo() →  process.env.CONTACT_TO            │
│                           || process.env.FULFILLMENT_TO     │  ← legacy alias
│                           || "info@aiprint.ai"              │
│                                                             │
│   sendOrderConfirmationEmail()   → replyTo: ordersTo()      │
│   sendShippingNotificationEmail()→ replyTo: ordersTo()      │
│   sendCreditPurchaseEmail()      → replyTo: ordersTo()      │
│   sendFulfillmentAlertEmail()    → to:      ordersTo()      │
│                                                             │
│   sendContactFormEmail()         → to:      contactTo()     │
│   sendVerificationEmail()        → replyTo: contactTo()     │
│   sendPasswordResetEmail()       → replyTo: contactTo()     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 Adding a new mailbox (future playbook)

Say you spin up `returns@aiprint.ai`. Five steps:

1. **Create the mailbox** with your domain email provider (same place you made
   orders@). Verify it receives mail.
2. **Verify the sender** in Resend → Domains if you want to *send from* it.
   (If you only want to *receive*, skip this.)
3. **Add an env var** in Vercel → Settings → Environment Variables:
   `RETURNS_TO=returns@aiprint.ai`.
4. **Wire a helper** in `api/_email.js` next to the existing ones:
   ```js
   export function returnsTo() {
     return process.env.RETURNS_TO || 'returns@aiprint.ai';
   }
   ```
5. **Use it** — point the relevant message types (e.g. a future refund-issued
   email) at `replyTo: returnsTo()`.

Redeploy. Verify with `/api/admin/email-test` — its JSON response includes a
`routing:` block that shows exactly where each mail kind lands.

### 4.6 Verifying routing is live

Any time you change mail config, smoke-test with this single URL:

```
GET https://aiprint.ai/api/admin/email-test?to=you@example.com
Header: Authorization: Bearer <ADMIN_PASSWORD>
```

Response includes:
- Which env vars are set / unset
- The effective values for ORDERS_TO and CONTACT_TO
- A `routing:` block — one line per mail kind → where it lands
- A real test email sent to `you@example.com` so you know delivery works

---

## 5. Features on the site (the add-ons)

### 5.1 Public pages

| Path | Purpose |
|---|---|
| `/` | The app. Prompt builder → image generation → finish picker → order button. |
| `/success.html` | Post-purchase confirmation + in-room mockup. |
| `/account.html` | Logged-in user — credit balance, profile basics. |
| `/reset-password.html` | Password reset flow (from email link). |
| `/verified.html` | Email-verification landing. |
| `/contact.html` | Contact form (lands at info@). |
| `/track.html` | Public order tracking (lookup by Stripe session ID). |
| `/about.html` | Founder + studio story. |
| `/faq.html` | FAQ. |
| `/policies.html` | Shipping, returns, privacy. |
| `/thank-you.html` | Post-contact-form landing. |
| `/coa.html` | Certificate of Authenticity viewer. |
| `/checklist.html` | Internal pre-launch checklist (should probably be gated). |
| `/404.html`, `/500.html` | Error pages. |

### 5.2 Admin pages (password-gated with `ADMIN_PASSWORD`)

| Path | Purpose |
|---|---|
| `/admin/` | Admin home (login gate). |
| `/admin/orders.html` | List orders, flip status, paste tracking, resend emails, refresh Stripe shipping. |
| `/admin/users.html` | List users, grant/deduct credits, resend verification, view per-user audit log. |

### 5.3 Backend functions (`api/`)

**Public customer-facing**
- `generate-image.js` — prompt → Gemini → Blob → URL
- `save-preview.js`, `get-preview.js` — preview persistence across reloads
- `create-checkout-session.js` — hand off to Stripe
- `session.js` — reads Stripe session for success page
- `webhook.js` — Stripe → Postgres → emails (the critical path)
- `track.js` — public order lookup
- `coa.js` — Certificate of Authenticity generation
- `contact.js` — contact form submission

**Auth (`api/auth/`)**
- `signup.js`, `login.js`, `logout.js`
- `me.js` — "who am I"
- `verify.js` — email verification
- `resend-verification.js`
- `forgot-password.js`, `reset-password.js`
- `utils.js` — JWT helpers, hash, getClientIp

**Credits (`api/credits/`)**
- `purchase.js` — buy credits via Stripe

**User data (`api/user/`)**
- User-scoped endpoints (profile reads, etc.)

**Admin (`api/admin/`, all Bearer-gated)**
- `orders.js`, `orders-export.js`
- `users.js`, `users-export.js`
- `email-test.js` — mail routing diagnostic

**Internal helpers**
- `_email.js` — Resend templates + `ordersTo()` / `contactTo()`
- `_stripe.js` — Stripe SDK init
- `_util.js` — rawBody for webhooks, shared helpers
- `_watermark.js` — server-side watermarking for previews
- `db/index.js` — all Postgres queries
- `db/schema.sql` — schema (reference; runtime uses self-heal)

### 5.4 Add-ons / extras already wired

| Feature | Where it lives | Notes |
|---|---|---|
| **Credit system** | `api/credits/*`, `users.credit_balance` col | Atomic deduction (race-safe). Purchase webhook is idempotent. |
| **Admin audit log** | `admin_actions` table, `logAdminAction()` in `api/db/index.js` | Every sensitive admin action logs actor IP + details. |
| **Watermarked previews** | `api/_watermark.js` | Customers see watermarked; paid customers + admin see clean. |
| **COA (Certificate of Authenticity)** | `api/coa.js`, `/coa.html` | Numbered certificate per print. |
| **Public order tracking** | `/track.html` + `api/track.js` | Lookup by Stripe session ID — no login needed. |
| **Pre-commit secret scanner** | `.githooks/pre-commit` | Blocks env files + Stripe/GH/Gemini/AWS secret prefixes on staged diffs. |
| **JWT fail-closed** | `api/auth/utils.js` | Refuses to sign/verify if JWT_SECRET missing, placeholder, or <32 chars. |
| **SEO** | OG tags + Twitter cards on every page, `robots.txt`, `sitemap.xml`, JSON-LD org schema | |
| **PostHog funnels** | `public/js/analytics.js` | Page loads + key events (generate, checkout, purchase). |
| **Rate limiting** | Contact form (3/hr/IP), generate (anonymous_generations table) | Lightweight; leans on self-heal tables. |

---

## 6. Data model

### 6.1 Tables

| Table | Rows per | What it stores |
|---|---|---|
| `users` | user | email, password hash, credit_balance, verified, reset_token |
| `credit_transactions` | purchase / spend | ledger of every ± to a user's credit balance |
| `generations` | image gen | prompt, URL, options, user_id |
| `anonymous_generations` | image gen (logged-out) | IP-based generation log for rate limit |
| `orders` | Stripe checkout.session.completed | full order snapshot |
| `contact_submissions` | contact form submit | IP + email for rate limit |
| `admin_actions` | admin mutation | audit log of sensitive admin actions |

### 6.2 Orders table (the big one)

Columns on `orders`:

```
id, stripe_session_id (UNIQUE), user_id, customer_email, customer_name,
shipping_address (JSONB), lookup_key, preview_url, clean_url, prompt,
options (JSONB), amount_total, tax_amount, currency,
status, tracking_number, carrier, admin_notes,
updated_at, created_at
```

**Status lifecycle:**

```
 ┌─────────┐       ┌──────────────┐       ┌──────────┐       ┌─────────────┐
 │  paid   │──────▶│in_production │──────▶│ shipped  │──────▶│  delivered  │
 └─────────┘       └──────────────┘       └──────────┘       └─────────────┘
      │                                        │
      │                                        │  (auto-fires shipping email
      ▼                                        │   when a tracking # is set)
 ┌─────────┐                                   │
 │canceled │                                   │
 └─────────┘                                   ▼
                                       (customer receives
                                        "📦 your print shipped")
```

### 6.3 Self-heal schema

Most tables create themselves on first use from `api/db/index.js`. When you
add a new column or table, add a matching `ensureX()` function there and
call it before the first query. That keeps live deploys from 500-ing when
the schema gets ahead of production Neon. `api/db/schema.sql` is a
reference file — **NOT** auto-run on deploy.

---

## 7. Environment variables — full reference

### 7.1 Grouped by domain

```
┌─ PAYMENTS ──────────────────────────────────────────────────────────┐
│ STRIPE_SECRET_KEY              sk_live_... from Stripe dashboard    │
│ STRIPE_WEBHOOK_SECRET          whsec_...  from webhook endpoint     │
└─────────────────────────────────────────────────────────────────────┘
┌─ AI / STORAGE ──────────────────────────────────────────────────────┐
│ GOOGLE_GEMINI_API_KEY          AIza...    from aistudio.google.com  │
│ BLOB_READ_WRITE_TOKEN          vercel_blob_rw_... auto from Vercel  │
└─────────────────────────────────────────────────────────────────────┘
┌─ EMAIL ─────────────────────────────────────────────────────────────┐
│ RESEND_API_KEY                 re_...     from resend.com           │
│ EMAIL_FROM                     "aiPRINT <orders@aiprint.ai>"        │
│ ORDERS_TO                      orders@aiprint.ai  (fulfillment)     │
│ CONTACT_TO                     info@aiprint.ai    (support)         │
│ FULFILLMENT_TO                 [LEGACY] falls back to CONTACT_TO    │
└─────────────────────────────────────────────────────────────────────┘
┌─ AUTH ──────────────────────────────────────────────────────────────┐
│ JWT_SECRET                     openssl rand -base64 48 (≥32 chars)  │
│ ADMIN_PASSWORD                 openssl rand -base64 32              │
└─────────────────────────────────────────────────────────────────────┘
┌─ DATABASE ──────────────────────────────────────────────────────────┐
│ POSTGRES_URL                   auto-set by Neon integration         │
│ POSTGRES_PRISMA_URL, etc.      auto-set                             │
└─────────────────────────────────────────────────────────────────────┘
┌─ SITE CONFIG ───────────────────────────────────────────────────────┐
│ CLIENT_URL                     https://aiprint.ai                    │
│ PORT                           3000 (local dev only)                │
│ DEBUG_LOGS                     (optional, truthy = verbose logs)    │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Can this go missing and what happens?

| Var | If missing | Impact |
|---|---|---|
| `STRIPE_SECRET_KEY` | Checkout 500s | Blocks all orders |
| `STRIPE_WEBHOOK_SECRET` | Webhook 400s (sig fail) | Orders paid but not saved |
| `GOOGLE_GEMINI_API_KEY` | Image gen 500s | Site is a brochure |
| `BLOB_READ_WRITE_TOKEN` | Image save fails | Previews can't persist |
| `RESEND_API_KEY` | Emails silently skip (log warning) | Orders save, no customer mail |
| `JWT_SECRET` | Login throws | Auth totally broken (fail-closed) |
| `ADMIN_PASSWORD` | Admin APIs return 401 | Can't access dashboard |
| `POSTGRES_URL` | Every DB query 500s | Orders, accounts, credits all down |
| `ORDERS_TO` | Defaults to orders@aiprint.ai | None — works out of the box |
| `CONTACT_TO` | Defaults to info@aiprint.ai (via FULFILLMENT_TO if set) | None — works out of the box |

---

## 8. Operational playbooks

### 8.1 Deploying

```
Local code change          Code is live
     │                           ▲
     │                           │
     │                           │
     ▼                           │
 git push origin main ──▶ Vercel builds ──▶ ~45s later
```

**Roll back:** Vercel → Deployments → prior successful deploy → "…" → Promote to Production. Instant.

**Env var change:** **Does NOT redeploy.** After saving vars, manually redeploy the latest prod deployment.

### 8.2 Daily ops (the loop)

```
  Morning        Every few hrs        End of day
 ────────────   ──────────────────   ─────────────
  check orders@  process new orders   mark shipped
  for alerts     (admin dashboard)    + tracking #
```

### 8.3 Adding a new product (size/finish)

```
   Stripe dashboard                    Repo
  ───────────────────                ─────────────────
  Create product                     Edit products.json:
   with a unique lookup_key           add an entry that
   (e.g. ACR-20x30-PT)                references that
       │                               lookup_key
       │                                   │
       └────────────── match ──────────────┘
                         │
                         ▼
                  git commit + push
                         │
                         ▼
                  live in ~45 seconds
```

### 8.4 Adding a new mailbox

See §4.5. Three touch-points: email provider → Resend (if sending from it)
→ `api/_email.js` helper + env var.

---

## 9. When something breaks

### 9.1 Triage order

```
 Is the site up?         ─── no ──▶  Vercel status; check deploy logs
      │ yes
      ▼
 Can users generate?     ─── no ──▶  Gemini quota; BLOB_READ_WRITE_TOKEN;
      │ yes                          check api/generate-image logs
      ▼
 Can users checkout?     ─── no ──▶  STRIPE_SECRET_KEY; check Stripe events
      │ yes
      ▼
 Are webhooks landing?   ─── no ──▶  STRIPE_WEBHOOK_SECRET; Stripe webhooks
      │ yes                          page → recent deliveries → resend
      ▼
 Are emails sending?     ─── no ──▶  /api/admin/email-test; check Resend
      │ yes                          dashboard for blocked domain
      ▼
 Is admin dashboard      ─── no ──▶  ADMIN_PASSWORD; JWT_SECRET; check
 accessible?                         Vercel → Runtime Logs
      │ yes
      ▼
 File an "intermittent"
 note and keep watching
```

### 9.2 Specific scenarios

| Symptom | First thing to check | Second thing |
|---|---|---|
| Customer: "I paid but got nothing" | Stripe → Payments → find session → is there an order in Neon? | Webhook delivery log in Stripe |
| Customer: "I never got the email" | Resend dashboard → find by recipient → did it bounce? | Resend a confirmation from `/admin/orders.html` |
| Admin: "Login wrong" | `ADMIN_PASSWORD` env var set? | Is there a trailing space / newline in Vercel? |
| Image generation fails | Gemini quota at aistudio.google.com | Runtime logs for specific error |
| Webhook "signature verification failed" | `STRIPE_WEBHOOK_SECRET` is stale | Roll in Stripe → paste → redeploy |
| Contact form "couldn't send" | Is Resend domain still verified? | Did `CONTACT_TO` change to an unverified addr? |
| Order missing shipping address | Refresh from Stripe: admin → order → "Refresh shipping from Stripe" | Check Stripe → session had address collection on |
| 500s across the board after deploy | Roll back (§8.1) | Then investigate — don't debug live |

### 9.3 Escalation

1. **Read** the runtime logs (Vercel → Deployments → latest → Function Logs).
2. **Reproduce** against the failing endpoint with a test payload.
3. **Isolate** — which integration is failing? Use `/api/admin/email-test`
   as the template pattern: build a diagnostic endpoint per service.
4. **Roll back** if a deploy broke something and you can't fix in ≤10 min.
5. **Post-mortem** in the team log: what happened, what we did, what to
   prevent next time.

---

## 10. Security

### 10.1 Boundaries

```
Customer browser
     │
     │   Never trusted. All input validated server-side.
     ▼
Vercel edge
     │
     │   TLS terminates here. Functions run in Vercel's isolated node envs.
     ▼
Serverless function
     │   Has access to ALL env vars — treat each function like a service
     │   account. Never log secrets. Never echo env vars in responses.
     ▼
Integrations (Stripe, Gemini, Resend, Neon, Blob)
     │
     │   Each is one rotatable credential away from the blast radius.
     │
     ▼  See OPERATIONS.md §1 for rotation order + per-provider steps.
```

### 10.2 What we do right

- **Pre-commit secret scanner** blocks env files and known secret prefixes on
  every commit before it lands in git history.
- **JWT fail-closed.** Missing / weak `JWT_SECRET` refuses to sign or verify
  tokens — better than silent forgery.
- **Admin audit log.** Every grant-credits, deduct, resend, order mutation
  logs actor IP + details. Survives admin password rotation.
- **Webhook signature verification.** All Stripe webhooks verify before
  doing DB writes.
- **Idempotency** on webhook. Stripe retries can't double-insert orders or
  double-credit accounts.
- **Atomic credit deduction** (`UPDATE ... WHERE balance >= 1`). Race-safe.
- **HTTP-only auth cookies** with `Secure; SameSite=Strict`.
- **bcrypt password hashing** with per-password salt.
- **Rate limiting** on contact form (3/hr/IP) and generation.

### 10.3 What's still on the "future" list

- No 2FA on admin. Single password.
- No IP allowlist on admin. Any IP with the password gets in.
- No automated secret scanning on GitHub (beyond our pre-commit). Consider
  GitHub secret scanning + push protection.
- No per-user rate limit on generation (only per-IP on anonymous). Logged-in
  abuse currently only capped by credit balance.

---

## 11. Appendix — where to look for what

| Need | Open |
|---|---|
| "What's the env var for X?" | This doc §7 or `.env.example` |
| "How does the webhook work?" | `api/webhook.js` + `ARCHITECTURE.md` §5 |
| "Where's the email template?" | `api/_email.js` |
| "How do I rotate a secret?" | `OPERATIONS.md` §1 |
| "What's in the copy / image punch list?" | `PROJECT-CHEATSHEET.md` §1 |
| "What should I check before going live?" | `LAUNCH-CHECKLIST.md` |
| "How does credit purchase work?" | `CREDITS_SETUP.md` |
| "Database columns?" | `api/db/schema.sql` |
| "Where do I verify mail routing is correct?" | `GET /api/admin/email-test?to=...` |

---

*End of manual. If you change the site and this doc doesn't also change, the
doc is wrong — update it in the same commit.*
