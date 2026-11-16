# Validation disputes (appeals)

Status: proposed. Builds on the hardening PR (`returnStake`, `transitionGoalStatus`, payout claims, review queue).

## Problem
An AI rejection sets the goal to `failed` immediately. The stake is forfeited and counted in the Phase 2 reward pool. There is no appeal.

## Decisions
- Appeal window: **48 hours** after an AI rejection.
- Appeals require a **bond of 5% of the stake**, paid in SOL, refunded if the appeal wins.
- v1 resolver: a single admin (via the existing review queue). v2: staked votes by past winners.

## Flow
1. AI rejects the proof -> goal becomes `rejected_appealable`, `appeal_deadline = now + 48h`. Stake stays in escrow and is **not** counted in the reward pool.
2. Owner appeals before the deadline (`POST /api/disputes`, wallet-signed, bond transaction verified on-chain). Goal becomes `disputed`. One dispute per goal.
3. No appeal -> cron sets the goal to `failed` once `appeal_deadline` passes; existing logic applies.
4. Admin resolves:
   - **overturned**: goal `completed`, stake returned via `returnStake`, bond refunded (claimed payout, type `bond_refund`).
   - **upheld**: goal `failed`, bond kept in escrow (v1: not added to the stake-based reward pool; see docs/features/disputes.md).

## Data model (`supabase-migrations/002_disputes.sql`)
- `goals.status` check adds `rejected_appealable`, `disputed`; new column `appeal_deadline timestamptz`.
- `disputes`: `id`, `goal_id` (unique), `proof_id`, `reason`, `extra_image_url`, `bond_amount`, `bond_tx_signature` (unique), `status` (`open|overturned|upheld`), `resolved_at`, `created_at`.
- `payouts.payout_type` check adds `bond_refund`.

## API
- `POST /api/disputes` - owner, wallet-signed, zod-validated; verifies bond transfer to escrow.
- `GET /api/disputes?wallet=` - owner's disputes.
- `GET/POST /api/admin/disputes` - list open disputes; resolve with `overturn | uphold` (admin key).
- `GET /api/cron/finalize-appeals` - fail goals whose window closed (CRON_SECRET).

## Changes to existing code
- `/api/proofs` reject branch -> `rejected_appealable` + set `appeal_deadline`.
- `trigger-rewards`, `/api/prize-pool`, `/api/platform-stats`: only `failed` counts; skip non-final statuses; refuse to distribute a deadline that still has `rejected_appealable` or `disputed` goals.
- Expiry cron: ignore the new statuses.
- Dashboard: status badges, "Appeal" button with countdown, dispute status.
- Types and Supabase `Database` definitions.

## Tests
Status transitions, bond verification (wrong amount / wrong sender / reused signature), one-dispute-per-goal, window enforcement, unresolved disputes never enter the reward pool, double-resolve is a no-op.

## Out of scope (v2)
Staked voting, reviewer rewards, bond slashing rules beyond upheld/overturned.
