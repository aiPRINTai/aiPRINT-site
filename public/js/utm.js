// public/js/utm.js
// Capture UTM params on landing → persist to localStorage so we can
// attribute the eventual purchase back to the ad source.
//
// Behavior: any of utm_source / utm_medium / utm_campaign / utm_content /
// utm_term present in the URL = first-touch attribution. We DON'T overwrite
// once captured — the first paid touch wins for the session window. After
// 30 days the values expire so a returning visitor isn't credited to a
// long-stale campaign.
//
// On click of the Stripe checkout button, public/index.html reads these
// values and forwards them to /api/create-checkout-session, which adds them
// to the Stripe session.metadata. The webhook then writes them onto the
// orders row, and /admin/marketing.html reads from there.
//
// Loaded with `defer` from every public-facing page that has analytics.js.

(function () {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const KEY_TS = 'aiprint_utm_ts';
  const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  function readUtmFromUrl() {
    try {
      const u = new URL(window.location.href);
      const out = {};
      for (const p of PARAMS) {
        const v = u.searchParams.get(p);
        if (v) out[p] = v.slice(0, 200); // cap each value
      }
      return Object.keys(out).length ? out : null;
    } catch (_) {
      return null;
    }
  }

  function isExpired() {
    const ts = parseInt(window.localStorage.getItem(KEY_TS) || '0', 10);
    return !ts || (Date.now() - ts) > TTL_MS;
  }

  function readStored() {
    const out = {};
    for (const p of PARAMS) {
      const v = window.localStorage.getItem('aiprint_' + p);
      if (v) out[p] = v;
    }
    return out;
  }

  function persist(obj) {
    for (const p of PARAMS) {
      if (obj[p]) window.localStorage.setItem('aiprint_' + p, obj[p]);
    }
    window.localStorage.setItem(KEY_TS, String(Date.now()));
  }

  // Capture-or-refresh logic: a fresh URL with UTMs always wins (most-recent
  // ad click attribution). Otherwise, expire stale values silently.
  const fromUrl = readUtmFromUrl();
  if (fromUrl) {
    persist(fromUrl);
    // Tag the PostHog session too so the funnel analytics + the orders
    // table tell the same attribution story.
    if (window.posthog) {
      try { window.posthog.register(fromUrl); } catch (_) {}
    }
  } else if (isExpired()) {
    for (const p of PARAMS) window.localStorage.removeItem('aiprint_' + p);
    window.localStorage.removeItem(KEY_TS);
  }

  // Public helper: index.html reads this when it builds the checkout request.
  window.aiprintUtm = function () { return readStored(); };
})();
