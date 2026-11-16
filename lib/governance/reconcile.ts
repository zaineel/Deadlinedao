import { decideReconcile, toUnconfirmedMarker, type SignatureStatus } from '@/lib/solana/payout-classify';

export interface UnconfirmedRewardRow {
  id: string;
  tx_signature: string | null;
  created_at: string;
}

export type RewardReconcileResult = 'finalized' | 'released' | 'waiting' | 'manual' | 'error';

export interface RewardReconcileDeps {
  getStatus: (signature: string) => Promise<SignatureStatus>;
  finalize: (rewardId: string, signature: string) => Promise<{ error: Error | null }>;
  release: (rewardId: string) => Promise<void>;
  now?: () => number;
}

/**
 * Resolve one 'unconfirmed' governance reward with the same rules as payouts:
 * landed -> paid; failed on-chain or never landed after blockhash expiry ->
 * release the claim; otherwise wait. No recorded signature cannot be checked
 * on-chain, so it is 'manual' and never released automatically.
 */
export async function reconcileRewardRow(
  row: UnconfirmedRewardRow,
  deps: RewardReconcileDeps
): Promise<RewardReconcileResult> {
  if (!row.tx_signature) return 'manual';
  try {
    const status = await deps.getStatus(row.tx_signature);
    const ageMs = (deps.now?.() ?? Date.now()) - new Date(row.created_at).getTime();
    const decision = decideReconcile({ txSignature: toUnconfirmedMarker(row.tx_signature), ageMs, status });
    if (decision.action === 'finalize') {
      const { error } = await deps.finalize(row.id, decision.signature);
      return error ? 'error' : 'finalized';
    }
    if (decision.action === 'release') {
      await deps.release(row.id);
      return 'released';
    }
    return decision.action === 'manual' ? 'manual' : 'waiting';
  } catch (err) {
    console.error(`[Admin] Reward reconcile failed for ${row.id}:`, err);
    return 'error';
  }
}
