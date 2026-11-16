# Setup

How to get DeadlineDAO running locally. The README has the authoritative environment variable table; this guide adds the account-creation steps. Requires Node 22.

```bash
npm ci
cp .env.local.example .env.local   # then fill in values
npm run dev
```

## 1. Solana devnet

Everything runs on **devnet**. Devnet SOL is free but must be requested from a faucet.

1. Generate an escrow keypair: `npx tsx scripts/generate-solana-keypair.ts`. It prints the public address and the secret key as a JSON byte array.
2. Put the byte array in `SOLANA_ESCROW_PRIVATE_KEY` (server-only). Whoever holds this key controls all staked funds; never commit it or expose it to the browser.
3. Fund the escrow wallet so it can pay out stakes and rewards, and fund your test wallet(s) so they can stake:
   - Web faucet: https://faucet.solana.com (select Devnet).
   - CLI: `solana airdrop 2 <ADDRESS> --url devnet`.
   - Faucets are rate limited; if one refuses, try another or wait.
4. Set `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com` (or a dedicated devnet RPC to avoid rate limits).
5. In Phantom or Solflare, switch the wallet to Devnet (Settings, Developer Settings, Testnet Mode, Devnet). A failed stake transaction when creating a goal almost always means the staking wallet has no devnet SOL. A goal created before its stake is confirmed stays `pending_validation` with `stake_tx_signature = 'pending'` and does not count as staked.
6. Check the escrow balance with `npx tsx scripts/check-escrow.ts`.

## 2. Supabase

1. Create a project at https://supabase.com/dashboard.
2. In the SQL editor run `supabase-schema.sql`, then every file in `supabase-migrations/` in numeric order.
   `001_payout_safety.sql` is mandatory: it creates the unique index that makes payouts idempotent (claim-before-send is not safe without it). Later migrations belong to feature flags (disputes, orgs, push); apply them before enabling the matching `FEATURE_*` flag. See `docs/features/*.md`.
3. Settings, API: copy the project URL and the **service_role** key.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (plus the other Supabase variables listed in the README table). The service-role key bypasses RLS: keep it server-only.
5. Verify the connection with `npx tsx scripts/test-supabase.ts`.

## 3. Cloudflare R2 (proof images)

Follow `scripts/setup-r2.md`: create a bucket, enable public access, create an API token with Object Read and Write, and set `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY`, `CLOUDFLARE_R2_BUCKET` and `CLOUDFLARE_R2_PUBLIC_URL`. Check with `npx tsx scripts/test-r2.ts`.

Uploads go through `POST /api/upload/proof` (JPEG or PNG, max 10 MB). Proof submission only accepts image URLs under `CLOUDFLARE_R2_PUBLIC_URL`. There is no presigned-upload endpoint.

## 4. Snowflake Cortex

See [snowflake.md](./snowflake.md).

## 5. Secrets for the API

- `ADMIN_API_KEY`: long random string, sent as the `x-admin-key` header. Required for `/admin` and every `/api/admin/*` route; those routes return 503 if it is unset.
- `CRON_SECRET`: long random string. Vercel sends it as `Authorization: Bearer ...` to `/api/cron/*`; those routes return 401 if it is unset or wrong.
- `SESSION_SECRET`: at least 32 random characters (`openssl rand -base64 48`). Signs wallet sign-in sessions; auth fails closed without it.
- `DEMO_MODE`: keep `false` (see [demo.md](./demo.md)).
- Optional: `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, and the `FEATURE_*` flags (all default off).

`.env.local.example` lists every variable the code reads (Snowflake, governance tuning, `NEXT_PUBLIC_IOS_APP_URL`). `SNOWFLAKE_USERNAME` is required: there is no default. See [snowflake.md](./snowflake.md).

## 6. Smoke test

1. `npm run dev`, then `curl localhost:3000/api/health`. It reports `up` or `down` for Supabase, Solana, Snowflake and R2 (HTTP 503 if anything is down).
2. Create a goal in the UI, sign the stake transaction, submit a proof, and watch the dashboard.
3. `npm run typecheck && npm run lint && npm test` is what CI runs.
