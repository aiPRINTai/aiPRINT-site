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
  // password_changed_at is needed by isTokenFresh() to reject JWTs issued
  // before the last password reset. Select-ed lazily with a fallback so an
  // older DB that hasn't gained the column yet still works.
  const run = (withPca) => withPca
    ? sql`
        SELECT id, email, credits_balance, email_verified,
               password_changed_at, created_at, updated_at
        FROM users WHERE id = ${userId}
      `
    : sql`
        SELECT id, email, credits_balance, email_verified, created_at, updated_at
        FROM users WHERE id = ${userId}
      `;
  try {
    const r = await run(true);
    return r.rows[0];
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    // Column missing on this DB — use the legacy SELECT. isTokenFresh
    // treats missing password_changed_at as "never changed", which is
    // correct for a DB that has never processed a password reset.
    const r = await run(false);
    return r.rows[0];
  }
}

// Password reset token storage. Uses the existing verification_token column
// scheme but in its own dedicated pair of columns so a reset-in-progress
// doesn't collide with signup verification.
//
// Self-heals: if the reset_token / reset_expires columns don't exist on the
// live users table yet (because schema.sql hasn't been re-applied since this
// feature shipped), add them on first use and retry. Avoids silent swallow
// of "column does not exist" errors.
async function ensureResetColumns() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token)`;
}

// password_changed_at is stamped whenever a password is reset/changed. JWTs
// issued before that timestamp are considered stale and must be rejected.
// Kept in its own ensure() so a fresh DB without the column self-heals on
// first password reset (similar to reset_token above).
async function ensurePasswordChangedAtColumn() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP`;
}

