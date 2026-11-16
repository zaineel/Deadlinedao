# DAO governance v2 (panel voting on disputes)

Flag: `FEATURE_GOVERNANCE=true` AND `FEATURE_DISPUTES=true` (default off; with either off every governance route and `/governance` return 404 and disputes keep the admin-only flow).
Migration: `supabase-migrations/007_governance.sql` (apply after 003; teams/orgs tables are optional and only read).
No token, no on-chain or voted parameter changes: parameters come from env.

## Flow
1. **Draw.** The first cron / admin run after a dispute opens (`runGovernanceCycle`) draws a panel for every open dispute without a governance record. Eligible voter = at least `GOVERNANCE_MIN_COMPLETED_GOALS` (3) completed goals, no pending dispute of their own (goal in `rejected_appealable` or `disputed`), not the owner, not in a team or org (members and org admins) with the owner. Teams/orgs lookups fail closed (a DB error aborts the draw; a table that was never migrated counts as empty). `GOVERNANCE_PANEL_SIZE` (5) wallets are drawn uniformly with `crypto.randomInt` (partial Fisher-Yates) and stored in `dispute_panels` (unique `(dispute_id, wallet)`); `dispute_governance` (primary key = `dispute_id`) makes the draw happen once and records the parameters, eligible count and voting deadline. If fewer than the quorum are eligible the dispute stays in the existing admin flow and `fallback_reason` records why (`insufficient_eligible_voters:2<3`).
2. **Vote.** `POST /api/governance/votes {disputeId, vote: overturn|uphold, reason?}` by a drawn panelist for `GOVERNANCE_VOTING_WINDOW_HOURS` (48) after the draw. One vote per wallet (unique + composite FK to the panel). Replaying the identical vote is a 200 no-op; a different second vote is 409; a non-drawn wallet gets 404; after the window 409. Votes are sealed: no API returns any vote other than the caller's own until the dispute is resolved, and then only as a tally plus pseudonymous votes. The owner has no vote API at all. Panelists see goal description, proof text/image, AI verdict/confidence/reasoning, the owner's appeal text, and the owner as a pseudonym (`Anon-xxxxxx`, HMAC keyed by `SESSION_SECRET`), never the wallet.
3. **Resolve.** `GET /api/cron/resolve-disputes` (hourly at :15, `CRON_SECRET`) and `POST /api/admin/governance {action:"run"}` resolve disputes whose window closed or whose panel is fully voted. Quorum (`GOVERNANCE_QUORUM`, 3, never above the panel size) counts CAST votes; majority of cast votes decides; a tie or missing quorum sets state `escalated` for the admin. The decision goes through the unchanged `resolveDispute` (`lib/disputes/resolve.ts`): atomic goal transition, stake return, bond refund, claim-before-send, unconfirmed handling. If a payout fails/is unconfirmed the dispute stays in `voting` and the next run retries (votes are immutable once due).
4. **Admin override.** `POST /api/admin/governance {action:"override", disputeId, decision, reason(5-500)}` works at any time. The audit row (`governance_audit`: action `admin_override`, reason, state, votes cast) is written BEFORE anything moves; if it cannot be written nothing is resolved. The old `POST /api/admin/disputes` still works and is audited best-effort as `admin_resolve_legacy`.
5. **Incentives.** Only when the PANEL upholds (bond forfeited): `GOVERNANCE_REWARD_SHARE_BPS` (5000 = 50%) of the bond, split equally in integer lamports among voters who voted `uphold`; the remainder stays in escrow; total never exceeds the bond. Nothing when overturned or when the admin decided. Rewards live in `governance_rewards` (unique `(dispute_id, voter_wallet)`), claim-before-send via `sendPayoutFromEscrow`: definite failure releases the claim, an ambiguous result keeps it and marks `unconfirmed` (never re-sent; reconcile manually). The row is the claim, so there is no reconcile endpoint yet. Stats (`governance_voter_stats`: cast, agreed, missed) are applied exactly once when the governance record flips to `resolved`; a missed vote only increments a counter.

## Endpoints
- `GET /api/governance` (session, 60/min): my assignments, stats, rewards, public parameters.
- `POST /api/governance/votes` (session, 20/min).
- `GET /api/admin/governance` (`x-admin-key`): escalated, admin-fallback and voting disputes; tallies only for escalated/resolved.
- `POST /api/admin/governance` (`x-admin-key`): `run` or `override`.
- `GET /api/cron/resolve-disputes` (Bearer `CRON_SECRET`; added to `vercel.json`). No-op when the flag is off.

## UI
`/governance`: my assignments (vote form with optional reason), my stats and rewards. 404 when the flags are off. The header link is for the integrator to add.

## Env
`FEATURE_GOVERNANCE`, `GOVERNANCE_MIN_COMPLETED_GOALS` (3, 1-100), `GOVERNANCE_PANEL_SIZE` (5, 3-25), `GOVERNANCE_QUORUM` (3, 2-25, capped at panel size), `GOVERNANCE_VOTING_WINDOW_HOURS` (48, 1-168), `GOVERNANCE_REWARD_SHARE_BPS` (5000, 0-10000). The bond percentage stays the disputes constant (`BOND_BPS`, 5%).

## Known limits
- The draw happens on the next cron/admin run after a dispute opens (up to an hour of lag); the voting window starts at the draw.
- If the process dies after `resolveDispute` but before the governance record is updated, the next run credits the panel when its tally matches the actual outcome, otherwise the admin.
- Eligibility counts are computed in the app from `goals` (capped at 50k rows); fine for current scale.
- Sybil resistance is only "N completed goals"; it is not a strong guard. Rewards below the rent-exempt minimum to a brand-new account may fail definitively and are retried each run.
