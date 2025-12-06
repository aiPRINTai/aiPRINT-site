# 🚀 Credits System - Deployment Checklist for Next Session

## 📦 What's Ready

All code is complete and pushed to branch: `claude/add-credits-system-01AgMjLq8Gd9F4Pi9ivFNuA2`

**Credit packages configured:**
- 5 credits: $5.00
- 10 credits: $10.00
- 15 credits: $15.00 ⭐ Most Popular
- 20 credits: $20.00
- 50 credits: $50.00

---

## 🎯 Quick Deployment (20 minutes total)

### STEP 0: Deploy Code (2 min)
1. Go to: https://github.com/aiPRINTai/aiPRINT-site/pull/new/claude/add-credits-system-01AgMjLq8Gd9F4Pi9ivFNuA2
2. Click "Create Pull Request"
3. Click "Merge Pull Request"
4. Wait for Vercel deployment (~2 min)

---

### STEP 1: Create Postgres Database (5 min)
1. Vercel Dashboard → Your Project → Storage
2. Click "Create Database" → Select "Postgres"
3. Choose region closest to your users
4. Click "Create"
5. Wait for "Database created successfully"

---

### STEP 2: Run Database Schema (2 min)
1. In Vercel, click your new database
2. Click ".sql Query" tab
3. Open: https://github.com/aiPRINTai/aiPRINT-site/blob/main/api/db/schema.sql
4. Copy ALL the SQL code
5. Paste into Vercel Query editor
6. Click "Run Query"
7. Verify you see green checkmarks for all CREATE TABLE statements

---

### STEP 3: Add JWT Secret (3 min)

**Generate secret:**
```bash
# Mac/Linux:
openssl rand -base64 32

# Windows PowerShell:
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})

# Or use: https://www.random.org/strings/?num=1&len=32
```

**Add to Vercel:**
1. Settings → Environment Variables
2. Click "Add New"
3. Name: `JWT_SECRET`
4. Value: Paste your generated secret
5. Check all 3 environments: Production, Preview, Development
6. Click "Save"
7. Click "Redeploy" when prompted
8. Wait ~1 minute

---

### STEP 4: Create Stripe Products (10 min)

Go to: https://dashboard.stripe.com/products

**Create 5 products with these EXACT lookup keys:**

#### Product 1:
- Name: `5 Credits`
- Price: `$5.00` (one-time)
- Lookup key: `CREDITS-5` ⚠️ Must be exact!

#### Product 2:
- Name: `10 Credits`
- Price: `$10.00` (one-time)
- Lookup key: `CREDITS-10` ⚠️ Must be exact!

#### Product 3:
- Name: `15 Credits`
- Price: `$15.00` (one-time)
- Lookup key: `CREDITS-15` ⚠️ Must be exact!

#### Product 4:
- Name: `20 Credits`
- Price: `$20.00` (one-time)
- Lookup key: `CREDITS-20` ⚠️ Must be exact!

#### Product 5:
- Name: `50 Credits`
- Price: `$50.00` (one-time)
- Lookup key: `CREDITS-50` ⚠️ Must be exact!

---

## ✅ Testing Checklist

After all steps complete:

- [ ] Visit site anonymously
- [ ] Generate 3 images (should work)
- [ ] Try 4th image (should show signup prompt)
- [ ] Sign up (should get 10 free credits)
- [ ] Generate image (credits should decrease)
- [ ] Visit `/account.html` (see balance and history)
- [ ] Click "Buy Credits" (see all 5 packages)
- [ ] Test purchase with Stripe test card: `4242 4242 4242 4242`
- [ ] Verify credits added after purchase

---

## 🆘 If Something Goes Wrong

**Site not working after deploy?**
1. Check Vercel deployment logs
2. Verify all environment variables are set
3. Check database schema was run successfully

**Credits not deducting?**
1. Check browser console for errors
2. Verify JWT_SECRET is set
3. Check Vercel function logs

**Credit purchase not working?**
1. Verify Stripe products have correct lookup keys
2. Check webhook is still configured
3. Look at Stripe logs

---

## 📊 What This Gives You

**Cost Protection:**
- Anonymous: 3 free/day (IP tracked)
- Registered: 10 free on signup
- All generations tracked in database

**Revenue:**
- At $1/credit, you make **$0.96-$0.97 profit per credit**
- Example: User buys 50 credits = $50 revenue - $1.75 cost = **$48.25 profit**

**Analytics:**
- Every generation logged
- User tracking
- Cost analysis in database

---

## 📖 Full Documentation

See `CREDITS_SETUP.md` for complete details on:
- System architecture
- Configuration options
- Monitoring & maintenance
- Troubleshooting
- Security best practices

---

**Ready to deploy? Just follow the 4 steps above!**

Time estimate: **20 minutes total**