// Order economics columns. shipping_amount + subtotal_amount let us compute
// real product margin (revenue - shipping - tax) without touching Stripe.
// utm_* are populated from the checkout-session metadata so the marketing
// dashboard can attribute orders back to the ad source. All optional —
// pre-existing rows without them just read NULL.
async function ensureOrderEconomicsColumns() {
  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS shipping_amount INT,
      ADD COLUMN IF NOT EXISTS subtotal_amount INT,
      ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1,
      ADD COLUMN IF NOT EXISTS line_item_index INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS utm_source TEXT,
      ADD COLUMN IF NOT EXISTS utm_medium TEXT,
      ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
      ADD COLUMN IF NOT EXISTS utm_content TEXT,
      ADD COLUMN IF NOT EXISTS utm_term TEXT
  `;
  // Cart support: an order can have multiple rows sharing one
  // stripe_session_id (one row per line_item). Drop the old single-row
  // UNIQUE on stripe_session_id and replace it with a composite UNIQUE
  // (stripe_session_id, line_item_index). Both DDLs are idempotent.
  // Constraint name varies by Postgres version / origin (auto-generated by
  // the original `UNIQUE` keyword in schema.sql) — the most common one is
  // `orders_stripe_session_id_key`. Try that first; the DO-block makes the
  // drop tolerant of any name by querying pg_constraint.
  await sql`
    DO $$
    DECLARE c_name TEXT;
    BEGIN
      SELECT conname INTO c_name FROM pg_constraint
        WHERE conrelid = 'orders'::regclass AND contype = 'u' AND conname LIKE '%stripe_session_id%'
          AND conname NOT LIKE '%line_item%'
        LIMIT 1;
      IF c_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE orders DROP CONSTRAINT ' || quote_ident(c_name);
      END IF;
    END$$;
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
          WHERE conrelid = 'orders'::regclass
            AND conname = 'orders_session_line_unique'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_session_line_unique
          UNIQUE (stripe_session_id, line_item_index);
      END IF;
    END$$;
  `;
}

function isMissingColumnError(err) {
  const m = String(err?.message || '');
  return m.includes('reset_token') || m.includes('reset_expires')
    || m.includes('password_changed_at')
    || m.includes('shipping_amount') || m.includes('subtotal_amount')
    || m.includes('quantity') || m.includes('line_item_index')
    || m.includes('utm_source') || m.includes('utm_medium') || m.includes('utm_campaign')
    || m.includes('utm_content') || m.includes('utm_term')
    || /column .* does not exist/i.test(m);
}

// True when the error came from the old single-row UNIQUE on stripe_session_id
// (i.e. the old constraint hasn't been replaced by the composite yet). When
// we see this we run the migration and retry — same self-heal pattern as the
// missing-column path above.
function isLegacySessionUniqueError(err) {
  const m = String(err?.message || '');
  return /duplicate key.*stripe_session_id/i.test(m)
      || /unique constraint.*stripe_session_id/i.test(m);
}

export async function setResetToken(userId, token, expires) {
  const run = () => sql`
    UPDATE users
    SET reset_token = ${token},
        reset_expires = ${expires},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
    RETURNING id, email
  `;
  try {
    const r = await run();
    return r.rows[0];
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    await ensureResetColumns();
    const r = await run();
    return r.rows[0];
  }
}

export async function getUserByResetToken(token) {
  const run = () => sql`
    SELECT * FROM users
    WHERE reset_token = ${token}
      AND reset_expires > NOW()
  `;
  try {
    const r = await run();
    return r.rows[0];
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    await ensureResetColumns();
    const r = await run();
    return r.rows[0];
  }
}

export async function updateUserPassword(userId, passwordHash) {
  const run = () => sql`
    UPDATE users
    SET password_hash = ${passwordHash},
        reset_token = NULL,
        reset_expires = NULL,
        password_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
    RETURNING id, email, password_changed_at
  `;
  try {
    const r = await run();
    return r.rows[0];
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    // Self-heal BOTH column sets in one shot so we don't do two retries.
    await ensureResetColumns();
    await ensurePasswordChangedAtColumn();
    const r = await run();
    return r.rows[0];
  }
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
// Returns the FIRST order row matching the session_id (lowest line_item_index).
// Cart sessions can produce multiple orders rows sharing one stripe_session_id;
// callers that need all of them should use getOrdersByStripeSessionId.
export async function getOrderByStripeSessionId(stripeSessionId) {
  const result = await sql`
    SELECT * FROM orders
    WHERE stripe_session_id = ${stripeSessionId}
    ORDER BY COALESCE(line_item_index, 0) ASC
    LIMIT 1
  `;
  return result.rows[0];
}

// Returns ALL order rows for the given session_id (cart-aware). Used by the
// admin orders panel + the order-confirmation email rendering for multi-item
// carts so we can show every print the customer bought in one display.
export async function getOrdersByStripeSessionId(stripeSessionId) {
  const result = await sql`
    SELECT * FROM orders
    WHERE stripe_session_id = ${stripeSessionId}
    ORDER BY COALESCE(line_item_index, 0) ASC
  `;
  return result.rows;
}

// ── Cross-device cart sync ─────────────────────────────────────────────────
// One row per user holding their cart + saved-for-later as JSONB blobs that
// mirror the localStorage shape. Last-write-wins; client merges with local
// state on read and PUTs the merged result.
async function ensureUserCartsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_carts (
      user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cart       JSONB DEFAULT '[]'::jsonb,
      saved      JSONB DEFAULT '[]'::jsonb,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export async function getUserCart(userId) {
  const run = () => sql`
    SELECT cart, saved, updated_at FROM user_carts WHERE user_id = ${userId}
  `;
  try {
    const r = await run();
    return r.rows[0] || { cart: [], saved: [], updated_at: null };
  } catch (err) {
    if (!String(err?.message || '').includes('does not exist')) throw err;
    await ensureUserCartsTable();
    const r = await run();
    return r.rows[0] || { cart: [], saved: [], updated_at: null };
  }
}

export async function setUserCart(userId, { cart, saved }) {
  const cartJson  = JSON.stringify(Array.isArray(cart)  ? cart  : []);
  const savedJson = JSON.stringify(Array.isArray(saved) ? saved : []);
  const run = () => sql`
    INSERT INTO user_carts (user_id, cart, saved, updated_at)
    VALUES (${userId}, ${cartJson}::jsonb, ${savedJson}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO UPDATE
      SET cart       = EXCLUDED.cart,
          saved      = EXCLUDED.saved,
          updated_at = CURRENT_TIMESTAMP
    RETURNING cart, saved, updated_at
  `;
  try {
    const r = await run();
    return r.rows[0];
  } catch (err) {
    if (!String(err?.message || '').includes('does not exist')) throw err;
    await ensureUserCartsTable();
    const r = await run();
    return r.rows[0];
  }
}

export async function getOrderById(id) {
  const result = await sql`SELECT * FROM orders WHERE id = ${id}`;
  return result.rows[0] || null;
}

export async function getOrdersByUserId(userId, { limit = 50 } = {}) {
  const result = await sql`
    SELECT id, stripe_session_id, customer_email, lookup_key, preview_url,
           amount_total, tax_amount, currency, status, tracking_number, carrier,
           shipping_address, quantity, created_at, updated_at
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
           shipping_address, quantity, created_at, updated_at
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
    amount_total, tax_amount, currency = 'usd',
    // Economic breakdown (cents). shipping_amount + subtotal_amount let us
    // compute real product margin per order. Both nullable for old rows.
    shipping_amount = null, subtotal_amount = null,
    // Quantity of identical prints in this order (1..10). Default 1.
    quantity = 1,
    // Cart support: which line_item this row corresponds to in a multi-item
    // checkout. Single-item flows leave this at 0.
    line_item_index = 0,
    // Marketing attribution. Captured from session.metadata in the webhook.
    utm_source = null, utm_medium = null, utm_campaign = null,
    utm_content = null, utm_term = null
  } = order;
  const run = () => sql`
    INSERT INTO orders (
      stripe_session_id, user_id, customer_email, customer_name,
      shipping_address, lookup_key, preview_url, clean_url, prompt, options,
      amount_total, tax_amount, currency,
      shipping_amount, subtotal_amount, quantity, line_item_index,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term
    ) VALUES (
      ${stripe_session_id}, ${user_id}, ${customer_email}, ${customer_name},
      ${JSON.stringify(shipping_address || null)}, ${lookup_key}, ${preview_url}, ${clean_url},
      ${prompt}, ${JSON.stringify(options || null)},
      ${amount_total}, ${tax_amount}, ${currency},
      ${shipping_amount}, ${subtotal_amount}, ${quantity}, ${line_item_index},
      ${utm_source}, ${utm_medium}, ${utm_campaign}, ${utm_content}, ${utm_term}
    )
    ON CONFLICT (stripe_session_id, line_item_index) DO NOTHING
    RETURNING *
  `;
  try {
    const result = await run();
    return result.rows[0] || null;
  } catch (err) {
    if (isMissingColumnError(err) || isLegacySessionUniqueError(err)) {
      // Either the new columns or the new composite UNIQUE haven't been
      // applied yet. ensureOrderEconomicsColumns handles both.
      await ensureOrderEconomicsColumns();
      const result = await run();
      return result.rows[0] || null;
    }
    throw err;
  }
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

// ── Admin: users list + detail ─────────────────────────────────────────────
// List users with derived aggregates (orders count, lifetime spend, generations
// count). One SQL round-trip using LEFT JOIN + GROUP BY. Optional search
// filters on email prefix (case-insensitive).
export async function listUsersWithStats({ limit = 200, offset = 0, search = null, verifiedOnly = false } = {}) {
  const s = search ? `%${search.toLowerCase()}%` : null;

  // Use a single query with subqueries to avoid a cartesian explosion from
  // joining both orders and generations simultaneously.
  if (s && verifiedOnly) {
    const r = await sql`
      SELECT
        u.id, u.email, u.credits_balance, u.email_verified, u.created_at, u.updated_at,
        COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id), 0) AS order_count,
        COALESCE((SELECT SUM(o.amount_total)::int FROM orders o WHERE o.user_id = u.id), 0) AS lifetime_cents,
        COALESCE((SELECT COUNT(*)::int FROM generations g WHERE g.user_id = u.id), 0) AS generation_count
      FROM users u
      WHERE LOWER(u.email) LIKE ${s} AND u.email_verified = TRUE
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return r.rows;
  }
  if (s) {
    const r = await sql`
      SELECT
        u.id, u.email, u.credits_balance, u.email_verified, u.created_at, u.updated_at,
        COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id), 0) AS order_count,
        COALESCE((SELECT SUM(o.amount_total)::int FROM orders o WHERE o.user_id = u.id), 0) AS lifetime_cents,
        COALESCE((SELECT COUNT(*)::int FROM generations g WHERE g.user_id = u.id), 0) AS generation_count
      FROM users u
      WHERE LOWER(u.email) LIKE ${s}
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return r.rows;
  }
  if (verifiedOnly) {
    const r = await sql`
      SELECT
        u.id, u.email, u.credits_balance, u.email_verified, u.created_at, u.updated_at,
        COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id), 0) AS order_count,
        COALESCE((SELECT SUM(o.amount_total)::int FROM orders o WHERE o.user_id = u.id), 0) AS lifetime_cents,
        COALESCE((SELECT COUNT(*)::int FROM generations g WHERE g.user_id = u.id), 0) AS generation_count
      FROM users u
      WHERE u.email_verified = TRUE
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return r.rows;
  }
  const r = await sql`
    SELECT
      u.id, u.email, u.credits_balance, u.email_verified, u.created_at, u.updated_at,
      COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id), 0) AS order_count,
      COALESCE((SELECT SUM(o.amount_total)::int FROM orders o WHERE o.user_id = u.id), 0) AS lifetime_cents,
      COALESCE((SELECT COUNT(*)::int FROM generations g WHERE g.user_id = u.id), 0) AS generation_count
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return r.rows;
}

