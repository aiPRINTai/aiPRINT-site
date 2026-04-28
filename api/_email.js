// Transactional email via Resend HTTP API.
//
// Env vars:
//   RESEND_API_KEY  - from resend.com dashboard
//   EMAIL_FROM      - e.g. "aiPRINT <orders@aiprint.ai>"
//                     (sender domain must be verified in Resend)
//   ORDERS_TO       - e.g. "orders@aiprint.ai"
//                     Where new-order fulfillment alerts land. Also the
//                     reply-to on order-related customer emails (order
//                     confirmation, shipping notification, credit purchase).
//                     Defaults to orders@aiprint.ai.
//   CONTACT_TO      - e.g. "info@aiprint.ai"
//                     Where contact-form messages land. Also the reply-to on
//                     account-support emails (email verification, password
//                     reset). Defaults to info@aiprint.ai.
//   FULFILLMENT_TO  - Legacy alias. If set, used as the default for
//                     CONTACT_TO (but NOT ORDERS_TO — new orders should
//                     flow to orders@ by default). Kept for back-compat with
//                     existing Vercel env configs.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Resolve the "orders" inbox — where new-order alerts go and what we use as
// reply-to on order-related customer emails.
function ordersTo() {
  return process.env.ORDERS_TO || 'orders@aiprint.ai';
}

// Resolve the "contact / support" inbox — where the contact form sends and
// what we use as reply-to on account-support emails. Falls back to the
// legacy FULFILLMENT_TO env var so existing deploys keep working.
export function contactTo() {
  return process.env.CONTACT_TO || process.env.FULFILLMENT_TO || 'info@aiprint.ai';
}

// Re-exported so callers outside this module (admin/email-test, contact.js)
// can stay in sync.
export { ordersTo };

async function sendEmail({ to, subject, html, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'aiPRINT <orders@aiprint.ai>';
  if (!apiKey) {
    console.warn('⚠️  RESEND_API_KEY not set — skipping email to', to);
    return { skipped: true, reason: 'no_api_key' };
  }
  let r;
  try {
    r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, reply_to: replyTo })
    });
  } catch (err) {
    console.error('❌ Resend network error:', err.message, '| from=', from, '| to=', to);
    return { error: 'network_error', detail: err.message };
  }
  const text = await r.text();
  if (!r.ok) {
    console.error(`❌ Resend ${r.status} | from="${from}" | to="${to}" | body=${text}`);
    return { error: text, status: r.status };
  }
  try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
}

function fmtMoney(cents, currency = 'usd') {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() });
}

function fmtAddress(a) {
  if (!a) return '';
  return [a.line1, a.line2, `${a.city || ''}${a.city ? ', ' : ''}${a.state || ''} ${a.postal_code || ''}`, a.country]
    .filter(Boolean).join('<br>');
}

export async function sendVerificationEmail(email, verifyUrl) {
  if (!email) return { skipped: true, reason: 'no email' };

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0f1d;background:#ffffff;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:42px;height:42px;border-radius:10px;background:#0a0f1d;color:#fff;font-weight:900;line-height:42px;font-size:18px;letter-spacing:-.5px;">AI</div>
      </div>
      <h1 style="font-size:24px;margin:0 0 12px;text-align:center;font-weight:800;">Confirm your email</h1>
      <p style="color:#475569;margin:0 0 24px;text-align:center;font-size:15px;line-height:1.5">
        Welcome to aiPRINT.ai. Click the button below to verify your email and unlock your account.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#818cf8);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">
          Verify my email →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:24px 0 0;line-height:1.5">
        Or paste this into your browser:<br>
        <span style="color:#64748b;word-break:break-all;">${verifyUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;line-height:1.5">
        This link expires in 24 hours. If you didn't sign up for aiPRINT.ai, you can ignore this email.<br><br>
        aiPRINT.ai · Made with care in Florida, USA
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Verify your aiPRINT.ai email',
    html,
    // Account-support question → goes to info@ (via CONTACT_TO).
    replyTo: contactTo()
  });
}

