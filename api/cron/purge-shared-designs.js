// api/cron/purge-shared-designs.js
// Daily retention cron. Deletes shared_designs rows older than N days so the
// table doesn't grow unbounded with stale preset blobs — those payloads can
// include the user's prompt text, which is PII-adjacent (kids' names, pets,
// addresses, etc.). Scheduled via the `crons` entry in vercel.json.
//
// Auth: Vercel's scheduler calls this endpoint with an `Authorization:
// Bearer <CRON_SECRET>` header when the CRON_SECRET env var is set on the
// project. We additionally gate on that here so a randomly-hit public GET
// can't trigger a purge.

import { purgeOldSharedDesigns } from '../db/index.js';

const DEFAULT_RETENTION_DAYS = 180;

export default async function handler(req, res) {
  // Reject anything that doesn't come from the Vercel cron runner.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('purge-shared-designs: CRON_SECRET not configured — refusing to run');
    return res.status(500).json({ error: 'Cron not configured' });
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const daysParam = Number(req.query?.days);
  const days = Number.isFinite(daysParam) && daysParam > 0
    ? daysParam
    : DEFAULT_RETENTION_DAYS;

  try {
    const deleted = await purgeOldSharedDesigns(days);
    console.log(`purge-shared-designs: deleted ${deleted} rows older than ${days} days`);
    return res.status(200).json({ ok: true, deleted, retentionDays: days });
  } catch (err) {
    console.error('purge-shared-designs error:', err?.message || err);
    return res.status(500).json({ error: 'Purge failed' });
  }
}