// High-level user stats for the admin dashboard tiles.
export async function getUserStats() {
  const r = await sql`
    SELECT
      COUNT(*)::int                                                    AS total,
      COUNT(*) FILTER (WHERE email_verified = TRUE)::int               AS verified,
      COUNT(*) FILTER (WHERE email_verified = FALSE)::int              AS unverified,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int   AS new_7d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int  AS new_30d,
      COALESCE(SUM(credits_balance), 0)::int                           AS total_credits
    FROM users
  `;
  return r.rows[0];
}

// Full detail for one user: base row + recent orders + recent credit txns +
// recent generations. Returns null if user doesn't exist.
export async function getUserDetail(userId) {
  const base = await sql`
    SELECT id, email, credits_balance, email_verified, created_at, updated_at
    FROM users WHERE id = ${userId}
  `;
  if (!base.rows[0]) return null;
  const [orders, txns, gens] = await Promise.all([
    sql`SELECT id, stripe_session_id, customer_email, lookup_key, quantity, amount_total, currency,
               status, tracking_number, carrier, preview_url, created_at
         FROM orders WHERE user_id = ${userId}
         ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT id, amount, type, description, stripe_payment_id, created_at
         FROM credit_transactions WHERE user_id = ${userId}
         ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT id, prompt, size, created_at
         FROM generations WHERE user_id = ${userId}
         ORDER BY created_at DESC LIMIT 25`
  ]);
  return {
    user: base.rows[0],
    orders: orders.rows,
    credit_transactions: txns.rows,
    generations: gens.rows
  };
}

