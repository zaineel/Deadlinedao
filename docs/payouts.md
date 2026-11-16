# Payouts

Money moves in two phases and only ever through the claim-before-send pattern. Code: `lib/supabase/payouts.ts`, `lib/solana/escrow.ts`, `lib/solana/stake-return.ts`, `lib/solana/payouts.ts`, `lib/solana/payout-classify.ts`. Payout types are defined in `lib/config/payout-types.ts`.

Escrow is a server-held keypair (`SOLANA_ESCROW_PRIVATE_KEY`), not an on-chain program; see the README's known limitations and `docs/designs/escrow-program.md`.

## Phase 1: stake return (immediate)

When a proof is approved, the goal moves `active -> completed` (atomic `transitionGoalStatus`) and `returnStake(goal)` sends the original stake back as payout type `original_stake`. Approval happens either automatically (AI verdict `approved` in `POST /api/proofs`) or by an admin (`POST /api/admin/review` with `approve`).

Outcomes of the send:

- `sent`: the signature is recorded; the response includes it.
- `already returned`: a payout row already existed; nothing is sent.
- definite failure (nothing could have reached the network): the claim is released and the goal is put back (`completed -> active` from the proof route, `completed -> pending_validation` from the review route) so it can be retried. The API answers 502.
- ambiguous failure (the transaction may have been broadcast): see "Unconfirmed payouts" below. The API answers 202 and the goal stays `completed`.

## Phase 2: reward run (admin, per deadline day)

Failed stakes for one deadline day are split pro rata among that day's completed goals, by stake size. Rewards do not include the stake itself (already returned in Phase 1). Each winner's amount is rounded down to 4 decimals (`computeRewardPayouts`).

1. Preview: `GET /api/admin/trigger-rewards?deadline=YYYY-MM-DD` returns stats, each winner's reward and `canDistribute`. Deadlines are matched by UTC calendar day.
2. Run: `POST /api/admin/trigger-rewards {"deadline":"YYYY-MM-DD"}`, or the Distribute button in `/admin`.
3. It refuses (409) while any goal on that day is still in the appeal window or disputed (`rejected_appealable`, `disputed`), because those stakes are not final. With `FEATURE_TEAMS` on it also refuses until every team goal due that day is settled (`POST /api/admin/team-settlement`); team member goals are excluded from the global winner and loser sets, and each settled team goal's recorded remainder (rounding dust, or the whole team pool when nobody completed) is added to that day's pool. It reports "no completed goals" or "no failed goals" without sending anything.
4. For each winner it claims a `completion_reward` payout, sends, then finalizes. Per-winner status is `success`, `already_distributed`, `unconfirmed` or `failed`.
5. It is safe to re-run: paid goals come back as `already_distributed`, failed claims were released and are retried, and unconfirmed ones are left alone.

Goals that were never proven are failed by the daily `expire-goals` cron once deadline plus the 7-day grace period (`lib/config/goals.ts`) has passed; this is what feeds the reward pool. Active goals are not part of a run.

## Claim-before-send

1. `claimPayout(goalId, wallet, amount, type)` inserts a payout row with `tx_signature = 'pending'`. A unique index on `(goal_id, payout_type)` (migration `001_payout_safety.sql`) means only one caller can claim; the loser gets "not claimed" and sends nothing.
2. The transfer is sent from escrow.
3. Success: `finalizePayout(id, signature)` records the real signature.
4. Definite failure: `releasePayout(id)` deletes the claim so the payout can be retried.
5. Ambiguous failure: `markPayoutUnconfirmed(id, signature)` stores `unconfirmed:<signature>` and keeps the claim, so nothing can pay twice.

Failure classification (`payout-classify.ts`): a failure before the signed transaction could be broadcast (bad address, low balance, blockhash fetch, signing) is definite; a failure after submission (send or confirmation threw or timed out) is ambiguous.

## Unconfirmed payouts and reconcile

`POST /api/admin/payouts/reconcile` (admin key; optional body `{"payoutId": "<uuid>"}`) resolves rows still `pending` or `unconfirmed:*`:

| Situation | Result |
| --- | --- |
| Signature confirmed or finalized without error | `finalized` with the real signature |
| Signature landed with an error | `released` (claim removed, retryable) |
| Signature unknown to the cluster and the claim is older than 15 minutes (blockhash expired) | `released` |
| Still processing, or younger than 15 minutes | `waiting`; run again later |
| `pending` with no signature and older than 2 minutes | `manual`: it cannot be checked on-chain and is never released automatically; inspect escrow history and decide by hand |
| RPC trouble | `error`; the row is untouched |

When an `original_stake` payout is released the goal is reopened (`completed -> active`) so it can be retried.

Never retry an unconfirmed payout by hand before reconciling it; that is how double payments happen.

## Other payout types

Dispute bond refunds (`bond_refund`), org sponsor matches (`sponsor_match`) and team rewards (`team_reward`) use the same claim, send, finalize or release flow. See `docs/features/disputes.md`, `docs/features/orgs.md` and `docs/features/teams.md`. Team settlement and dispute resolution can also leave unconfirmed payouts; reconcile them the same way.

## Inspecting payouts (devnet)

- `npx tsx scripts/check-payout-status.ts` lists completed goals and whether they have payouts.
- `npx tsx scripts/check-payouts.ts` lists recent payout rows.
- `npx tsx scripts/check-escrow.ts` shows the escrow address and balance.

Every payout can be verified on https://explorer.solana.com/?cluster=devnet using its signature.
