import { sql } from '@vercel/postgres';

/**
 * Database utilities for aiPRINT credit system
 */

// User operations
export async function createUser(email, passwordHash, { verificationToken = null, verificationExpires = null } = {}) {
  const result = await sql`
    INSERT INTO users (email, password_hash, credits_balance, email_verified, verification_token, verification_expires)
    VALUES (${email}, ${passwordHash}, 10, FALSE, ${verificationToken}, ${verificationExpires})
    RETURNING id, email, credits_balance, email_verified, created_at
  `;
  return result.rows[0];
}

export async function getUserByVerificationToken(token) {
  const result = await sql`
    SELECT * FROM users
    WHERE verification_token = ${token}
      AND verification_expires > NOW()
      AND email_verified = FALSE
  `;
  return result.rows[0];
}

export async function markEmailVerified(userId) {
  const result = await sql`
    UPDATE users
    SET email_verified = TRUE,
        verification_token = NULL,
        verification_expires = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
    RETURNING id, email, credits_balance, email_verified, created_at
  `;
  return result.rows[0];
}

export async function setVerificationToken(userId, token, expires) {
  const result = await sql`
    UPDATE users
    SET verification_token = ${token},
        verification_expires = ${expires},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId} AND email_verified = FALSE
    RETURNING id, email
  `;
  return result.rows[0];
}

export async function getUserByEmail(email) {
  const result = await sql`
    SELECT * FROM users WHERE email = ${email}
  `;
  return result.rows[0];
}

export async function getUserById(userId) {
  const result = await sql`
    SELECT id, email, credits_balance, created_at, updated_at
    FROM users WHERE id = ${userId}
  `;
  return result.rows[0];
}

export async function updateUserCredits(userId, newBalance) {
  const result = await sql`
    UPDATE users
    SET credits_balance = ${newBalance}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
    RETURNING credits_balance
  `;
  return result.rows[0];
}

// Credit transaction operations
export async function addCreditTransaction(userId, amount, type, description = null, stripePaymentId = null) {
  const result = await sql`
    INSERT INTO credit_transactions (user_id, amount, type, description, stripe_payment_id)
    VALUES (${userId}, ${amount}, ${type}, ${description}, ${stripePaymentId})
    RETURNING *
  `;
  return result.rows[0];
}

export async function getCreditTransactionByStripePaymentId(stripePaymentId) {
  if (!stripePaymentId) return null;
  const result = await sql`
    SELECT * FROM credit_transactions
    WHERE stripe_payment_id = ${stripePaymentId}
    LIMIT 1
  `;
  return result.rows[0] || null;
}

// Atomic credit deduction — prevents race conditions where two concurrent
// generations both read the same balance, both pass the check, and both write
// (balance - 1), effectively giving one free generation.
// Returns the new balance, or null if the user didn't have enough.
export async function atomicDeductCredits(userId, amount = 1) {
  const result = await sql`
    UPDATE users
    SET credits_balance = credits_balance - ${amount}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId} AND credits_balance >= ${amount}
    RETURNING credits_balance
  `;
  return result.rows[0]?.credits_balance ?? null;
}

export async function getUserCreditHistory(userId, limit = 50) {
  const result = await sql`
    SELECT * FROM credit_transactions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result.rows;
}

// Generation tracking
// imageUrl = watermarked preview (public)
// cleanUrl = original full-res file (admin / post-payment only)
export async function recordGeneration(userId, ipAddress, prompt, imageUrl, size, cost = 0.035, cleanUrl = null) {
  const result = await sql`
    INSERT INTO generations (user_id, ip_address, prompt, image_url, clean_url, size, cost)
    VALUES (${userId}, ${ipAddress}, ${prompt}, ${imageUrl}, ${cleanUrl}, ${size}, ${cost})
    RETURNING *
  `;
  return result.rows[0];
}

// Look up the clean original by the public preview URL.
// Used by create-checkout-session.js to thread the clean URL into Stripe metadata
// without ever exposing it to the browser.
export async function getCleanUrlForPreview(previewUrl) {
  if (!previewUrl) return null;
  const result = await sql`
    SELECT clean_url FROM generations
    WHERE image_url = ${previewUrl} AND clean_url IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return result.rows[0]?.clean_url || null;
}

