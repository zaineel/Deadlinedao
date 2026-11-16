import { connection } from '@/lib/solana/client';
import { getEscrowAddress } from '@/lib/solana/escrow';
import { extractFundingLamports, type ParsedTxLike } from './funding';

export type FundingVerification =
  | { ok: true; lamports: number }
  | { ok: false; reason: 'not_found' | 'tx_failed' | 'no_transfer' | 'rpc_error' };

/**
 * Verify an on-chain transfer from the admin's wallet to the escrow, like
 * stake verification in lib/solana/escrow.ts, but credit the amount that
 * actually moved rather than a client-supplied figure.
 */
export async function verifyFundingTransfer(signature: string, adminWallet: string): Promise<FundingVerification> {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return { ok: false, reason: 'not_found' };
    const check = extractFundingLamports(tx as unknown as ParsedTxLike, adminWallet, getEscrowAddress());
    return check;
  } catch (error) {
    console.error('verifyFundingTransfer error:', error);
    return { ok: false, reason: 'rpc_error' };
  }
}