export async function getOrderStats() {
  const r = await sql`
    SELECT
      COUNT(*)::int                                          AS total,
      COUNT(*) FILTER (WHERE status = 'paid')::int           AS paid,
      COUNT(*) FILTER (WHERE status = 'in_production')::int  AS in_production,
      COUNT(*) FILTER (WHERE status = 'shipped')::int        AS shipped,
      COUNT(*) FILTER (WHERE status = 'delivered')::int      AS delivered,
      COUNT(*) FILTER (WHERE status = 'canceled')::int       AS canceled,
      COALESCE(SUM(amount_total) FILTER (
        WHERE status IN ('paid','in_production','shipped','delivered')
      ), 0)::int                                             AS revenue_cents
    FROM orders
  `;
  return r.rows[0];
}

// Aggregate orders + revenue + AOV bucketed by UTM source for the marketing
// dashboard. NULLs are coalesced to '(direct)' so visitors who came in
// without a tagged link are still represented. Revenue uses subtotal_amount
// when available (cleanest "product revenue" number), falling back to
// amount_total for legacy rows.
export async function getMarketingStats({ days = 30 } = {}) {
  const run = () => sql`
    WITH recent AS (
      SELECT
        COALESCE(NULLIF(utm_source,   ''), '(direct)')  AS source,
        COALESCE(NULLIF(utm_medium,   ''), '(none)')    AS medium,
        COALESCE(NULLIF(utm_campaign, ''), '(none)')    AS campaign,
        COALESCE(subtotal_amount, amount_total - COALESCE(tax_amount,0) - COALESCE(shipping_amount,0)) AS rev_cents,
        amount_total,
        shipping_amount,
        tax_amount,
        status,
        created_at
      FROM orders
      WHERE created_at >= NOW() - (${days}::int || ' days')::interval
        AND status IN ('paid','in_production','shipped','delivered')
    )
    SELECT
      source,
      medium,
      campaign,
      COUNT(*)::int                              AS orders,
      COALESCE(SUM(rev_cents),0)::int            AS revenue_cents,
      COALESCE(SUM(amount_total),0)::int         AS gross_cents,
      COALESCE(SUM(shipping_amount),0)::int      AS shipping_cents,
      COALESCE(SUM(tax_amount),0)::int           AS tax_cents,
      COALESCE(AVG(rev_cents),0)::int            AS aov_cents
    FROM recent
    GROUP BY source, medium, campaign
    ORDER BY revenue_cents DESC, orders DESC
  `;
  try {
    const r = await run();
    return r.rows;
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    await ensureOrderEconomicsColumns();
    const r = await run();
    return r.rows;
  }
}