export async function getUserGenerations(userId, limit = 50) {
  const result = await sql`
    SELECT * FROM generations
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result.rows;
}

// Anonymous generation tracking (IP-based rate limiting)
export async function recordAnonymousGeneration(ipAddress, sessionId = null) {
  const result = await sql`
    INSERT INTO anonymous_generations (ip_address, session_id)
    VALUES (${ipAddress}, ${sessionId})
    RETURNING *
  `;
  return result.rows[0];
}

export async function getAnonymousGenerationCount(ipAddress, hoursAgo = 24) {
  const result = await sql`
    SELECT COUNT(*) as count
    FROM anonymous_generations
    WHERE ip_address = ${ipAddress}
    AND created_at > NOW() - (${hoursAgo} * INTERVAL '1 hour')
  `;
  return parseInt(result.rows[0].count);
}

export async function cleanupOldAnonymousGenerations(daysOld = 7) {
  await sql`
    DELETE FROM anonymous_generations
    WHERE created_at < NOW() - (${daysOld} * INTERVAL '1 day')
  `;
}

// Print orders
export async function getOrderByStripeSessionId(stripeSessionId) {
  const result = await sql`
    SELECT * FROM orders WHERE stripe_session_id = ${stripeSessionId}
  `;
  return result.rows[0];
}

export async function getOrderById(id) {
  const result = await sql`SELECT * FROM orders WHERE id = ${id}`;
  return result.rows[0] || null;
}

export async function getOrdersByUserId(userId, { limit = 50 } = {}) {
  const result = await sql`
    SELECT id, stripe_session_id, customer_email, lookup_key, preview_url,
           amount_total, tax_amount, currency, status, tracking_number, carrier,
           shipping_address, created_at, updated_at
    FROM orders
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result.rows;
}

export async function getOrdersByEmail(email, { limit = 50 } = {}) {
  if (!email) return [];
  const result = await sql`
    SELECT id, stripe_session_id, customer_email, lookup_key, preview_url,
           amount_total, tax_amount, currency, status, tracking_number, carrier,
           shipping_address, created_at, updated_at
    FROM orders
    WHERE LOWER(customer_email) = LOWER(${email})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result.rows;
}

export async function createOrder(order) {
  const {
    stripe_session_id, user_id = null, customer_email, customer_name,
    shipping_address, lookup_key, preview_url, clean_url = null, prompt, options,
    amount_total, tax_amount, currency = 'usd'
  } = order;
  const result = await sql`
    INSERT INTO orders (
      stripe_session_id, user_id, customer_email, customer_name,
      shipping_address, lookup_key, preview_url, clean_url, prompt, options,
      amount_total, tax_amount, currency
    ) VALUES (
      ${stripe_session_id}, ${user_id}, ${customer_email}, ${customer_name},
      ${JSON.stringify(shipping_address || null)}, ${lookup_key}, ${preview_url}, ${clean_url},
      ${prompt}, ${JSON.stringify(options || null)},
      ${amount_total}, ${tax_amount}, ${currency}
    )
    ON CONFLICT (stripe_session_id) DO NOTHING
    RETURNING *
  `;
  return result.rows[0] || null;
}

export async function listOrders({ limit = 100, offset = 0, status = null } = {}) {
  if (status) {
    const r = await sql`
      SELECT * FROM orders WHERE status = ${status}
      ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
    return r.rows;
  }
  const r = await sql`
    SELECT * FROM orders
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
  return r.rows;
}

export async function updateOrder(id, { status, tracking_number, carrier, admin_notes }) {
  const r = await sql`
    UPDATE orders SET
      status           = COALESCE(${status ?? null}, status),
      tracking_number  = COALESCE(${tracking_number ?? null}, tracking_number),
      carrier          = COALESCE(${carrier ?? null}, carrier),
      admin_notes      = COALESCE(${admin_notes ?? null}, admin_notes),
      updated_at       = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;
  return r.rows[0] || null;
}

// One-off / self-heal: writes the shipping block back onto an existing order.
// Used by the admin "Refresh from Stripe" action when a webhook stored a null
// address (e.g. because of the Stripe API 2024-06-20 shipping field move).
export async function setOrderShipping(id, { customer_name, shipping_address }) {
  const r = await sql`
    UPDATE orders SET
      customer_name    = COALESCE(${customer_name ?? null}, customer_name),
      shipping_address = COALESCE(${shipping_address ? JSON.stringify(shipping_address) : null}::jsonb, shipping_address),
      updated_at       = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;
  return r.rows[0] || null;
}

export async function getOrderStats() {
  const r = await sql`
    SELECT
      COUNT(*)::int                                          AS total,
      COUNT(*) FILTER (WHERE status = 'paid')::int           AS paid,
      COUNT(*) FILTER (WHERE status = 'in_production')::int  AS in_production,
      COUNT(*) FILTER (WHERE status = 'shipped')::int        AS shipped,
      COUNT(*) FILTER (WHERE status = 'delivered')::int      AS delivered,
      COALESCE(SUM(amount_total), 0)::int                    AS revenue_cents
    FROM orders
  `;
  return r.rows[0];
}

// Initialize database tables
export async function initializeDatabase() {
  // This function can be called to ensure tables exist
  // The schema.sql should be run manually or via Vercel Postgres dashboard
  console.log('Database initialization - run schema.sql via Vercel dashboard');
}
