// public/js/cart.js
// Client-side cart, persisted in localStorage. The site stays mostly
// single-item-purchase-friendly; this module adds an "add to cart" path
// for customers who want to buy multiple distinct designs in one
// transaction.
//
// Storage shape:
//   localStorage['aiprint_cart_v1'] = JSON.stringify([
//     {
//       id: '<uuid>',
//       preview_url: 'https://...',           // watermarked preview shown in cart
//       clean_url:   'https://...' | null,    // optional, will be looked up server-side at checkout
//       prompt: '...',
//       options: { style, mood, light, comp, medium, sig },
//       lookup_key: 'CAN-16x24-PT',
//       product_name: 'Canvas 16×24',
//       unit_amount: 10500,                   // cents, snapshot at add-time
//       currency: 'usd',
//       quantity: 1..10,
//       addedAt: 1714328400000
//     },
//     ...
//   ]);
//
// The cart is capped at MAX_ITEMS distinct entries (default 10) — well above
// any honest use, low enough to keep the Stripe line_items list reasonable.
//
// Public API on window.aiprintCart:
//   add(item)            -> bool      did the item get added (false if cart full)
//   remove(id)           -> void
//   updateQuantity(id,n) -> void      clamps 1..10
//   list()               -> Array     full cart array (read-only copy)
//   count()              -> number    total prints (sum of quantities)
//   distinctCount()      -> number    distinct items
//   totalCents()         -> number    pre-shipping, pre-tax subtotal in cents
//   clear()              -> void
//
// Events:
//   window dispatches 'aiprint-cart-changed' (CustomEvent, detail = current array)
//   on every mutation. UI listens for this to update the badge + drawer.

(function () {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const KEY = 'aiprint_cart_v1';
  const SAVED_KEY = 'aiprint_saved_v1';
  const MAX_ITEMS = 10;
  const MAX_SAVED = 30;            // higher cap — saved-for-later is a wishlist
  const MIN_QTY = 1;
  const MAX_QTY = 10;

  // Generic key-scoped reader/writer so cart + saved share the same plumbing
  // without duplicating the JSON-safe try/catch dance.
  function safeReadKey(k) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }
  function safeWriteKey(k, arr) {
    try { localStorage.setItem(k, JSON.stringify(arr)); } catch (_) {}
    notify();
  }
  function safeRead() { return safeReadKey(KEY); }
  function safeWrite(arr) { safeWriteKey(KEY, arr); }
  function safeReadSaved()  { return safeReadKey(SAVED_KEY); }
  function safeWriteSaved(arr) { safeWriteKey(SAVED_KEY, arr); }

  function notify() {
    try {
      window.dispatchEvent(new CustomEvent('aiprint-cart-changed', {
        detail: { cart: safeRead(), saved: safeReadSaved() }
      }));
    } catch (_) {}
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function clampQty(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v) || v < MIN_QTY) return MIN_QTY;
    return Math.min(v, MAX_QTY);
  }

  function add(item) {
    if (!item || typeof item !== 'object') return false;
    const arr = safeRead();
    if (arr.length >= MAX_ITEMS) return false;
    const entry = {
      id: newId(),
      preview_url: String(item.preview_url || ''),
      clean_url: item.clean_url ? String(item.clean_url) : null,
      prompt: String(item.prompt || ''),
      options: item.options && typeof item.options === 'object' ? item.options : {},
      lookup_key: String(item.lookup_key || ''),
      product_name: String(item.product_name || ''),
      unit_amount: Number.isFinite(item.unit_amount) ? Math.floor(item.unit_amount) : 0,
      currency: String(item.currency || 'usd'),
      quantity: clampQty(item.quantity || 1),
      addedAt: Date.now()
    };
    arr.push(entry);
    safeWrite(arr);
    return true;
  }

  function remove(id) {
    const arr = safeRead().filter(x => x && x.id !== id);
    safeWrite(arr);
  }

  function updateQuantity(id, qty) {
    const arr = safeRead();
    const it = arr.find(x => x && x.id === id);
    if (!it) return;
    it.quantity = clampQty(qty);
    safeWrite(arr);
  }

  function clear() { safeWrite([]); }
  function list() { return safeRead().slice(); }
  function count() { return safeRead().reduce((s, x) => s + clampQty(x.quantity || 1), 0); }
  function distinctCount() { return safeRead().length; }
  function totalCents() {
    return safeRead().reduce((s, x) => s + (Number(x.unit_amount) || 0) * clampQty(x.quantity || 1), 0);
  }
  function isFull() { return safeRead().length >= MAX_ITEMS; }

  // ── Saved-for-later (wishlist) ─────────────────────────────────────
  // A second collection that hangs off the same UI but doesn't roll into
  // the checkout subtotal. Items can hop between cart and saved.
  function saveForLater(id) {
    const cart = safeRead();
    const idx = cart.findIndex(x => x && x.id === id);
    if (idx === -1) return false;
    const saved = safeReadSaved();
    if (saved.length >= MAX_SAVED) return false;
    const [moved] = cart.splice(idx, 1);
    moved.quantity = 1; // saved items reset to 1; you usually re-pick qty when moving back
    saved.push(moved);
    safeWrite(cart);
    safeWriteSaved(saved);
    return true;
  }
  function moveToCart(id) {
    const saved = safeReadSaved();
    const idx = saved.findIndex(x => x && x.id === id);
    if (idx === -1) return false;
    const cart = safeRead();
    if (cart.length >= MAX_ITEMS) return false;
    const [moved] = saved.splice(idx, 1);
    cart.push(moved);
    safeWriteSaved(saved);
    safeWrite(cart);
    return true;
  }
  function removeSaved(id) {
    safeWriteSaved(safeReadSaved().filter(x => x && x.id !== id));
  }
  function clearSaved() { safeWriteSaved([]); }
  function listSaved() { return safeReadSaved().slice(); }
  function savedCount() { return safeReadSaved().length; }

  window.aiprintCart = {
    add, remove, updateQuantity, clear,
    list, count, distinctCount, totalCents, isFull,
    saveForLater, moveToCart, removeSaved, clearSaved, listSaved, savedCount,
    // Replace both collections from an external source (e.g. a server-side
    // sync). Single notify so the UI re-renders once.
    replaceAll(cart, saved) {
      try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(cart) ? cart : [])); } catch (_) {}
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(Array.isArray(saved) ? saved : [])); } catch (_) {}
      notify();
    },
    MAX_ITEMS, MIN_QTY, MAX_QTY, MAX_SAVED
  };

  // Cross-tab sync: a cart or saved edit in another tab should refresh
  // this tab's UI. Both keys share the same change event.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === SAVED_KEY) notify();
  });
})();
