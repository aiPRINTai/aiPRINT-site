import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
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
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
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
