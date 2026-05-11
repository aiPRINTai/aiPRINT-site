# aiPRINT.ai — Paid-traffic launch reference

> Companion to `OPERATIONS.md` §7 (marketing dashboard) and `LAUNCH-CHECKLIST.md`.
> One file with everything you need to run the first month of paid ads:
> ready-to-paste URLs, monitoring rhythm, what to do when numbers wobble.

---

## 1. UTM-tagged ad URL templates

These are the URLs to paste into Meta Ads Manager + Pinterest Ads Manager so
every order can be attributed back to the campaign that drove it. The
marketing dashboard at `/admin/marketing.html` reads `orders.utm_*` columns
that are populated end-to-end from these params.

**Tagging rules:**
- `utm_source` = the **network** (always one of: `meta`, `pinterest`, `email`,
  `referral`, `direct`)
- `utm_medium` = the **kind of placement** (`cpc` for paid, `social` for
  organic, `email` for newsletter, `referral` for press, etc.)
- `utm_campaign` = a **name you'll recognize** later (use kebab-case, no
  spaces)
- `utm_content` = the **ad creative variant** (when A/B testing)
- `utm_term` = optional, useful for keyword-style campaigns

### Meta (Facebook/Instagram) — paste in Ads Manager → Tracking → URL Parameters

For a single campaign:
```
utm_source=meta&utm_medium=cpc&utm_campaign=launch-week-1&utm_content={{ad.name}}
```

With Meta's dynamic placeholders (recommended — auto-populates per ad):
```
utm_source=meta&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{adset.name}}_{{ad.name}}&utm_term={{placement}}
```

**Where to paste:** Ads Manager → Ad level → URL parameters field (NOT in the
Website URL itself — Meta appends them automatically).

**Example campaigns to start:**
| Campaign goal | Suggested utm_campaign | Suggested utm_content |
|---|---|---|
| Cold prospecting (broad audience) | `launch-prospect-broad` | `creative-A` / `creative-B` |
| Lookalike (1% LAL of site visitors) | `launch-lal-1pct` | `creative-A` |
| Retargeting (visited site, no buy) | `retarget-visitors` | `dynamic-product` |
| Retargeting (added to cart) | `retarget-cart-abandoner` | `discount-message` |

### Pinterest — paste in Ads Manager → Tracking parameters

Same structure, just `utm_source=pinterest`:
```
utm_source=pinterest&utm_medium=cpc&utm_campaign={{campaignname}}&utm_content={{adgroupname}}_{{adname}}
```

Pinterest's macros differ slightly from Meta's — case matters. Their docs
update occasionally, so verify in their UI before launch.

**Suggested first campaigns:**
| Campaign goal | utm_campaign |
|---|---|
| Idea pin → site (top of funnel) | `pinterest-idea-pins` |
| Standard pin → site | `pinterest-standard` |
| Shopping ads (when product feed connected) | `pinterest-shopping` |

### Email & organic (don't forget these)

When you send any newsletter / launch email:
```
?utm_source=email&utm_medium=newsletter&utm_campaign=launch-announce
```

Organic Instagram bio link / story stickers:
```
?utm_source=ig&utm_medium=social&utm_campaign=link-in-bio
```

Press / blog mentions (when someone writes about you):
```
?utm_source=referral&utm_medium=press&utm_campaign=<publication-name>
```

---

## 2. Pre-launch checklist (the day before flipping ads on)

Run through this **the night before Wednesday** so you're not racing day-of:

