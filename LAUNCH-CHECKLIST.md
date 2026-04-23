# aiPRINT.ai — Launch Checklist

Things only **you** can do. Code is in good shape; this is the human/content/decisions layer.

Last updated: 2026-04-22 (visual-polish / UX session — hero grid, mobile copy, dropdown z-index, wall-preview refresh, gallery dedupes)

---

## 🔴 Must-do before launch

These are visible on the live site right now and will hurt conversion until handled.

- [x] **1. Founder note** — ✅ Done. About page now has a real personal intro from Lawrence.
- [x] **2. Founder portrait photo** — ✅ Done. Live on both homepage + about page.
- [x] **3a. Real material example shots** — ✅ Done. Homepage shows real Canvas/Metal/Acrylic mockups.
- [~] **3b. Real customer print photos in real homes** — 🟡 AI placeholders staged
  - 5 concept room visualizations live in `#rooms`. Section labeled honestly as "Concept visualizations."
  - **Still TODO:** swap placeholders with real phone shots from early customers.

- [ ] **4. Real testimonials** (3–5 short quotes) — 🔴 STILL FAKE
  - Three placeholder quotes labeled "Verified buyer" currently sit on the homepage.
  - Edited 2026-04-19 to remove "Lawrence himself emailed me…" type claims that contradicted the new "inspected, not personally hand-touched" story — but they're still fake.
  - This is **the single biggest credibility risk on the site.** A diligent investor or first-time buyer who looks at the source can tell. "Verified buyer" on a fake testimonial is borderline deceptive marketing.
  - Options: (a) get 3 real ones from beta buyers and replace, (b) drop the section until real ones exist and replace with a "Be one of our first 100" CTA, (c) swap the badge to "Beta tester" if those are real beta-tester quotes.

