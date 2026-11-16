# Team deadlines (Phase 2)

Flag: `FEATURE_TEAMS=true` (routes return 404 and `/teams` 404s when off).
Migration: `supabase-migrations/004_teams.sql` (apply after 002, before enabling the flag).

## Model
`teams`, `team_members`, `team_goals`, plus nullable `goals.team_goal_id`. A member's stake and proofs are an ordinary `goals` row, so staking, proof submission, AI validation and Phase 1 stake returns are unchanged. A unique index on `(team_goal_id, wallet_address)` allows one stake per member per team goal.

## Rule: team-first redistribution
Members who fail forfeit into the team pool. It is split pro rata (by stake) among teammates who completed, floored to 4 decimals (sum never exceeds the pool). Paid as `team_reward` payouts, claim-before-send, one per member goal. The remainder (rounding dust, or the whole pool if nobody completed) is not paid out by team settlement and stays in escrow for the global pool.
Pure logic: `lib/teams/rewards.ts` (`computeTeamRewards`), `lib/teams/settlement.ts`, `lib/teams/settle.ts`.

## Flow
1. `POST /api/teams` create (owner = session wallet, invite code generated).
2. `POST /api/teams/join { inviteCode }` join (max 20 members).
3. Owner: `POST /api/team-goals` (title, description, category, deadline, stakePerMember).
4. Each member: `POST /api/team-goals/[id]/join` returns `{ goalId, transaction }` (unsigned stake transfer to escrow). The client signs/sends it, then calls the existing `POST /api/goals/confirm { goalId, signature }`. Calling the endpoint again before confirming re-issues the transaction for the same goal.
5. Members submit proofs through the normal flow.
6. Admin: `POST /api/admin/team-settlement { teamGoalId, dryRun? }` (header `x-admin-key`).

## Endpoints
| Route | Auth | Notes |
|---|---|---|
| `GET/POST /api/teams` | session | list mine / create |
| `POST /api/teams/join` | session | invite code, rate limited 10/min |
| `GET /api/teams/[id]` | session, members only (404 otherwise) | members, goals, per-member progress status (no proofs/text), invite code |
| `POST /api/team-goals` | session, owner only | |
| `POST /api/team-goals/[id]/join` | session, members only | builds stake tx, inserts pending member goal |
| `POST /api/admin/team-settlement` | admin key | see below |

## Settlement safety
- Refused with 409 before the team goal deadline, or while ANY staked member goal is not `completed`/`failed` (active, pending validation, and any appeal/dispute states). Goals whose stake was never confirmed (`stake_tx_signature = 'pending'`) are ignored.
- Idempotent: re-running skips rewards already claimed and retries rewards whose send failed (claim released). The team goal is marked `settled` only when every reward is paid. `dryRun: true` returns the plan without claiming or sending.

## Interaction with the global pool
`/api/admin/trigger-rewards` and `/api/prize-pool` exclude every goal with `team_goal_id` set from the global winner and loser sets (team goals are settled only by team settlement, so no stake is distributed twice and no member gets both a `team_reward` and a `completion_reward`). When settlement completes it records `team_goals.remainder_to_global` once (write-if-null). With `FEATURE_TEAMS` on, the global run for a deadline day adds the recorded remainders of that day's settled team goals to the pool, and refuses (409) while any team goal of that day is still unsettled, so settle team goals first. Pure logic: `lib/teams/pool.ts`.

## UI
`/teams` (list + join by code, supports `?code=`), `/teams/new`, `/teams/[id]` (invite link, goals, progress bars, stake button, leaderboard of completed goals), `/teams/[id]/goals/new`. Uses the wallet session via `components/teams/use-teams-api.ts` (signs in on first 401).

## Integrator notes
Nav link: add "Teams" -> `/teams` to the header when `FEATURE_TEAMS` is on. No new env vars.