export async function sendOrderConfirmationEmail(order) {
  const { customer_email, customer_name, preview_url, clean_url, lookup_key, prompt, amount_total, currency, stripe_session_id, shipping_address, quantity } = order;
  if (!customer_email) return { skipped: true, reason: 'no email' };
  // Customer paid — show them the clean image, not the watermarked preview.
  const artworkImg = clean_url || preview_url;
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0f1d;">
      <h1 style="font-size:24px;margin:0 0 8px">Your aiPRINT is in the works 🎨</h1>
      <p style="color:#475569;margin:0 0 20px">Hi ${customer_name || 'there'}, your order is confirmed. Here are the details:</p>

      ${artworkImg ? `<img src="${artworkImg}" alt="Your artwork" style="width:100%;border-radius:12px;margin-bottom:20px"/>` : ''}

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#64748b">Order</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-size:12px">${stripe_session_id}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Finish / Size</td><td style="padding:8px 0;text-align:right">${lookup_key || '—'}</td></tr>
        ${qty > 1 ? `<tr><td style="padding:8px 0;color:#64748b">Quantity</td><td style="padding:8px 0;text-align:right;font-weight:600">${qty} prints</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#64748b">Total</td><td style="padding:8px 0;text-align:right;font-weight:600">${fmtMoney(amount_total || 0, currency)}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px;font-size:16px">Shipping to</h3>
      <p style="margin:0;color:#334155;font-size:14px"><strong>${customer_name || ''}</strong><br>${fmtAddress(shipping_address)}</p>

      <h3 style="margin:24px 0 8px;font-size:16px">What happens next</h3>
      <ol style="color:#334155;font-size:14px;padding-left:20px;margin:0">
        <li style="margin-bottom:6px">Our team color-corrects and proofs your artwork.</li>
        <li style="margin-bottom:6px">We print on archival materials at our Florida studio.</li>
        <li style="margin-bottom:6px">Production: 3–7 business days · Shipping: 3–7 business days after production.</li>
        <li>You'll get a tracking email when it ships.</li>
      </ol>

      <p style="margin:24px 0 0;font-size:14px"><a href="https://aiprint.ai/track.html?id=${encodeURIComponent(stripe_session_id)}" style="display:inline-block;background:#0a0f1d;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Track this order →</a></p>

      <p style="margin-top:28px;color:#64748b;font-size:13px">Questions? Just reply to this email — we respond within 24 hours.</p>
      <p style="margin-top:8px;color:#94a3b8;font-size:12px">aiPRINT.ai · Made with care in Florida, USA</p>
    </div>
  `.trim();

  return sendEmail({
    to: customer_email,
    subject: 'Your aiPRINT order is confirmed 🎨',
    html,
    // Order-related → replies go to orders@.
    replyTo: ordersTo()
  });
}

/**
 * Combined customer confirmation for a multi-item cart purchase.
 * Renders one email listing every print so the buyer doesn't get N copies
 * of the same template. Falls back gracefully on bad input.
 *
 * @param {Array} orders  array of orders rows from a single cart session,
 *                        sorted ascending by line_item_index.
 */
export async function sendCartOrderConfirmationEmail(orders) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return { skipped: true, reason: 'empty cart array' };
  }
  const head = orders[0];
  if (!head?.customer_email) return { skipped: true, reason: 'no email' };
  const currency = head.currency || 'usd';
  const sessionId = head.stripe_session_id || '';
  const totalAll = orders.reduce((s, o) => s + (Number(o.amount_total) || 0), 0);
  const totalPrints = orders.reduce((s, o) => s + Math.max(1, parseInt(o.quantity, 10) || 1), 0);

  const itemRows = orders.map((o, i) => {
    const img = o.clean_url || o.preview_url || '';
    const qty = Math.max(1, parseInt(o.quantity, 10) || 1);
    const lineCents = Number(o.subtotal_amount) || (Number(o.amount_total) || 0);
    return `
      <tr>
        <td style="padding:14px 12px;border-top:1px solid #e2e8f0;vertical-align:top;width:96px">
          ${img ? `<img src="${img}" alt="" style="width:96px;height:96px;border-radius:8px;object-fit:cover;display:block"/>` : ''}
        </td>
        <td style="padding:14px 12px;border-top:1px solid #e2e8f0;vertical-align:top;font-size:14px">
          <div style="font-weight:600;color:#0a0f1d">${o.lookup_key || 'Print'}</div>
          ${qty > 1 ? `<div style="color:#475569;font-size:13px;margin-top:2px">Quantity: ${qty} prints</div>` : ''}
          <div style="color:#94a3b8;font-size:12px;margin-top:6px;line-height:1.4">${(o.prompt || '').slice(0, 120)}${(o.prompt || '').length > 120 ? '…' : ''}</div>
        </td>
        <td style="padding:14px 12px;border-top:1px solid #e2e8f0;vertical-align:top;text-align:right;font-weight:600;font-size:14px;white-space:nowrap">
          ${fmtMoney(lineCents, currency)}
        </td>
      </tr>`;
  }).join('');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0a0f1d;">
      <h1 style="font-size:24px;margin:0 0 8px">Your ${orders.length}-piece order is in the works 🎨</h1>
      <p style="color:#475569;margin:0 0 20px">Hi ${head.customer_name || 'there'}, your cart is confirmed. Here's everything you ordered:</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        ${itemRows}
        <tr>
          <td colspan="2" style="padding:14px 12px;border-top:2px solid #0a0f1d;text-align:right;font-weight:700;font-size:15px">Order total</td>
          <td style="padding:14px 12px;border-top:2px solid #0a0f1d;text-align:right;font-weight:700;font-size:15px">${fmtMoney(totalAll, currency)}</td>
        </tr>
      </table>
      <p style="color:#94a3b8;font-size:12px;margin:0 0 20px">Includes shipping + tax. ${totalPrints !== orders.length ? `${totalPrints} prints across ${orders.length} designs.` : `${orders.length} unique designs.`}</p>

      <h3 style="margin:24px 0 8px;font-size:16px">Shipping to</h3>
      <p style="margin:0;color:#334155;font-size:14px"><strong>${head.customer_name || ''}</strong><br>${fmtAddress(head.shipping_address)}</p>

      <h3 style="margin:24px 0 8px;font-size:16px">What happens next</h3>
      <ol style="color:#334155;font-size:14px;padding-left:20px;margin:0">
        <li style="margin-bottom:6px">We color-correct and proof every piece.</li>
        <li style="margin-bottom:6px">All prints are produced on archival materials at our Florida studio.</li>
        <li style="margin-bottom:6px">Production: 3–7 business days · Shipping: 3–7 business days. Multi-piece orders ship together when possible.</li>
        <li>You'll get a tracking email when it ships.</li>
      </ol>

      <p style="margin:24px 0 0;font-size:14px"><a href="https://aiprint.ai/track.html?id=${encodeURIComponent(sessionId)}" style="display:inline-block;background:#0a0f1d;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Track this order →</a></p>

      <p style="margin-top:28px;color:#64748b;font-size:13px">Questions? Just reply to this email — we respond within 24 hours.</p>
      <p style="margin-top:8px;color:#94a3b8;font-size:12px">aiPRINT.ai · Made with care in Florida, USA</p>
    </div>
  `.trim();

  return sendEmail({
    to: head.customer_email,
    subject: `Your aiPRINT cart is confirmed — ${orders.length} pieces 🎨`,
    html,
    replyTo: ordersTo()
  });
}

/**
 * Combined fulfillment alert covering every item in a cart purchase.
 * One email instead of N — easier on the inbox + admin sees the full
 * package at a glance.
 */
export async function sendCartFulfillmentAlertEmail(orders) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return { skipped: true, reason: 'empty cart array' };
  }
  const head = orders[0];
  const to = ordersTo();
  const currency = head.currency || 'usd';
  const sessionId = head.stripe_session_id || '';
  const totalAll = orders.reduce((s, o) => s + (Number(o.amount_total) || 0), 0);
  const totalPrints = orders.reduce((s, o) => s + Math.max(1, parseInt(o.quantity, 10) || 1), 0);

  const itemBlocks = orders.map((o, i) => {
    const printMaster = o.clean_url || o.preview_url || '';
    const qty = Math.max(1, parseInt(o.quantity, 10) || 1);
    const lineCents = Number(o.subtotal_amount) || (Number(o.amount_total) || 0);
    const opts = o.options || {};
    return `
      <div style="margin:16px 0;padding:14px;border:1px solid #e2e8f0;border-radius:8px">
        <div style="display:flex;align-items:flex-start;gap:14px">
          ${printMaster ? `<img src="${printMaster}" alt="" style="width:140px;height:140px;border-radius:6px;object-fit:cover;flex-shrink:0"/>` : ''}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
              <div>
                <span style="display:inline-block;background:#312e81;color:#c7d2fe;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">CART ${i + 1} / ${orders.length}</span>
                ${qty > 1 ? `<span style="display:inline-block;background:#fde047;color:#422006;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;margin-left:6px">PRINT × ${qty}</span>` : ''}
              </div>
              <strong style="font-size:14px">${fmtMoney(lineCents, currency)}</strong>
            </div>
            <div style="font-weight:600;font-size:14px">${o.lookup_key || '—'}</div>
            <div style="color:#475569;font-size:12px;margin-top:4px;line-height:1.4">${(o.prompt || '').slice(0, 200)}${(o.prompt || '').length > 200 ? '…' : ''}</div>
            ${printMaster ? `<p style="margin:8px 0 0;font-size:12px"><a href="${printMaster}" download style="color:#4f46e5;font-weight:600">⬇ Download print master</a></p>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;padding:20px;color:#0a0f1d;">
      <h2 style="margin:0 0 8px">🛒 New cart order — ${orders.length} pieces · ${fmtMoney(totalAll, currency)}</h2>
      <p style="margin:0 0 8px;color:#64748b;font-size:14px">${head.customer_email}${totalPrints !== orders.length ? ` · ${totalPrints} prints across ${orders.length} designs` : ` · ${orders.length} designs`} · ship together</p>

      ${itemBlocks}

      <h3 style="margin:24px 0 4px;font-size:14px">Ship to</h3>
      <p style="margin:0;font-size:14px"><strong>${head.customer_name || ''}</strong><br>${fmtAddress(head.shipping_address)}</p>

      <p style="margin-top:16px;font-size:12px;color:#94a3b8">Stripe session: ${sessionId}</p>
    </div>
  `.trim();

  return sendEmail({
    to,
    subject: `🛒 New cart order · ${orders.length} pieces · ${fmtMoney(totalAll, currency)}`,
    html,
    replyTo: head.customer_email
  });
}

