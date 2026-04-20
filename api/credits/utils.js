import {
  getUserById,
  updateUserCredits,
  addCreditTransaction,
  recordAnonymousGeneration,
  getAnonymousGenerationCount,
  atomicDeductCredits
} from '../db/index.js';
import { getUserFromRequest, getClientIp } from '../auth/utils.js';

// Configuration
const SIGNUP_BONUS_CREDITS = 10;
const GENERATION_COST = 1; // 1 credit per generation
const ANONYMOUS_LIMIT = 1; // free previews allowed per IP per 24h before signup is required
const ANONYMOUS_WINDOW_HOURS = 24;

/**
 * Check if user (authenticated or anonymous) can generate an image
 * Returns: { allowed: boolean, reason?: string, user?: object, remainingCredits?: number }
 */
export async function canUserGenerate(req) {
  const tokenData = getUserFromRequest(req);
  const ipAddress = getClientIp(req);

  // Check if user is authenticated
  if (tokenData && tokenData.userId) {
    try {
      const user = await getUserById(tokenData.userId);

      if (!user) {
        return { allowed: false, reason: 'User not found' };
      }

      if (user.credits_balance < GENERATION_COST) {
        return {
          allowed: false,
          reason: 'Insufficient credits',
          user,
          remainingCredits: user.credits_balance
        };
      }

      return {
        allowed: true,
        user,
        remainingCredits: user.credits_balance
      };
    } catch (error) {
      console.error('Error checking user credits:', error);
      return { allowed: false, reason: 'Error checking credits' };
    }
  }

  // Anonymous user - allow ANONYMOUS_LIMIT previews per IP per window
  try {
    const usedCount = await getAnonymousGenerationCount(ipAddress, ANONYMOUS_WINDOW_HOURS);
    const remaining = Math.max(0, ANONYMOUS_LIMIT - usedCount);
    if (remaining > 0) {
      return {
        allowed: true,
        isAnonymous: true,
        remainingGenerations: remaining - 1 // after this generation
      };
    }
    return {
      allowed: false,
      reason: 'Sign up free to keep creating — new accounts get 10 credits.',
      isAnonymous: true,
      remainingGenerations: 0,
      needsSignup: true
    };
  } catch (error) {
    console.error('Error checking anonymous limit:', error);
    // Fail closed: require signup if we can't read the table
    return {
      allowed: false,
      reason: 'Sign in to generate. New accounts get 10 free credits.',
      isAnonymous: true,
      remainingGenerations: 0,
      needsSignup: true
    };
  }
}

/**
 * Deduct credits after successful generation
 * Returns updated credit balance or null for anonymous users
 */
export async function deductCreditsForGeneration(req, generationData) {
  const tokenData = getUserFromRequest(req);
  const ipAddress = getClientIp(req);

  // Authenticated user - deduct credits atomically (race-safe)
  if (tokenData && tokenData.userId) {
    try {
      const newBalance = await atomicDeductCredits(tokenData.userId, GENERATION_COST);

      if (newBalance === null) {
        // Either user doesn't exist or balance went under between check and deduct
        throw new Error('Insufficient credits at deduction time');
      }

      // Record transaction
      await addCreditTransaction(
        tokenData.userId,
        -GENERATION_COST,
        'generation_use',
        `Generated image: ${generationData.prompt.substring(0, 50)}...`
      );

      return {
        success: true,
        newBalance,
        creditsUsed: GENERATION_COST
      };
    } catch (error) {
      console.error('Error deducting credits:', error);
      throw error;
    }
  }

  // Anonymous user — record the generation against their IP/session
  try {
    await recordAnonymousGeneration(ipAddress, generationData.sessionId || null);
    const usedCount = await getAnonymousGenerationCount(ipAddress, ANONYMOUS_WINDOW_HOURS);
    return {
      success: true,
      isAnonymous: true,
      remainingGenerations: Math.max(0, ANONYMOUS_LIMIT - usedCount),
      newBalance: null,
      creditsUsed: 0
    };
  } catch (error) {
    console.error('Error recording anonymous generation:', error);
    // Don't block on telemetry failure
    return {
      success: true,
      isAnonymous: true,
      remainingGenerations: 0,
      newBalance: null,
      creditsUsed: 0
    };
  }
}

/**
 * Add credits to user account (after purchase)
 */
export async function addCreditsToUser(userId, amount, description, stripePaymentId = null) {
  try {
    const user = await getUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const newBalance = user.credits_balance + amount;

    // Update user credits
    await updateUserCredits(userId, newBalance);

    // Record transaction
    await addCreditTransaction(
      userId,
      amount,
      'purchase',
      description,
      stripePaymentId
    );

    return {
      success: true,
      newBalance,
      creditsAdded: amount
    };
  } catch (error) {
    console.error('Error adding credits:', error);
    throw error;
  }
}

/**
 * Get credit packages available for purchase
 */
export function getCreditPackages() {
  return [
    {
      id: 'credits_25',
      credits: 25,
      price: 5.00,
      pricePerCredit: 0.20,
      popular: false,
      lookupKey: 'CREDITS-25'
    },
    {
      id: 'credits_50',
      credits: 50,
      price: 10.00,
      pricePerCredit: 0.20,
      popular: true,
      lookupKey: 'CREDITS-50'
    },
    {
      id: 'credits_100',
      credits: 100,
      price: 20.00,
      pricePerCredit: 0.20,
      popular: false,
      lookupKey: 'CREDITS-100'
    },
    {
      id: 'credits_250',
      credits: 250,
      price: 50.00,
      pricePerCredit: 0.20,
      popular: false,
      lookupKey: 'CREDITS-250'
    }
  ];
}
