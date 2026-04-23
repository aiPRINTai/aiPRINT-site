// Admin CSV export of all users. Auth: Bearer ADMIN_PASSWORD.
import { listUsersWithStats, logAdminAction } from '../db/index.js';
import { requireAdmin } from './_auth.js';
import { getClientIp } from '../auth/utils.js';

function csvField(v) {
  if (v == null) return '';
  let s = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const search = (req.query.search || '').trim() || null;
    const verifiedOnly = req.query.verifiedOnly === '1' || req.query.verifiedOnly === 'true';
    const users = await listUsersWithStats({ limit: 5000, search, verifiedOnly });

    // Audit trail: user exports contain emails + verification status, so log
    // every export so you can trace a leak back to an actor if needed.
    try {
      await logAdminAction({
        action: 'export_users_csv',
        actor_ip: getClientIp(req),
        details: { search, verifiedOnly, count: users.length }
      });
    } catch (_) { /* never fail the export on audit write */ }

    const headers = [
      'id', 'email', 'email_verified', 'credits_balance',
      'order_count', 'lifetime_spend_cents', 'generation_count',
      'created_at', 'updated_at'
    ];
    const lines = [headers.join(',')];
    for (const u of users) {
      lines.push([
        u.id, u.email, u.email_verified, u.credits_balance,
        u.order_count, u.lifetime_cents, u.generation_count,
        u.created_at, u.updated_at
      ].map(csvField).join(','));
    }

    const filename = `aiprint-users-${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(lines.join('\n'));
  } catch (err) {
    console.error('CSV export error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
