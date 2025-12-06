// IMPORTANT: This endpoint must receive the RAW body for Stripe signature verification
import { stripe } from './_stripe.js';
import { json, rawBody } from './_util.js';
import { google } from 'googleapis';

export const config = { api: { bodyParser: false } }; // Vercel/Next tells not to parse

async function saveOrderToGoogleSheets(order) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS || '{}');
    const spreadsheetId = process.env.GOOGLE_SHEETS_ORDER_SHEET_ID;

    if (!credentials.client_email || !spreadsheetId) {
      console.warn('Google Sheets not configured - skipping order save');
      return;
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const shippingAddress = order.customer.address
      ? `${order.customer.address.line1 || ''}, ${order.customer.address.city || ''}, ${order.customer.address.state || ''} ${order.customer.address.postal_code || ''}, ${order.customer.address.country || ''}`
      : '';

    const row = [
      order.order_id,
      new Date(order.created).toISOString(),
      order.customer.email,
      order.customer.name,
      shippingAddress,
      order.options.product_name || order.lookup_key,
      (order.amount_total / 100).toFixed(2), // Convert cents to dollars
      (order.tax_amount / 100).toFixed(2),
      order.preview_url,
      order.prompt,
      'Pending' // Status
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:K', // Append to columns A through K
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.log('✅ Order saved to Google Sheets:', order.order_id);
  } catch (err) {
    console.error('❌ Error saving to Google Sheets:', err.message);
    // Don't throw - we don't want to fail the webhook if sheets save fails
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  const buf = await rawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return json(res, 400, { error: `Webhook signature verification failed: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const m = s.metadata || {};
    const order = {
      order_id: s.id,
      lookup_key: m.lookup_key,
      preview_url: m.preview_url,
      prompt: m.prompt,
      options: {
        ratio: m.ratio,
        style: m.style,
        mood: m.mood,
        light: m.light,
        composition: m.composition,
        medium: m.medium,
        signature: m.signature_json ? JSON.parse(m.signature_json) : null,
        product_name: m.product_name,
        product_description: m.product_description
      },
      customer: {
        email: s.customer_details?.email || '',
        name: s.shipping_details?.name || '',
        address: s.shipping_details?.address || null
      },
      amount_total: s.amount_total,
      tax_amount: s.total_details?.amount_tax || 0,
      created: Date.now()
    };

    console.log('✅ Order captured:', order);

    // Save to Google Sheets
    await saveOrderToGoogleSheets(order);
  }

  res.status(200).json({ received: true });
}
