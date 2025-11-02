# Snowflake Setup Guide - Step by Step

Complete guide to set up Snowflake with JWT authentication for DeadlineDAO.

---

## 📋 Prerequisites

- ✅ Snowflake account (Enterprise edition for Cortex AI)
- ✅ Email access for verification
- ✅ OpenSSL installed (comes with macOS)
- ✅ Node.js and npm installed

---

## Step 1: Sign Up for Snowflake (5 minutes)

### 1.1 Go to Snowflake Signup
**URL:** https://signup.snowflake.com/

### 1.2 Fill Out Form
```
First Name: [Your name]
Last Name: [Your name]
Email: [Your email]
Company: [Your company or "Personal"]
Country: United States

☑️ **IMPORTANT:**
   Edition: "Enterprise" (required for Cortex AI!)
   Cloud: AWS
   Region: US East (N. Virginia) or US West (Oregon)
```

### 1.3 Verify Email
- Check your email inbox
- Click the verification link
- Set your password

### 1.4 Save Your Account Identifier
After signup, you'll see your **Account Identifier**. It looks like:
- `xy12345` or
- `xy12345.us-east-1.aws`

**Write it down!** You'll need this later.

### 1.5 Log In
- URL will be: `https://[your-account].snowflakecomputing.com`
- Username: Your email or assigned username
- Password: What you set

---

## Step 2: Generate RSA Key Pair (2 minutes)

Run this command in your terminal:

```bash
bash scripts/generate-snowflake-keys.sh
```

**What this does:**
- Creates `.snowflake-keys/` directory
- Generates private key: `rsa_key.p8`
- Generates public key: `rsa_key.pub`
- Shows you the public key to copy

**Output will look like:**
```
🔐 Generating Snowflake JWT Authentication Keys
==============================================

1️⃣  Generating private key...
✅ Private key generated: .snowflake-keys/rsa_key.p8

2️⃣  Generating public key...
✅ Public key generated: .snowflake-keys/rsa_key.pub

==============================================
✅ Key pair generated successfully!

📋 Next steps:

1. Log into your Snowflake account
2. Run this SQL command to add the public key to your user:

   ALTER USER <your_username> SET RSA_PUBLIC_KEY='
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
   ';

3. Copy the public key above (without the BEGIN/END lines)
4. Paste it into Snowflake SQL worksheet and execute
```

**Copy the public key** (the long string shown in the output)

---

## Step 3: Upload Public Key to Snowflake (3 minutes)

### 3.1 Open Snowflake SQL Worksheet
1. Log into your Snowflake web interface
2. Click **"Worksheets"** in left sidebar
3. Click **"+ Worksheet"** to create new

### 3.2 Get Your Username
First, find your username by running:
```sql
SELECT CURRENT_USER();
```

**Copy the result** (e.g., `MYUSER`)

### 3.3 Upload Your Public Key
Run this SQL command, replacing:
- `<YOUR_USERNAME>` with your username from step 3.2
- `<YOUR_PUBLIC_KEY>` with the key from step 2

```sql
ALTER USER <YOUR_USERNAME>
SET RSA_PUBLIC_KEY='<YOUR_PUBLIC_KEY>';
```

**Example:**
```sql
ALTER USER MYUSER
SET RSA_PUBLIC_KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...';
```

### 3.4 Verify Upload
Run this to check:
```sql
DESC USER <YOUR_USERNAME>;
```

Look for `RSA_PUBLIC_KEY_FP` - if it has a value, you're good! ✅

---

## Step 4: Generate JWT Token (2 minutes)

Run this command:

```bash
npx tsx scripts/generate-snowflake-jwt.ts
```

**It will ask you:**
```
Account identifier (e.g., xy12345): [Enter your account from Step 1.4]
Username (e.g., MYUSER): [Enter your username from Step 3.2]
```

**Output will be:**
```
✅ JWT Token Generated Successfully!

🎫 Your JWT Token:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJYWTEyMzQ1Lk1ZVVNFUi...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Add these to your .env.local file:

SNOWFLAKE_ACCOUNT=XY12345
SNOWFLAKE_API_ENDPOINT=https://xy12345.snowflakecomputing.com
SNOWFLAKE_JWT_TOKEN=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Copy all three lines!**

---

## Step 5: Update .env.local (1 minute)

Open your `.env.local` file and **replace** these lines:

```bash
# Replace these:
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_API_ENDPOINT=https://your-account.snowflakecomputing.com
SNOWFLAKE_JWT_TOKEN=your_jwt_token

# With the values from Step 4:
SNOWFLAKE_ACCOUNT=XY12345
SNOWFLAKE_API_ENDPOINT=https://xy12345.snowflakecomputing.com
SNOWFLAKE_JWT_TOKEN=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 6: Test Snowflake Connection (2 minutes)

### 6.1 Restart Dev Server
```bash
# Stop the current server (Ctrl+C)
npm run dev
```

