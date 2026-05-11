# 🔒 INTERNAL FULFILLMENT WORKFLOW — DO NOT EXPOSE

> **This document describes the internal production workflow for aiPRINT.ai.**
> It contains a trade-secret production step (AI upscaling between order and lab handoff)
> that customers must never see.
>
> **NEVER mention any of the following in customer-facing copy, emails, FAQ,
> COA, marketing, ads, or social posts:**
> - "AI upscaling" / "upscale" / "Gigapixel" / "Topaz"
> - "Image enhancement" / "AI enhancement"
> - "Resolution boost" / "smart resize"
> - Any reference to the original generation being lower-resolution than the print
>
> **ALWAYS use the established cover language instead:**
> - "Color-corrected, sharpened, and proofed at print resolution" (already on `about.html` line 220)
> - "Prepared at archival print resolution and quality-checked before production" (already on `faq.html`)
> - "Founder-reviewed before production"
>
> If a future contributor (Claude or human) needs to add new copy about the
> production step, they must use those phrases or equivalent. Anything that
> hints at a separate "upscaling step" undoes the brand positioning.

---

## Why this exists

Gemini 2.5 Flash Image generates at roughly **1024×1024–1024×1568** pixels. That
resolution is fine for screen previews but **far below print resolution** for
anything larger than ~5×8 inches. To produce gallery-grade prints up to 36×36
inches, every order's source file must be upscaled to the target DPI for its
material before it goes to the print lab.

This step is real, takes 5–15 minutes per order, and is what makes the
difference between a "premium AI print" and a "blurry AI print." It's also
the kind of thing a competitor can't easily replicate without doing the work
themselves — which is why we treat it as proprietary.

---

## Operational rhythm — weekly batch (2026-04-28)

**Submission day: Friday evening** — every order paid through Friday afternoon
gets prepared (upscaled, color-corrected, sharpened) and submitted to the
appropriate lab in one batch.

**Pickup day: Monday (the following week)** — both labs hit ~7-day turnaround.

| Lab | Pickup method | Cost per run | Notes |
|---|---|---|---|
| **Artful Printers** (Miami) — canvas + acrylic | Uber Courier same-day Miami → Jupiter | **$70 flat** | Cost amortizes across all Artful orders in that batch |
| **Shiny Prints** (Jupiter) — metal | Self pickup, local | **$0** | Lawrence picks up directly |

### Volume math (this matters a lot in the first months)

The $70 Uber Courier is a **fixed cost per pickup run**, so the per-order
inbound cost depends entirely on how many Artful (canvas + acrylic) orders
are in the batch:

| Artful orders / week | $/order inbound | What happens to canvas margins |
|---|---|---|
| 1 | $70.00 | **catastrophic — losing money on canvas** |
| 3 | $23.33 | tight, ~12% margin |
| 5 | $14.00 | ~20% margin |
| 10 | $7.00 | ~26% margin |
| 20 | $3.50 | ~29% margin |
| 50 | $1.40 | ~31% margin |

**Operational implication for the first 30–60 days of paid traffic:** if
canvas orders are arriving at <3/week, running the Uber Courier every Friday
loses money on canvas. Two reasonable responses:

1. **Hold canvas/acrylic orders** until at least 3 are in the queue before
   firing the courier run. This delays shipping by a few days but protects
   margins. Keep customers informed via the order-confirmation email.
2. **Eat the early-volume losses** as a one-time customer-acquisition cost —
   get the first 50 orders out fast for reviews and word-of-mouth, accept
   the margin hit, scale into profit at ~10+ orders/week.

The `/admin/finances.html` dashboard has a "Batch size" input at the top
right — drag it to model different volume scenarios in real time.

### Customer-promise timing (7–14 business days)

The weekly cadence creates a per-order timing range based on when in the
week the order is placed:

| Order placed | Days until next Friday submit | Lab turnaround | Days till Monday pickup | Ship to customer | Total (calendar) | Business days |
|---|---|---|---|---|---|---|
| Saturday morning | 6 days | 7 days | 3 days | 1–3 days | 17–19 days | ~12–14 |
| Tuesday | 3 days | 7 days | 3 days | 1–3 days | 14–16 days | ~10–12 |
| Friday before submit cutoff | 0 days | 7 days | 3 days | 1–3 days | 11–13 days | ~8–10 |
| Friday AFTER submit cutoff | 7 days | 7 days | 3 days | 1–3 days | 18–20 days | ~13–15 |

