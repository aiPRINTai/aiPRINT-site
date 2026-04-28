# aiPRINT.ai — AI-Generated Art Prints

Turn any idea into a gallery-worthy print.  
Source code for the **aiPRINT.ai** website.

## About
aiPRINT.ai transforms text prompts into unique, high-quality art prints.  
Customers can describe their idea, receive proofs, and order archival prints (metal, fine-art paper, or canvas).

## Tech Stack
- Frontend: HTML + Tailwind (CDN)
- Hosting: Vercel
- Contact form: self-hosted (Resend for delivery)
- Payments: Stripe Checkout
- Database: Neon Postgres (orders, users, admin audit log)
- Transactional email: Resend
- File storage: Vercel Blob
- AI image generation: Google Gemini (via serverless API route)
- Auth: JWT (30-day, HttpOnly cookie)

## Local / Dev (optional)
If/when we add serverless routes:
1. Install Node 18+
2. `npm install`
3. Add env vars (see `.env.example`)
4. Run locally with `vercel dev`

## Security
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy) served site-wide via `vercel.json` rewrites; CSP is live in
  Report-Only mode and reports land at `POST /api/csp-report`.
- Auth endpoints are rate-limited per-IP and per-email (login, signup, reset-request,
  reset-password, verify, resend-verification); admin endpoints add a per-token cap
  on top of bearer auth.
- Signup flow is hardened against account enumeration — identical HTTP response
  shape for all outcomes; signal is email-only.
- Password reset stamps `password_changed_at` and every sensitive user-data endpoint
  re-checks the JWT's `iat` against it, so resets invalidate stolen sessions without
  admin action.
- All sensitive admin actions (credit grants, bulk PII exports, order mutations)
  write to an `admin_actions` audit log with actor IP, target, and before/after
  details. Surfaced on `/admin/security.html`.
- A daily purge cron (gated by `CRON_SECRET`) trims `shared_designs` past its
  retention window.
- Day-2 runbook lives in `OPERATIONS.md`; personal punch list in `your-todo.html`.

## Marketing & shipping
- Tiered flat-rate shipping ($10 / $15 / $25 / $35 by size + material) wired
  through Stripe `shipping_options`; policy lives in `api/_shipping.js`.
- Webhook persists `shipping_amount` + `subtotal_amount` alongside the gross
  total so true product margin is queryable per order.
- UTMs captured on landing (`public/js/utm.js`) propagate end-to-end through
  the checkout flow into `orders.utm_*` columns; admin dashboard at
  `/admin/marketing.html` visualizes orders + revenue + CAC by source.
- Hero/gallery/room/banner images are served as WebP (95% smaller than the
  source JPGs); regenerate via `scripts/convert-to-webp.js` after adding new
  product photography.

## Contact
info@aiPRINT.ai  
Instagram: @aiPRINT.ai

© 2025 aiPRINT.ai — All rights reserved.
