-- Widen payouts.payout_type for roadmap features. Run once in the Supabase SQL editor.
-- Must be applied before enabling disputes, teams or orgs.
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_payout_type_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_payout_type_check
  CHECK (payout_type IN (
    'original_stake', 'completion_reward', 'bond_refund', 'team_reward', 'sponsor_match'
  ));
