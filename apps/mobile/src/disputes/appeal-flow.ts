import type { DisputesApi } from '../api/disputes';
import { REASON_MAX, REASON_MIN } from '../api/disputes';
import { buildTransferTransaction, LAMPORTS_PER_SOL } from '../solana/transfer';
import type { WalletProvider } from '../wallet/types';

/** A SOL amount that is already a whole number of lamports (the server quote) -> integer lamports. */
export function bondLamports(bondSol: number): number {
  return Math.round(bondSol * LAMPORTS_PER_SOL);
}

/** Same integer math as lib/disputes/logic computeBond: 5% of the stake, rounded up to a lamport. */
export function expectedBondLamports(stakeSol: number): number {
  if (!Number.isFinite(stakeSol) || stakeSol <= 0) throw new RangeError('Invalid stake');
  return Math.ceil((Math.round(stakeSol * LAMPORTS_PER_SOL) * 500) / 10_000);
}

export function validateReason(reason: string): string | null {
  const n = reason.trim().length;
  if (n < REASON_MIN) return `Please explain why the decision was wrong (at least ${REASON_MIN} characters).`;
  if (n > REASON_MAX) return `Keep it under ${REASON_MAX} characters.`;
  return null;
}

/**
 * Pay the bond to escrow (wallet signs, app broadcasts + confirms), then file
 * the appeal with that transaction signature. Mirrors components/disputes/AppealModal.tsx.
 * The transfer is built locally from the server's quote; the server re-verifies it on-chain.
 */
export async function fileAppeal(
  deps: {
    wallet: WalletProvider;
    disputes: Pick<DisputesApi, 'openDispute'>;
    getBlockhash: () => Promise<string>;
  },
  p: { goalId: string; reason: string; bondAmount: number; stakeAmount: number; escrowAddress: string; walletAddress: string }
) {
  const invalid = validateReason(p.reason);
  if (invalid) throw new Error(invalid);
  if (!p.escrowAddress) throw new Error('Escrow address unavailable');
  // Never sign a quote that is not exactly 5% of the stake the user sees.
  const lamports = bondLamports(p.bondAmount);
  if (lamports !== expectedBondLamports(p.stakeAmount)) throw new Error('Bond quote does not match your stake. Refresh and try again.');
  const tx = buildTransferTransaction({
    from: p.walletAddress,
    to: p.escrowAddress,
    lamports,
    recentBlockhash: await deps.getBlockhash(),
  });
  const bondSignature = await deps.wallet.signAndSendTransaction(tx);
  return deps.disputes.openDispute({ goalId: p.goalId, reason: p.reason, bondSignature });
}
