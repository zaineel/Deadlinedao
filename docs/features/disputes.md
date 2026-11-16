# Validation disputes (appeals)

Flag: `FEATURE_DISPUTES=true` (default off). Design: `docs/designs/validation-disputes.md`.
Migration: `supabase-migrations/003_disputes.sql` (apply after 002, before enabling the flag).

## Behaviour
1. AI rejects a proof. With the flag on the goal becomes `rejected_appealable` with `appeal_deadline = now + 48h` (flag off: goal becomes `failed` as before). The owner gets an `appeal_window_open` notification.
2. The owner pays a bond of 5% of the stake (rounded up to a lamport) from their wallet to escrow, then calls `POST /api/disputes`. The server verifies the transfer on-chain (same check as stake confirmation: sender = session wallet, destination = escrow, amount >= bond), requires the signature to be unused (not a prior bond, not any goal's stake signature) and the window to be open. Goal becomes `disputed`. One dispute per goal (unique `goal_id`, unique `bond_tx_signature`).
3. No appeal: `GET /api/cron/finalize-appeals` (hourly, `CRON_SECRET`) moves `rejected_appealable` goals past their deadline to `failed`.
4. Admin resolves via `POST /api/admin/disputes {disputeId, decision}`:
   - `overturn`: goal `disputed -> completed` (atomic), stake returned with `returnStake`, bond refunded by claim-before-send as payout type `bond_refund`; the owner gets `appeal_resolved`.
   - `uphold`: goal `disputed -> failed`, bond stays in escrow (it is not added to the stake-based reward pool computation in v1), owner notified.
   - Resolving a resolved dispute is a no-op. If a payout fails the dispute stays open and the call can be retried; payouts are unique per (goal, type) so a retry never pays twice.

## Reward pool
Only `failed` goals count. `trigger-rewards` refuses (409) and previews `canDistribute: false` while any goal on that deadline day is `rejected_appealable` or `disputed`; `/api/prize-pool` and `/api/platform-stats` expose `pendingAppeals`. `expire-goals` only touches `active` goals so it ignores the new statuses.

## Endpoints
- `POST /api/disputes` (session, rate limited 5/min): `{goalId, reason(10-1000), extraImageUrl?, bondSignature}`.
- `GET /api/disputes` (session): own disputes, plus `appealable` goals with bond quote and the `escrowAddress`. 404 when the flag is off (the UI uses this to hide itself); 401 means "sign in with wallet".
- `GET/POST /api/admin/disputes` (`x-admin-key`).
- `GET /api/cron/finalize-appeals` (Bearer `CRON_SECRET`, added to `vercel.json` hourly).

## UI
Dashboard: status badges, appeal countdown + bond amount, "Appeal decision" (pays bond, files appeal), dispute status; wallet sign-in prompt when no session. Admin: `DisputeQueue` below the review queue. Both hidden when the flag is off.

## Env / nav
Only `FEATURE_DISPUTES`. No nav links needed. `DEMO_MODE` accepts `demo_tx_*` bond signatures like stake confirmation.

## Known limits
- Bond verification is `>=` bond (like stakes); the bond amount is converted to lamports with the existing floor helper, so it can be at most 1 lamport lenient.
- The goal is claimed (`rejected_appealable -> disputed`) before the bond is verified, so the finalize cron can never fail a goal whose bond was paid. If verification fails the goal is handed back. A crash between the claim and the dispute insert leaves a `disputed` goal with no dispute row (needs a manual fix).
- An upheld bond stays in escrow; it is NOT added to the reward pool in v1 (the design doc's original idea was deferred).
