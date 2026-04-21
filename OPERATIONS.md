# aiPRINT — Operations Runbook

Day-2 operations for the aiPRINT site. If a secret leaks, a deploy breaks, or
you need to know "what is this env var for," start here.

---

## 1. Secret rotation

### 1.1 When to rotate
Rotate **immediately** if any of the following is true:
- A key appears in a public git commit, Slack message, issue, screenshot, or log line.
- A contractor, former employee, or third party had access and no longer should.
- You see unexpected API usage or charges.
- A quarterly rotation is due (put this on the calendar for Jan 1 / Apr 1 / Jul 1 / Oct 1).

Treat "might have leaked" as "did leak." The cost of rotating a key you didn't need to is
15 minutes. The cost of not rotating a key you should have is unbounded.

### 1.2 Rotation order
Rotate in this order so the site never serves with a mix of old and new keys:
1. Generate the new value in the provider dashboard (do NOT revoke the old one yet).
2. Paste into Vercel → Project → Settings → Environment Variables (Production +
   Preview + Development). Save.
3. Redeploy: Vercel → Deployments → latest production → "…" → **Redeploy**.
4. Smoke test (see §1.4).
5. Revoke / delete the OLD key in the provider dashboard.
6. Note the rotation in the team log (date, what rotated, why).

### 1.3 Per-provider rotation steps

