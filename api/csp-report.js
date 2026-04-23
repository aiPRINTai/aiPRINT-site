// api/csp-report.js
// Browser-posted Content-Security-Policy violation reports. Wired via
// the `report-uri` directive in vercel.json's CSP header. Every time a
// real user's browser would have blocked something (while we're still
// in Report-Only mode), it POSTs a JSON report here.
//
// We log a condensed line to Vercel's runtime logs so you can grep for
// "csp-report" in Observability > Logs. That's the observation channel
// for the 3–7 day CSP bake before we flip Report-Only -> enforcing.
//
// Browsers send two possible body shapes depending on whether the site
// uses the legacy `report-uri` or the newer Reporting API:
//
//   Legacy: { "csp-report": { "document-uri": ..., "blocked-uri": ..., ... } }
//   New:    [{ "type": "csp-violation", "body": { "documentURL": ..., ... } }]
//
// We accept either and normalize to a single log line.
//
// Why a separate endpoint and not a third-party service:
// - No new vendor, no PII exfiltration to a third party.
// - Vercel logs are free and retained long enough for a 1-week audit.
// - We rate-limit so a hostile site (or misconfigured app) can't flood us.

import { enforceRateLimit } from './_rate-limit.js';

export const config = { api: { bodyParser: true } };

const MAX_BODY_BYTES = 8 * 1024; // 8 KB — real reports are well under 1 KB

function extractReport(body) {
  // Legacy report-uri format
  if (body && typeof body === 'object' && body['csp-report']) {
    const r = body['csp-report'];
    return {
      documentUri: r['document-uri'] || r['documentURI'] || '',
      referrer: r['referrer'] || '',
      violatedDirective: r['violated-directive'] || r['effective-directive'] || '',
      blockedUri: r['blocked-uri'] || '',
      sourceFile: r['source-file'] || '',
      lineNumber: r['line-number'] || 0,
      disposition: r['disposition'] || 'report'
    };
  }
  // Reporting API format — body is an array
  if (Array.isArray(body) && body[0]?.body) {
    const r = body[0].body;
    return {
      documentUri: r.documentURL || '',
      referrer: r.referrer || '',
      violatedDirective: r.effectiveDirective || r.violatedDirective || '',
      blockedUri: r.blockedURL || '',
      sourceFile: r.sourceFile || '',
      lineNumber: r.lineNumber || 0,
      disposition: r.disposition || 'report'
    };
  }
  return null;
}

export default async function handler(req, res) {
  // Browsers use POST (legacy) or POST with Content-Type: application/reports+json.
  // Anything else is noise — drop it quietly without leaking that we exist.
  if (req.method !== 'POST') {
    return res.status(204).end();
  }

  // Defense: a buggy app or hostile site could spam this endpoint. 60/min/IP
  // is way more than any browser will ever produce for a single user.
  const rl = enforceRateLimit(req, res, { bucket: 'csp-report', limit: 60, windowMs: 60_000 });
  if (!rl.ok) return;

  try {
    const body = req.body || {};
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyStr.length > MAX_BODY_BYTES) {
      return res.status(413).end();
    }

    const report = extractReport(body);
    if (!report) {
      return res.status(204).end(); // ignore malformed reports silently
    }

    // Single-line structured log so `grep csp-report` in Vercel logs gives
    // you a sortable, diffable stream. Keep keys short; these get typed by
    // hand into allowlist updates.
    console.log(
      `[csp-report] directive="${report.violatedDirective}" blocked="${report.blockedUri}" doc="${report.documentUri}" src="${report.sourceFile}:${report.lineNumber}"`
    );

    // Browsers ignore the response body but expect a quick 2xx.
    return res.status(204).end();
  } catch (err) {
    // Never leak details; CSP reports must not fail user page loads.
    console.error('csp-report handler error:', err?.message || err);
    return res.status(204).end();
  }
}
