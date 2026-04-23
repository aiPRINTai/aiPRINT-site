// GET /api/admin/email-test?to=you@example.com
// Diagnostic: checks env vars and attempts a real send. Password-gated via
// the shared requireAdmin helper (constant-time compare + per-IP rate limit).
// Returns plain JSON describing exactly what's misconfigured.

import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const to = (req.query.to || '').trim();
    if (!to) return res.status(400).json({ error: 'Pass ?to=email@example.com' });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;

    // Show the full routing picture so it's clear where each kind of mail lands.
    const ordersTo = process.env.ORDERS_TO || 'orders@aiprint.ai (default)';
    const contactTo = process.env.CONTACT_TO
      || process.env.FULFILLMENT_TO
      || 'info@aiprint.ai (default)';

    const checks = {
      RESEND_API_KEY_set: !!apiKey,
      RESEND_API_KEY_prefix: apiKey ? apiKey.slice(0, 6) + '…' : null,
      EMAIL_FROM_set: !!from,
      EMAIL_FROM_value: from || '(unset, will fall back to "aiPRINT <orders@aiprint.ai>")',
      ORDERS_TO: ordersTo,
      CONTACT_TO: contactTo,
      FULFILLMENT_TO_legacy: process.env.FULFILLMENT_TO || '(unset)',
      routing: {
        new_order_alerts: ordersTo,
        order_confirmation_replyto: ordersTo,
        shipping_notification_replyto: ordersTo,
        credit_purchase_replyto: ordersTo,
        contact_form_destination: contactTo,
        email_verification_replyto: contactTo,
        password_reset_replyto: contactTo
      }
    };

    if (!apiKey) {
      return res.status(200).json({ ok: false, problem: 'RESEND_API_KEY missing in Vercel env vars', checks });
    }

    const sender = from || 'aiPRINT <orders@aiprint.ai>';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: [to],
        subject: 'aiPRINT email diagnostic ✅',
        html: `<p>If you got this, Resend is working.</p><p>Sender: <code>${sender}</code></p>`
      })
    });
    const body = await r.text();
    let parsed; try { parsed = JSON.parse(body); } catch { parsed = body; }

    if (!r.ok) {
      let hint = 'Unknown — see resendResponse.';
      const lower = body.toLowerCase();
      if (lower.includes('domain') && lower.includes('not verified')) hint = 'Your sender domain is NOT verified in Resend. Go to resend.com/domains and finish DNS setup.';
      else if (lower.includes('from') && (lower.includes('invalid') || lower.includes('not allowed'))) hint = 'EMAIL_FROM uses an address whose domain is not verified in Resend.';
      else if (r.status === 401 || r.status === 403) hint = 'RESEND_API_KEY is invalid, revoked, or lacks permission. Regenerate it in resend.com/api-keys.';
      else if (r.status === 422) hint = 'Resend rejected the payload — usually the from-address domain is unverified.';
      return res.status(200).json({ ok: false, status: r.status, hint, sender, resendResponse: parsed, checks });
    }

    return res.status(200).json({ ok: true, message: `Sent to ${to}`, sender, resendResponse: parsed, checks });
  } catch (err) {
    console.error('Admin email-test error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
