/**
 * A goal may be "confirmed" (activated with a stake transaction) ONLY while it
 * is still waiting for that transaction: status pending_validation AND
 * stake_tx_signature still the 'pending' placeholder. Goals already staked and
 * sitting in the admin review queue have a real signature and must not be
 * re-activated with a fresh stake.
 */
export const PENDING_STAKE_SIGNATURE = 'pending';

export function canConfirmStake(goal: {
  status: string;
  stake_tx_signature?: string | null;
}): boolean {
  return (
    goal.status === 'pending_validation' &&
    goal.stake_tx_signature === PENDING_STAKE_SIGNATURE
  );
}
