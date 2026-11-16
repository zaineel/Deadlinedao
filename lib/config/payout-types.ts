/**
 * Every kind of payout row. Keep in sync with the CHECK constraint in
 * supabase-migrations/002_payout_types.sql.
 *
 * Payouts are unique per (goal_id, payout_type), so each type must be
 * something a single goal receives at most once.
 */
export const PAYOUT_TYPES = [
  'original_stake', // Phase 1: stake returned on approval
  'completion_reward', // Phase 2: share of the failed pool
  'bond_refund', // dispute bond returned when an appeal wins
  'team_reward', // share of teammates' forfeited stakes
  'sponsor_match', // employer-funded match on completion
] as const;

export type PayoutType = (typeof PAYOUT_TYPES)[number];
