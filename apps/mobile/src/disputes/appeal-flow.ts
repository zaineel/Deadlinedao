import type { DisputesApi } from '../api/disputes';
import { REASON_MAX, REASON_MIN } from '../api/disputes';
import { buildTransferTransaction, LAMPORTS_PER_SOL } from '../solana/transfer';
import type { WalletProvider } from '../wallet/types';

/** Bond in lamports exactly as the web AppealModal computes it (the server accepts >= its own rounding). */
export function bondLamports(bondSol: number): number {
  return Math.ceil(bondSol * LAMPORTS_PER_SOL);
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
  p: { goalId: string; reason: string; bondAmount: number; escrowAddress: string; walletAddress: string }
) {
  const invalid = validateReason(p.reason);
  if (invalid) throw new Error(invalid);
  if (!p.escrowAddress) throw new Error('Escrow address unavailable');
  const tx = buildTransferTransaction({
    from: p.walletAddress,
    to: p.escrowAddress,
    lamports: bondLamports(p.bondAmount),
    recentBlockhash: await deps.getBlockhash(),
  });
  const bondSignature = await deps.wallet.signAndSendTransaction(tx);
  return deps.disputes.openDispute({ goalId: p.goalId, reason: p.reason, bondSignature });
}