| Env var | Provider | Where to rotate | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe | Dashboard → Developers → API keys → "Roll key" | Rotate live + test separately. |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Developers → Webhooks → endpoint → "Roll secret" | Webhook will fail until Vercel is updated — redeploy promptly. |
| `GOOGLE_GEMINI_API_KEY` | Google AI Studio | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → delete + create new | Check IP/referrer restrictions. |
| `RESEND_API_KEY` | Resend | [resend.com/api-keys](https://resend.com/api-keys) → revoke + create | Scope to "Send access" only. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | Vercel → Storage → Blob → Settings → "Regenerate" | Existing URLs keep working; only new writes need the new token. |
| `JWT_SECRET` | (self-generated) | `openssl rand -base64 48` locally | **Rotating invalidates every active session.** All users will have to log in again. |
| `ADMIN_PASSWORD` | (self-generated) | `openssl rand -base64 32` locally | Only you know this. No "forgot password" flow — store in password manager. |
| `POSTGRES_*` | Neon / Vercel Postgres | Neon console → Roles → reset password, or Vercel → Storage → reset | Vercel auto-refreshes its own vars; manual reset needs Vercel redeploy. |

### 1.4 Smoke test after rotation
After every rotation, verify:
- [ ] `GET https://aiprint.ai/` loads (no 500).
- [ ] `POST /api/contact` — submit the public contact form; confirm the email arrives.
- [ ] `POST /api/auth/login` — log into an account; confirm cookie is set.
- [ ] `POST /api/create-checkout-session` — start a Stripe checkout; do not complete.
- [ ] `POST /api/generate-image` (if you rotated Gemini) — generate one image.
- [ ] Admin dashboard — log in at `/admin/` with `ADMIN_PASSWORD`; orders list loads.

If anything fails, check Vercel → Deployments → runtime logs for the specific error.

---

## 2. Deploying

Production deploys are automatic: push to `main` → Vercel builds → live in ~45s.

```bash
git push origin main
```

### 2.1 Rolling back
Vercel → Deployments → pick a previous successful deployment → "…" → **Promote to Production**.
Instant. No rebuild.

### 2.2 Environment variables only
Changing env vars does NOT trigger a redeploy. After saving, go to the latest production
deployment and hit **Redeploy** — otherwise the running instance keeps the old values.

### 2.3 Pre-commit guard
The repo ships a pre-commit secret scanner at `.githooks/pre-commit`. Install it once per clone:
```bash
./scripts/install-hooks.sh
```
It blocks (a) env files by name, (b) known secret prefixes in added lines
(`sk_live_`, `ghp_`, `AIza`, AWS keys, Postgres URLs with passwords, PEM private keys, etc.),
and (c) the JWT placeholder string. Bypass with `git commit --no-verify` **only** if you're
certain the hit is a false positive (e.g. documentation showing a prefix).

---

## 3. Admin dashboard

URL: `https://aiprint.ai/admin/` — Bearer token is `ADMIN_PASSWORD`.

### 3.1 Capabilities
- **Orders** (`/admin/orders.html`): list, filter by status, update status/tracking,
  resend confirmation or shipping email, refresh shipping address from Stripe.
- **Users** (`/admin/users.html`): list, grant credits, deduct credits, resend
  verification email, view per-user audit log.
- **Audit log** (`/admin/users.html` with audit toggle, or `GET /api/admin/users?audit=1`):
  every sensitive admin action is recorded with actor IP, target, timestamp, and details.

### 3.2 What gets logged
Any of these admin actions writes a row to `admin_actions`:
- `grant_credits`, `deduct_credits`, `resend_verification` (from `/api/admin/users`)
- `resend_order_confirmation`, `resend_shipping_notification`,
  `refresh_shipping_from_stripe`, `update_order` (from `/api/admin/orders`)

Read-only GETs are not logged. If you need to audit reads, add logging to the
handlers in `api/admin/users.js` / `api/admin/orders.js`.

### 3.3 Reviewing the audit log
- In the UI: open a user's detail view — the audit block shows that user's actions.
- Via API: `GET /api/admin/users?audit=1&limit=100` → last 100 actions across all users.
- Via SQL (Neon console): `SELECT * FROM admin_actions ORDER BY created_at DESC LIMIT 100;`

---

## 4. Database

- Provider: Neon Postgres (attached via Vercel → Storage).
- Schema: `api/db/schema.sql` (reference only — NOT auto-run on deploy).
- Self-heal: most tables/columns are created lazily on first use from
  `api/db/index.js`. If you add a new table or column, add an `ensureX()`
  function there and call it from the code that reads/writes it. This keeps
  live deploys from 500-ing when the schema gets ahead of the database.

### 4.1 Backups
Neon keeps point-in-time recovery (PITR) automatically on paid tiers.
**Test restoration quarterly** — an untested backup is not a backup:
1. Neon console → Branches → "Create branch" → pick a point in time 1 hour ago.
2. Connect to the branch, run `SELECT COUNT(*) FROM orders;` — should match recent count.
3. Delete the branch.

### 4.2 Direct SQL access
Via the Neon SQL editor in the Neon console — log in with your Neon account.
Do NOT paste `POSTGRES_URL` into third-party tools.

---

## 5. Environment variable reference

Full template: `.env.example`. Summary of each variable's purpose:

| Var | Required | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | Server-side Stripe auth (Checkout, webhooks, refunds). |
| `STRIPE_WEBHOOK_SECRET` | yes | Verifies `/api/webhook` requests actually come from Stripe. |
| `GOOGLE_GEMINI_API_KEY` | yes | Image generation in `/api/generate-image`. |
| `BLOB_READ_WRITE_TOKEN` | yes | Writes generated images to Vercel Blob. |
| `RESEND_API_KEY` | yes | Sends contact replies, order confirmations, shipping notices, password-reset and verification emails. |
| `EMAIL_FROM` | yes | Sender address on all outbound email. Must be a verified domain in Resend. |
| `FULFILLMENT_TO` | yes | Destination for contact-form messages and operational alerts. |
| `JWT_SECRET` | yes | Signs user session JWTs. ≥32 chars, not a placeholder — app refuses to sign or verify otherwise. |
| `ADMIN_PASSWORD` | yes | Bearer token for all `/api/admin/*` routes. Store in password manager. |
| `POSTGRES_URL` (+ 6 siblings) | yes | Neon/Vercel Postgres connection. Auto-populated by the Vercel Postgres integration. |
| `CLIENT_URL` | yes | Public origin used in Stripe success/cancel URLs, password-reset links, and the email footer. |
| `PORT` | no (dev) | Local-dev port for `vercel dev`. Ignored in production. |
| `DEBUG_LOGS` | no | Truthy → extra server logs (image gen, email). Leave unset in production. |

---

## 6. Incident response

### 6.1 Leaked secret in a commit
1. Rotate the secret (§1). Revoke the old value.
2. If the repo is public, assume the old value is **permanently compromised** — removing
   the commit does not help; GitHub search, the Wayback Machine, and ingestion bots
   will have indexed it within seconds.
3. Check for abuse: Stripe dashboard for unexpected charges; Gemini quota; Resend sends;
   Blob storage writes.
4. Add the pattern to `.githooks/pre-commit` if it's a new shape the scanner missed.
5. Write a one-line post-mortem in the team log: what leaked, how, mitigation.

### 6.2 Site returns 500
1. Vercel → Deployments → latest → "View Function Logs" → look for the stack trace.
2. Common causes:
   - Missing env var after a rotation without redeploy (§2.2).
   - New DB column referenced before self-heal in `api/db/index.js`.
   - Upstream provider outage (Stripe / Resend / Gemini). Check their status pages.
3. If it's a recent deploy, roll back (§2.1) while you investigate.

### 6.3 Stripe webhook failures
- Stripe → Developers → Webhooks → endpoint → "Attempts" tab shows failures with status codes.
- A 400 usually means signature mismatch → `STRIPE_WEBHOOK_SECRET` is stale; re-copy from
  Stripe and save in Vercel → redeploy.
- A 500 is a bug in `/api/webhook` — check function logs.

### 6.4 Admin account suspected compromised
1. Rotate `ADMIN_PASSWORD` (§1.3).
2. Redeploy to invalidate the old token everywhere.
3. Review the audit log (§3.3) for the last 30 days. Anything you don't recognize is a lead.
4. If user data was mutated, the `details` column on each `admin_actions` row shows the
   before/after values — use that to reconstruct what was changed and by whom (IP).

---

## 7. Quarterly checklist

First Monday of each quarter:
- [ ] Rotate `ADMIN_PASSWORD` and `JWT_SECRET`.
- [ ] Rotate `STRIPE_WEBHOOK_SECRET`.
- [ ] Test a Neon PITR restore (§4.1).
- [ ] Skim 90 days of `admin_actions` — anything unexpected?
- [ ] Check Resend, Gemini, and Stripe for usage spikes.
- [ ] Bump dependencies: `npm outdated` — patch/minor updates without ceremony.
- [ ] Confirm the pre-commit hook still works: `bash .githooks/pre-commit` in a repo with
      staged changes containing a fake `sk_live_` value should fail closed.
