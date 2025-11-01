# Cloudflare R2 Setup Guide

## Quick Setup (5 minutes)

### Step 1: Create R2 Bucket

1. Go to https://dash.cloudflare.com
2. Navigate to **R2 Object Storage** in the left sidebar
3. Click **Create bucket**
4. Bucket name: `deadlinedao-proofs`
5. Location: Choose closest to you (or leave default)
6. Click **Create bucket**

### Step 2: Create API Token

1. While in R2, click **Manage R2 API Tokens** (top right)
2. Click **Create API token**
3. Configure:
   - **Token name**: `deadlinedao-api`
   - **Permissions**: **Admin Read & Write**
   - **TTL**: Never expire (or set expiration if you prefer)
4. Click **Create API token**
5. **IMPORTANT**: Copy both values NOW (you won't see them again):
   - Access Key ID
   - Secret Access Key

### Step 3: Get Your R2 Endpoint

Your R2 endpoint has this format:
```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

To find your Account ID:
1. Look at the Cloudflare Dashboard URL
2. It's the part after `dash.cloudflare.com/`:
   ```
   https://dash.cloudflare.com/<YOUR_ACCOUNT_ID>/r2
   ```
3. Or click on any R2 bucket and look at **Bucket Details** → **S3 API**

### Step 4: Set Up Public Access (for serving images)

1. Go to your `deadlinedao-proofs` bucket
2. Click **Settings**
3. Scroll to **Public Access**
4. Click **Connect Domain** or **Enable R2.dev subdomain**
5. Option A: **R2.dev subdomain** (easiest for testing):
   - Click **Allow Access**
   - Your public URL will be: `https://pub-<hash>.r2.dev`
6. Option B: **Custom domain** (for production):
   - Add your domain
   - Follow DNS setup instructions

### Step 5: Update .env.local

Open `.env.local` and replace the R2 section with your values:

```bash
# Cloudflare R2 Configuration
CLOUDFLARE_R2_ENDPOINT=https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=<YOUR_ACCESS_KEY_ID>
CLOUDFLARE_R2_SECRET_KEY=<YOUR_SECRET_ACCESS_KEY>
CLOUDFLARE_R2_BUCKET=deadlinedao-proofs
CLOUDFLARE_R2_PUBLIC_URL=https://pub-<YOUR_HASH>.r2.dev
```

**Example**:
```bash
CLOUDFLARE_R2_ENDPOINT=https://abc123.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=1a2b3c4d5e6f7g8h9i0j
CLOUDFLARE_R2_SECRET_KEY=aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd
CLOUDFLARE_R2_BUCKET=deadlinedao-proofs
CLOUDFLARE_R2_PUBLIC_URL=https://pub-a1b2c3d4e5.r2.dev
```

### Step 6: Test It Works

Run the test script:
```bash
npx tsx scripts/test-r2.ts
```

This will:
1. ✅ Test connection
2. ✅ Upload a test file
3. ✅ Download it back
4. ✅ Generate a public URL
5. ✅ Clean up test file

---

## Troubleshooting

### "Access Denied" Error
- Check your API token has **Admin Read & Write** permissions
- Verify the Access Key and Secret Key are correct

### "Bucket Not Found" Error
- Make sure bucket name is exactly: `deadlinedao-proofs`
- Check the bucket exists in your account

### "Invalid Endpoint" Error
- Verify your endpoint URL format: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- Account ID should be the one from your dashboard URL

### Public URL Returns 404
- Make sure you enabled R2.dev subdomain or connected a custom domain
- Wait a few minutes for DNS propagation

---

## What You'll Be Able To Do

Once set up, your app can:
- ✅ Upload proof images from users
- ✅ Store them securely in R2
- ✅ Serve them via CDN (fast globally)
- ✅ Generate time-limited presigned URLs
- ✅ Delete files when needed
- ✅ Track file metadata

---

## Cost

Cloudflare R2 pricing:
- **Storage**: $0.015/GB per month
- **Operations**: Class A (writes) $4.50/million, Class B (reads) $0.36/million
- **Egress**: **FREE** (this is the big win vs S3!)

For a hackathon demo:
- 100 proof images (~10MB total) = ~$0.0002/month
- Basically **FREE** for demo purposes!

---

## Next Steps

After setup:
1. Run `npx tsx scripts/test-r2.ts` to verify
2. Restart your dev server
3. Check `/api/health` shows R2 as "up"
4. Try uploading a proof in your app!
