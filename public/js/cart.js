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
  const MAX_ITEMS = 10;
  const MIN_QTY = 1;
  const MAX_QTY = 10;

  function safeRead() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function safeWrite(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (_) {}
    notify(arr);
  }

  function notify(arr) {
    try {
      window.dispatchEvent(new CustomEvent('aiprint-cart-changed', { detail: arr }));
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

  window.aiprintCart = {
    add, remove, updateQuantity, clear,
    list, count, distinctCount, totalCents, isFull,
    MAX_ITEMS, MIN_QTY, MAX_QTY
  };

  // Cross-tab sync: a cart edit in another tab should refresh this tab's UI.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) notify(safeRead());
  });
})();
