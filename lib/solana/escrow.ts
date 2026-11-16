import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { encodeBase58, isAmbiguousFailure, type SendStage } from './payout-classify';
import {
  connection,
  getEscrowKeypair,
  getEscrowPublicKey,
  solToLamports,
  lamportsToSol,
  getBalance,
  confirmTransaction,
  getRecentBlockhash,
} from './client';

/**
 * Escrow wallet management for DeadlineDAO
 * The escrow holds all staked SOL until goals are completed or failed
 */

/**
 * Get escrow wallet balance
 */
export async function getEscrowBalance(): Promise<number> {
  const escrowPublicKey = getEscrowPublicKey();
  return await getBalance(escrowPublicKey);
}

/**
 * Accept stake from user (user sends SOL to escrow)
 * In production, the user would sign this transaction on the frontend
 * The backend just verifies the transaction signature
 */
export async function verifyStakeTransaction(
  signature: string,
  expectedAmount: number,
  userPublicKey: string
): Promise<{ valid: boolean; error: Error | null }> {
  try {
    const escrowPublicKey = getEscrowPublicKey();

    // Get transaction details
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error: new Error('Transaction not found') };
    }

    if (tx.meta?.err) {
      return { valid: false, error: new Error('Transaction failed') };
    }

    // Verify the transaction is a transfer to escrow
    const instructions = tx.transaction.message.instructions;
    let foundTransfer = false;

    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.program === 'system') {
        const parsed = instruction.parsed;
        if (parsed.type === 'transfer') {
          const info = parsed.info;

          // Verify: from user, to escrow, correct amount
          if (
            info.destination === escrowPublicKey.toBase58() &&
            info.source === userPublicKey &&
            info.lamports >= solToLamports(expectedAmount)
          ) {
            foundTransfer = true;
            break;
          }
        }
      }
    }

    if (!foundTransfer) {
      return {
        valid: false,
        error: new Error('No valid transfer to escrow found in transaction'),
      };
    }

    return { valid: true, error: null };
  } catch (error) {
    console.error('Error verifying stake transaction:', error);
    return { valid: false, error: error as Error };
  }
}

export type SendPayoutResult = {
  /** Set on success, and also on an AMBIGUOUS failure (the tx may still land). */
  signature: string | null;
  error: Error | null;
  /**
   * true  = the signed transaction may have reached the network; funds MAY have
   *         moved. Never release the payout claim; reconcile it instead.
   * false = definitive: nothing was submitted (or it landed and failed).
   */
  ambiguous: boolean;
};

/**
 * Send payout from escrow to user.
 * Distinguishes definitive failures (nothing submitted) from ambiguous ones
 * (submission or confirmation threw / timed out). The signature is computed
 * from the signed transaction BEFORE broadcasting so an ambiguous failure can
 * still be reconciled later.
 */
export async function sendPayoutFromEscrow(
  recipientAddress: string,
  amount: number
): Promise<SendPayoutResult> {
  let stage: SendStage = 'prepare';
  let signature: string | null = null;
  try {
    const escrowKeypair = getEscrowKeypair();
    const recipientPublicKey = new PublicKey(recipientAddress);
    const lamports = solToLamports(amount);

    // Check escrow has sufficient balance
    const escrowBalance = await getEscrowBalance();
    if (escrowBalance < amount) {
      return {
        signature: null,
        error: new Error(`Insufficient escrow balance. Has ${escrowBalance} SOL, needs ${amount} SOL`),
        ambiguous: false,
      };
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: recipientPublicKey,
        lamports,
      })
    );

    const { blockhash, lastValidBlockHeight } = await getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = escrowKeypair.publicKey;
    transaction.sign(escrowKeypair);

    const sigBytes = transaction.signature;
    if (!sigBytes) throw new Error('Transaction was not signed');
    signature = encodeBase58(sigBytes);

    // From here on the transaction may reach the network.
    stage = 'submitted';
    await connection.sendRawTransaction(transaction.serialize());
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    if (confirmation.value.err) {
      // Landed and failed on-chain: no funds moved (only the fee).
      return {
        signature: null,
        error: new Error('Transfer failed on-chain'),
        ambiguous: false,
      };
    }

    return { signature, error: null, ambiguous: false };
  } catch (error) {
    console.error('Error sending payout from escrow:', error);
    const ambiguous = isAmbiguousFailure(stage);
    return { signature: ambiguous ? signature : null, error: error as Error, ambiguous };
  }
}

/**
 * Send multiple payouts in batch (more efficient)
 */
export async function sendBatchPayouts(
  payouts: Array<{ recipient: string; amount: number }>
): Promise<{
  signatures: string[];
  errors: Array<{ recipient: string; error: string }>;
}> {
  const signatures: string[] = [];
  const errors: Array<{ recipient: string; error: string }> = [];

  // Check total amount needed
  const totalAmount = payouts.reduce((sum, p) => sum + p.amount, 0);
  const escrowBalance = await getEscrowBalance();

  if (escrowBalance < totalAmount) {
    return {
      signatures: [],
      errors: [{
        recipient: 'all',
        error: `Insufficient escrow balance. Has ${escrowBalance} SOL, needs ${totalAmount} SOL`,
      }],
    };
  }

  // Send payouts sequentially (parallel might cause nonce issues)
  for (const payout of payouts) {
    const { signature, error } = await sendPayoutFromEscrow(
      payout.recipient,
      payout.amount
    );

    if (signature && !error) {
      signatures.push(signature);
    } else if (error) {
      errors.push({
        recipient: payout.recipient,
        error: error.message,
      });
    }
  }

  return { signatures, errors };
}

/**
 * Calculate escrow health (ratio of balance to total staked goals)
 */
export async function calculateEscrowHealth(totalStakedInGoals: number): Promise<{
  balance: number;
  totalStaked: number;
  healthRatio: number;
  isHealthy: boolean;
}> {
  const balance = await getEscrowBalance();
  const healthRatio = totalStakedInGoals > 0 ? balance / totalStakedInGoals : 1;

  return {
    balance,
    totalStaked: totalStakedInGoals,
    healthRatio,
    isHealthy: healthRatio >= 0.95, // Should have at least 95% of staked amount
  };
}

/**
 * Emergency: Withdraw all funds from escrow (admin only)
 * Use this only for contract upgrades or emergencies
 */
export async function emergencyWithdraw(
  destinationAddress: string
): Promise<SendPayoutResult> {
  try {
    const balance = await getEscrowBalance();

    if (balance === 0) {
      return { signature: null, error: new Error('Escrow is already empty'), ambiguous: false };
    }

    // Leave a small amount for rent (0.001 SOL)
    const withdrawAmount = balance - 0.001;

    if (withdrawAmount <= 0) {
      return { signature: null, error: new Error('Insufficient balance to withdraw'), ambiguous: false };
    }

    return await sendPayoutFromEscrow(destinationAddress, withdrawAmount);
  } catch (error) {
    console.error('Error during emergency withdraw:', error);
    return { signature: null, error: error as Error, ambiguous: false };
  }
}

/**
 * Get escrow address as string (for display/frontend)
 */
export function getEscrowAddress(): string {
  return getEscrowPublicKey().toBase58();
}
