// public/js/cart-ui.js
// Visual layer for the cart. Injects:
//   * a floating cart pill (top-right, fixed) showing the item count
//   * a slide-in drawer modal (right edge) showing items + checkout
// Reads/writes via window.aiprintCart (defined in cart.js).
//
// Loaded on every public page that has analytics.js. Hides itself on
// /admin/* and /success.html / /verified.html (post-purchase / utility
// pages where a cart pill would be confusing).

(function () {
  if (typeof window === 'undefined' || !document) return;
  // Skip on admin + transactional pages.
  const path = (window.location && window.location.pathname) || '';
  if (path.startsWith('/admin/') || path === '/success.html' || path === '/verified.html') return;
  if (!window.aiprintCart) return; // cart.js failed to load — bail silently

  const STYLES = `
    .aip-cart-pill {
      position: fixed; top: 14px; right: 14px; z-index: 60;
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 14px; border-radius: 999px;
      background: rgba(11,16,32,.85); color: #e7eef8;
      border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(6px);
      font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer; transition: transform .15s, background .15s, opacity .2s;
      box-shadow: 0 6px 24px rgba(0,0,0,.25);
    }
    .aip-cart-pill:hover { transform: translateY(-1px); background: rgba(11,16,32,.95); }
    .aip-cart-pill.aip-empty { opacity: .55; }
    .aip-cart-pill.aip-empty:hover { opacity: 1; }
    .aip-cart-pill .aip-cart-icon { width: 16px; height: 16px; flex-shrink: 0; }
    .aip-cart-pill .aip-cart-count { background: linear-gradient(135deg,#6366f1,#818cf8); color: #fff; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
    .aip-cart-pill.aip-empty .aip-cart-count { display: none; }

    .aip-drawer-backdrop {
      position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,.55);
      backdrop-filter: blur(2px); opacity: 0; pointer-events: none;
      transition: opacity .2s ease;
    }
    .aip-drawer-backdrop.aip-open { opacity: 1; pointer-events: auto; }

    .aip-drawer {
      position: fixed; right: 0; top: 0; bottom: 0; z-index: 90;
      width: min(420px, 92vw); background: #0b1020; color: #e7eef8;
      border-left: 1px solid rgba(255,255,255,.12);
      transform: translateX(105%); transition: transform .25s ease;
      display: flex; flex-direction: column;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .aip-drawer.aip-open { transform: translateX(0); }

    .aip-drawer header { padding: 18px 20px; border-bottom: 1px solid rgba(255,255,255,.10); display: flex; align-items: center; justify-content: space-between; }
    .aip-drawer header h2 { margin: 0; font-size: 17px; font-weight: 700; }
    .aip-drawer .aip-close { background: rgba(255,255,255,.08); border: none; color: #e7eef8; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 16px; }
    .aip-drawer .aip-close:hover { background: rgba(255,255,255,.16); }

    .aip-drawer .aip-items { flex: 1; overflow-y: auto; padding: 12px 18px; }
    .aip-drawer .aip-empty-state { padding: 60px 20px; text-align: center; color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .aip-drawer .aip-empty-state strong { color: #e7eef8; display: block; margin-bottom: 6px; }

    .aip-item { display: grid; grid-template-columns: 64px 1fr auto; gap: 12px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
    .aip-item:last-child { border-bottom: none; }
    .aip-item img { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; background: rgba(255,255,255,.05); }
    .aip-item .aip-item-meta { font-size: 13px; line-height: 1.4; min-width: 0; }
    .aip-item .aip-item-meta .aip-name { font-weight: 600; color: #e7eef8; }
    .aip-item .aip-item-meta .aip-prompt { color: #94a3b8; font-size: 12px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; max-width: 100%; }
    .aip-item .aip-item-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .aip-item .aip-price { font-weight: 700; font-size: 13px; }
    .aip-item .aip-qty-row { display: inline-flex; align-items: center; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 6px; overflow: hidden; }
    .aip-item .aip-qty-btn { width: 24px; height: 24px; background: transparent; border: none; color: #cbd5e1; cursor: pointer; font-size: 14px; line-height: 1; }
    .aip-item .aip-qty-btn:hover:not(:disabled) { background: rgba(255,255,255,.08); }
    .aip-item .aip-qty-btn:disabled { opacity: .3; cursor: default; }
    .aip-item .aip-qty-input { width: 28px; text-align: center; background: transparent; border: none; color: #e7eef8; font-size: 13px; padding: 0; }
    .aip-item .aip-qty-input::-webkit-inner-spin-button, .aip-item .aip-qty-input::-webkit-outer-spin-button { -webkit-appearance: none; }
    .aip-item .aip-remove { background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; padding: 0; }
    .aip-item .aip-remove:hover { color: #fca5a5; }
    .aip-item .aip-save-link { background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; padding: 0; margin-right: 8px; }
    .aip-item .aip-save-link:hover { color: #c7d2fe; }
    .aip-item .aip-action-row { display: flex; gap: 4px; align-items: center; }

    .aip-saved-section { margin-top: 12px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.10); }
    .aip-saved-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; cursor: pointer; user-select: none; }
    .aip-saved-header h3 { margin: 0; font-size: 13px; font-weight: 600; color: #cbd5e1; text-transform: uppercase; letter-spacing: .04em; }
    .aip-saved-header .aip-saved-count { font-size: 11px; color: #94a3b8; }
    .aip-saved-header .aip-chev { color: #94a3b8; transition: transform .18s ease; }
    .aip-saved-section.aip-collapsed .aip-saved-list { display: none; }
    .aip-saved-section.aip-collapsed .aip-chev { transform: rotate(-90deg); }
    .aip-saved-item { display: grid; grid-template-columns: 48px 1fr auto; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.05); align-items: center; }
    .aip-saved-item:last-child { border-bottom: none; }
    .aip-saved-item img { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; background: rgba(255,255,255,.05); }
    .aip-saved-item .aip-name { font-size: 12px; font-weight: 600; color: #e7eef8; }
    .aip-saved-item .aip-prompt { color: #94a3b8; font-size: 11px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
    .aip-saved-item .aip-saved-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .aip-saved-item .aip-move-btn { background: rgba(99,102,241,.20); border: 1px solid rgba(99,102,241,.40); color: #c7d2fe; font-size: 10px; padding: 3px 8px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    .aip-saved-item .aip-move-btn:hover { background: rgba(99,102,241,.32); }
    .aip-saved-item .aip-saved-remove { background: none; border: none; color: #94a3b8; font-size: 10px; cursor: pointer; padding: 0; }
    .aip-saved-item .aip-saved-remove:hover { color: #fca5a5; }

    .aip-drawer footer { padding: 18px 20px; border-top: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.02); }
    .aip-totals { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
    .aip-totals .aip-label { color: #94a3b8; font-size: 13px; }
    .aip-totals .aip-amount { font-size: 22px; font-weight: 800; color: #e7eef8; font-variant-numeric: tabular-nums; }
    .aip-shipnote { font-size: 11px; color: #64748b; margin-top: -8px; margin-bottom: 14px; }
    .aip-checkout-btn { width: 100%; padding: 12px 18px; background: linear-gradient(135deg,#6366f1,#818cf8); color: #fff; font-weight: 700; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; }
    .aip-checkout-btn:hover { filter: brightness(1.08); }
    .aip-checkout-btn:disabled { opacity: .5; cursor: not-allowed; }
    .aip-continue-btn { width: 100%; margin-top: 8px; padding: 10px 18px; background: transparent; color: #94a3b8; border: 1px solid rgba(255,255,255,.10); border-radius: 8px; cursor: pointer; font-size: 13px; }
    .aip-continue-btn:hover { color: #e7eef8; }

    .aip-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 100; background: #0b1020; color: #e7eef8; padding: 12px 20px; border-radius: 10px; font-size: 13px; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 6px 24px rgba(0,0,0,.25); opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; }
    .aip-toast.aip-show { opacity: 1; transform: translateX(-50%) translateY(-4px); }

    @media (max-width: 480px) {
      .aip-cart-pill { top: 8px; right: 8px; padding: 6px 10px; font-size: 12px; }
    }
  `;

  const ICON_BAG = `
    <svg class="aip-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8h18l-1.5 11.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5L3 8Z"/>
      <path d="M8 8V6a4 4 0 1 1 8 0v2"/>
    </svg>`;

  function fmtMoney(cents, cur = 'usd') {
    return (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: cur.toUpperCase() });
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // Inject styles once.
  function injectStyles() {
    if (document.getElementById('aip-cart-styles')) return;
    const style = document.createElement('style');
    style.id = 'aip-cart-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // Build the floating pill + drawer DOM.
  function build() {
    injectStyles();

    const pill = document.createElement('button');
    pill.className = 'aip-cart-pill aip-empty';
    pill.id = 'aipCartPill';
    pill.setAttribute('aria-label', 'Open cart');
    pill.innerHTML = `${ICON_BAG}<span>Cart</span><span class="aip-cart-count" id="aipCartCount">0</span>`;
    document.body.appendChild(pill);

    const backdrop = document.createElement('div');
    backdrop.className = 'aip-drawer-backdrop';
    backdrop.id = 'aipCartBackdrop';
    document.body.appendChild(backdrop);

    const drawer = document.createElement('aside');
    drawer.className = 'aip-drawer';
    drawer.id = 'aipCartDrawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Shopping cart');
    drawer.innerHTML = `
      <header>
        <h2>Your cart</h2>
        <button class="aip-close" id="aipCartClose" aria-label="Close cart">✕</button>
      </header>
      <div class="aip-items" id="aipCartItems"></div>
      <footer id="aipCartFooter" style="display:none">
        <div class="aip-totals">
          <span class="aip-label">Subtotal</span>
          <span class="aip-amount" id="aipCartTotal">$0.00</span>
        </div>
        <p class="aip-shipnote">Shipping calculated at the next step. Tax added on the Stripe page.</p>
        <button class="aip-checkout-btn" id="aipCartCheckout">Checkout →</button>
        <button class="aip-continue-btn" id="aipCartContinue">Continue browsing</button>
      </footer>
    `;
    document.body.appendChild(drawer);

    const toast = document.createElement('div');
    toast.className = 'aip-toast';
    toast.id = 'aipToast';
    document.body.appendChild(toast);

    // Wire events.
    pill.addEventListener('click', openDrawer);
    document.getElementById('aipCartClose').addEventListener('click', closeDrawer);
    document.getElementById('aipCartContinue').addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    document.getElementById('aipCartCheckout').addEventListener('click', startCheckout);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('aip-open')) closeDrawer();
    });
  }

  function openDrawer() {
    document.getElementById('aipCartDrawer').classList.add('aip-open');
    document.getElementById('aipCartBackdrop').classList.add('aip-open');
    render();
  }
  function closeDrawer() {
    document.getElementById('aipCartDrawer').classList.remove('aip-open');
    document.getElementById('aipCartBackdrop').classList.remove('aip-open');
  }

  function showToast(msg) {
    const t = document.getElementById('aipToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('aip-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('aip-show'), 2400);
  }

  // Persist the saved-for-later collapsed state across drawer opens so the
  // user's preference sticks within the session.
  let savedCollapsed = (() => {
    try { return localStorage.getItem('aiprint_saved_collapsed') === '1'; } catch (_) { return false; }
  })();
  function setSavedCollapsed(v) {
    savedCollapsed = !!v;
    try { localStorage.setItem('aiprint_saved_collapsed', v ? '1' : '0'); } catch (_) {}
  }

  function render() {
    const cart = window.aiprintCart;
    if (!cart) return;
    const items = cart.list();
    const saved = cart.listSaved();
    const count = cart.count();
    const total = cart.totalCents();

    // Pill
    const pill = document.getElementById('aipCartPill');
    const countEl = document.getElementById('aipCartCount');
    if (pill && countEl) {
      countEl.textContent = String(count);
      pill.classList.toggle('aip-empty', count === 0);
    }

    // Drawer body
    const list = document.getElementById('aipCartItems');
    const footer = document.getElementById('aipCartFooter');
    if (!list || !footer) return;

    let html = '';
    if (items.length === 0) {
      html += `
        <div class="aip-empty-state">
          <strong>Your cart is empty</strong>
          Generate a print, pick a size, and click "Add to cart" to start your order.
        </div>`;
    } else {
      html += items.map(it => {
        const lineCents = (it.unit_amount || 0) * (it.quantity || 1);
        const promptShort = (it.prompt || '').slice(0, 80);
        return `
          <div class="aip-item" data-id="${escapeHtml(it.id)}">
            <img src="${escapeHtml(it.preview_url || '')}" alt="${escapeHtml(promptShort) || 'Cart item'}" loading="lazy"/>
            <div class="aip-item-meta">
              <div class="aip-name">${escapeHtml(it.product_name || it.lookup_key || 'Print')}</div>
              <div class="aip-prompt">${escapeHtml(promptShort)}${(it.prompt || '').length > 80 ? '…' : ''}</div>
              <div class="aip-qty-row" style="margin-top:6px">
                <button class="aip-qty-btn" data-act="dec" aria-label="Decrease quantity"${(it.quantity || 1) <= cart.MIN_QTY ? ' disabled' : ''}>−</button>
                <input class="aip-qty-input" type="number" min="${cart.MIN_QTY}" max="${cart.MAX_QTY}" value="${it.quantity || 1}" inputmode="numeric" aria-label="Quantity"/>
                <button class="aip-qty-btn" data-act="inc" aria-label="Increase quantity"${(it.quantity || 1) >= cart.MAX_QTY ? ' disabled' : ''}>+</button>
              </div>
            </div>
            <div class="aip-item-controls">
              <span class="aip-price">${fmtMoney(lineCents, it.currency)}</span>
              <div class="aip-action-row">
                <button class="aip-save-link" data-act="save" aria-label="Save for later">Save for later</button>
                <button class="aip-remove" data-act="remove" aria-label="Remove item">Remove</button>
              </div>
            </div>
          </div>`;
      }).join('');
    }

    // Saved-for-later section. Only renders if there's something saved OR if
    // the user has historically used the feature (we don't show an empty
    // section just to demo the feature).
    if (saved.length > 0) {
      html += `
        <div class="aip-saved-section${savedCollapsed ? ' aip-collapsed' : ''}" id="aipSavedSection">
          <div class="aip-saved-header" id="aipSavedHeader">
            <h3>Saved for later <span class="aip-saved-count">(${saved.length})</span></h3>
            <span class="aip-chev">▾</span>
          </div>
          <div class="aip-saved-list">
            ${saved.map(it => {
              const promptShort = (it.prompt || '').slice(0, 60);
              return `
                <div class="aip-saved-item" data-id="${escapeHtml(it.id)}">
                  <img src="${escapeHtml(it.preview_url || '')}" alt="" loading="lazy"/>
                  <div>
                    <div class="aip-name">${escapeHtml(it.product_name || it.lookup_key || 'Print')}</div>
                    <div class="aip-prompt">${escapeHtml(promptShort)}${(it.prompt || '').length > 60 ? '…' : ''}</div>
                  </div>
                  <div class="aip-saved-actions">
                    <button class="aip-move-btn" data-act="move" aria-label="Move to cart">Move to cart</button>
                    <button class="aip-saved-remove" data-act="rm-saved" aria-label="Remove">Remove</button>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    list.innerHTML = html;

    // Wire per-item interactions (cart items)
    list.querySelectorAll('.aip-item').forEach(node => {
      const id = node.getAttribute('data-id');
      node.querySelector('[data-act="dec"]')?.addEventListener('click', () => {
        const cur = items.find(x => x.id === id);
        if (cur) cart.updateQuantity(id, (cur.quantity || 1) - 1);
      });
      node.querySelector('[data-act="inc"]')?.addEventListener('click', () => {
        const cur = items.find(x => x.id === id);
        if (cur) cart.updateQuantity(id, (cur.quantity || 1) + 1);
      });
      node.querySelector('[data-act="remove"]')?.addEventListener('click', () => cart.remove(id));
      node.querySelector('[data-act="save"]')?.addEventListener('click', () => {
        if (cart.saveForLater(id)) {
          showToast('Saved for later');
        } else {
          showToast('Saved-for-later list is full');
        }
      });
      node.querySelector('.aip-qty-input')?.addEventListener('change', (e) => {
        cart.updateQuantity(id, e.target.value);
      });
    });

    // Wire saved-for-later interactions
    list.querySelectorAll('.aip-saved-item').forEach(node => {
      const id = node.getAttribute('data-id');
      node.querySelector('[data-act="move"]')?.addEventListener('click', () => {
        if (cart.moveToCart(id)) {
          showToast('Moved to cart');
        } else {
          showToast('Cart is full');
        }
      });
      node.querySelector('[data-act="rm-saved"]')?.addEventListener('click', () => cart.removeSaved(id));
    });

    // Wire saved header collapse toggle
    const savedHeader = document.getElementById('aipSavedHeader');
    if (savedHeader) {
      savedHeader.addEventListener('click', () => {
        const sec = document.getElementById('aipSavedSection');
        const next = !sec.classList.contains('aip-collapsed');
        sec.classList.toggle('aip-collapsed', next);
        setSavedCollapsed(next);
      });
    }

    // Footer
    if (items.length === 0) {
      footer.style.display = 'none';
    } else {
      document.getElementById('aipCartTotal').textContent = fmtMoney(total, items[0]?.currency || 'usd');
      footer.style.display = '';
    }
  }

  async function startCheckout() {
    const cart = window.aiprintCart;
    if (!cart) return;
    const items = cart.list();
    if (items.length === 0) return;
    const btn = document.getElementById('aipCartCheckout');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Opening secure checkout…';
    try {
      const utm = (typeof window.aiprintUtm === 'function') ? window.aiprintUtm() : {};
      const r = await fetch('/api/create-cart-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(it => ({
            preview_url: it.preview_url,
            clean_url: it.clean_url || null,
            prompt: it.prompt,
            options: it.options || {},
            lookup_key: it.lookup_key,
            quantity: Math.max(1, Math.min(10, parseInt(it.quantity, 10) || 1))
          })),
          utm
        })
      });
      const data = await r.json();
      if (!r.ok || !data.url) {
        const msg = data.detail ? `${data.error} (${data.detail})` : (data.error || `HTTP ${r.status}`);
        throw new Error(msg);
      }
      window.location.href = data.url;
    } catch (err) {
      console.error('Cart checkout error:', err);
      alert('Could not open checkout: ' + err.message);
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  // Public helper for "Add to cart" buttons elsewhere.
  window.aiprintCartUI = {
    open: openDrawer,
    close: closeDrawer,
    toast: showToast,
    render
  };

  // Boot
  function boot() {
    if (!document.body) return setTimeout(boot, 30);
    build();
    render();
    window.addEventListener('aiprint-cart-changed', render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
