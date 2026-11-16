import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { connection, getEscrowPublicKey, solToLamports } from '@/lib/solana/client';

/** Unsigned member stake transfer (member wallet -> escrow), same shape as /api/goals/create. */
export async function buildStakeTransaction(
  wallet: string,
  amountSol: number
): Promise<{ transaction: string; escrowAddress: string }> {
  const from = new PublicKey(wallet);
  const escrow = getEscrowPublicKey();
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: escrow, lamports: solToLamports(amountSol) })
  );
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;
  const transaction = tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
  return { transaction, escrowAddress: escrow.toString() };
}
