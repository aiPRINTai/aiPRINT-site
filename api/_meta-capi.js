// Meta Conversions API helper.
// Sends server-side events to Meta with SHA256-hashed user data, deduped
// against browser pixel events via a shared event_id.
import crypto from 'crypto';

const PIXEL_ID = '2679208262451729';
const API_VERSION = 'v21.0';

const sha256 = (v) => {
  if (!v) return undefined;
  return crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
};

export async function sendMetaEvent({ eventName, eventId, eventSourceUrl, userData = {}, customData = {}, testEventCode }) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return { skipped: 'no_token' };

  const hashed = {
    em: userData.email ? [sha256(userData.email)] : undefined,
    ph: userData.phone ? [sha256(userData.phone.replace(/\D/g, ''))] : undefined,
    fn: userData.firstName ? [sha256(userData.firstName)] : undefined,
    ln: userData.lastName ? [sha256(userData.lastName)] : undefined,
    ct: userData.city ? [sha256(userData.city)] : undefined,
    st: userData.state ? [sha256(userData.state)] : undefined,
    zp: userData.zip ? [sha256(userData.zip)] : undefined,
    country: userData.country ? [sha256(userData.country)] : undefined,
    client_ip_address: userData.clientIp,
    client_user_agent: userData.userAgent,
    fbc: userData.fbc,
    fbp: userData.fbp
  };
  Object.keys(hashed).forEach(k => hashed[k] === undefined && delete hashed[k]);

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: eventSourceUrl,
      user_data: hashed,
      custom_data: customData
    }]
  };
  if (testEventCode) payload.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('❌ Meta CAPI error:', res.status, body);
      return { ok: false, status: res.status, body };
    }
    return { ok: true, body };
  } catch (err) {
    console.error('❌ Meta CAPI fetch failed:', err);
    return { ok: false, error: err.message };
  }
}
