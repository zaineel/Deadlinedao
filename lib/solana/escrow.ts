import {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
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

/**
 * Send payout from escrow to user
 */
export async function sendPayoutFromEscrow(
  recipientAddress: string,
  amount: number
): Promise<{ signature: string | null; error: Error | null }> {
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
      };
    }

    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: recipientPublicKey,
        lamports,
      })
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = escrowKeypair.publicKey;

    // Sign and send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [escrowKeypair],
      { commitment: 'confirmed' }
    );

    return { signature, error: null };
  } catch (error) {
    console.error('Error sending payout from escrow:', error);
    return { signature: null, error: error as Error };
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

    if (signature) {
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
): Promise<{ signature: string | null; error: Error | null }> {
  try {
    const balance = await getEscrowBalance();

    if (balance === 0) {
      return { signature: null, error: new Error('Escrow is already empty') };
    }

    // Leave a small amount for rent (0.001 SOL)
    const withdrawAmount = balance - 0.001;

    if (withdrawAmount <= 0) {
      return { signature: null, error: new Error('Insufficient balance to withdraw') };
    }

    return await sendPayoutFromEscrow(destinationAddress, withdrawAmount);
  } catch (error) {
    console.error('Error during emergency withdraw:', error);
    return { signature: null, error: error as Error };
  }
}

/**
 * Get escrow address as string (for display/frontend)
 */
export function getEscrowAddress(): string {
  return getEscrowPublicKey().toBase58();
}
