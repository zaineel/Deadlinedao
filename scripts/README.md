# scripts/

Ad-hoc developer tools. Run TypeScript ones from the repo root with `npx tsx scripts/<name>.ts`. They load `.env.local` and talk to the live services that file points at (Supabase, Solana devnet, Snowflake, R2), so double-check which project you are connected to first. None of them are used by the app, CI or `package.json`.

| File | What it does | Changes data or sends SOL? |
| --- | --- | --- |
| `generate-solana-keypair.ts` | Generates a new Solana keypair for the escrow wallet and prints the address and the secret key as a JSON byte array for `SOLANA_ESCROW_PRIVATE_KEY`. | No |
| `generate-snowflake-keys.sh` | Creates an RSA key pair in `.snowflake-keys/` and prints the `ALTER USER ... SET RSA_PUBLIC_KEY` statement. See `docs/snowflake.md`. | Writes local key files |
| `test-cortex-sdk.ts` | Smoke-tests Snowflake Cortex through `snowflake-sdk` (needs `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USERNAME`, `SNOWFLAKE_WAREHOUSE` and a key). | No |
| `setup-supabase.ts` | Checks that the `goals`, `proofs` and `payouts` tables exist (it does not create them; run `supabase-schema.sql`). | No |
| `test-supabase.ts` | Exercises the Supabase helpers: creates a test goal, reads it, then deletes it. | Creates and deletes one goal |
| `setup-r2.md` | Step-by-step Cloudflare R2 bucket and token setup. | n/a |
| `test-r2.ts` | Uploads, downloads and deletes a test object in the configured R2 bucket. | Temporary R2 object |
| `check-escrow.ts` | Prints the escrow address and balance. | No |
| `check-deadlines.ts` | Lists goals grouped by deadline. | No |
| `check-failed-goals.ts` | Lists failed goals (the Phase 2 reward pool). | No |
| `check-payout-status.ts` | Lists completed goals and whether each has a payout row. | No |
| `check-payouts.ts` | Lists payout rows and totals. | No |
| `update-deadlines.ts` | Moves the deadline of every `active` goal to 7 days from now, so proofs can be submitted again. Demo helper; affects all active goals. | Updates goals |

To run a Phase 2 reward distribution use the admin page or `POST /api/admin/trigger-rewards`, not a script (see `docs/payouts.md`).

## Removed

Obsolete scripts were deleted in the repo cleanup: the Snowflake JWT and REST API debugging scripts (the app uses `snowflake-sdk`), `trigger-payouts.ts` (it called a removed helper that bypassed claim-before-send), `approve-pending-goals.ts` (bulk-reactivated goals without checking stakes) and the hackathon test-data scripts `add-test-competitors.ts` and `remove-test-data.ts`. They remain in git history.
