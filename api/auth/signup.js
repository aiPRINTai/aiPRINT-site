import crypto from 'node:crypto';
import { createUser, getUserByEmail, setVerificationToken } from '../db/index.js';
import { hashPassword, isValidEmail, isValidPassword } from './utils.js';
import { sendVerificationEmail, sendAccountExistsEmail } from '../_email.js';
import { enforceRateLimit } from '../_rate-limit.js';

/**
 * POST /api/auth/signup
 * Creates an unverified account. Sends a verification email. Does NOT issue a JWT.
 * User must click the email link before they can log in.
 *
 * Enumeration defense: this endpoint returns the SAME 201 success response
 * regardless of whether the email was already registered. Side-effects branch
 * on real state (see the three cases below), and the legit user is notified
 * via email in every case. An attacker probing for valid accounts gets no
 * signal from the HTTP response.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // IP-level cap: generous enough for shared office / campus NAT, tight
  // enough that a single box cant mass-enumerate or mass-spam inboxes.
  const ipRl = enforceRateLimit(req, res, {
    bucket: 'auth-signup-ip',
    limit: 10,
    windowMs: 60 * 60_000 // 10/hour
  });
  if (!ipRl.ok) return;

  try {
    const { email, password, pending_share_slug: pendingShareSlug } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Per-email cap: prevents someone from mail-bombing a specific address by
    // submitting the signup form repeatedly with that target. 3/hour is well
    // above any real human mistake rate. We silently accept on breach (same
    // 201 response) so an attacker cant probe for the limit edge to enumerate.
    const emailRl = enforceRateLimit(req, res, {
      bucket: 'auth-signup-email',
      limit: 3,
      windowMs: 60 * 60_000,
      key: cleanEmail
    });
    if (!emailRl.ok) return;

    // All three branches below return the SAME response body at the bottom
    // of the function. Only the side-effect (email sent) differs, and only
    // the target of the email knows which branch fired.
    const origin = process.env.CLIENT_URL
      || req.headers.origin
      || `https://${req.headers.host || 'aiprint.ai'}`;
    const safeSlug =
      typeof pendingShareSlug === 'string' && /^[a-zA-Z0-9]{6,16}$/.test(pendingShareSlug)
        ? pendingShareSlug
        : null;

    const existingUser = await getUserByEmail(cleanEmail);

    if (existingUser && existingUser.email_verified) {
      // Case 1: account already exists and is verified. Send a "you already
      // have an account — sign in" email instead of creating a duplicate.
      // Never reveal this to the HTTP caller.
      try {
        await sendAccountExistsEmail(cleanEmail, `${origin}/`);
      } catch (err) {
        console.error('Account-exists email threw:', err);
      }
    } else if (existingUser) {
      // Case 2: account exists but is still unverified. Rotate the
      // verification token (old one may have expired) and resend the link.
      // Equivalent to resend-verification flow but silently via signup.
      const newToken = crypto.randomBytes(32).toString('hex');
      const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      try {
        await setVerificationToken(existingUser.id, newToken, newExpires);
        const verifyUrl = safeSlug
          ? `${origin}/api/auth/verify?token=${newToken}&s=${encodeURIComponent(safeSlug)}`
          : `${origin}/api/auth/verify?token=${newToken}`;
        const result = await sendVerificationEmail(cleanEmail, verifyUrl);
        if (result?.error) console.error('Resend verification email returned error:', result);
      } catch (err) {
        console.error('Resend verification threw:', err);
      }
    } else {
      // Case 3: no existing account — normal signup path.
      const passwordHash = await hashPassword(password);
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      try {
        await createUser(cleanEmail, passwordHash, {
          verificationToken,
          verificationExpires
        });

        // Pass `pending_share_slug` through the verification URL so it
        // survives the round-trip: signup → email → /api/auth/verify →
        // /verified.html → "Start creating" → /?s=<slug>. Lets a user who
        // signed up from the checkout-signup gate land back on their exact
        // design — even on a fresh device that never had the localStorage copy.
        const verifyUrl = safeSlug
          ? `${origin}/api/auth/verify?token=${verificationToken}&s=${encodeURIComponent(safeSlug)}`
          : `${origin}/api/auth/verify?token=${verificationToken}`;

        const result = await sendVerificationEmail(cleanEmail, verifyUrl);
        if (result?.error) console.error('Verification email send returned error:', result);
      } catch (err) {
        // A real DB failure during createUser would be suspicious if we
        // silently returned 201 (the user never actually got created).
        // Log server-side but keep the response identical — attacker still
        // gets no signal, and a legit user who is actually broken will
        // simply never get the email and can try again.
        console.error('New-user signup error:', err);
      }
    }

    // Single canonical response. Do not branch on existingUser here.
    return res.status(201).json({
      success: true,
      verificationRequired: true,
      message: 'Check your email to verify your account.',
      email: cleanEmail
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}
