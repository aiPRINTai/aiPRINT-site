// GET /api/auth/verify?token=...
// Validates the token, marks the email verified, issues a JWT, and redirects
// to /verified.html so the user lands logged in.

import { getUserByVerificationToken, markEmailVerified } from '../db/index.js';
import { generateToken, createAuthCookie } from './utils.js';

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function htmlPage({ title, body }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
  <style>
    body{background:#0a0f1d;color:#e7eef8;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;}
    .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:36px;border-radius:16px;max-width:440px;text-align:center;}
    h1{font-size:24px;margin:0 0 12px;font-weight:800;}
    p{color:#94a3b8;margin:0 0 20px;line-height:1.5;}
    a.btn{display:inline-block;background:linear-gradient(135deg,#6366f1,#818cf8);color:white;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;}
  </style></head><body><div class="card">${body}</div></body></html>`;
}

export default async function handler(req, res) {
  const token = (req.query.token || '').trim();

  if (!token) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(htmlPage({
      title: 'Invalid link',
      body: `<h1>Invalid verification link</h1><p>The link is missing a token.</p><a class="btn" href="/">Back to home</a>`
    }));
  }

  try {
    const user = await getUserByVerificationToken(token);
    if (!user) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(htmlPage({
        title: 'Link expired',
        body: `<h1>Link expired or already used</h1><p>Verification links are valid for 24 hours and only work once. You can request a new one from the login screen.</p><a class="btn" href="/">Back to home</a>`
      }));
    }

    const verified = await markEmailVerified(user.id);
    const jwt = generateToken(verified);
    res.setHeader('Set-Cookie', createAuthCookie(jwt));
    return res.redirect(302, `/verified.html?token=${encodeURIComponent(jwt)}`);
  } catch (err) {
    console.error('Verify error:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(htmlPage({
      title: 'Server error',
      body: `<h1>Something went wrong</h1><p>Please try again. If this keeps happening, email info@aiprint.ai.</p><a class="btn" href="/">Back to home</a>`
    }));
  }
}
