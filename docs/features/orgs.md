# Employer integration (corporate wellness): `orgs`

Flag: `FEATURE_ORGS=true`. Off by default: every route returns 404 and `/orgs/*` pages 404.
Migration: `supabase-migrations/005_orgs.sql` (needs 001 and 002 applied first).

## How it works
1. An org admin (any session wallet) creates an organization with a sponsor pool: match rate (% of stake), per-member cap, program window.
2. The admin funds the pool with an on-chain SOL transfer from their session wallet to the escrow, then submits the signature to `POST /api/orgs/[id]/fund`. The server verifies sender, destination and success, and credits the lamports that actually moved. Signatures are credited once (unique in `org_fundings`) and cannot be a signature already used as a goal stake.
3. Employees join with an invite code (`/orgs/join?code=...`). Consent to aggregate stats starts OFF.
4. Employees stake and complete goals through the normal flow. Nothing in `app/api/proofs` or the stake-return code changed.
5. A sweep pays matches: `POST /api/admin/org-matches` (header `x-admin-key`) or the cron `GET /api/cron/org-matches` (Bearer `CRON_SECRET`, daily 06:30 UTC, in vercel.json). It finds completed goals of members that joined at or before the goal was created, whose goal was created inside the program window, with no match yet, and pays `min(stake * rate, cap left, pool remaining)` rounded down to 0.0001 SOL as payout type `sponsor_match` (unique per goal).
6. After the window ends, an admin can withdraw the unspent balance (`POST /api/orgs/[id]/withdraw`), sent to their session wallet.

## Money safety
- Reservation is atomic in Postgres (`org_reserve_match`): locks pool and member rows, re-checks completed status, wallet, window, membership, remaining balance and cap, inserts the unique per-goal `org_matches` row, decrements the pool. Pure decision logic lives in `lib/orgs/match.ts` (tested); the DB re-enforces it.
- Order per match: reserve -> `claimPayout(goal, 'sponsor_match')` -> send -> `finalizePayout` + mark paid. Definite pre-broadcast failure (insufficient escrow, missing key) releases both claims; anything else (timeouts, unconfirmed) is treated as ambiguous and stays reserved for manual reconciliation, so a transfer that may have landed is never re-paid.
- Withdrawals use their own table (`org_withdrawals`) with claim-before-send: `org_claim_withdrawal` zeroes the pool and inserts a `pending` row in one transaction (unique index: one in flight per org). Blocked while any member goal started in the window is still `active`.
- Ambiguous rows to reconcile by hand: `org_matches.status = 'reserved'` with a `payouts.tx_signature = 'pending'` row, and `org_withdrawals.tx_signature = 'pending'`.

## Endpoints
| Route | Auth | Purpose |
|---|---|---|
| `GET/POST /api/orgs` | session | list my orgs / create org + pool |
| `POST /api/orgs/join` | session | join by invite code |
| `GET/POST /api/orgs/[id]/fund` | org admin | escrow address / submit funding signature |
| `GET/PUT /api/orgs/[id]/members` | member/admin | own membership + headcounts; set OWN consent |
| `GET /api/orgs/[id]/stats` | org admin | aggregate stats |
| `POST /api/orgs/[id]/withdraw` | org admin | withdraw unspent balance after window |
| `POST /api/admin/org-matches` | admin key | run sweep |
| `GET /api/cron/org-matches` | CRON_SECRET | run sweep |

UI: `/orgs` (list/create), `/orgs/[id]` (employer dashboard), `/orgs/join` (employee join + consent). Non-admins hitting admin routes get 404 so org ids cannot be probed.

## Privacy rules (enforced in code)
- Employers see aggregates only: participation count, completion rate, total staked, total matched.
- Only members with `consent_aggregate = true` are ever counted or even queried for stats (`loadStatsInputs`), and only the columns status, stake, created_at and wallet are read for that. Titles, descriptions and proofs are never read.
- k-anonymity: nothing is shown below 5 consenting members (`MIN_GROUP_SIZE` in `lib/orgs/stats.ts`). Rates and totals additionally need 5 consenting participants.
- Admin endpoints return headcounts, never wallet lists or per-person rows. The invite code and pool balances are visible to admins only.
- Members control their own consent and can revoke it at any time.
- Known limit: pool balances are the employer's own money; in a very small org the pool drawdown could hint at individual activity. Acceptable under the roadmap rules, but worth a policy note to employers.

## Env vars / nav
No new env vars (uses `CRON_SECRET`, `ADMIN_API_KEY`, `SESSION_SECRET`, `FEATURE_ORGS`). Suggested nav link for the integrator: "Organizations" -> `/orgs`, shown only when the flag is on.