### 6.2 Check Health
```bash
curl http://localhost:3000/api/health | python3 -m json.tool
```

**You should see:**
```json
{
  "status": "healthy",
  "services": {
    "supabase": { "status": "up" },
    "solana": { "status": "up" },
    "snowflake": { "status": "up" },  // ✅ Should be "up" now!
    "cloudflare_r2": { "status": "up" }
  }
}
```

---

## Step 7: Enable Cortex AI (CRITICAL - 2 minutes)

Cortex AI must be **explicitly enabled** on your account.

### 7.1 Open SQL Worksheet in Snowflake

### 7.2 Run This Test
```sql
SELECT SNOWFLAKE.CORTEX.COMPLETE(
  'mistral-large',
  [{'role': 'user', 'content': 'Say hello'}]
) AS response;
```

### If You Get an Error:
**Error:** `Function SNOWFLAKE.CORTEX.COMPLETE does not exist`

**Solution:**
1. Go to **Admin** → **Billing & Terms**
2. Check if you're on **Enterprise edition**
3. Contact Snowflake support to enable Cortex AI
4. Or use the Snowflake UI to enable "Cortex AI Features"

### If It Works:
You'll see:
```
{"response": "Hello! How can I help you today?"}
```

**✅ You're ready to go!**

---

## Step 8: Test Full Proof Validation (5 minutes)

### 8.1 Create a Test Goal
```bash
curl -X POST http://localhost:3000/api/goals \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_address": "E9RPd79Q9mMffFPrTBMgDpHSDmmvTwB1wsnf5KNVLr5b",
    "title": "Learn TypeScript",
    "description": "Complete TypeScript tutorial and build 3 projects",
    "deadline": "2025-12-31T23:59:59Z",
    "stake_amount": 0.1,
    "stake_tx_signature": "test_tx_12345",
    "category": "learning"
  }'
```

**Save the `goal_id` from response!**

### 8.2 Submit Proof for AI Validation
```bash
curl -X POST http://localhost:3000/api/proofs \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "<GOAL_ID_FROM_ABOVE>",
    "text_description": "I completed all TypeScript modules with 95% score. Built 3 projects: todo app, weather dashboard, and e-commerce site. All deployed to production. Here are the GitHub links and screenshots showing completion certificates.",
    "image_url": ""
  }'
```

**You should see:**
```json
{
  "success": true,
  "proof": {
    "id": "...",
    "ai_verdict": "approved",
    "ai_confidence": 87,
    "quality_score": 82,
    "ai_reasoning": "The proof demonstrates clear completion..."
  },
  "validation": {
    "verdict": "approved",
    "confidence": 87,
    "quality_score": 82,
    "text_match_score": 90,
    "specificity_score": 85,
    "red_flags": [],
    "reasoning": "..."
  },
  "goal_status": "completed",
  "payout": {
    "signature": "...",
    "amount": 0.1
  }
}
```

**🎉 Snowflake AI validation is working!**

---

## Troubleshooting

### JWT Token Expired
**Symptom:** `401 Unauthorized` errors

**Solution:** JWT tokens expire after 1 hour. Regenerate:
```bash
npx tsx scripts/generate-snowflake-jwt.ts
```
Then update `.env.local` and restart server.

### Cortex AI Not Available
**Symptom:** `Function SNOWFLAKE.CORTEX.COMPLETE does not exist`

**Solutions:**
1. Verify you're on **Enterprise edition** (not Standard/Business)
2. Contact Snowflake support to enable Cortex AI
3. Check your account region supports Cortex (AWS US East/West)

### Connection Refused
**Symptom:** `Connection refused` or timeout errors

**Solutions:**
1. Check your account identifier is correct
2. Verify endpoint format: `https://[account].snowflakecomputing.com`
3. Check public key is properly uploaded to user account
4. Regenerate JWT token

### Public Key Upload Failed
**Symptom:** `SQL compilation error` when running ALTER USER

**Solutions:**
1. Make sure you're using YOUR username (run `SELECT CURRENT_USER()`)
2. Remove `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` lines
3. Make sure public key is one continuous string
4. Check you have ACCOUNTADMIN or SECURITYADMIN role

---

## Quick Reference

```bash
# Generate keys
bash scripts/generate-snowflake-keys.sh

# Generate JWT token
npx tsx scripts/generate-snowflake-jwt.ts

# Test connection
curl http://localhost:3000/api/health

# Test Cortex AI in Snowflake
SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large',
  [{'role': 'user', 'content': 'Hello'}]) AS response;
```

---

## Next Steps

Once Snowflake is working:
1. ✅ Test proof submission with real AI validation
2. ✅ Create multiple test goals
3. ✅ Demo the complete flow for hackathon
4. 📝 Consider setting up Cloudflare R2 for image uploads

---

**Status:** Ready for hackathon demo with full AI validation! 🚀
