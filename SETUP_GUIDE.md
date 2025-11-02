# DeadlineDAO Service Setup Guide

Quick setup guide for all external services needed to run DeadlineDAO.

## ✅ Completed: Solana

- **Status:** READY ✓
- **Escrow Wallet:** `E9RPd79Q9mMffFPrTBMgDpHSDmmvTwB1wsnf5KNVLr5b`
- **Balance:** 2 SOL (devnet)
- **Configuration:** Already in `.env.local`

---

## 🔵 Supabase Setup (15 minutes)

### Step 1: Create Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Choose organization (or create one)
4. Fill in:
   - **Name:** `deadlinedao`
   - **Database Password:** Generate a strong password (save it!)
   - **Region:** Choose closest to you
   - **Pricing Plan:** Free tier is fine for development
5. Click "Create new project"
6. Wait 2-3 minutes for database to provision

### Step 2: Run Database Schema

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click "New query"
3. Copy the entire contents of `supabase-schema.sql` from your project
4. Paste into the SQL editor
5. Click "Run" (or press Cmd/Ctrl + Enter)
6. You should see: "Success. No rows returned"

This creates:
- `goals` table (stores all accountability goals)
- `proofs` table (stores submitted proofs)
- `payouts` table (tracks all SOL payouts)
- Indexes for performance
- Row Level Security policies

### Step 3: Get API Credentials

1. Go to **Settings** → **API** (in left sidebar)
2. Find these values:

**Project URL:**
```
https://xxxxxxxxxxxxx.supabase.co
```

**Service Role Key (secret):**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
```

⚠️ **Important:** Use the **service_role** key, NOT the anon key!

### Step 4: Update .env.local

Add these lines to your `.env.local` file:

```bash
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
```

### Step 5: Test Connection

Run the test script:

```bash
npm run test:supabase
```

Expected output:
```
✅ Supabase connection successful
✅ Test goal created: [UUID]
✅ Goal retrieved successfully
✅ Platform stats: {...}
✅ Test goal deleted
```

---

## 🟠 Cloudflare R2 Setup (15 minutes)

### Step 1: Create R2 Bucket

1. Go to https://dash.cloudflare.com
2. Select your account (or sign up if new)
3. Click **R2** in left sidebar
4. Click "Create bucket"
5. Name: `deadlinedao-proofs`
6. Location: Automatic
7. Click "Create bucket"

### Step 2: Enable Public Access

1. In your bucket settings, go to **Settings** tab
2. Scroll to **Public access**
3. Click "Allow Access"
4. Copy the **Public bucket URL**, looks like:
   ```
   https://pub-xxxxxxxxxxxxx.r2.dev
   ```

### Step 3: Create API Token

1. Go back to **R2** main page
2. Click "Manage R2 API Tokens"
3. Click "Create API token"
4. Name: `deadlinedao-api`
5. Permissions:
   - ✅ Object Read & Write
   - ✅ Edit (for presigned URLs)
6. Click "Create API token"
7. **SAVE THESE VALUES** (shown only once):
   - Access Key ID
   - Secret Access Key
   - Jurisdiction-specific endpoint for S3 clients

### Step 4: Update .env.local

Add these lines:

```bash
CLOUDFLARE_R2_ENDPOINT=https://xxxxxxxx.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=your_access_key_here
CLOUDFLARE_R2_SECRET_KEY=your_secret_key_here
CLOUDFLARE_R2_BUCKET=deadlinedao-proofs
CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxxxxxxxxxxxx.r2.dev
```

---

## 🔵 Snowflake Setup (May Require Enterprise - 30 minutes)

### Option A: Free Trial (Recommended)

1. Go to https://signup.snowflake.com/
2. Sign up for **30-day free trial**
3. Choose:
   - **Cloud Provider:** AWS (best Cortex support)
   - **Region:** US East or West
   - **Edition:** Enterprise (needed for Cortex AI)
4. Verify email and complete setup

### Option B: Existing Account

1. Check if your account has **Cortex AI** access
2. Run in Snowflake worksheet:
   ```sql
   SELECT SNOWFLAKE.CORTEX.COMPLETE(
     'claude-3-5-sonnet',
     [{'role': 'user', 'content': 'Hello'}]
   );
   ```
3. If this works, you have Cortex access ✓

### Get Credentials

**Method 1: API Key (Simpler)**
1. Go to **Account** → **API Keys**
2. Generate new key pair
3. Save private key file

**Method 2: JWT Token (Enterprise)**
1. Go to **Admin** → **Security** → **Authentication Policies**
2. Configure JWT authentication
3. Generate token

### Update .env.local

```bash
SNOWFLAKE_ACCOUNT=your_account_identifier
SNOWFLAKE_API_ENDPOINT=https://your-account.snowflakecomputing.com
SNOWFLAKE_JWT_TOKEN=your_jwt_token_or_api_key
```

### Important Notes

- Snowflake Cortex AI requires **Enterprise Edition** or higher
- Free trials include Enterprise features
- If you don't have access, you can:
  - Mock the AI validation for demo purposes
  - Use OpenAI/Anthropic API instead (requires code changes)
  - Focus demo on other features (Solana + Supabase work without Snowflake)

---

## Testing Order

Once services are configured, test in this order:

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```
Should show all services "up"

### 2. Create Goal
```bash
curl -X POST http://localhost:3000/api/goals \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_address": "E9RPd79Q9mMffFPrTBMgDpHSDmmvTwB1wsnf5KNVLr5b",
    "title": "Test Goal",
    "description": "Testing the system",
    "deadline": "2025-12-31T23:59:59Z",
    "stake_amount": 0.1,
    "stake_tx_signature": "your_tx_signature_here",
    "category": "learning"
  }'
```

### 3. Get Presigned Upload URL
```bash
curl -X POST http://localhost:3000/api/upload/presigned \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "proof.jpg",
    "goal_id": "goal_uuid_from_step_2",
    "user_id": "test_user"
  }'
```

### 4. Submit Proof (with Snowflake AI)
```bash
curl -X POST http://localhost:3000/api/proofs \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "goal_uuid_from_step_2",
    "text_description": "I completed the test goal successfully with concrete results",
    "image_url": "https://pub-xxx.r2.dev/proofs/test.jpg"
  }'
```

### 5. Get Analytics
```bash
curl http://localhost:3000/api/analytics/platform
```

---

## Troubleshooting

### Supabase Connection Failed
- Check URL doesn't have trailing slash
- Verify you're using SERVICE_ROLE key, not anon key
- Check database is running (not paused)

### Cloudflare R2 Upload Failed
- Verify endpoint matches your account region
- Check bucket name is exact match
- Ensure API token has "Object Read & Write" permissions

### Snowflake AI Not Available
- Confirm account has Enterprise edition
- Check Cortex AI is enabled for your account
- Try a simpler model first (mistral-large vs claude-3-5-sonnet)

### Solana Transaction Failed
- Ensure escrow wallet has enough SOL for fees
- Check you're on devnet, not mainnet
- Verify transaction signature is recent (<10 minutes)

---

## Quick Start Commands

```bash
# Install dependencies (if not done)
npm install

# Start dev server
npm run dev

# Test Supabase connection
npm run test:supabase

# Check all services health
curl http://localhost:3000/api/health

# View API documentation
curl http://localhost:3000/api
```

---

## Service Status Checklist

- [x] **Solana** - Configured and funded ✓
- [x] **Supabase** - Configured and tested ✓
- [ ] **Cloudflare R2** - Pending setup
- [ ] **Snowflake Cortex** - Pending setup (may require enterprise)

Update this checklist as you complete each service!