- [ ] Meta Pixel test — `/admin/marketing.html` → events firing? Or in Meta Events Manager → Test Events tab → load `aiprint.ai` → see PageView fire
- [ ] Pinterest Tag test — Pinterest Conversions → Test events → see PageVisit fire
- [ ] Stripe live-mode webhook connected — `dashboard.stripe.com` → Developers → Webhooks → confirm endpoint shows green and recent successful deliveries
- [ ] Verify `/admin/finances.html` loads with current cost data
- [ ] Verify `/admin/marketing.html` loads (will be empty until first attributed order)
- [ ] Daily ad budget caps set in Meta + Pinterest (don't burn $500 in one bad night)
- [ ] Customer service inbox — `info@aiprint.ai` reachable, you'll respond within 24h
- [ ] Free 4 hours blocked off Wednesday morning for any "the site went down" surprise

---

## 3. Day 0 (launch day) monitoring rhythm

**Check every 2 hours for the first 12 hours.** This is the bug-discovery
window. After Day 0, drop to morning + evening check-ins.

| What to check | Where | What's normal | What's a red flag |
|---|---|---|---|
| Site is up | `aiprint.ai` (just open it) | Loads in <2s | 500 / blank page |
| New orders | `/admin/orders.html` | 0–5 in first day is realistic | Orders that are `paid` but not in admin = webhook silently failed |
| Confirmation emails firing | Inbox of any test order | Lands within 30 sec | No email = Resend failure or webhook failure |
| Pinterest events | Pinterest Conversions → Events overview | PageVisit + Signup + AddToCart events appearing | Zero events after 4+ hours of traffic = pixel broken |
| Meta events | Meta Events Manager | PageView + AddToCart + Purchase events | Same — zero events with traffic = broken |
| Vercel function errors | `npx vercel logs --status-code 500 --since 2h` | 0 in normal operation | Anything >0 — investigate |
| Ad spend pacing | Meta + Pinterest dashboards | Tracking your daily cap | Spending faster than expected = audience too small or bid too high |
| CAC sanity check | `/admin/marketing.html` → CAC calculator | $30–$80 is healthy at $100–$200 AOV | >$100 CAC = pause and investigate before more spend |

---

## 4. Day 1 (24h after launch) — first read

Numbers will be noisy. Don't make decisions yet. Just collect:

- **Total spend so far** (Meta + Pinterest combined)
- **Total orders** (`/admin/orders.html`)
- **Blended CAC** = spend ÷ orders
- **Click-through rate** per ad — Meta gives this in Ads Manager
- **Bounce rate** — PostHog will show "homepage → exits without scrolling" for paid landings

If CAC is **green (<$30)** → keep budget where it is, don't touch
If CAC is **yellow ($30–$80)** → keep running, you're learning
If CAC is **red (>$100)** → pause the worst-performing campaign, keep the others

Don't pause everything in panic. One bad campaign on Day 1 doesn't mean the
strategy is wrong.

---

## 5. Week 1 — first decision point

After 5–7 days, you have enough data to make tweaks:

1. **Which network is delivering?** Compare Meta vs Pinterest CAC. If Pinterest is 2× Meta's CAC after 7 days, shift budget to Meta. (But keep Pinterest live with $10/day floor — Pinterest takes longer to optimize, may catch up by Week 2.)

2. **Which audience?** In Meta Ads Manager, look at the **Audience Insights**: which age range / location / interest is converting? Build a lookalike from buyers and run that as a separate ad set.

3. **Which creative?** Look at which `utm_content` value has the best CAC in `/admin/marketing.html`. Kill the bottom-performing ad creative. Make a new variant of the top performer.

4. **Pinterest Event Quality** — by Day 7 Pinterest grades each event 0–10. Anything below 6 = enhanced match isn't connecting. Diagnose: are users logging in pre-purchase? If not, Pinterest doesn't get an email for matching.

---

## 6. Spend ramp suggestions

**Week 1: $250–$500 total** ($25-$50/day Meta + $25/day Pinterest)
- Goal: validate the funnel works at all and collect baseline data

**Week 2: $500–$1000** (raise the winning campaigns 2×, kill losers)
- Goal: hit your first 30 customers and get reviews

**Week 3+: $1000–$3000/wk** (scale + diversify)
- Goal: predictable CAC, predictable revenue
- Reinvest profit until you hit the breakeven CAC ceiling per SKU (visible in `/admin/finances.html` calculator)

**Don't ramp past 3× weekly spend in one week.** Algorithms re-learn when budgets jump too fast and CAC spikes for 5–7 days while they re-optimize.

---

## 7. Common Day-1 problems & fixes

| Problem | Likely cause | Fix |
|---|---|---|
| Pixel events show, no Purchase events | Webhook fired but Purchase event didn't | Check `/admin/orders.html` — if order is there, it's a CAPI issue. Check Meta Events Manager → Test Events |
| Stripe reports paid, no order email | Resend down OR webhook silently failed | Check Resend dashboard for bounces. Check Vercel logs for `/api/webhook` 500s |
| Ad clicks but no conversions | Landing page isn't loading well, OR audience/offer mismatch | Open the ad URL yourself, time how long to first paint, scroll depth |
| Pinterest event quality <5 | Customer not logged in pre-purchase | Expected for first 30 days — improves naturally as repeat customers log in |
| CAC very high in Hour 1 | Algorithm is in learning phase | DO NOT touch for 48h. Algorithms re-learn on every change. |

---

## 8. Where each metric lives

| Metric | Source | URL |
|---|---|---|
| UTM-attributed revenue | aiPRINT marketing dashboard | `/admin/marketing.html` |
| Per-SKU profit + margin | aiPRINT finances dashboard | `/admin/finances.html` |
| Order list / fulfillment status | aiPRINT orders | `/admin/orders.html` |
| Meta conversion events | Meta Events Manager | `business.facebook.com/events_manager` |
| Pinterest conversion events | Pinterest Conversions | `ads.pinterest.com/conversions` |
| PostHog product analytics | PostHog | `us.posthog.com` |
| Stripe payment events | Stripe Dashboard | `dashboard.stripe.com/events` |
| Vercel function errors | Vercel logs | `npx vercel logs --status-code 500 --since 1h` |

---

## 9. Don't-do-these list

- **Don't change the ad budget more than once a day** — algorithm re-learns
- **Don't run more than 2 active campaigns per network for the first 2 weeks** — too much audience overlap, wastes spend
- **Don't pause winning campaigns to "test new creative"** — make a NEW campaign and let both run
- **Don't optimize for cost-per-click (CPC)** — optimize for cost-per-purchase (CPA / CAC)
- **Don't ignore Pinterest's longer learning curve** — Pinterest takes 14+ days to settle into a good CPA, vs Meta's 5–7 days

---

## 10. When to message me

Anytime any of these happen — these are the "stop and ask Claude" triggers:

- **Order placed but no email arrived after 5 minutes** — possible silent webhook failure
- **CAC over $150 for 48 hours straight** — strategic call needed
- **Site loading >5 seconds on a 4G phone** — performance regression
- **Any 500 error in Vercel logs that wasn't there yesterday** — fresh bug
- **Meta or Pinterest ad gets disapproved** — usually a copy/imagery issue we can iterate on

Most other things — let them run for a week before reacting. Algorithms need time.
