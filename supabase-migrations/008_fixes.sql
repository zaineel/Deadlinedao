-- 008_fixes.sql: defects found by the cross-migration verification (docs/migrations-verification.md).
-- Idempotent and additive; safe to re-run, in any position after supabase-schema.sql.

-- 1. supabase-schema.sql created "Enable all access for service role" policies as
--    `FOR ALL USING (true)` with no TO clause, i.e. for PUBLIC. That grants the anon
--    (and authenticated) role full read/write on goals, proofs and payouts to anyone
--    holding the public anon key. The service role bypasses RLS and needs no policy,
--    and the app only uses the service-role key, so removing the policies is safe.
--    RLS stays enabled, so with no policies anon/authenticated get no rows.
DROP POLICY IF EXISTS "Enable all access for service role" ON goals;
DROP POLICY IF EXISTS "Enable all access for service role" ON proofs;
DROP POLICY IF EXISTS "Enable all access for service role" ON payouts;
