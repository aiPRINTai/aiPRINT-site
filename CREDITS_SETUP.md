# Credits System Setup Guide

This guide will walk you through setting up the credits system for aiPRINT.ai.

## Overview

The credits system protects your costs by:
- **Anonymous users**: 3 free image generations per day (IP-based tracking)
- **Registered users**: 10 free credits on signup
- **Credit purchases**: Users can buy credit packs through Stripe
- **Cost tracking**: All generations are logged in the database

## Prerequisites

- Vercel project (or any Node.js hosting)
- Stripe account
- Google Gemini API key (already configured)
- Vercel Postgres database

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

New dependencies added:
- `@vercel/postgres` - PostgreSQL database
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication
- `uuid` - Unique ID generation

### 2. Set Up Vercel Postgres Database

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to your Vercel project dashboard
2. Click on **Storage** tab
3. Click **Create Database**
4. Select **Postgres**
5. Choose a region close to your users
6. Click **Create**

Vercel will automatically add these environment variables to your project:
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

#### Option B: Via Vercel CLI

```bash
vercel storage create postgres
```

### 3. Initialize Database Schema

After creating the Postgres database:

1. Go to your Vercel project → **Storage** → **Your Postgres Database**
2. Click on **Query** or **Data** tab
3. Copy and paste the contents of `api/db/schema.sql`
4. Run the query to create all tables and indexes

Alternatively, you can use the Vercel CLI:

```bash
# Connect to your database
vercel env pull .env.local

# Then use psql or any PostgreSQL client to run the schema
psql $POSTGRES_URL < api/db/schema.sql
```

### 4. Configure Environment Variables

Add these new environment variables to your Vercel project:

```bash
# JWT Secret (generate a random string)
vercel env add JWT_SECRET

# Use a strong random string, for example:
# Generate one with: openssl rand -base64 32
```

**Important**: The `POSTGRES_*` variables should already be set by Vercel when you created the database.

### 5. Create Stripe Credit Products

You need to create products in Stripe for the credit packages:

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Products** → **Add Product**
3. Create these three products:

#### Product 1: 25 Credits
- **Name**: 25 Credits
- **Description**: AI image generation credits
- **Price**: $5.00 USD (one-time)
- **Advanced options** → **Lookup key**: `CREDITS-25`

#### Product 2: 100 Credits (Most Popular)
- **Name**: 100 Credits
- **Description**: AI image generation credits
- **Price**: $15.00 USD (one-time)
- **Advanced options** → **Lookup key**: `CREDITS-100`

#### Product 3: 500 Credits
- **Name**: 500 Credits
- **Description**: AI image generation credits
- **Price**: $50.00 USD (one-time)
- **Advanced options** → **Lookup key**: `CREDITS-500`

**Note**: The lookup keys must match exactly as shown above.

### 6. Update Stripe Webhook

Your existing Stripe webhook will automatically handle credit purchases. No additional configuration needed!

The webhook at `/api/webhook.js` now handles:
- Print product purchases (existing)
- Credit purchases (new)

### 7. Deploy

```bash
# Commit your changes
git add .
git commit -m "Add credits system"

# Push to deploy (Vercel will auto-deploy)
git push origin main
```

Or use Vercel CLI:

```bash
vercel --prod
```

### 8. Verify Setup

After deployment:

1. **Test Anonymous Usage**:
   - Visit your site
   - Generate 3 images (should work)
   - Try generating a 4th (should show signup prompt)

2. **Test Signup**:
   - Click "Sign up"
   - Create an account
   - Verify you receive 10 credits

3. **Test Credit Purchase**:
   - Use all 10 credits
   - Click "Buy Credits"
   - Complete a test purchase (use Stripe test mode)
   - Verify credits are added to your account

4. **Test Generation with Credits**:
   - Generate an image
   - Verify credit balance decreases
   - Check account page for transaction history

## System Architecture

### Database Schema

**users**
- Stores user accounts
- Tracks credit balance
- 10 free credits on signup

**generations**
- Logs every image generation
- Tracks cost and prompt
- Links to user (if authenticated)

**credit_transactions**
- Records all credit changes
- Types: signup_bonus, purchase, generation_use
- Links to Stripe payment ID

**anonymous_generations**
- Tracks IP-based rate limiting
- Cleanup old records automatically

### API Endpoints

**Authentication**
- `POST /api/auth/signup` - Create account (10 free credits)
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

