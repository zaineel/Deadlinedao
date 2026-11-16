# Demo script

A single walkthrough for demoing DeadlineDAO on devnet, plus a pre-flight checklist. The product is described in the README; this is the order to show it in.

## Demo mode: read this first

`DEMO_MODE=true` (server-only; `NEXT_PUBLIC_DEMO_MODE` is read as a fallback) changes three things:

- `POST /api/goals/create` creates the goal without building a stake transaction.
- `POST /api/goals/confirm` accepts signatures starting with `demo_tx_` without verifying anything on-chain.
- `POST /api/disputes` accepts `demo_tx_` bond signatures the same way (when disputes are on).

Payouts are NOT simulated: stake returns and rewards still send real devnet SOL from the escrow wallet. A goal activated through demo mode has no stake behind it, so approving it pays out money the escrow never received. Use demo mode only on a throwaway devnet deployment, never in production, and prefer the real flow with a funded devnet wallet whenever you can. Set `DEMO_MODE=false` (or leave it unset) everywhere else.

## Pre-flight (15 minutes before)

- [ ] `.env.local` is complete (see [setup.md](./setup.md)); `curl localhost:3000/api/health` shows all four services `up`.
- [ ] Escrow wallet funded: `npx tsx scripts/check-escrow.ts`. Demo wallet funded with a few devnet SOL, wallet set to Devnet.
- [ ] All migrations applied in Supabase (at least `001_payout_safety.sql`).
- [ ] You know your `ADMIN_API_KEY`; `/admin` loads.
- [ ] Goals for the story exist (below) and their deadlines are in the future if you still want to submit proofs. `npx tsx scripts/update-deadlines.ts` pushes all active goals 7 days out; `scripts/check-deadlines.ts` lists them.
- [ ] Browser zoom up, notifications off, devnet explorer tab open: https://explorer.solana.com/?cluster=devnet
- [ ] Production is not running with demo mode on.

## Walkthrough (about 6 minutes)

1. **Pitch (30 s).** Stake SOL on a goal with a deadline. Finish and get your stake back plus a share of the stakes of people who failed. Say plainly that escrow is a server-held devnet keypair.
2. **Connect wallet (30 s).** Phantom on Devnet. Message signatures are free; only the stake moves SOL. With disputes, orgs or push enabled the UI also asks for a wallet sign-in (`/api/auth/*`).
3. **Create a goal (60 s).** Title, description, category, deadline, stake (say 0.1 SOL). Sign the stake transaction. `POST /api/goals/confirm` verifies it on-chain and activates the goal; show the transaction in the explorer.
4. **Submit proof (90 s).** On the dashboard open the goal, write what you did, optionally attach a JPEG or PNG, sign the proof message. Snowflake Cortex returns `approved`, `rejected` or `needs_review` within seconds. On approval the stake is returned immediately (Phase 1); show the payout signature. Mention that images are stored but not analyzed by the AI.
5. **Human in the loop (45 s).** In `/admin` show the review queue for a `needs_review` proof and approve or reject it.
6. **Phase 2 rewards (90 s).** Needs a deadline day that has at least one completed goal and one failed goal (create an extra goal and reject its proof in the review queue to make a failed stake quickly). In `/admin` enter the deadline, Preview, then Distribute rewards and open the explorer links. Re-click to show it is idempotent (`already_distributed`).
7. **Close (30 s).** Mention claim-before-send payouts, the appeal window (if `FEATURE_DISPUTES` is on), and the limitations in the README.

## Fallbacks

- Snowflake down: proofs go to `needs_review`; demo the admin review queue instead.
- Devnet congestion or faucet limits: have a second funded wallet ready.
- A payout shows `unconfirmed`: do not retry; run reconcile ([admin.md](./admin.md)).
- Out of time to wait for a real deadline: use `scripts/update-deadlines.ts`, or show the cron endpoint with the `CRON_SECRET` header.

## After the demo

Turn off `DEMO_MODE` if it was on and top the escrow wallet back up.