The Friday-after-cutoff window is the **risk case** — it can land at 13–15
business days, brushing against the public 7–14 business day promise.

Mitigations (in priority order):
1. **Set a clear Friday submission cutoff** (e.g., 5 PM ET) and put the
   customer-confirmation email in the loop — orders placed after cutoff
   get an honest "your print enters production next Friday" line.
2. **Twice-weekly submissions (Mon + Fri)** once volume justifies — cuts
   max wait by 3 days but doubles courier cost. Cross over to twice-weekly
   when Artful volume hits ~10 orders/week (per-order courier cost still
   < $7 even with two runs).
3. **Buffer the public promise** — change "7–14 business days" to "10–14
   business days" or "2–3 weeks" if the math feels too tight in practice.
   Don't do this preemptively; let real fulfillment data drive it.

---

## Workflow (manual — current, through ~first 50 orders)

```
ORDER PAID
   ↓
Stripe webhook → orders row created with clean_url + admin fulfillment email sent
   ↓
[INTERNAL — Lawrence's local machine]
1. Open admin email at orders@aiprint.ai
2. Download source file via "⬇ Download print master" link (this is the Gemini original)
3. Open in Topaz Photo AI (or Gigapixel AI)
   • Set output DPI per the material/size table below
   • Use "Standard" or "High Fidelity" model — NOT "Art" mode (over-stylizes)
   • Output as TIFF for metal/acrylic, JPEG q95 for canvas
4. Open output in Photoshop
   • Color-correct (small calibration tweaks for the lab profile)
   • Sharpen (Smart Sharpen, ~30% amount, 1-2px radius)
   • Soft proof against the lab's ICC profile if available
   • Verify pixel dimensions match the material/size DPI target
5. Name file: order-{stripe_session_id_short}-{material}-{size}.{tiff|jpg}
   Example: order-cs_a1b2c3-CAN-16x24-PT.jpg
6. Save to:
   • Local: ~/aiPRINT-prints/{YYYY-MM}/
   • Cloud backup: Dropbox or iCloud Drive (NOT Vercel Blob — that's customer-facing)
   ↓
7. Upload to print lab portal OR email lab with file attached
   ↓
8. Mark order "in_production" in /admin/orders.html
   ↓
9. Lab ships → mark "shipped" + paste tracking → customer gets shipping email
```

---

## DPI targets per material

These are the minimums. Going higher is fine; going under is not.

| Material | Target DPI | File format |
|---|---|---|
| Canvas | **200 DPI** (canvas weave forgives lower res) | JPEG q95 |
| Metal (ChromaLuxe) | **250 DPI** (glossy substrate shows artifacts) | TIFF 16-bit |
| Acrylic facemount | **300 DPI** (clarity reveals everything — non-negotiable) | TIFF 16-bit |

## Pixel-dimension cheat sheet (target output size after upscale)

| Size | Canvas (200) | Metal (250) | Acrylic (300) |
|---|---|---|---|
| 8×12 | 1600×2400 | 2000×3000 | 2400×3600 |
| 12×18 | 2400×3600 | 3000×4500 | 3600×5400 |
| 16×24 | 3200×4800 | 4000×6000 | 4800×7200 |
| 18×18 | 3600×3600 | 4500×4500 | 5400×5400 |
| 20×30 | 4000×6000 | 5000×7500 | 6000×9000 |
| 24×24 | 4800×4800 | 6000×6000 | 7200×7200 |
| 24×36 | 4800×7200 | 6000×9000 | 7200×10800 |
| 30×30 | 6000×6000 | 7500×7500 | 9000×9000 |
| 36×36 | 7200×7200 | 9000×9000 | **10800×10800** |

A 10800×10800 16-bit TIFF is roughly **400–700 MB**. Make sure you have RAM
and disk for batch processing on the largest acrylic orders.

---

## Software

**Currently used:** **Topaz Photo AI** AND **Topaz Gigapixel AI** (Lawrence owns both, A/B testing per order during early launch to settle on which produces better results for AI-generated art at print resolution).

