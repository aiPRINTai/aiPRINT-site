// Transactional email via Resend HTTP API.
// Requires env vars:
//   RESEND_API_KEY  - from resend.com dashboard
//   EMAIL_FROM      - e.g. "aiPRINT <orders@aiprint.ai>"  (sender domain must be verified in Resend)
//   FULFILLMENT_TO  - e.g. "info@aiprint.ai"              (where new-order alerts go)

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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
    replyTo: process.env.FULFILLMENT_TO || 'info@aiprint.ai'
  });
}

export async function sendOrderConfirmationEmail(order) {
  const { customer_email, customer_name, preview_url, clean_url, lookup_key, prompt, amount_total, currency, stripe_session_id, shipping_address } = order;
  if (!customer_email) return { skipped: true, reason: 'no email' };
  // Customer paid — show them the clean image, not the watermarked preview.
  const artworkImg = clean_url || preview_url;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0f1d;">
      <h1 style="font-size:24px;margin:0 0 8px">Your aiPRINT is in the works 🎨</h1>
      <p style="color:#475569;margin:0 0 20px">Hi ${customer_name || 'there'}, your order is confirmed. Here are the details:</p>

      ${artworkImg ? `<img src="${artworkImg}" alt="Your artwork" style="width:100%;border-radius:12px;margin-bottom:20px"/>` : ''}

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#64748b">Order</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-size:12px">${stripe_session_id}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Finish / Size</td><td style="padding:8px 0;text-align:right">${lookup_key || '—'}</td></tr>
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
    replyTo: process.env.FULFILLMENT_TO || 'info@aiprint.ai'
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
    replyTo: process.env.FULFILLMENT_TO || 'info@aiprint.ai'
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
    replyTo: process.env.FULFILLMENT_TO || 'info@aiprint.ai'
  });
}

export async function sendFulfillmentAlertEmail(order) {
  const to = process.env.FULFILLMENT_TO || 'info@aiprint.ai';
  const { customer_email, customer_name, preview_url, clean_url, lookup_key, prompt, amount_total, currency, stripe_session_id, shipping_address, options } = order;
  // Lawrence (admin) needs the clean print master, not a watermarked preview.
  const printMaster = clean_url || preview_url;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#0a0f1d;">
      <h2 style="margin:0 0 8px">🖨 New print order — ${fmtMoney(amount_total || 0, currency)}</h2>
      <p style="margin:0 0 16px;color:#64748b">${lookup_key || '—'} · ${customer_email}</p>

      ${printMaster ? `<img src="${printMaster}" alt="Print master" style="width:100%;max-width:520px;border-radius:8px;margin-bottom:8px"/>` : ''}
      ${printMaster ? `<p style="margin:0 0 16px;font-size:12px"><a href="${printMaster}" style="color:#4f46e5;font-weight:600" download>⬇ Download print master (full-resolution, unwatermarked)</a></p>` : ''}

      <h3 style="margin:16px 0 4px;font-size:14px">Ship to</h3>
      <p style="margin:0;font-size:14px"><strong>${customer_name || ''}</strong><br>${fmtAddress(shipping_address)}</p>

      <h3 style="margin:16px 0 4px;font-size:14px">Creative settings</h3>
      <pre style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-word">${JSON.stringify({ prompt, ...(options || {}) }, null, 2)}</pre>

      <p style="margin-top:16px;font-size:12px;color:#94a3b8">Stripe session: ${stripe_session_id}</p>
    </div>
  `.trim();

  return sendEmail({
    to,
    subject: `🖨 New order · ${lookup_key || 'print'} · ${fmtMoney(amount_total || 0, currency)}`,
    html,
    replyTo: customer_email
  });
}
