import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Known placeholder / weak values we refuse to run with. If the secret is
// missing or looks like a template, we throw the first time anything tries
// to sign or verify a token — fail-closed beats silently issuing forgeable
// tokens signed with a public string.
const WEAK_JWT_SECRETS = new Set([
  'your-secret-key-change-in-production',
  'changeme',
  'secret',
  'test',
  'dev',
  'development'
]);

function requireStrongJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error(
      'JWT_SECRET is not set. Refusing to sign or verify tokens. ' +
      'Set a long random value (e.g. `openssl rand -base64 48`) in Vercel env vars.'
    );
  }
  if (WEAK_JWT_SECRETS.has(s) || s.length < 32) {
    throw new Error(
      'JWT_SECRET is weak or is a placeholder value. Refusing to sign or verify tokens. ' +
      'Use a random value at least 32 characters long.'
    );
  }
  return s;
}

const JWT_EXPIRES_IN = '30d'; // Token valid for 30 days

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token for user
 */
export function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email
    },
    requireStrongJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, requireStrongJwtSecret());
  } catch (error) {
    return null;
  }
}

/**
 * Extract user from request (supports Authorization header or cookie)
 */
export function getUserFromRequest(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return verifyToken(token);
  }

  // Check cookie (if using cookie-based auth)
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.auth_token) {
    return verifyToken(cookies.auth_token);
  }

  return null;
}

/**
 * Get client IP address from request
 */
export function getClientIp(req) {
  // Vercel provides the real IP in x-forwarded-for or x-real-ip
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

/**
 * Parse cookies from cookie header string
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.trim().split('=');
    cookies[name] = value;
    return cookies;
  }, {});
}

/**
 * Check whether a JWT is still valid for a user, given their most recent
 * password change. JWTs carry an `iat` (issued-at, seconds) and we stamp
 * `password_changed_at` on every password reset. If the token was issued
 * before the last password change, we reject it — otherwise a password
 * reset doesn't actually kick an attacker out of a hijacked session.
 *
 * Missing `password_changed_at` (user has never changed password) is treated
 * as always-valid, which is correct behavior for newly-signed-up accounts.
 *
 * The one-second grace band (`-1`) absorbs the race where a token is minted
 * in the same request that stamps password_changed_at (reset-password.js
 * signs the new JWT right after the UPDATE). Without the grace, the fresh
 * JWT from the reset endpoint itself could be rejected if both timestamps
 * land in the same second on slow clocks.
 *
 * @param {object} tokenData - decoded JWT payload (must include `iat`)
 * @param {object} user - user row from DB (should include `password_changed_at`)
 * @returns {boolean} true if the token is still fresh
 */
export function isTokenFresh(tokenData, user) {
  if (!user?.password_changed_at) return true;
  if (typeof tokenData?.iat !== 'number') return false;
  const changedSec = Math.floor(new Date(user.password_changed_at).getTime() / 1000);
  return tokenData.iat >= (changedSec - 1);
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength (min 8 chars)
 */
export function isValidPassword(password) {
  return password && password.length >= 8;
}

/**
 * Create HTTP-only cookie for auth token
 */
export function createAuthCookie(token) {
  const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
  return `auth_token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Path=/`;
}

/**
 * Create cookie to clear auth token
 */
export function clearAuthCookie() {
  return 'auth_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/';
}
