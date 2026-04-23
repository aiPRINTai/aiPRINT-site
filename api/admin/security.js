// Admin security dashboard.
// Auth: Bearer ADMIN_PASSWORD via the shared requireAdmin gate.
//
// GET /api/admin/security             → posture + audit rollup + shared-designs retention
// GET /api/admin/security?actions=1   → paginated admin audit log
//       ?limit=50&offset=0&action=<name>&user_id=<uuid>
//
// Note: rate-limit bucket state is in-memory per Vercel function instance, so
// we do not try to surface it here — a snapshot from this instance would be
// misleading. CSP reports are currently console-logged only (no table), so
// we surface the posture bit ("reporting enabled") without counts.

import {
  listAdminActions,
  getAdminActionStats,
  getSharedDesignStats
} from '../db/index.js';
import { requireAdmin } from './_auth.js';

function getPosture() {
  // Reflect what's actually configured in the live environment so the
  // admin can spot missing env vars at a glance.
  return {
    admin_password_set: !!process.env.ADMIN_PASSWORD,
    cron_secret_set: !!process.env.CRON_SECRET,
    resend_api_key_set: !!process.env.RESEND_API_KEY,
    stripe_webhook_secret_set: !!process.env.STRIPE_WEBHOOK_SECRET,
    jwt_secret_set: !!process.env.JWT_SECRET,
    // Things you can't detect from env but are always-on in the codebase.
    // Exposing them as booleans makes the panel a living security checklist.
    admin_timing_safe_compare: true,
    admin_rate_limit_per_ip: '30/min',
    auth_login_rate_limit_per_ip: '20 / 5min',
    auth_login_rate_limit_per_email: '5 / 15min',
    auth_signup_rate_limit_per_ip: '10 / hour',
    auth_signup_rate_limit_per_email: '3 / hour',
    signup_email_enumeration_hardened: true,
    security_headers_active: true,  // HSTS + CSP-RO + XFO + referrer etc. from vercel.json
    csp_report_only: true,
    csp_reporting_endpoint: '/api/csp-report',
    shared_designs_retention_days: 180,
    shared_designs_purge_cron: '/api/cron/purge-shared-designs (daily 04:00 UTC)',
    robots_disallow_token_pages: true
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Paginated audit log view — drives the main table on the page.
    if (req.query.actions === '1' || req.query.actions === 'true') {
      const limit = Math.min(parseInt(req.query.limit) || 50, 500);
      const offset = parseInt(req.query.offset) || 0;
      const userId = req.query.user_id || null;
      // Note: action-type filter is applied in-memory after fetching; actions
      // volume is low enough that over-fetching by a factor is cheaper than
      // adding another query variant in db/index.js.
      let rows = await listAdminActions({ limit: limit * 4, offset, userId });
      const actionFilter = (req.query.action || '').trim();
      if (actionFilter) rows = rows.filter(r => r.action === actionFilter);
      rows = rows.slice(0, limit);
      return res.status(200).json({ actions: rows });
    }

    // Default: full security rollup.
    const [actionStats, sharedStats, recent] = await Promise.all([
      getAdminActionStats(),
      getSharedDesignStats(),
      listAdminActions({ limit: 25 })
    ]);

    return res.status(200).json({
      posture: getPosture(),
      audit: {
        ...actionStats,
        recent
      },
      shared_designs: sharedStats
    });
  } catch (err) {
    console.error('Admin security error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
