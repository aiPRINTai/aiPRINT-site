// Pinterest Conversions API helper.
// Sends server-side events to Pinterest with SHA256-hashed user data,
// deduped against browser tag events via a shared event_id.
import crypto from 'crypto';

const API_BASE = 'https://api.pinterest.com/v5';

const sha256 = (v) => {
  if (!v) return undefined;
  return crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
};

export async function sendPinterestEvent({
  eventName,
  eventId,
  eventSourceUrl,
  userData = {},
  customData = {},
  test = false
}) {
  const token = process.env.PINTEREST_CAPI_TOKEN;
  const adAccountId = process.env.PINTEREST_AD_ACCOUNT_ID;
  if (!token || !adAccountId) return { skipped: 'no_token_or_account' };

  const hashed = {
    em: userData.email ? [sha256(userData.email)] : undefined,
    ph: userData.phone ? [sha256(userData.phone.replace(/\D/g, ''))] : undefined,
    fn: userData.firstName ? [sha256(userData.firstName)] : undefined,
    ln: userData.lastName ? [sha256(userData.lastName)] : undefined,
    ct: userData.city ? [sha256(userData.city)] : undefined,
    st: userData.state ? [sha256(userData.state)] : undefined,
    zp: userData.zip ? [sha256(userData.zip)] : undefined,
    country: userData.country ? [sha256(userData.country)] : undefined,
    external_id: userData.externalId ? [sha256(userData.externalId)] : undefined,
    client_ip_address: userData.clientIp,
    client_user_agent: userData.userAgent,
    click_id: userData.clickId
  };
  Object.keys(hashed).forEach(k => hashed[k] === undefined && delete hashed[k]);

  const payload = {
    data: [{
      event_name: eventName,
      action_source: 'web',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl,
      user_data: hashed,
      custom_data: customData
    }]
  };

  const url = `${API_BASE}/ad_accounts/${adAccountId}/events${test ? '?test=true' : ''}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('❌ Pinterest CAPI error:', res.status, body);
      return { ok: false, status: res.status, body };
    }
    return { ok: true, body };
  } catch (err) {
    console.error('❌ Pinterest CAPI fetch failed:', err);
    return { ok: false, error: err.message };
  }
}