const CARRIER_TRACKING_URLS = {
  ups: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  usps: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  dhl: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`
};

export async function sendShippingNotificationEmail(order) {
  const { customer_email, customer_name, preview_url, clean_url, lookup_key, tracking_number, carrier, shipping_address, stripe_session_id } = order;
  if (!customer_email) return { skipped: true, reason: 'no email' };
  if (!tracking_number) return { skipped: true, reason: 'no tracking number' };
  // Customer paid — show clean image, not watermark.
  const artworkImg = clean_url || preview_url;

  const carrierKey = (carrier || '').toLowerCase().trim();
  const trackingUrl = CARRIER_TRACKING_URLS[carrierKey] ? CARRIER_TRACKING_URLS[carrierKey](tracking_number) : null;
  const carrierLabel = carrier ? carrier.toUpperCase() : 'Carrier';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0f1d;">
      <h1 style="font-size:24px;margin:0 0 8px">Your aiPRINT just shipped 📦</h1>
      <p style="color:#475569;margin:0 0 20px">Hi ${customer_name || 'there'}, your print is on its way. Hang it somewhere it'll get the light it deserves.</p>

      ${artworkImg ? `<img src="${artworkImg}" alt="Your artwork" style="width:100%;border-radius:12px;margin-bottom:20px"/>` : ''}

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:16px 0">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Tracking</div>
        <div style="font-size:18px;font-weight:700;font-family:monospace;margin-bottom:4px">${tracking_number}</div>
        <div style="font-size:13px;color:#64748b">${carrierLabel}</div>
        ${trackingUrl ? `<div style="margin-top:14px"><a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#818cf8);color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">Track shipment →</a></div>` : ''}
      </div>

      <h3 style="margin:24px 0 8px;font-size:16px">Shipping to</h3>
      <p style="margin:0;color:#334155;font-size:14px"><strong>${customer_name || ''}</strong><br>${fmtAddress(shipping_address)}</p>

      <h3 style="margin:24px 0 8px;font-size:16px">When it arrives</h3>
      <p style="margin:0;color:#334155;font-size:14px;line-height:1.6">
        Inside the box you'll find your print, ready to hang, plus your numbered Certificate of Authenticity — recording your prompt, edition number, and print date. Keep it with the print; it's part of the work.
      </p>

      <p style="margin-top:28px;color:#64748b;font-size:13px">If anything doesn't arrive perfect, reply to this email within 7 days and we'll make it right — no questions asked.</p>
      <p style="margin-top:8px;color:#94a3b8;font-size:12px">aiPRINT.ai · Order ${stripe_session_id || ''}</p>
    </div>
  `.trim();

  return sendEmail({
    to: customer_email,
    subject: 'Your aiPRINT just shipped 📦',
    html,
    // Order-related → replies go to orders@.
    replyTo: ordersTo()
  });
}

export async function sendCreditPurchaseEmail({ email, name, creditsAmount, amountTotal, currency, newBalance, sessionId }) {
  if (!email) return { skipped: true, reason: 'no email' };

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0f1d;background:#ffffff;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:42px;height:42px;border-radius:10px;background:#0a0f1d;color:#fff;font-weight:900;line-height:42px;font-size:18px;letter-spacing:-.5px;">AI</div>
      </div>
      <h1 style="font-size:24px;margin:0 0 12px;text-align:center;font-weight:800;">${creditsAmount} credits added ⚡</h1>
      <p style="color:#475569;margin:0 0 24px;text-align:center;font-size:15px;line-height:1.5">
        Hi ${name || 'there'}, your credits are loaded and ready to use.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px">
        <tr><td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0">Credits added</td><td style="padding:10px 0;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0">${creditsAmount}</td></tr>
        ${typeof newBalance === 'number' ? `<tr><td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0">New balance</td><td style="padding:10px 0;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0">${newBalance}</td></tr>` : ''}
        <tr><td style="padding:10px 0;color:#64748b">Total charged</td><td style="padding:10px 0;text-align:right;font-weight:600">${fmtMoney(amountTotal || 0, currency || 'usd')}</td></tr>
      </table>

      <div style="text-align:center;margin:24px 0;">
        <a href="https://aiprint.ai/" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#818cf8);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">
          Start creating →
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;line-height:1.5">
        Receipt: ${sessionId || ''}<br>
        Questions? Just reply — we respond within 24 hours.<br><br>
        aiPRINT.ai · Made with care in Florida, USA
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: email,
    subject: `${creditsAmount} aiPRINT credits added to your account`,
    html,
    // Purchase-related → replies go to orders@.
    replyTo: ordersTo()
  });
}

