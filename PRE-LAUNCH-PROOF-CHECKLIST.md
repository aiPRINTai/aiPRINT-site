# aiPRINT.ai — Pre-Launch Proof Checklist

> Walk-through of every public page, image, and key copy block before flipping
> ads on. Last updated: 2026-05-09. Print this or keep it open in another
> window while you click through the site.

**Total time to walk through: 60–90 min if thorough, 30 min if just spot-checking.**

---

## 🌍 Pre-flight (do once, applies everywhere)

- [ ] **Hard reload** `aiprint.ai` (`Cmd+Shift+R`) before starting — kills cached old assets
- [ ] **Open browser DevTools console** (`F12`) — keep it open so you'd see any JS errors
- [ ] Test on **Chrome (desktop)**, **Safari (desktop)**, and **Mobile Safari (iPhone)** at minimum
- [ ] Verify **favicon** appears in the browser tab (small purple `ai` icon)
- [ ] Open `aiprint.ai/og-image.png` directly — verify it loads and looks right (1200×630, branded)

---

## 🏠 Page 1 — Homepage (`/`)

The big one. Walk top to bottom.

### Hero / above-the-fold (4 images)
- [ ] Hero carousel image #1 — `/ai-art/art-cyberpunk-tokyo.webp` — should be sharp, no compression artifacts
- [ ] Hero carousel image #2 — `/ai-art/art-aurora.webp`
- [ ] Hero carousel image #3 — `/ai-art/art-cosmic-cliff.webp`
- [ ] Hero carousel image #4 — `/ai-art/art-anime-blossoms.webp`
- [ ] Each hero piece has a caption ("Cosmic cliff" — Acrylic, etc.) — check spelling
- [ ] Hero copy: **"Turn any idea into a gallery-worthy print."** matches what you want
- [ ] Subhead: "Type a prompt, generate your artwork in seconds..." — proof
- [ ] Trust pills row: "From $45. Ships in 7–14 **business** days. Numbered Certificate of Authenticity. Optional artist signature." — verify "business" word is there

### Trust strip (right under hero)
- [ ] **"Made in the USA"** ✓
- [ ] **"Inspected before & after print"** ✓ (NOT "hand-signed by Lawrence" or similar)
- [ ] **"Certificate of Authenticity"** ✓
- [ ] **"30-day satisfaction guarantee"** ✓

### Step 1 — Create section (the prompt builder)
- [ ] Form panel renders cleanly, no overlap on desktop or mobile
- [ ] All 9 dropdowns load options correctly:
  - Style, Mood/Atmosphere, Color Palette, Time of Day
  - Lighting, Camera & Composition, Faces/Expression, Medium
  - Aspect Ratio
- [ ] **"Surprise me" button** has the dropdown of 9 theme buckets (Any / Pets / Nature / Cities / Cosmic / Surreal / Anime / Modern / Vintage)
- [ ] Generate a real preview — confirm it returns within ~10 sec
- [ ] **Signature controls** appear after first generation:
  - Name input, Font dropdown (6 fonts: Elegant / Flowing / Refined / Brush / Handwritten / Italic Serif)
  - Color dropdown (Auto / Soft Ivory / Soft Charcoal / Champagne Gold / Warm Pewter)
  - **Size slider (12–36)** + **Opacity slider (30–100%) ← NEW**
  - 4 position buttons (TC, BL, BC, BR)
- [ ] Type a name and verify the signature appears on the preview, in the right font
- [ ] Drag the opacity slider — signature transparency updates live
- [ ] Cycle through all 6 fonts — each renders distinctly (no fallbacks to default)
- [ ] Click "See it on a wall" — wall mockup loads
- [ ] Click "Try another (1 credit)" — works
- [ ] Click "Share / save" — generates a share link

### Step 2 — Pick your print
- [ ] **3 material cards: Canvas, Metal, Acrylic** — each with description
- [ ] Material thumbnail images:
  - Canvas: `/materials/canvas.webp` (real product shot)
  - Metal: `/materials/metal.webp`
  - Acrylic: `/materials/acrylic.webp`
- [ ] Each material has 5 size options with prices
- [ ] **"Buy now"** button + **"Add to cart"** button + **quantity selector** (1–10)
- [ ] CTA footer: "📦 Ships in 7–14 **business** days · ↩ 30-day satisfaction guarantee · 🎖 Certificate of Authenticity included"

