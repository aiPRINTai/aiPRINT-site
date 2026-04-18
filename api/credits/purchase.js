import Stripe from 'stripe';
import { getUserFromRequest } from '../auth/utils.js';
import { getCreditPackages } from './utils.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/credits/purchase
 * Create a Stripe checkout session for purchasing credits
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // User must be authenticated to purchase credits
    const tokenData = getUserFromRequest(req);

    if (!tokenData || !tokenData.userId) {
      return res.status(401).json({ error: 'Authentication required to purchase credits' });
    }

    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({ error: 'Package ID is required' });
    }

    // Get package details
    const packages = getCreditPackages();
    const selectedPackage = packages.find(pkg => pkg.id === packageId);

    if (!selectedPackage) {
      return res.status(400).json({ error: 'Invalid package ID' });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${selectedPackage.credits} Credits`,
              description: `AI image generation credits - $${selectedPackage.pricePerCredit.toFixed(2)} per credit`,
              images: [`${clientUrl}/icon.png`]
            },
            unit_amount: Math.round(selectedPackage.price * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${clientUrl}/account.html?session_id={CHECKOUT_SESSION_ID}&credits_purchased=true`,
      cancel_url: `${clientUrl}/account.html?canceled=true`,
      metadata: {
        type: 'credit_purchase',
        user_id: tokenData.userId,
        credits_amount: selectedPackage.credits.toString(),
        package_id: packageId
      },
      customer_email: tokenData.email
    });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Credit purchase error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
