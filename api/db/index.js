import { sql } from '@vercel/postgres';

/**
 * Database utilities for aiPRINT credit system
 */

// User operations
export async function createUser(email, passwordHash) {
  const result = await sql`
    INSERT INTO users (email, password_hash, credits_balance)
    VALUES (${email}, ${passwordHash}, 10)
    RETURNING id, email, credits_balance, created_at
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
export async function recordGeneration(userId, ipAddress, prompt, imageUrl, size, cost = 0.035) {
  const result = await sql`
    INSERT INTO generations (user_id, ip_address, prompt, image_url, size, cost)
    VALUES (${userId}, ${ipAddress}, ${prompt}, ${imageUrl}, ${size}, ${cost})
    RETURNING *
  `;
  return result.rows[0];
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
    AND created_at > NOW() - INTERVAL '${hoursAgo} hours'
  `;
  return parseInt(result.rows[0].count);
}

export async function cleanupOldAnonymousGenerations(daysOld = 7) {
  await sql`
    DELETE FROM anonymous_generations
    WHERE created_at < NOW() - INTERVAL '${daysOld} days'
  `;
}

// Initialize database tables
export async function initializeDatabase() {
  // This function can be called to ensure tables exist
  // The schema.sql should be run manually or via Vercel Postgres dashboard
  console.log('Database initialization - run schema.sql via Vercel dashboard');
}