// Sent when someone submits the signup form using an email that already has
// a verified account. Signup.js used to respond with 409 "Email already
// registered" which is an enumeration oracle — an attacker could probe 10k
// emails and learn which ones have accounts. Now the API returns the same
// 201 success response regardless, and the real signal moves to the user's
// inbox via this email (for verified accounts) or the verification email
// (for unverified accounts). That way the attacker gets no signal at all.
export async function sendAccountExistsEmail(email, signinUrl) {
  if (!email) return { skipped: true, reason: 'no email' };

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0f1d;background:#ffffff;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:42px;height:42px;border-radius:10px;background:#0a0f1d;color:#fff;font-weight:900;line-height:42px;font-size:18px;letter-spacing:-.5px;">AI</div>
      </div>
      <h1 style="font-size:24px;margin:0 0 12px;text-align:center;font-weight:800;">You already have an account</h1>
      <p style="color:#475569;margin:0 0 24px;text-align:center;font-size:15px;line-height:1.5">
        Someone (hopefully you) just tried to sign up for aiPRINT.ai using <strong>${email}</strong>, but an account with this email already exists. Sign in instead.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${signinUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#818cf8);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">
          Sign in to aiPRINT.ai →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;text-align:center;margin:16px 0 0;line-height:1.5">
        Forgot your password? Use <a href="${signinUrl}" style="color:#6366f1;">the sign-in page</a> and click "Forgot password".
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;line-height:1.5">
        If that wasn't you, no action is needed — your account is safe and nothing has changed. Someone may have mistyped their email.<br><br>
        aiPRINT.ai · Made with care in Florida, USA
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: email,
    subject: 'You already have an aiPRINT.ai account',
    html,
    replyTo: contactTo()
  });
}

