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