### "How it works" (3 illustrated steps)
- [ ] Step 1 image — `/illustrations/step-1.webp` — describes "Describe your vision"
- [ ] Step 2 image — `/illustrations/step-2.webp` — "See it come to life"
- [ ] Step 3 image — `/illustrations/step-3.webp` — "Printed, inspected, shipped"
- [ ] Each step's text matches the image conceptually

### Gallery — "Anything you can imagine" (12 AI pieces)
- [ ] `/ai-art/hero-whimsy.webp` — "Hot-air balloons over rolling hills"
- [ ] `/ai-art/hero-pop.webp` — "Pop-art color blocks"
- [ ] `/ai-art/art-pet-portrait.webp` — "Regal golden retriever, oil portrait"
- [ ] `/ai-art/art-ocean-abstract.webp` — "Ocean abstraction in motion"
- [ ] `/ai-art/art-still-life.webp` — "Dutch-master still life, copper kettle"
- [ ] `/ai-art/art-abstract-bold.webp` — "Color field study, palette knife"
- [ ] `/ai-art/art-bw-street.webp` — "Lone walker, Parisian alley"
- [ ] `/ai-art/art-botanical.webp` — "Magnolia branch, vintage botanical"
- [ ] `/ai-art/art-watercolor-coast.webp` — "Mediterranean village, watercolor"
- [ ] `/ai-art/art-macro-wing.webp` — "Morpho wing, iridescent macro"
- [ ] `/ai-art/hero-canyon.webp` — "Desert canyon at golden hour"
- [ ] `/ai-art/art-forest-mist.webp` — "Redwood forest in morning mist"
- [ ] No piece appears in BOTH hero and gallery (deduplicated)

### "On the wall" room visualizations (5 mockups, **honestly labeled as concepts**)
- [ ] `/gallery/04-hallway-vertical.webp`
- [ ] `/gallery/01-living-room-acrylic.webp`
- [ ] `/gallery/02-bedroom-canvas-sunset.webp`
- [ ] `/gallery/03-office-metal-dunes.webp`
- [ ] `/gallery/05-dining-gallery-wall.webp`
- [ ] Section copy somewhere says "Concept visualization" or similar (not "real customer photos")

### Founder section
- [ ] **`/founder-lawrence.jpg`** — your real portrait, sharp, well-lit
- [ ] One-line: "Designed and printed in [Florida / Jupiter / wherever you've decided]"
- [ ] Long-form bio paragraph reads well, no placeholder language

### Materials section (mid-page)
- [ ] Same 3 material thumbnails (canvas/metal/acrylic .webp) appear here too — same images, OK

### Testimonials section (now real per you)
- [ ] All 3 testimonial cards show real quotes from real people
- [ ] First name + last initial format
- [ ] City under each name
- [ ] No more "Verified buyer" labels if those were attached to fake quotes — only attach to real verified buyers

### "Now make it real" / final CTA section
- [ ] Closing copy is yours, no placeholders
- [ ] "Founding-customer stories arriving soon" line (or whatever you replaced "We just opened" with)
- [ ] Footer year shows **2026** (or current year — not hardcoded 2024)

### OG / social preview (test by sharing the URL)
- [ ] Open `https://www.opengraph.xyz/?url=https%3A%2F%2Faiprint.ai` in a new tab
- [ ] OG image shows your branded 1200×630 PNG
- [ ] Title: "aiPRINT.ai — Turn any idea into a gallery-worthy print"
- [ ] Description: "Create premium, ready-to-hang fine art prints from your idea. AI + human curation, archival materials, hand-numbered Certificate of Authenticity. Custom-made and shipped in 7–14 business days."

---

## 📖 Page 2 — About (`/about.html`)

### Images (5)
- [ ] Hero banner — `/banners/about-hero.webp` — sharp, on-brand
- [ ] Founder portrait #1 — `/founder-lawrence.jpg` — same photo as homepage
- [ ] Studio image #1 — `/studio/lab-prints-hero.webp` — real photo of your lab
- [ ] Studio image #2 — `/studio/lab-wide.webp` — wide studio shot
- [ ] Studio image #3 — `/studio/lab-acrylic.webp` — acrylic prints in production