- [x] **5. "Hand-signed by founder" copy** — ✅ Resolved (passes #1 + #2 below)
  - Pass #1 (initial cleanup): about/index/email — anywhere we said the founder hand-signs prints or COAs has been changed to "inspected before & after print" + "numbered Certificate of Authenticity."
  - Pass #2 (full proof, 2026-04-19): caught and fixed three more leftover spots:
    - `index.html` founder block — "Printed and signed in Florida, USA" → "Printed, inspected, and numbered in Florida, USA"
    - `about.html` story — "personally reviewed and color-corrected by me" → "Every order on this site crosses my desk before it prints…"
    - Hero subhead — "Includes your signature + a Certificate of Authenticity" → "Numbered Certificate of Authenticity. Optional artist signature."
    - `success.html` step 2 — "Your signature is embedded in the print" → "If you added a signature, it's embedded in the final print." (was unconditional before)
    - `faq.html` — fixed stale UI label ("Show signature on preview" → "Add your signature")
    - Preview-area caption — "your final print arrives clean and **signed**" → "clean, inspected, and with a numbered Certificate of Authenticity"

- [ ] **6. Stock Unsplash photos in "How it works"** — 🟡 Still 3 of them
  - `index.html` lines ~1142, 1156, 1170 still load `images.unsplash.com` photos for steps 1/2/3.
  - These are visible on every desktop scroll and are a tonal mismatch with the rest of the (real, custom) imagery.
  - Either replace with custom shots from the studio (best), or generate 3 minimalist illustrations.

---

## 🟡 Should-do for polish

- [x] **7. OG share image** — ✅ Done. 1200×630 PNG live, wired into all pages.
- [x] **8. Preview-image protection (watermark architecture)** — ✅ Shipped 2026-04-19, **cleaned up same day**
  - Server-side `sharp` watermark: clean PNG → `originals/` (admin only) + watermarked JPEG → `previews/` (public).
  - DB schema migrated (`clean_url` column on `generations` + `orders`, with lookup index).
  - Stripe metadata threads `clean_url` to webhook → DB → admin emails + CSV export.
  - Migration script bug fixed (was silently skipping statements preceded by `--` comments).
  - **v2 watermark cleanup:** original v1 used a tiled "aiPRINT.ai · PREVIEW" pattern that rendered as ugly tofu boxes (librsvg in Sharp doesn't have the system font fallbacks for the bullet character or small-size glyphs). Replaced with a single subtle diagonal "PREVIEW" + small ASCII-only "aiPRINT.ai" corner stamp. Watermark is still present and protective, just no longer visually noisy.
- [x] **9. Trust strip wording fix** — ✅ Done 2026-04-19
  - Was claiming "Hand-signed by Lawrence." Now reads "Inspected before & after print."
- [x] **10. Generator size + visual weight** — ✅ Done 2026-04-19
  - Form panel was constrained to `max-w-5xl`; widened, taller dropdowns, larger textarea, hefty Generate button.
- [x] **11. Hero bottom-row image fit** — ✅ Done 2026-04-19
  - Square 1024×1024 fox + hummingbird were showing internal padding inside landscape containers. Swapped to landscape art (Neon Tokyo + Aurora) that fills cleanly.
- [x] **12. Wide-display layout** — ✅ Done 2026-04-19 (3 passes)
  - Pass 1: All 7 user-facing pages bumped from `max-w-7xl` (1280px) to `max-w-[1800px]`.
  - Pass 2: Narrow inner sections widened to `max-w-[1500–1700px]`.
  - Pass 3 (final): Unified ALL section caps to `max-w-[1800px]` — trust strip, How it works, Founder, Testimonials. Sections now have visually consistent left/right edges instead of zigzagging between 1500/1600/1700/1800. Founder paragraph capped at `max-w-4xl` so reading line stays sane inside the wide container.
  - Header strips on success/track/thank-you bumped to match (no more navbar-snap on transactional pages).
  - **Fluid font scaling** added: `html { font-size: clamp(16px, 0.85vw + 12px, 20px); }` — base font slides 16→20px from small to ultra-wide displays. All rem-based Tailwind utilities (text-sm, padding, etc.) scale with it.
  - Heading clamp ceilings bumped: H1 max ~3.8rem → ~5rem, H2 max ~2.4rem → ~3.25rem.
  - Form panel intentionally stays at `max-w-[1400px]` — it's an interactive form, narrower is more usable.
- [x] **13. Consistent shipping timing across pages** — ✅ Verified 2026-04-19
  - Canonical: "3–7 production + 3–7 shipping = 7–14 total."
  - Fixed one stale ASCII hyphen on `policies.html` (`7-14 days` → `7–14 days`).
- [ ] **14. Real Trustpilot widget** — Need real reviews collected first (chicken/egg). Not blocking launch.

---

## 🟢 Decisions only you can make

- [ ] **15. International shipping launch date** — Update wording when you have real countries/dates.
- [ ] **16. Pricing comparison table** (vs Etsy / Society6 / Saatchi) — risky if your prices land worse on any axis. Skip unless math favors you on at least 2 axes.
- [ ] **17. Abandoned-preview email** — privacy-sensitive. Recommend skipping until signed-in users abandon carts.
- [ ] **18. Replicate API key** (for future panoramic / upscaling) — skip until volume justifies it.
- [ ] **19. Stripe live-mode confirmation**
  - Verify in Stripe dashboard that the production webhook is firing on real payments.
  - Place a real $1 test transaction (you can refund yourself).
  - Confirm: order email arrives, fulfillment alert arrives, order shows in `/admin/orders.html`.
- [ ] **20. End-to-end watermarking smoke test** — generate one image post-deploy and confirm:
  - Browser receives `…/previews/<base>.jpg` with subtle diagonal "PREVIEW" + bottom-right "aiPRINT.ai"
  - DB row has both `image_url` (preview) and `clean_url` (original PNG)
  - On checkout, order row gets `clean_url` populated; admin fulfillment email contains "⬇ Download print master"

---

## ✅ Already shipped (no action needed)

The code-side work is done. For reference, here's what's already live:

**Customer-facing**
- ✅ Order tracking page at `/track.html` (no login needed; uses Stripe session ID)
- ✅ "Track this order" button in confirmation email + on success page
- ✅ Order history visible on `/account.html`
- ✅ Trust badges row on homepage (USA / Inspected / COA / 30-day)
- ✅ Material price-delta badges on the 3 print options
- ✅ 8 prompt-builder dropdowns including Color Palette and Time of Day
- ✅ "🎲 Surprise me" randomizer with 20 fun seed prompts
- ✅ 4-position signature picker with auto-contrast color
- ✅ Mobile-optimized prompt builder layout
- ✅ Accessibility (aria-labels) on all form controls
- ✅ ORDER section directly under CREATE — one continuous funnel (Step 1 / Step 2 labels)
- ✅ 12-piece gallery (was 6) with row variety: B&W street, botanical, watercolor, macro wing, canyon, forest mist, etc.
- ✅ Policies page surfaced in nav with hero banner
- ✅ Site scales properly on ultra-wide displays (1800px content cap + fluid font)

**Admin**
- ✅ Resend confirmation / shipping email buttons per-order
- ✅ CSV export of all orders — now includes `print_master_url` column (clean, full-resolution)
- ✅ Keyboard shortcuts: R, /, E, S, ?, Esc
- ✅ Revenue stat excludes `canceled` orders (2026-04-22)

**Visual / UX polish (2026-04-22)**
- ✅ Custom-select dropdowns render the actual font of each choice (Chrome/Safari fix)
- ✅ Open dropdown lifts above preview image (no more "menu hidden behind art")
- ✅ Wall-preview room mockup refreshes when user regenerates without closing the section
- ✅ Mobile hero copy shortened to "Prompt → Generate → Print → Ship → Hang" (desktop paragraph preserved)
- ✅ Hero grid: retired desert-canyon anchor layout, now 4 symmetric `aspect-square` tiles
- ✅ Gallery deduplicated — no image appears in both hero and gallery any more (16 unique)
- ✅ Palette emoji replaced with custom framed-art SVG on Color Palette dropdown

**Backend / robustness**
- ✅ Standardized shipping timing across all pages (3–7 production + 3–7 shipping = 7–14 total)
- ✅ Tightened error messages (no leaked internals)
- ✅ URL scheme validation on preview images
- ✅ Debug logs gated behind env var
- ✅ Meta tags + noindex on private pages (success, account, track)
- ✅ Contact form length validation + autocomplete hints
- ✅ Two-URL image architecture (clean print master never touches the browser)
- ✅ Watermark renders cleanly across all aspect ratios (v2 — ASCII only, no font-fallback boxes)

---

## Rough launch-readiness score

| Area | Status | Notes |
|---|---|---|
| Code & infrastructure | ✅ 100% | All deployed, watermarking live (v2), DB migrated |
| Payment + fulfillment flow | 🟡 90% | Code is right; needs real $1 live-mode confirm (#19) |
| Legal pages (Terms / Privacy / Shipping) | ✅ 100% | Plain-English policies live with hero banner |
| Visible placeholders | 🟡 75% | Customer-room photos (#3b) + Unsplash how-it-works (#6) still placeholder |
| Trust/credibility content | 🟠 60% | Founder + studio strong, but **fake testimonials are still the real problem (#4)** |
| Marketing assets | ✅ 100% | OG image + meta tags live across all pages |
| Visual / UX polish | ✅ 98% | Wide-display layout fixed, font scales, watermark cleaned, all "hand-signed" copy reconciled |
| Copy consistency | ✅ 97% | Full proof pass 2026-04-19; all founder-hand-signs / signature-is-required claims reconciled |

**Bottom line:**
- **Soft launch (paying customers):** ~95% ready. Code, copy, and UX are there. Only gate is the live-mode Stripe confirmation (#19) and the watermark smoke test (#20) — both 30-min tasks.
- **Investor-facing:** ~80% ready. Same as above plus the testimonial credibility problem (#4) is the one item that meaningfully drags this down. A diligent investor doing 5 minutes of source-view will spot the placeholder testimonials.
- **Public launch / press push:** 75% — wait until #4, #3b, and #6 are real, otherwise the imagery story doesn't fully match the "real prints from a real studio" positioning.
