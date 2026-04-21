-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  credits_balance INTEGER DEFAULT 10,
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(128),
  verification_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Safe additive migrations for existing users tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);

-- Password reset (separate from signup verification so the two flows don't collide)
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- Generations table (tracks all image generations)
-- image_url = the WATERMARKED preview shown publicly
-- clean_url = the ORIGINAL high-res file (admin-only, used for printing)
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  prompt TEXT NOT NULL,
  image_url TEXT,
  clean_url TEXT,
  size VARCHAR(20),
  cost DECIMAL(10, 4) DEFAULT 0.035,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE generations ADD COLUMN IF NOT EXISTS clean_url TEXT;
-- Index lets create-checkout-session.js look up the clean_url by the preview URL fast
CREATE INDEX IF NOT EXISTS idx_generations_image_url ON generations(image_url);

-- Credit transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  stripe_payment_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Anonymous generations tracking (IP-based rate limiting)
CREATE TABLE IF NOT EXISTS anonymous_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address VARCHAR(45) NOT NULL,
  session_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Print orders (one row per checkout.session.completed for a print)
-- preview_url = watermarked preview (safe to embed publicly, e.g. order-status pages)
-- clean_url   = original full-res print master (admin/customer-after-payment only)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  shipping_address JSONB,
  lookup_key VARCHAR(100),
  preview_url TEXT,
  clean_url TEXT,
  prompt TEXT,
  options JSONB,
  amount_total INTEGER,
  tax_amount INTEGER,
  currency VARCHAR(10) DEFAULT 'usd',
  status VARCHAR(50) DEFAULT 'paid',
  tracking_number VARCHAR(255),
  carrier VARCHAR(50),
  admin_notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Safe additive migrations for existing orders tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS clean_url TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_generations_ip ON anonymous_generations(ip_address);
CREATE INDEX IF NOT EXISTS idx_anonymous_generations_created_at ON anonymous_generations(created_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