### Copy
- [ ] Headline: "AI art, made real." or whatever it currently is
- [ ] Founder bio reads cleanly — no placeholder
- [ ] "Every order on this site crosses my desk before it prints..." — confirm this language is intact
- [ ] "Color-corrects, sharpens, and proofs the file at print resolution" line is present (it's the cover for the upscaling step)
- [ ] "7–14 **business** days door to door" — confirm "business" is there
- [ ] No "hand-signed by founder" claims
- [ ] Footer year correct (2026)

---

## ❓ Page 3 — FAQ (`/faq.html`)

### Images (1 hero)
- [ ] Hero banner — `/banners/faq-hero.webp`

### Copy — proof every Q&A answer
- [ ] **Sizing question**: "Currently up to 36" on the longest side. Each artwork is prepared at archival print resolution and quality-checked before production..." (NOT "Our AI upscales intelligently" — that was a leak we fixed)
- [ ] **Shipping**: "Most orders arrive within 7–14 **business** days total"
- [ ] **Returns**: "If you're not satisfied with the print quality... contact us within 30 days for a replacement or full refund — no questions asked." (specific, not vague)
- [ ] **Damage policy**: "Contact us within 14 days... shipping damage is always replaced free."
- [ ] **Signature**: matches what's possible in the UI (6 fonts, opacity, position)
- [ ] **Materials**: descriptions match what you actually offer
- [ ] **Pricing**: any prices mentioned in copy match `products.json` reality
- [ ] All section anchor links work (clicking a left-nav item scrolls to that section)
- [ ] Footer year correct (2026)

---

## ⚖ Page 4 — Policies (`/policies.html`)

### Images (1 hero)
- [ ] Hero banner — `/banners/policies-hero.webp`

### Copy
- [ ] **"7–14 business days"** big stat number is correct
- [ ] **30-Day Satisfaction Guarantee section**: "no questions asked" specific wording
- [ ] **Quality Promise**: "we'll replace or refund — no questions asked"
- [ ] Shipping rates section: $10 / $15 / $25 / $35 tiers match what's in `_shipping.js`
- [ ] **Privacy / Tracking & Cookies**: lists PostHog, Meta Pixel, Pinterest Tag, Stripe, Vercel — accurate
- [ ] CCPA paragraph for California residents present
- [ ] Footer year correct (2026)

---

## 📞 Page 5 — Contact (`/contact.html`)

### Images (1 hero)
- [ ] Hero banner — `/banners/contact-hero.webp`

### Copy + functionality
- [ ] Form fields all present: name, email, message
- [ ] Submit button works
- [ ] Submitting redirects to thank-you page or shows success message
- [ ] Email mentioned matches `info@aiprint.ai`
- [ ] No phone number listed (we kept that private)
- [ ] Footer year correct (2026)

---

## 🧴 Page 6 — Care (`/care.html`)

### Images
- [ ] No banner image expected (text-heavy guide)

### Copy
- [ ] Cleaning, hanging, longevity guidance per material (canvas / metal / acrylic) — all present
- [ ] Tone is warm + practical, not clinical
- [ ] Footer year correct

---

## 📜 Page 7 — Certificate of Authenticity (`/coa.html`)

This page is **template** — populated dynamically via query params from `/api/coa?session_id=…`. Test it like this:

- [ ] Open `https://aiprint.ai/coa.html?title=Test%20Title&edition=1&total=250&medium=Fine%20Art%20Canvas&dimensions=24x36&order=AI-P-TEST&fingerprint=abcd%20%C2%B7%20efgh`
- [ ] Renders cleanly with the test values populated in the right fields
- [ ] Looks print-worthy (this is what customers will print to PDF)
- [ ] Try `Cmd+P` → save as PDF — looks like a real certificate, not a webpage
- [ ] **Wording does NOT promise a Lawrence signature** (we removed that — only mentions the hand-numbered + fingerprint)

---

## 📦 Page 8 — Track an Order (`/track.html`)

- [ ] Page loads cleanly
- [ ] Form accepts a session_id
- [ ] Test with your existing test order session ID — should show order status, items, timeline
- [ ] **"Production usually takes 3–7 business days, with 3–7 more in transit. Expect 7–14 business days door to door."** — confirm this language

---

## ✅ Page 9 — Success (`/success.html`)

This page only loads after a real Stripe Checkout. Easiest to verify by opening the URL of your existing test order:
`https://aiprint.ai/success.html?session_id=cs_live_b1agsvoabaMaqaa7iJysNabW7NDiaNNbY557OR9LORl0MgNMlZEFA4SfB8`

- [ ] Order summary displays correctly
- [ ] Artwork preview shown
- [ ] Wall mockup with sample room loads — `/rooms/room3-sofa-wall.webp`
- [ ] Production: 3–7 business days · Shipping: 3–7 business days **after production** wording
- [ ] "Track this order" button works
- [ ] "Create another print" button works → returns to homepage
- [ ] OG description (for if someone shares the success URL): "Your custom AI art print is in production. Ships in 7–14 **business** days."

---

## 💌 Page 10 — Thank You (`/thank-you.html`)

- [ ] Loads after contact form submit
- [ ] Says "We received your message and will respond within 24 hours" or similar
- [ ] Has a "Back to home" or similar link

---

## 🔑 Pages 11–14 — Auth flow pages

Quick visual check (no functionality re-test needed since we already verified):
- [ ] `/verified.html` — shown after email verification — looks professional
- [ ] `/reset-password.html` — password reset form — works
- [ ] `/404.html` — load `aiprint.ai/this-page-does-not-exist` — friendly 404 page, has "back home" link
- [ ] `/500.html` — can't easily simulate, just confirm it exists with similar friendly tone

---

## 👤 Account pages (logged in)

Sign in first, then:
- [ ] **`/account.html`** loads
- [ ] **My Gallery section** — shows your generated images in a grid (or the new empty state if you cleared them)
- [ ] **Print Orders section** — shows your test order with PAID status
- [ ] **Credit History section** — shows your credit ledger
- [ ] **Account dropdown** (top-right):
  - [ ] "Signed in as" label + your email
  - [ ] Credit count + "+ Buy" inline button works
  - [ ] "My Gallery" link → scrolls to designs section ✅
  - [ ] "My Orders" link → scrolls to orders section ✅ (badge shows "1 in production" if you have one)
  - [ ] "Credit History" link → scrolls to credits section ✅
  - [ ] "Track an Order" → goes to /track.html
  - [ ] "Help & Contact" → goes to /contact.html
  - [ ] "Sign out" works

---

## 📱 MOBILE pass (do on actual iPhone if possible)

- [ ] Homepage loads in <3s on cellular
- [ ] Hero text is readable, not cropped
- [ ] Generate flow works: prompt input, dropdowns, generate
- [ ] Material/size picker is usable on small screen
- [ ] Cart drawer slides in cleanly from right
- [ ] Account dropdown menu doesn't overflow viewport horizontally (we capped width)
- [ ] Sticky header doesn't cover content when you tap an anchor link
- [ ] Tap targets feel right (no double-taps needed)
- [ ] FAQ accordions expand/collapse smoothly
- [ ] Forms (contact, signup, login) usable, keyboard doesn't cover input

---

## 🌐 Cross-cutting checks

- [ ] **Footer year** shows **current year** on every page (we fixed hardcoded 2024)
- [ ] **No console errors** in DevTools on any page
- [ ] **No 404s in Network tab** for any image/script/style on any page
- [ ] **All "7–14 days" mentions say "7–14 business days"** (we standardized this)
- [ ] **No "hand-signed by founder" or "personally signed by Lawrence" anywhere** (we removed these)
- [ ] **No "Our AI upscales" or similar** (internal step never surfaces)

---

## 🔒 Last security/credibility paranoia checks

- [ ] View page source on `/` (`Cmd+U`) — no leftover dev comments, TODOs, or placeholder strings
- [ ] No exposed API keys in any client-side script (open `/js/analytics.js` and `/js/auth.js` quickly)
- [ ] HTTPS lock icon shows on every page (no mixed content warnings)
- [ ] Test signup → email verification → login flow at least once with a fresh email

---

## 🎯 What "passing" looks like

- ✅ Every image loads, sharp, no broken pixels, no Unsplash watermarks
- ✅ Every copy block is yours, no `[TBD]` or placeholder language
- ✅ Every footer says 2026
- ✅ Every CTA leads where it should
- ✅ Mobile works smoothly
- ✅ No console errors anywhere
- ✅ Account dropdown + signature flow + checkout all feel premium

When all of that is green → you're truly ready for paid traffic.

---

## 🚨 If you find anything broken

Tell me which page, which item, and what looks off. Most fixes are 5-15 min.
