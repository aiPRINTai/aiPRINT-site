import {
  getUserById,
  updateUserCredits,
  addCreditTransaction,
  getAnonymousGenerationCount,
  recordAnonymousGeneration
} from '../db/index.js';
import { getUserFromRequest, getClientIp } from '../auth/utils.js';

// Configuration
const ANONYMOUS_DAILY_LIMIT = 3;
const SIGNUP_BONUS_CREDITS = 10;
const GENERATION_COST = 1; // 1 credit per generation

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

  // Anonymous user - check IP-based rate limit
  try {
    const count = await getAnonymousGenerationCount(ipAddress, 24);

    if (count >= ANONYMOUS_DAILY_LIMIT) {
      return {
        allowed: false,
        reason: 'Daily limit reached',
        isAnonymous: true,
        remainingGenerations: 0
      };
    }

    return {
      allowed: true,
      isAnonymous: true,
      remainingGenerations: ANONYMOUS_DAILY_LIMIT - count
    };
  } catch (error) {
    console.error('Error checking anonymous limit:', error);
    return { allowed: false, reason: 'Error checking limit' };
  }
}

/**
 * Deduct credits after successful generation
 * Returns updated credit balance or null for anonymous users
 */
export async function deductCreditsForGeneration(req, generationData) {
  const tokenData = getUserFromRequest(req);
  const ipAddress = getClientIp(req);

  // Authenticated user - deduct credits
  if (tokenData && tokenData.userId) {
    try {
      const user = await getUserById(tokenData.userId);

      if (!user) {
        throw new Error('User not found');
      }

      const newBalance = user.credits_balance - GENERATION_COST;

      // Update user credits
      await updateUserCredits(tokenData.userId, newBalance);

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

  // Anonymous user - record generation for rate limiting
  try {
    await recordAnonymousGeneration(ipAddress, generationData.sessionId);
    const count = await getAnonymousGenerationCount(ipAddress, 24);

    return {
      success: true,
      isAnonymous: true,
      remainingGenerations: ANONYMOUS_DAILY_LIMIT - count
    };
  } catch (error) {
    console.error('Error recording anonymous generation:', error);
    throw error;
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
      id: 'credits_100',
      credits: 100,
      price: 15.00,
      pricePerCredit: 0.15,
      popular: true,
      lookupKey: 'CREDITS-100'
    },
    {
      id: 'credits_500',
      credits: 500,
      price: 50.00,
      pricePerCredit: 0.10,
      popular: false,
      lookupKey: 'CREDITS-500'
    }
  ];
}