**Credits**
- `GET /api/credits/balance` - Get credit balance
- `GET /api/credits/packages` - List available packages
- `POST /api/credits/purchase` - Create Stripe checkout
- `GET /api/credits/history` - Transaction history

**Generation**
- `POST /api/generate-image` - Generate image (modified to check/deduct credits)

**User Data**
- `GET /api/user/generations` - User's generation history

### Frontend Components

**auth.js**
- Login/signup modals
- Session management
- User menu

**credits.js**
- Credit balance display
- Purchase modal
- Anonymous limit tracking

**account.html**
- User dashboard
- Credit history
- Generation gallery

## Configuration

### Credit Limits

Edit `/api/credits/utils.js`:

```javascript
const ANONYMOUS_DAILY_LIMIT = 3;  // Free generations per day (anonymous)
const SIGNUP_BONUS_CREDITS = 10;  // Credits on signup
const GENERATION_COST = 1;        // Credits per generation
```

### Credit Packages

Edit `/api/credits/utils.js` → `getCreditPackages()`:

```javascript
{
  id: 'credits_25',
  credits: 25,
  price: 5.00,
  pricePerCredit: 0.20,
  lookupKey: 'CREDITS-25'
}
```

Update Stripe products accordingly.

### Generation Cost Tracking

Edit `/api/generate-image.js`:

```javascript
await recordGeneration(
  tokenData?.userId || null,
  ipAddress,
  prompt,
  url,
  size,
  0.035 // ← Actual cost per generation (update as needed)
);
```

## Monitoring & Maintenance

### Check Costs

Query your database to see actual costs:

```sql
-- Total cost by day
SELECT
  DATE(created_at) as date,
  COUNT(*) as generations,
  SUM(cost) as total_cost
FROM generations
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Cost by user
SELECT
  u.email,
  COUNT(g.id) as generations,
  SUM(g.cost) as total_cost
FROM users u
LEFT JOIN generations g ON g.user_id = u.id
GROUP BY u.id, u.email
ORDER BY total_cost DESC;
```

### Cleanup Old Data

Anonymous generations are kept indefinitely by default. To clean up:

```javascript
// Run in a cron job or manually
import { cleanupOldAnonymousGenerations } from './api/db/index.js';

// Delete anonymous records older than 7 days
await cleanupOldAnonymousGenerations(7);
```

### Monitor Credit Balance

Set up alerts for:
- Users with 0 credits (conversion opportunity)
- High-volume generators (potential abuse)
- Daily generation costs exceeding budget

## Troubleshooting

### "Database connection failed"
- Check that Vercel Postgres is properly configured
- Verify `POSTGRES_URL` environment variable exists
- Run database schema if tables don't exist

### "JWT token invalid"
- Check `JWT_SECRET` environment variable is set
- Clear browser localStorage and login again
- Verify token expiration (default 30 days)

### "Credits not deducted"
- Check webhook is receiving events
- Verify Stripe payment succeeded
- Check transaction logs in database

### "Anonymous limit not working"
- Verify IP address is being captured correctly
- Check `anonymous_generations` table
- Test with different IPs (use VPN or mobile)

## Security Best Practices

1. **JWT Secret**: Use a strong random string (32+ characters)
2. **Password Hashing**: bcrypt is configured with salt rounds of 10
3. **SQL Injection**: Using parameterized queries (@vercel/postgres)
4. **Rate Limiting**: Consider adding rate limits to signup/login
5. **HTTPS Only**: Ensure production site uses HTTPS

## Cost Protection Features

✅ **IP-based rate limiting** (3 free/day for anonymous)
✅ **Credit balance checks** before generation
✅ **Database tracking** of all generations and costs
✅ **Webhook verification** for Stripe payments
✅ **User authentication** to prevent abuse
✅ **Transaction logging** for audit trail

## Next Steps

Consider implementing:
- Email verification for new accounts
- Password reset functionality
- Subscription plans (monthly unlimited)
- Referral program (earn credits)
- Admin dashboard for monitoring
- Analytics and reporting
- Rate limiting on API endpoints

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Review browser console for errors
3. Verify all environment variables are set
4. Test Stripe webhook deliverability
5. Check database tables exist and have data

## Summary

Your site now has:
- ✅ Cost protection through credits
- ✅ User authentication system
- ✅ Stripe payment integration
- ✅ Database tracking
- ✅ Anonymous rate limiting
- ✅ User account dashboard

**Estimated setup time**: 30-45 minutes

**Your costs are now protected!** 🎉