// Daily totals for the trendline chart on the marketing dashboard.
// Bucketed by created_at::date (UTC) — close enough at this scale; if we
// ever need timezone-aware buckets we can pass the operator's tz in.
export async function getMarketingTrend({ days = 30 } = {}) {
  const run = () => sql`
    SELECT
      created_at::date                                         AS day,
      COUNT(*)::int                                            AS orders,
      COALESCE(SUM(
        COALESCE(subtotal_amount, amount_total - COALESCE(tax_amount,0) - COALESCE(shipping_amount,0))
      ),0)::int                                                AS revenue_cents
    FROM orders
    WHERE created_at >= NOW() - (${days}::int || ' days')::interval
      AND status IN ('paid','in_production','shipped','delivered')
    GROUP BY day
    ORDER BY day ASC
  `;
  try {
    const r = await run();
    return r.rows;
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    await ensureOrderEconomicsColumns();
    const r = await run();
    return r.rows;
  }
}

// ── Admin audit log ────────────────────────────────────────────────────────
// One row per admin action. Self-heals if the table doesn't exist yet
// (same pattern as contact_submissions / reset_token).
async function ensureAdminActionsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action VARCHAR(64) NOT NULL,
      target_user_id UUID,
      target_order_id UUID,
      actor_ip VARCHAR(45),
      details JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_admin_actions_user ON admin_actions(target_user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_admin_actions_order ON admin_actions(target_order_id)`;
}

export async function logAdminAction({ action, target_user_id = null, target_order_id = null, actor_ip = null, details = null }) {
  const payload = details ? JSON.stringify(details) : null;
  const run = () => sql`
    INSERT INTO admin_actions (action, target_user_id, target_order_id, actor_ip, details)
    VALUES (${action}, ${target_user_id}, ${target_order_id}, ${actor_ip}, ${payload}::jsonb)
    RETURNING id, created_at
  `;
  try {
    const r = await run();
    return r.rows[0];
  } catch (err) {
    // Self-heal: table missing on live DB (schema.sql not re-applied)
    if (String(err?.message || '').includes('does not exist')) {
      try {
        await ensureAdminActionsTable();
        const r = await run();
        return r.rows[0];
      } catch (inner) {
        console.error('logAdminAction: could not create/insert:', inner.message);
        return null;
      }
    }
    console.error('logAdminAction failed:', err.message);
    return null; // never throw — audit logging must not break the primary action
  }
}

export async function listAdminActions({ limit = 100, offset = 0, userId = null, orderId = null } = {}) {
  const run = async () => {
    if (userId) {
      return sql`
        SELECT a.*, u.email AS target_user_email
        FROM admin_actions a
        LEFT JOIN users u ON u.id = a.target_user_id
        WHERE a.target_user_id = ${userId}
        ORDER BY a.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    if (orderId) {
      return sql`
        SELECT a.*, u.email AS target_user_email
        FROM admin_actions a
        LEFT JOIN users u ON u.id = a.target_user_id
        WHERE a.target_order_id = ${orderId}
        ORDER BY a.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    return sql`
      SELECT a.*, u.email AS target_user_email
      FROM admin_actions a
      LEFT JOIN users u ON u.id = a.target_user_id
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  };
  try {
    const r = await run();
    return r.rows;
  } catch (err) {
    if (String(err?.message || '').includes('does not exist')) {
      await ensureAdminActionsTable();
      return [];
    }
    throw err;
  }
}

