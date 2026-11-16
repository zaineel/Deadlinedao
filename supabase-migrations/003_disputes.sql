-- Validation disputes (appeals). Idempotent and additive: safe to re-run.
-- Run once in the Supabase SQL editor before enabling FEATURE_DISPUTES.
-- Requires 002_payout_types.sql (bond_refund payout type).

-- 1. New goal statuses + appeal deadline
ALTER TABLE goals ADD COLUMN IF NOT EXISTS appeal_deadline TIMESTAMPTZ;

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE goals ADD CONSTRAINT goals_status_check
  CHECK (status IN (
    'active', 'pending_validation', 'completed', 'failed',
    'rejected_appealable', 'disputed'
  ));

CREATE INDEX IF NOT EXISTS idx_goals_appeal_deadline
  ON goals (appeal_deadline) WHERE status = 'rejected_appealable';

-- 2. Disputes: one per goal, one bond transaction per dispute
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  proof_id UUID REFERENCES proofs(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  extra_image_url TEXT,
  bond_amount DECIMAL(10, 6) NOT NULL CHECK (bond_amount > 0),
  bond_tx_signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'overturned', 'upheld')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS disputes_goal_id_key ON disputes (goal_id);
CREATE UNIQUE INDEX IF NOT EXISTS disputes_bond_tx_signature_key ON disputes (bond_tx_signature);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);

-- 3. The app uses the service role; anon gets no access (RLS on, no policies)
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- 4. Cross-feature signature reuse guard (same pattern and advisory-lock key as
-- 005_orgs.sql): one on-chain transfer is credited once across goal stakes,
-- org fundings and dispute bonds. Self-contained and order-independent: each
-- check looks at other tables only when they exist, and 005 also checks
-- disputes, so this is safe to apply before or after 005 and to re-run.
CREATE OR REPLACE FUNCTION disputes_sig_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bond_tx_signature LIKE 'demo_tx_%' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('txsig:' || NEW.bond_tx_signature));
  IF EXISTS (SELECT 1 FROM goals WHERE stake_tx_signature = NEW.bond_tx_signature) THEN
    RAISE EXCEPTION 'signature already used as a goal stake' USING ERRCODE = '23505';
  END IF;
  IF to_regclass('public.org_fundings') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM org_fundings WHERE tx_signature = NEW.bond_tx_signature) THEN
      RAISE EXCEPTION 'signature already used as an org funding' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_disputes_sig_guard ON disputes;
CREATE TRIGGER trg_disputes_sig_guard BEFORE INSERT OR UPDATE OF bond_tx_signature ON disputes
  FOR EACH ROW EXECUTE FUNCTION disputes_sig_guard();

-- Goal side: a stake may not reuse a bond signature. Separate trigger so it
-- coexists with 005's goals_sig_guard whichever order they are applied in.
CREATE OR REPLACE FUNCTION goals_disputes_sig_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stake_tx_signature IS NULL OR NEW.stake_tx_signature = 'pending'
     OR NEW.stake_tx_signature LIKE 'demo_tx_%' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('txsig:' || NEW.stake_tx_signature));
  IF EXISTS (SELECT 1 FROM disputes WHERE bond_tx_signature = NEW.stake_tx_signature) THEN
    RAISE EXCEPTION 'signature already used as a dispute bond' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_goals_disputes_sig_guard ON goals;
CREATE TRIGGER trg_goals_disputes_sig_guard BEFORE INSERT OR UPDATE OF stake_tx_signature ON goals
  FOR EACH ROW EXECUTE FUNCTION goals_disputes_sig_guard();

-- Org funding side: only when 005 has already been applied (otherwise 005 adds it).
DO $do$
BEGIN
  IF to_regclass('public.org_fundings') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION org_fundings_disputes_sig_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $b$
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtext('txsig:' || NEW.tx_signature));
        IF EXISTS (SELECT 1 FROM disputes WHERE bond_tx_signature = NEW.tx_signature) THEN
          RAISE EXCEPTION 'signature already used as a dispute bond' USING ERRCODE = '23505';
        END IF;
        RETURN NEW;
      END $b$
    $f$;
    DROP TRIGGER IF EXISTS trg_org_fundings_disputes_sig_guard ON org_fundings;
    CREATE TRIGGER trg_org_fundings_disputes_sig_guard BEFORE INSERT ON org_fundings
      FOR EACH ROW EXECUTE FUNCTION org_fundings_disputes_sig_guard();
  END IF;
END $do$;
