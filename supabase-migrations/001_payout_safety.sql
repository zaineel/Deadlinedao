-- Payout safety: run once in the Supabase SQL editor.

-- 1. A goal can receive at most one payout of each type
--    (one 'original_stake' return, one 'completion_reward').
--    The API claims a payout row BEFORE sending SOL; this index makes the claim atomic.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payouts_goal_type
  ON payouts (goal_id, payout_type)
  WHERE goal_id IS NOT NULL;

-- 2. A stake transaction signature can back only one goal (replay protection).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_goals_stake_tx_signature
  ON goals (stake_tx_signature)
  WHERE stake_tx_signature <> 'pending' AND stake_tx_signature NOT LIKE 'demo_tx_%';

-- 3. Sanity check on stakes.
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_stake_positive;
ALTER TABLE goals ADD CONSTRAINT goals_stake_positive CHECK (stake_amount > 0) NOT VALID;