Suggested A/B method:
- Run a sample 16×24 acrylic order through both at the target DPI (300)
- Open both outputs side-by-side at 100% zoom in Photoshop
- Look for: edge artifacts, painted-looking detail loss, over-smoothing on faces, color shifts
- Pick the winner per material category — they may differ (Photo AI tends to win on noisy/photo-realistic art; Gigapixel cleaner on flat illustration-style art)
- Document the chosen tool per material here once decided

| Option | Cost | Verdict |
|---|---|---|
| **Topaz Photo AI** ✅ | $199 one-time | Owned. Combines upscale + sharpen + denoise — best for noisy/photo-realistic generations |
| **Topaz Gigapixel AI** ✅ | $99 one-time | Owned. Upscale-only — often cleaner on flat/illustration-style art |
| Adobe Photoshop "Super Resolution" | Free with Adobe sub | Backup option if both Topaz tools struggle on a specific piece |
| Real-ESRGAN (open source) | Free | Skip — variable quality, not worth the maintenance |

---

## QC checklist before sending to lab

Before uploading the upscaled file to the print lab portal:

- [ ] Pixel dimensions ≥ target for material+size (see table above)
- [ ] No visible upscaling artifacts (over-smoothed faces, painted-looking edges, lost detail in fine textures)
- [ ] Color profile is sRGB (or the lab's preferred CMYK if they convert on receipt)
- [ ] File opens cleanly in Preview (corrupt TIFFs don't always print)
- [ ] Filename matches the convention `order-{session_id}-{material}-{size}.{ext}`
- [ ] Filed to local + cloud backup BEFORE upload to lab

---

## Watermarking interaction (already wired)

The watermarking pipeline (`api/_watermark.js`, `api/generate-image.js`) does
NOT touch the upscaling step. It produces:
- `previews/<base>.jpg` — watermarked, public, low-res, what the customer sees
- `originals/<base>.png` — clean, admin-only, the Gemini original — what gets
  downloaded for upscaling

The upscaled file you produce locally is **a separate artifact** that never
goes back to Vercel Blob with a public URL. It's local + cloud-backup only.

---

## Future: optional automation (week 2-3 of paid traffic)

If/when manual upscaling starts costing more than 30 min/day, build:

1. **`print_master_url` column on `orders`** (self-healing migration)
2. **Admin upload field** on each order row in `/admin/orders.html` —
   drag-and-drop the upscaled file → uploads to a **private** Vercel Blob path
   (path prefix `print-masters/` with no public listing)
3. **State machine:** `paid → needs_prep → ready_for_lab → in_production → shipped`
4. **Pixel-dimension validation** on upload — verify the file meets DPI target
   for that SKU's size before allowing the state transition to `ready_for_lab`
5. **Optional CLI worker** — Topaz Photo AI has a CLI (`tpai-cli`); could
   queue overnight batch processing on Lawrence's machine via a cron-pulled
   job list from a `/api/admin/pending-prep` endpoint

**Don't build any of this for the May 13 launch.** Manual is fine for the
first 20–50 orders.

---

## COA fingerprint behavior (verified 2026-04-28)

The COA fingerprint hashes `prompt + sessionId` (in `api/coa.js:104`), NOT
image pixels. **Upscaling does not break or invalidate any COA**, because
the fingerprint is a per-order identifier, not an image content hash.

Customers receive their COA with a fingerprint that survives the upscaling
step transparently.

---

## Signed-by-the-founder note (2026-04-28)

The site previously promised "signed, hand-numbered Certificate of
Authenticity" but the actual COA template has no signature line. As of the
May 13 launch sweep, the marketing copy has been updated to "**hand-numbered**
Certificate of Authenticity" — dropping the "signed" promise.

If you want to re-add a signature line later:
1. Edit `api/coa.js` to add a signature image to the PDF template
2. Capture a clean digital signature image of "Lawrence Leyderman" on a
   white background, save to `/public/founder-signature.png` (kept private
   from public listing — only embedded in the COA PDF)
3. Restore "signed" wording across `index.html`, `policies.html`, FAQ
4. Update this doc to reflect the change
