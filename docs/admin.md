# Admin operations

Everything admin-facing is protected by `ADMIN_API_KEY`, sent as the `x-admin-key` header. The `/admin` page asks for the key and attaches it to its API calls. If `ADMIN_API_KEY` is not configured the admin routes return 503; a wrong key returns 401. Treat the key like the escrow key: it can move funds.

Page: `app/admin/page.tsx`, with `components/admin/ReviewQueue.tsx` and `components/admin/DisputeQueue.tsx`. Production URL is whatever your Vercel deployment is; locally http://localhost:3000/admin.

## Reward distribution (Phase 2)

On `/admin`:

1. Enter the admin key, pick a deadline date (UTC day, `YYYY-MM-DD`).
2. **Preview** (`GET /api/admin/trigger-rewards?deadline=...`): totals for completed, failed and active goals, each winner's stake, share and reward, and whether it can run. It cannot run while appeals are pending, while team goals for that day are unsettled (`FEATURE_TEAMS`), or if there are no winners or no failed stakes.
3. **Distribute rewards** (`POST /api/admin/trigger-rewards`): sends the rewards and shows each payout with a devnet explorer link. Status per winner is `success`, `already_distributed`, `unconfirmed` or `failed`.

Re-running is safe. Details and failure handling are in [payouts.md](./payouts.md).

## Review queue

Proofs the AI could not decide (`needs_review`, including AI errors and suspected prompt injection) leave the goal in `pending_validation` with a submitted proof. They appear in the review queue on `/admin`.

- `GET /api/admin/review`: lists staked `pending_validation` goals that have a proof, with the proof text, image link, AI verdict, confidence, quality score and reasoning. Images are not analyzed by the AI, so check them yourself.
- `POST /api/admin/review {goalId, decision}`:
  - `approve`: goal becomes `completed` and the stake is returned (Phase 1). If the transfer fails definitively the goal returns to the queue (HTTP 502); if it is ambiguous the response is 202 and you must reconcile.
  - `reject`: goal becomes `failed` and its stake joins the Phase 2 pool.
  - 409 if the goal was already processed.

## Dispute queue (`FEATURE_DISPUTES=true`)

`GET/POST /api/admin/disputes` and the `DisputeQueue` component resolve appeals with `overturn` or `uphold`. See `docs/features/disputes.md`.

## Reconciling unconfirmed payouts

There is no button for this; call the API:

```bash
curl -X POST "$BASE_URL/api/admin/payouts/reconcile" \
  -H "x-admin-key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
```

The response counts `finalized`, `released`, `waiting`, `manual` and `errors` and lists each outcome. Run it whenever a reward run, approval or review reports `unconfirmed`, and again later for `waiting` rows. `manual` rows need a human to inspect escrow history. Rules are in [payouts.md](./payouts.md).

### Other claimed-but-unconfirmed rows

- Governance voter rewards (`governance_rewards.status = 'unconfirmed'`): `POST /api/admin/governance/reconcile` (admin key, governance flags) with the same rules: landed becomes `paid`, failed on-chain or never landed after blockhash expiry releases the claim, a row with no signature is `manual`.
- Sponsor matches (`FEATURE_ORGS`) are `sponsor_match` rows in `payouts`, so the payouts reconcile above covers them. Releasing the payout row does not return the org pool reservation: for a `released` sponsor match, check the org's `org_matches`/pool balance by hand.
- Org withdrawals (`org_withdrawals` with `tx_signature = 'pending'` after an ambiguous send) are NOT auto-reconciled: no signature is recorded, and the pending row blocks another withdrawal for that org. Inspect escrow history for a transfer to the admin wallet of that amount, then set `tx_signature` to the real signature (it landed), or call `org_release_withdrawal(id)` (it did not).

## Editing goals

`PUT /api/goals/[id]` (admin key) sets a goal's status directly (`active`, `pending_validation`, `completed`, `failed`). It bypasses the payout flow: it moves no money and does not return stakes. Prefer the review queue.

## Team settlement (`FEATURE_TEAMS=true`)

After a team goal's deadline and once every staked member goal is completed or failed, `POST /api/admin/team-settlement {teamGoalId, dryRun?}` pays failed members' stakes to teammates who completed. Use `dryRun: true` first. Re-running is safe; unconfirmed rewards need reconcile, not a retry. Run this before the global reward run for that deadline day. See `docs/features/teams.md`.

## Org sponsor matches (`FEATURE_ORGS=true`)

`POST /api/admin/org-matches` runs the sponsor-match sweep on demand; the same sweep runs from the cron below. See `docs/features/orgs.md`.

## Cron jobs

Registered in `vercel.json`. Vercel sends `Authorization: Bearer $CRON_SECRET`; each route returns 401 if `CRON_SECRET` is unset or does not match (constant-time compare). They can also be triggered by hand with the same header.

| Path | Schedule (UTC) | What it does |
| --- | --- | --- |
| `/api/cron/expire-goals` | daily 06:00 | Marks `active` goals `failed` once deadline plus the 7-day grace period has passed. This feeds the Phase 2 pool. |
| `/api/cron/finalize-appeals` | hourly | Moves `rejected_appealable` goals whose 48-hour appeal window closed to `failed`. Runs regardless of the disputes flag. |
| `/api/cron/deadline-reminders` | every 6 hours | Sends push reminders for goals due soon (flag `FEATURE_PUSH`; 404 when off). |
| `/api/cron/org-matches` | daily 06:30 | Sponsor-match sweep (flag `FEATURE_ORGS`; 404 when off). |
| `/api/cron/resolve-disputes` | hourly at :15 | Governance pass: draws panels, resolves due votes, pays voter rewards (flags `FEATURE_GOVERNANCE` and `FEATURE_DISPUTES`; skips when off). |

Manual run example:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/expire-goals"
```

## Operational checklist

- `GET /api/health` shows whether Supabase, Solana, Snowflake and R2 are reachable.
- Keep the escrow wallet funded; `npx tsx scripts/check-escrow.ts` shows its balance.
- Clear the review queue regularly; goals in `pending_validation` do not expire.
- Run reconcile after any `unconfirmed` result before retrying anything.
