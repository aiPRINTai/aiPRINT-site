// Admin endpoint: list users + per-user detail + admin actions.
// Auth: `Authorization: Bearer <ADMIN_PASSWORD>` header.
//
// GET  /api/admin/users                          → { users:[], stats:{} }
// GET  /api/admin/users?search=foo               → filter by email (LIKE)
// GET  /api/admin/users?verifiedOnly=1           → only verified users
// GET  /api/admin/users?id=<uuid>                → detail (user + orders + txns + gens)
// POST /api/admin/users  { id, action: "grant_credits", amount, reason }
// POST /api/admin/users  { id, action: "resend_verification" }

import crypto from 'node:crypto';
import {
  listUsersWithStats,
  getUserStats,
  getUserDetail,
  getUserById,
  getUserByEmail,
  setVerificationToken,
  logAdminAction,
  listAdminActions
} from '../db/index.js';
import { addCreditsToUser } from '../credits/utils.js';
import { addCreditTransaction, updateUserCredits } from '../db/index.js';
import { sendVerificationEmail } from '../_email.js';
import { getClientIp } from '../auth/utils.js';

function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized' });
}

function checkAuth(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token && token === expected;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!checkAuth(req)) return unauthorized(res);

  try {
    if (req.method === 'GET') {
      // Audit log: /api/admin/users?audit=1[&user_id=<uuid>]
      if (req.query.audit === '1' || req.query.audit === 'true') {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const offset = parseInt(req.query.offset) || 0;
        const userId = req.query.user_id || null;
        const actions = await listAdminActions({ limit, offset, userId });
        return res.status(200).json({ actions });
      }

      // Detail view: /api/admin/users?id=<uuid>
      if (req.query.id) {
        const detail = await getUserDetail(req.query.id);
        if (!detail) return res.status(404).json({ error: 'User not found' });
        // Recent admin actions targeting this user
        const actions = await listAdminActions({ userId: req.query.id, limit: 25 });
        return res.status(200).json({ ...detail, admin_actions: actions });
      }

      // List view
      const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
      const offset = parseInt(req.query.offset) || 0;
      const search = (req.query.search || '').trim() || null;
      const verifiedOnly = req.query.verifiedOnly === '1' || req.query.verifiedOnly === 'true';

      const [users, stats] = await Promise.all([
        listUsersWithStats({ limit, offset, search, verifiedOnly }),
        getUserStats()
      ]);
      return res.status(200).json({ users, stats });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { id, action } = body || {};
      if (!id || !action) return res.status(400).json({ error: 'Missing id or action' });

      const user = await getUserById(id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (action === 'grant_credits') {
        const amount = parseInt(body.amount, 10);
        const reason = (body.reason || '').trim() || 'Admin grant';
        if (!Number.isFinite(amount) || amount === 0) {
          return res.status(400).json({ error: 'amount must be a nonzero integer' });
        }
        // Clamp to a reasonable range so a typo can't bankrupt or mint millions.
        if (amount > 10000 || amount < -10000) {
          return res.status(400).json({ error: 'amount out of range (-10000..10000)' });
        }

        const actorIp = getClientIp(req);
        if (amount > 0) {
          const r = await addCreditsToUser(id, amount, `Admin grant: ${reason}`, null);
          await logAdminAction({
            action: 'grant_credits',
            target_user_id: id,
            actor_ip: actorIp,
            details: { amount, reason, new_balance: r.newBalance, target_email: user.email }
          });
          return res.status(200).json({ ok: true, newBalance: r.newBalance, creditsAdded: amount });
        }

        // Negative: deduct, but don't go below zero.
        const currentBalance = user.credits_balance || 0;
        const deduct = Math.min(Math.abs(amount), currentBalance);
        if (deduct === 0) {
          return res.status(400).json({ error: 'User has no credits to deduct' });
        }
        const newBalance = currentBalance - deduct;
        await updateUserCredits(id, newBalance);
        await addCreditTransaction(id, -deduct, 'admin_adjustment', `Admin deduct: ${reason}`, null);
        await logAdminAction({
          action: 'deduct_credits',
          target_user_id: id,
          actor_ip: actorIp,
          details: { amount: -deduct, reason, new_balance: newBalance, target_email: user.email }
        });
        return res.status(200).json({ ok: true, newBalance, creditsAdded: -deduct });
      }

      if (action === 'resend_verification') {
        // Fresh user row (getUserById drops the verification columns — re-read
        // by email to pick them up).
        const full = await getUserByEmail(user.email);
        if (!full) return res.status(404).json({ error: 'User not found' });
        if (full.email_verified) {
          return res.status(400).json({ error: 'User is already verified' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await setVerificationToken(full.id, token, expires);

        const origin = process.env.CLIENT_URL
          || req.headers.origin
          || `https://${req.headers.host || 'aiprint.ai'}`;
        const verifyUrl = `${origin}/api/auth/verify?token=${token}`;
        try {
          const r = await sendVerificationEmail(full.email, verifyUrl);
          if (r?.error) return res.status(502).json({ error: r.error.message || 'Email failed' });
        } catch (err) {
          console.error('Verification email threw:', err);
          return res.status(502).json({ error: 'Email send failed' });
        }
        await logAdminAction({
          action: 'resend_verification',
          target_user_id: full.id,
          actor_ip: getClientIp(req),
          details: { target_email: full.email }
        });
        return res.status(200).json({ ok: true, sent_to: full.email });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
