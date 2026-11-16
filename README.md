# DeadlineDAO

Stake SOL on a personal goal with a deadline. Submit proof; an AI check (Snowflake Cortex) validates it. Complete the goal and you get your stake back plus a share of the stakes of people who failed. Miss it and your stake goes to the winners.

Built for the OSU Hackathon 2025. It is a hackathon project running on **Solana devnet**; read "Known limitations" before trusting it with anything of value.

## Known limitations

- **Escrow is a server-held keypair, not a trustless on-chain program.** Stakes are sent to a wallet whose private key (`SOLANA_ESCROW_PRIVATE_KEY`) lives in the server environment. Whoever controls that key controls the funds. Devnet only.
- **Image proofs are not analyzed by the AI yet.** Images are uploaded to R2 and linked, but validation is based on the proof text only. Images need manual review by an admin.
- **Demo mode must stay off in production.** `DEMO_MODE=true` skips on-chain stake verification.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- Solana (`@solana/web3.js`, wallet-adapter), devnet
- Supabase (Postgres) for goals, proofs, payouts
- Snowflake Cortex (via `snowflake-sdk`) for proof validation
- Cloudflare R2 (S3 API) for proof image storage
- zod for request validation, Vitest for tests, deployed on Vercel

## Architecture

1. **Create goal**: `POST /api/goals/create` stores a goal (title, deadline, stake) as pending.
2. **Stake**: the user signs a SOL transfer to the escrow wallet; `POST /api/goals/confirm` verifies that transfer on-chain (amount, sender, destination) and rejects reused signatures, then activates the goal.
3. **Proof**: the owner submits text (and optionally an image) to `POST /api/proofs`, signing a message with their wallet. Proofs are accepted until the deadline plus a 7-day grace period (`lib/config/goals.ts`).
4. **AI validation**: Snowflake Cortex returns `approved`, `rejected` or `needs_review`. AI errors and suspected prompt injection fail closed to `needs_review`.
5. **Admin review queue**: `needs_review` proofs are decided by an admin via `/admin` (`/api/admin/review`).
6. **Two-phase payout**:
   - Phase 1: on approval, the original stake is returned.
   - Phase 2: an admin triggers `POST /api/admin/trigger-rewards` for a deadline date; failed stakes are split among that day's completed goals.
   Each payout is recorded ("claimed") in the database before SOL is sent, with a unique index per goal and payout type, so retries and concurrent requests cannot double-pay.
7. **Expiry cron**: `GET /api/cron/expire-goals` (daily) marks active goals as `failed` once deadline plus grace period has passed without a completed proof, which feeds their stake into the Phase 2 pool.

Code layout: `app/` (pages and API routes), `lib/solana`, `lib/supabase`, `lib/snowflake`, `lib/cloudflare`, `lib/auth` (admin key, wallet signatures), `lib/validation` (zod schemas), `lib/notify` (notification skeleton, not yet wired into flows), `tests/`.

## Setup

Requires Node 22 (matches CI).

```bash
npm ci
cp .env.local.example .env.local   # then fill in values
npm run dev
```

### Environment variables

Server-only variables must never be exposed to the browser (do not prefix with `NEXT_PUBLIC_`).

| Variable | Server-only | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | no | Solana RPC endpoint (devnet) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | Supabase client config (read by some client/lib code) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | yes | Supabase server config |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Full DB access; bypasses RLS |
| `SOLANA_ESCROW_PRIVATE_KEY` | yes | Escrow keypair as a JSON byte array; controls all staked funds |
| `SNOWFLAKE_ACCOUNT` | yes | Snowflake account identifier |
| `SNOWFLAKE_USERNAME`, `SNOWFLAKE_WAREHOUSE` | yes | Snowflake user and warehouse (code defaults exist; set your own) |
| `SNOWFLAKE_PRIVATE_KEY` | yes | Key-pair auth for Snowflake |
| `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY`, `CLOUDFLARE_R2_BUCKET` | yes | R2 credentials |
| `CLOUDFLARE_R2_PUBLIC_URL` | yes | Public base URL for stored proofs |
| `ADMIN_API_KEY` | yes | Required (`x-admin-key`) for `/admin` and `/api/admin/*` |
| `CRON_SECRET` | yes | Bearer token Vercel sends to `/api/cron/*`; endpoint fails closed if unset |
| `DEMO_MODE` | yes | `true` skips stake verification. Keep `false` in production |
| `SESSION_SECRET` | yes | Used by wallet sessions |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | yes | Optional; enable the email channel in `lib/notify` |

Note: `.env.local.example` still lists `SNOWFLAKE_API_ENDPOINT` and `SNOWFLAKE_JWT_TOKEN`, but the code reads `SNOWFLAKE_USERNAME`, `SNOWFLAKE_WAREHOUSE` and `SNOWFLAKE_PRIVATE_KEY`. Treat the code as authoritative. `NEXT_PUBLIC_DEMO_MODE` is still read as a fallback for `DEMO_MODE`; do not set it in production.

### Database

1. In the Supabase SQL editor, run `supabase-schema.sql` (tables `goals`, `proofs`, `payouts`).
2. Then run every file in `supabase-migrations/`.

> **Warning:** `supabase-migrations/001_payout_safety.sql` must be applied. It creates the unique indexes that make payouts idempotent. Without it, the claim-before-send protection against double payouts does not work.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (`tests/*.test.ts`) |

Helper scripts live in `scripts/` and run with `npx tsx scripts/<name>.ts` (escrow checks, payout inspection, Snowflake/R2 diagnostics). Some of them are destructive or send SOL; read them first.

## Security model

- **Admin key**: `/admin` and `/api/admin/*` require `ADMIN_API_KEY`. Editing a goal via `PUT /api/goals/[id]` is admin-only.
- **Wallet-signed proof submission**: `POST /api/proofs` requires an ed25519 signature from the goal owner's wallet over a message with a freshness window.
- **On-chain stake verification**: goals are only activated after the stake transfer is verified on-chain; signatures cannot be reused. (Skipped in demo mode.)
- **Claim-before-send payouts**: a payout row is claimed in the DB (unique per goal and type) before any SOL moves; status transitions are atomic; reward distribution is safe to re-run and reports partial failures.
- **Prompt-injection hardening**: user text is fenced as untrusted in Cortex prompts, model output is strictly parsed, and any error or injection signal results in `needs_review` rather than approval.
- **Input validation**: zod schemas on API routes; uploads check real file bytes.
- **Cron**: `CRON_SECRET` bearer check with constant-time comparison.

## Testing and CI

`npm run typecheck`, `npm run lint` and `npm test` run on every PR and on pushes to `main` via `.github/workflows/ci.yml` (Node 22). Tests cover prompt-safety, reward math, validation schemas and wallet signature verification; external services are not called.

## Deployment (Vercel)

- Set all server env vars in the Vercel project; set `DEMO_MODE=false`.
- `vercel.json` registers the cron `/api/cron/expire-goals` (daily, 06:00 UTC) and raises `maxDuration` for the proof routes. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
- Apply the Supabase migrations before the first deploy.

## Roadmap

See [docs/designs/roadmap.md](docs/designs/roadmap.md).

## Other docs

The repo also contains older hackathon-era guides in the root (`SETUP_GUIDE.md`, `API.md`, demo checklists, etc.). They may be out of date; this README takes precedence.