export async function sendPasswordResetEmail(email, resetUrl) {
  if (!email) return { skipped: true, reason: 'no email' };

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0f1d;background:#ffffff;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:42px;height:42px;border-radius:10px;background:#0a0f1d;color:#fff;font-weight:900;line-height:42px;font-size:18px;letter-spacing:-.5px;">AI</div>
      </div>
      <h1 style="font-size:24px;margin:0 0 12px;text-align:center;font-weight:800;">Reset your password</h1>
      <p style="color:#475569;margin:0 0 24px;text-align:center;font-size:15px;line-height:1.5">
        Someone (hopefully you) asked to reset the password on your aiPRINT.ai account. Click below to choose a new one.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#818cf8);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">
          Reset my password →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:24px 0 0;line-height:1.5">
        Or paste this into your browser:<br>
        <span style="color:#64748b;word-break:break-all;">${resetUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;line-height:1.5">
        This link expires in 1 hour and can only be used once. If you didn't request a reset, you can safely ignore this email — your password won't change.<br><br>
        aiPRINT.ai · Made with care in Florida, USA
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Reset your aiPRINT.ai password',
    html,
    // Account-support question → goes to info@ (via CONTACT_TO).
    replyTo: contactTo()
  });
}

// Sent to the site operator (CONTACT_TO, default info@) when a customer
// submits the contact form. Uses the customer's email as reply-to so admin
// can just hit Reply to get back to them.
export async function sendContactFormEmail({ name, email, subject, message, orderNumber, newsletter }) {
  const to = contactTo();

  const escape = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const subjectMap = {
    order: 'Question about an order',
    materials: 'Material & sizing help',
    bulk: 'Bulk order inquiry',
    technical: 'Website support',
    other: 'Other'
  };
  const subjectLabel = subjectMap[subject] || subject || 'Contact form message';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0a0f1d;">
      <h2 style="margin:0 0 8px;font-size:20px;">📨 New contact form message</h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:14px;">${escape(subjectLabel)}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px;">
        <tr><td style="padding:8px 0;color:#64748b;width:110px;">From</td><td style="padding:8px 0;"><strong>${escape(name)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Email</td><td style="padding:8px 0;"><a href="mailto:${escape(email)}" style="color:#4f46e5;">${escape(email)}</a></td></tr>
        ${orderNumber ? `<tr><td style="padding:8px 0;color:#64748b;">Order #</td><td style="padding:8px 0;font-family:monospace;">${escape(orderNumber)}</td></tr>` : ''}
        ${newsletter ? `<tr><td style="padding:8px 0;color:#64748b;">Newsletter</td><td style="padding:8px 0;color:#16a34a;">✓ opted in</td></tr>` : ''}
      </table>

      <h3 style="margin:24px 0 8px;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Message</h3>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escape(message)}</div>

      <p style="margin-top:24px;color:#94a3b8;font-size:12px;">Hit reply to respond directly to ${escape(name)}.</p>
    </div>
  `.trim();

  return sendEmail({
    to,
    subject: `[aiPRINT.ai] ${subjectLabel} — ${name}`,
    html,
    replyTo: email
  });
}

// Sent to the customer who submitted the contact form, so they have a
// confirmation that we got their message. Includes a copy of what they
// wrote (so they can reference it later) and sets a clear reply-time
// expectation. ReplyTo is info@ so a reply to this ack lands in support.
export async function sendContactFormCustomerAck({ name, email, subject, message, orderNumber }) {
  if (!email) return { skipped: true, reason: 'no_customer_email' };

  const escape = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const subjectMap = {
    order: 'Question about an order',
    materials: 'Material & sizing help',
    bulk: 'Bulk order inquiry',
    technical: 'Website support',
    other: 'Other'
  };
  const subjectLabel = subjectMap[subject] || subject || 'your message';

  // First name only for the greeting (a bit warmer than full name).
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0a0f1d;background:#ffffff;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:42px;height:42px;border-radius:10px;background:#0a0f1d;color:#fff;font-weight:900;line-height:42px;font-size:18px;letter-spacing:-.5px;">AI</div>
      </div>

      <h1 style="font-size:22px;margin:0 0 12px;text-align:center;font-weight:800;">Thanks, ${escape(firstName)} — we got your message ✨</h1>

      <p style="color:#475569;margin:0 0 24px;text-align:center;font-size:15px;line-height:1.55;">
        A real human will read it and reply within <strong>24 hours</strong> (usually faster on weekdays).
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:24px 0;">
        <p style="margin:0 0 12px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Your message</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 12px;">
          <tr><td style="padding:4px 0;color:#64748b;width:90px;">Subject</td><td style="padding:4px 0;">${escape(subjectLabel)}</td></tr>
          ${orderNumber ? `<tr><td style="padding:4px 0;color:#64748b;">Order #</td><td style="padding:4px 0;font-family:monospace;">${escape(orderNumber)}</td></tr>` : ''}
        </table>
        <div style="font-size:14px;line-height:1.6;color:#0a0f1d;white-space:pre-wrap;border-top:1px solid #e2e8f0;padding-top:12px;">${escape(message)}</div>
      </div>

      <p style="color:#475569;margin:24px 0 0;font-size:14px;line-height:1.55;">
        Need to add something? Just reply to this email and it'll reach the same person.
      </p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 20px;">
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;line-height:1.55;">
        aiPRINT.ai · Made with care in Florida, USA<br>
        You're getting this because you submitted the contact form at aiprint.ai.
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: email,
    subject: 'We got your message — aiPRINT.ai',
    html,
    // If they reply to this ack, route it to the support inbox.
    replyTo: contactTo()
  });
}

