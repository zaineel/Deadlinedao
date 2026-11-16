# Migration verification

Harness: `scripts/migration-verify/verify.mjs` (PGlite, an in-process real Postgres build). It needs `@electric-sql/pglite` installed separately; nothing was added to `package.json`. Run: `PGLITE_DIR=<dir with pglite installed> node scripts/migration-verify/verify.mjs`.

## Stand-ins
Only one: the roles `anon`, `authenticated`, `service_role` are created `NOLOGIN` (they exist on hosted Supabase; the `REVOKE`/`GRANT` lines in 005 need them). `gen_random_uuid()` is built in to modern Postgres, so no extension stand-in was needed. `supabase-schema.sql` is applied unmodified.

## Orders tried (each on a fresh database after the base schema)
1. 001,002,003,004,005,006,008 (numeric)
2. the same set applied twice (idempotency)
3. 001,002,005,003,004,006,008
4. 001,002,006,004,003,005,008
5. 001,002,005,003,004,006 then the full numeric set again (mixed re-apply)

All five ran without error, and the resulting schema (columns, constraints, indexes, triggers, functions, policies, RLS flags) is byte-identical across all five.

## Behaviour checks (run on every order, 205 passing assertions total)
All five payout types accepted, unknown rejected; payouts unique per (goal_id, payout_type); duplicate goal stake signature rejected while `pending` and `demo_tx_%` are exempt; `stake_amount > 0` for new rows; goals.status accepts `rejected_appealable` and `disputed`, rejects unknown; `share_public` defaults false; one dispute per goal; duplicate bond signature rejected; goal stake <-> dispute bond, goal stake <-> org funding, dispute bond <-> org funding signature reuse all fail with 23505 in both directions; `demo_tx_%` bond exempt; teams unique (team_goal_id, wallet); `org_fund_pool` credit and replay (23505), `org_reserve_match` (success, second call NULL), `org_release_match`, `org_claim_withdrawal` (window_open, not_admin, success after the window), `org_release_withdrawal`; push_tokens token unique and platform check; deadline_reminders_sent unique; RLS enabled on every public table; the five `org_*` RPCs executable by `service_role` only.

## Defect found and fixed
`supabase-schema.sql` creates `CREATE POLICY ... FOR ALL USING (true)` on goals, proofs and payouts with no `TO` clause, so the policy applies to PUBLIC: anyone with the public anon key could read and write those tables through PostgREST. The app only uses the service-role key (which bypasses RLS). Fixed by new `supabase-migrations/008_fixes.sql`, which drops the three policies (idempotent). `supabase-schema.sql` itself is unchanged (shared file); fresh installs must run 008. Apply 008 in production promptly.

## TypeScript vs SQL
- `GoalStatus` (types/index.ts) matches the goals.status CHECK exactly (6 values).
- `PAYOUT_TYPES` matches the 002 CHECK exactly (5 values).
- category and proofs.ai_verdict unions match their CHECKs.
- Mismatch (minor, not changed because shared files are off limits): `Database.public.Tables.goals.Row` in lib/supabase/client.ts omits `team_goal_id` (004) and `share_public` (006); `Database` has no entries for the tables added by 003-006. `appeal_deadline` is present. Decimal columns are typed `number`; supabase-js returns numeric as number for these, but `bigint` lamport columns in 005 may come back as numbers beyond 2^53 only for huge values (not a practical concern).

## Reviewed by reading (PGlite cannot prove)
- Hosted Supabase: roles/extension availability is assumed (`anon`, `authenticated`, `service_role` exist; no extensions are used). Supabase's default privileges grant table and function access to anon/authenticated, relying on RLS (tables) and the explicit REVOKE (functions); the harness checks function ACLs with stand-in roles but does not replicate Supabase's default-privilege setup.
- PostgREST exposure, the SQL editor's transaction handling, and Supabase's role-based `pg_policies` output are not emulated.
- Concurrency: the advisory-lock triggers are only exercised serially; real race behaviour across connections is not proven.
- `goals_stake_positive` is `NOT VALID` (001): new rows are checked, legacy rows are not.
- No Postgres-version differences were tested (PGlite is a recent Postgres 17 build; Supabase versions may differ).