// ── Shared designs (short-link sharing for /index.html presets) ───────────
// One row per generated short slug. Self-heals if the table doesn't exist yet
// (same pattern as admin_actions).
async function ensureSharedDesignsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS shared_designs (
      slug TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      views INT DEFAULT 0
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_shared_designs_created_at ON shared_designs(created_at DESC)`;
}

export async function saveSharedDesign(slug, payload) {
  const json = JSON.stringify(payload);
  const run = () => sql`
    INSERT INTO shared_designs (slug, payload)
    VALUES (${slug}, ${json}::jsonb)
    RETURNING slug, created_at
  `;
  try {
    const r = await run();
    return r.rows[0];
  } catch (err) {
    if (String(err?.message || '').includes('does not exist')) {
      await ensureSharedDesignsTable();
      const r = await run();
      return r.rows[0];
    }
    throw err;
  }
}

export async function getSharedDesign(slug) {
  const run = () => sql`
    SELECT payload, created_at, views
    FROM shared_designs
    WHERE slug = ${slug}
    LIMIT 1
  `;
  try {
    const r = await run();
    if (!r.rows[0]) return null;
    // Best-effort view counter; ignore failures (never block the read).
    sql`UPDATE shared_designs SET views = views + 1 WHERE slug = ${slug}`.catch(() => {});
    return r.rows[0];
  } catch (err) {
    if (String(err?.message || '').includes('does not exist')) {
      await ensureSharedDesignsTable();
      return null;
    }
    throw err;
  }
}

/**
 * Purge shared_designs rows older than `olderThanDays`. Called by the daily
 * cron at /api/cron/purge-shared-designs.js. Keeps the share table from
 * growing unbounded with stale preset blobs (PII-adjacent: they contain the
 * customer's prompt, which can reveal identity, kids, pets, etc.).
 *
 * Returns the number of rows deleted.
 */
export async function purgeOldSharedDesigns(olderThanDays = 180) {
  const days = Math.max(7, Math.min(3650, Number(olderThanDays) || 180));
  try {
    const r = await sql`
      DELETE FROM shared_designs
      WHERE created_at < NOW() - (${days}::int * INTERVAL '1 day')
      RETURNING slug
    `;
    return r.rowCount || 0;
  } catch (err) {
    if (String(err?.message || '').includes('does not exist')) {
      return 0; // nothing to purge if the table isn't there yet
    }
    throw err;
  }
}

// ── Stats for /api/admin/security dashboard ───────────────────────────────
// Aggregates over admin_actions and shared_designs. Both self-heal if their
// table doesn't exist yet (returning empty stats rather than throwing) so the
// security page renders on a brand-new DB where no admin action has been
// logged yet.

export async function getAdminActionStats() {
  const empty = {
    total_24h: 0, total_7d: 0, total_30d: 0,
    unique_actor_ips_24h: 0,
    by_action_7d: {},
    by_action_30d: {}
  };
  try {
    const totals = await sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS t_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')   AS t_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')  AS t_30d,
        COUNT(DISTINCT actor_ip) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS ips_24h
      FROM admin_actions
    `;
    const by7 = await sql`
      SELECT action, COUNT(*)::int AS n
      FROM admin_actions
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY action
      ORDER BY n DESC
    `;
    const by30 = await sql`
      SELECT action, COUNT(*)::int AS n
      FROM admin_actions
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY action
      ORDER BY n DESC
    `;
    const row = totals.rows[0] || {};
    const out = {
      total_24h: Number(row.t_24h || 0),
      total_7d: Number(row.t_7d || 0),
      total_30d: Number(row.t_30d || 0),
      unique_actor_ips_24h: Number(row.ips_24h || 0),
      by_action_7d: Object.fromEntries(by7.rows.map(r => [r.action, r.n])),
      by_action_30d: Object.fromEntries(by30.rows.map(r => [r.action, r.n]))
    };
    return out;
  } catch (err) {
    if (String(err?.message || '').includes('does not exist')) return empty;
    throw err;
  }
}

export async function getSharedDesignStats() {
  const empty = { total: 0, oldest_age_days: null, newest_created_at: null };
  try {
    const r = await sql`
      SELECT
        COUNT(*)::int AS total,
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400.0 AS oldest_age_days,
        MAX(created_at) AS newest_created_at
      FROM shared_designs
    `;
    const row = r.rows[0] || {};
    return {
      total: Number(row.total || 0),
      oldest_age_days: row.oldest_age_days != null ? Number(row.oldest_age_days) : null,
      newest_created_at: row.newest_created_at || null
    };
  } catch (err) {
    if (String(err?.message || '').includes('does not exist')) return empty;
    throw err;
  }
}

// Initialize database tables
export async function initializeDatabase() {
  // This function can be called to ensure tables exist
  // The schema.sql should be run manually or via Vercel Postgres dashboard
  console.log('Database initialization - run schema.sql via Vercel dashboard');
}
