// public/js/cart-sync.js
// Cross-device cart sync glue. Sits on top of cart.js + auth.js.
//
// Flow on every page load:
//   1. Wait for window.auth.ready (the auth manager has loaded /api/auth/me).
//   2. If the user is logged in, GET /api/cart.
//   3. Merge server state with localStorage:
//        - Cart: union by (lookup_key + preview_url). On collision, take the
//          larger quantity (assumes the user added MORE later).
//        - Saved: union by the same key, keep first occurrence (no qty math).
//   4. Replace localStorage with the merged result, then PUT it back to the
//      server so both sides agree.
//
// On every cart-changed event after that, debounced PUT to /api/cart so
// other devices pick it up on their next load.
//
// If the user is anonymous, this module silently no-ops — local cart still
// works perfectly, the customer just won't see it on a different device.
// If the user logs out, server-side cart stays untouched (it's THEIRS).
// localStorage is left as-is too; next login will re-merge.

(function () {
  if (typeof window === 'undefined' || !window.aiprintCart) return;

  const SYNC_DEBOUNCE_MS = 1200;
  let serverInSync = false;       // true once we've completed the boot merge
  let pendingSyncTimer = null;
  let lastSyncedHash = '';        // skip PUT if state hasn't actually changed

  function authToken() {
    try {
      return (window.auth && window.auth.token)
        || localStorage.getItem('auth_token')
        || null;
    } catch (_) { return null; }
  }

  function isLoggedIn() {
    return !!(window.auth && window.auth.user) || !!authToken();
  }

  // Dedup key for an item. Same lookup_key + preview_url = same print at
  // the same size, regardless of when it was added or which device's id
  // is on it.
  function itemKey(it) {
    return `${(it.lookup_key || '').toLowerCase()}::${it.preview_url || ''}`;
  }

  // Cart merge: union, on conflict take the larger quantity.
  function mergeCart(local, server) {
    const seen = new Map();
    for (const arr of [local, server]) {
      for (const it of (arr || [])) {
        if (!it || !it.lookup_key || !it.preview_url) continue;
        const k = itemKey(it);
        const prior = seen.get(k);
        if (!prior) {
          seen.set(k, { ...it });
        } else {
          const a = parseInt(prior.quantity, 10) || 1;
          const b = parseInt(it.quantity, 10) || 1;
          if (b > a) prior.quantity = Math.min(b, 10);
        }
      }
    }
    return Array.from(seen.values());
  }

  // Saved merge: union, first occurrence wins (no qty semantics).
  function mergeSaved(local, server) {
    const seen = new Map();
    for (const arr of [local, server]) {
      for (const it of (arr || [])) {
        if (!it || !it.lookup_key || !it.preview_url) continue;
        const k = itemKey(it);
        if (!seen.has(k)) seen.set(k, { ...it });
      }
    }
    return Array.from(seen.values());
  }

  function hashState(cart, saved) {
    // Cheap content fingerprint — order-insensitive — so we don't PUT
    // identical state back to the server repeatedly.
    const sigOf = (it) => `${itemKey(it)}@${it.quantity || 1}`;
    const c = (cart  || []).map(sigOf).sort().join('|');
    const s = (saved || []).map(sigOf).sort().join('|');
    return `c:${c}#s:${s}`;
  }

  async function fetchServer() {
    const token = authToken();
    if (!token) return null;
    try {
      const r = await fetch('/api/cart', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (r.status === 401) return null; // logged out / stale token
      if (!r.ok) return null;
      return await r.json();
    } catch (_) { return null; }
  }

  async function pushServer(cart, saved) {
    const token = authToken();
    if (!token) return false;
    try {
      const r = await fetch('/api/cart', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ cart, saved })
      });
      return r.ok;
    } catch (_) { return false; }
  }

  function scheduleSync() {
    if (!serverInSync || !isLoggedIn()) return;
    if (pendingSyncTimer) clearTimeout(pendingSyncTimer);
    pendingSyncTimer = setTimeout(async () => {
      pendingSyncTimer = null;
      const cart  = window.aiprintCart.list();
      const saved = window.aiprintCart.listSaved();
      const h = hashState(cart, saved);
      if (h === lastSyncedHash) return;
      const ok = await pushServer(cart, saved);
      if (ok) lastSyncedHash = h;
    }, SYNC_DEBOUNCE_MS);
  }

  // Boot: wait for auth, then merge.
  async function boot() {
    try { if (window.auth && window.auth.ready) await window.auth.ready; }
    catch (_) {}
    if (!isLoggedIn()) return;

    const server = await fetchServer();
    if (!server) {
      // Either not authenticated after all, or the call failed. Fall back to
      // pushing whatever we have so the server is initialized for next time.
      const cart  = window.aiprintCart.list();
      const saved = window.aiprintCart.listSaved();
      if (cart.length || saved.length) {
        await pushServer(cart, saved);
      }
      serverInSync = true;
      lastSyncedHash = hashState(cart, saved);
      return;
    }

    const localCart  = window.aiprintCart.list();
    const localSaved = window.aiprintCart.listSaved();
    const mergedCart  = mergeCart(localCart,  server.cart  || []).slice(0, window.aiprintCart.MAX_ITEMS);
    const mergedSaved = mergeSaved(localSaved, server.saved || []).slice(0, window.aiprintCart.MAX_SAVED);

    // Replace local state in one shot (single notify event).
    window.aiprintCart.replaceAll(mergedCart, mergedSaved);

    // Push the merged state back so both sides agree. If the merge produced
    // exactly the server's state we skip the round-trip via the hash.
    const h = hashState(mergedCart, mergedSaved);
    const serverH = hashState(server.cart || [], server.saved || []);
    if (h !== serverH) {
      const ok = await pushServer(mergedCart, mergedSaved);
      if (ok) lastSyncedHash = h;
    } else {
      lastSyncedHash = h;
    }
    serverInSync = true;
  }

  // After every cart mutation, debounced PUT.
  window.addEventListener('aiprint-cart-changed', scheduleSync);

  // Best-effort: flush any pending mutation immediately on visibility change
  // (tab going to background) instead of waiting out the debounce. fetch()
  // with keepalive=true lets the request finish even if the tab closes
  // shortly after — and unlike sendBeacon, keepalive supports headers so we
  // can keep using Bearer auth without a server-side workaround.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (!serverInSync || !isLoggedIn()) return;
    const cart  = window.aiprintCart.list();
    const saved = window.aiprintCart.listSaved();
    const h = hashState(cart, saved);
    if (h === lastSyncedHash) return;
    const token = authToken();
    if (!token) return;
    try {
      fetch('/api/cart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ cart, saved }),
        keepalive: true
      }).catch(() => {});
      lastSyncedHash = h; // optimistic — next page load will reconcile if it failed
    } catch (_) {}
  });

  // Boot once the DOM is ready (or immediately if it's already past that).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose a manual hook in case auth.js wants to trigger a re-sync after
  // login/logout (e.g. login screen calls window.aiprintCartSync.refresh()).
  window.aiprintCartSync = {
    refresh: boot,
    push: () => scheduleSync()
  };
})();
