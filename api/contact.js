// POST /api/contact
// Accepts the website contact form and emails CONTACT_TO (default info@)
// via Resend. Replaces the external Formspree dependency with an in-house
// flow so you own the data and get consistent deliverability via your
// existing Resend setup.
//
// Rate-limited to 3 submissions per IP per hour via the anonymous_generations
// table (reuses existing infra — a dedicated contact_submissions table would
// be cleaner but is overkill for this volume).

import { sendContactFormEmail, contactTo } from './_email.js';
import { isValidEmail } from './auth/utils.js';
import { getClientIp } from './auth/utils.js';
import { sql } from '@vercel/postgres';

// Allowed subject keys (must match the <select> in contact.html)
const ALLOWED_SUBJECTS = new Set(['order', 'materials', 'bulk', 'technical', 'other']);

// Simple IP rate limit via a lightweight table. Falls open if the table
// doesn't exist (so an outage in the DB doesn't kill support contact).
async function ipSubmissionsInLastHour(ip) {
  try {
    const r = await sql`
      SELECT COUNT(*)::int AS n
      FROM contact_submissions
      WHERE ip_address = ${ip} AND created_at > NOW() - INTERVAL '1 hour'
    `;
    return r.rows[0]?.n || 0;
  } catch {
    return 0;
  }
}

async function recordSubmission(ip, email) {
  try {
    await sql`
      INSERT INTO contact_submissions (ip_address, email)
      VALUES (${ip}, ${email})
    `;
  } catch (err) {
    // Table might not exist yet — create it lazily so first deploy works
    // without a manual migration.
    if (String(err.message).includes('does not exist')) {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS contact_submissions (
            id SERIAL PRIMARY KEY,
            ip_address VARCHAR(45),
            email VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;
        await sql`
          CREATE INDEX IF NOT EXISTS idx_contact_submissions_ip_created
          ON contact_submissions(ip_address, created_at)
        `;
        // Retry insert
        await sql`
          INSERT INTO contact_submissions (ip_address, email)
          VALUES (${ip}, ${email})
        `;
      } catch (innerErr) {
        console.error('contact: could not create/insert submission log:', innerErr.message);
      }
    } else {
      console.error('contact: submission log insert failed:', err.message);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const name = String(body?.name || '').trim().slice(0, 100);
  const email = String(body?.email || '').trim().slice(0, 200).toLowerCase();
  const subject = String(body?.subject || '').trim();
  const message = String(body?.message || '').trim();
  const orderNumber = String(body?.orderNumber || '').trim().slice(0, 50) || null;
  const newsletter = body?.newsletter === true || body?.newsletter === 'on' || body?.newsletter === '1';
  // Honeypot — hidden field in the form. If filled, silently accept but drop.
  const honeypot = String(body?.website || '').trim();

  // Validate
  if (!name || name.length < 2) {
    return res.status(400).json({ ok: false, error: 'Please provide your name.' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
  }
  if (!ALLOWED_SUBJECTS.has(subject)) {
    return res.status(400).json({ ok: false, error: 'Please select a valid subject.' });
  }
  if (!message || message.length < 10) {
    return res.status(400).json({ ok: false, error: 'Please write a message of at least 10 characters.' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Message is too long (5000 character max).' });
  }

  // Honeypot: a bot filled the hidden field. Pretend everything's fine.
  if (honeypot) {
    console.warn('contact: honeypot triggered — dropping silently', { email, honeypotValue: honeypot.slice(0, 40) });
    return res.status(200).json({ ok: true, message: 'Thanks — we received your message.' });
  }

  const ip = getClientIp(req);

  // Rate limit: 3/hour/IP
  const recent = await ipSubmissionsInLastHour(ip);
  if (recent >= 3) {
    return res.status(429).json({
      ok: false,
      error: 'You\'ve sent a few messages in the last hour. Please wait a bit before sending another, or email info@aiprint.ai directly.'
    });
  }

  // Send via Resend
  const to = contactTo();
  console.log('contact: sending', { to, from: process.env.EMAIL_FROM || 'aiPRINT <orders@aiprint.ai>', subject, replyTo: email });
  try {
    const result = await sendContactFormEmail({ name, email, subject, message, orderNumber, newsletter });
    if (result?.skipped) {
      console.error('contact: Resend skipped:', result);
      return res.status(502).json({
        ok: false,
        error: 'Email is not configured on the server right now. Please email info@aiprint.ai directly.'
      });
    }
    if (result?.error) {
      console.error('contact: Resend error:', result);
      return res.status(502).json({
        ok: false,
        error: 'We couldn\'t send your message right now. Please email info@aiprint.ai directly.'
      });
    }
    console.log('contact: Resend accepted', { id: result?.id || null });
  } catch (err) {
    console.error('contact: threw:', err?.message || err);
    return res.status(502).json({
      ok: false,
      error: 'We couldn\'t send your message right now. Please email info@aiprint.ai directly.'
    });
  }

  // Log for rate limiting
  await recordSubmission(ip, email);

  return res.status(200).json({
    ok: true,
    message: 'Thanks — we received your message and will reply within 24 hours.'
  });
}