export async function sendFulfillmentAlertEmail(order) {
  // New-order alerts go to orders@ (ORDERS_TO) — the fulfillment inbox.
  const to = ordersTo();
  const { customer_email, customer_name, preview_url, clean_url, lookup_key, prompt, amount_total, currency, stripe_session_id, shipping_address, options, quantity } = order;
  // Lawrence (admin) needs the clean print master, not a watermarked preview.
  const printMaster = clean_url || preview_url;
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const qtyBadge = qty > 1
    ? `<span style="display:inline-block;background:#fde047;color:#422006;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:700;margin-left:8px">PRINT × ${qty}</span>`
    : '';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#0a0f1d;">
      <h2 style="margin:0 0 8px">🖨 New print order — ${fmtMoney(amount_total || 0, currency)}${qtyBadge}</h2>
      <p style="margin:0 0 16px;color:#64748b">${lookup_key || '—'} · ${customer_email}${qty > 1 ? ` · <strong style="color:#0a0f1d">print ${qty} copies</strong>` : ''}</p>

      ${printMaster ? `<img src="${printMaster}" alt="Print master" style="width:100%;max-width:520px;border-radius:8px;margin-bottom:8px"/>` : ''}
      ${printMaster ? `<p style="margin:0 0 16px;font-size:12px"><a href="${printMaster}" style="color:#4f46e5;font-weight:600" download>⬇ Download print master (full-resolution, unwatermarked)</a></p>` : ''}

      <h3 style="margin:16px 0 4px;font-size:14px">Ship to</h3>
      <p style="margin:0;font-size:14px"><strong>${customer_name || ''}</strong><br>${fmtAddress(shipping_address)}</p>

      <h3 style="margin:16px 0 4px;font-size:14px">Creative settings</h3>
      <pre style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-word">${JSON.stringify({ prompt, quantity: qty, ...(options || {}) }, null, 2)}</pre>

      <p style="margin-top:16px;font-size:12px;color:#94a3b8">Stripe session: ${stripe_session_id}</p>
    </div>
  `.trim();

  return sendEmail({
    to,
    subject: `🖨 New order · ${lookup_key || 'print'}${qty > 1 ? ` × ${qty}` : ''} · ${fmtMoney(amount_total || 0, currency)}`,
    html,
    replyTo: customer_email
  });
}
