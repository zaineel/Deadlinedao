import { PublicKey } from '@solana/web3.js';
import { connection, solToLamports, lamportsToSol } from './client';

/**
 * Transaction verification and utilities for DeadlineDAO
 */

export interface TransactionDetails {
  signature: string;
  from: string;
  to: string;
  amount: number; // in SOL
  blockTime: number;
  slot: number;
  status: 'success' | 'failed';
  fee: number; // in SOL
}

export interface TransactionVerification {
  valid: boolean;
  details?: TransactionDetails;
  error?: string;
}

/**
 * Get detailed transaction information
 */
export async function getTransactionDetails(
  signature: string
): Promise<TransactionDetails | null> {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return null;
    }

    const instructions = tx.transaction.message.instructions;
    let from = '';
    let to = '';
    let amount = 0;

    // Find the transfer instruction
    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.program === 'system') {
        const parsed = instruction.parsed;
        if (parsed.type === 'transfer') {
          from = parsed.info.source;
          to = parsed.info.destination;
          amount = lamportsToSol(parsed.info.lamports);
          break;
        }
      }
    }

    const fee = tx.meta?.fee ? lamportsToSol(tx.meta.fee) : 0;

    return {
      signature,
      from,
      to,
      amount,
      blockTime: tx.blockTime || 0,
      slot: tx.slot,
      status: tx.meta?.err ? 'failed' : 'success',
      fee,
    };
  } catch (error) {
    console.error('Error getting transaction details:', error);
    return null;
  }
}

/**
 * Verify a transaction with specific criteria
 */
export async function verifyTransaction(
  signature: string,
  expectedFrom?: string,
  expectedTo?: string,
  minAmount?: number
): Promise<TransactionVerification> {
  try {
    const details = await getTransactionDetails(signature);

    if (!details) {
      return {
        valid: false,
        error: 'Transaction not found',
      };
    }

    if (details.status === 'failed') {
      return {
        valid: false,
        details,
        error: 'Transaction failed',
      };
    }

    // Verify sender
    if (expectedFrom && details.from !== expectedFrom) {
      return {
        valid: false,
        details,
        error: `Transaction sender mismatch. Expected ${expectedFrom}, got ${details.from}`,
      };
    }

    // Verify recipient
    if (expectedTo && details.to !== expectedTo) {
      return {
        valid: false,
        details,
        error: `Transaction recipient mismatch. Expected ${expectedTo}, got ${details.to}`,
      };
    }

    // Verify amount
    if (minAmount !== undefined && details.amount < minAmount) {
      return {
        valid: false,
        details,
        error: `Transaction amount too low. Expected at least ${minAmount} SOL, got ${details.amount} SOL`,
      };
    }

    return {
      valid: true,
      details,
    };
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if transaction is confirmed
 */
export async function isTransactionConfirmed(signature: string): Promise<boolean> {
  try {
    const status = await connection.getSignatureStatus(signature);
    return status.value?.confirmationStatus === 'confirmed' ||
           status.value?.confirmationStatus === 'finalized';
  } catch (error) {
    console.error('Error checking transaction confirmation:', error);
    return false;
  }
}

/**
 * Get transaction age in minutes
 */
export async function getTransactionAge(signature: string): Promise<number | null> {
  try {
    const details = await getTransactionDetails(signature);
    if (!details || !details.blockTime) {
      return null;
    }

    const txTime = details.blockTime * 1000; // Convert to milliseconds
    const now = Date.now();
    return (now - txTime) / 1000 / 60; // Return age in minutes
  } catch (error) {
    console.error('Error getting transaction age:', error);
    return null;
  }
}

/**
 * Get recent transactions for an address
 */
export async function getRecentTransactions(
  address: string,
  limit: number = 10
): Promise<TransactionDetails[]> {
  try {
    const publicKey = new PublicKey(address);
    const signatures = await connection.getSignaturesForAddress(publicKey, { limit });

    const transactions: TransactionDetails[] = [];

    for (const sig of signatures) {
      const details = await getTransactionDetails(sig.signature);
      if (details) {
        transactions.push(details);
      }
    }

    return transactions;
  } catch (error) {
    console.error('Error getting recent transactions:', error);
    return [];
  }
}

/**
 * Estimate transaction fee
 */
export async function estimateTransactionFee(): Promise<number> {
  try {
    // Get recent prioritization fees
    const recentFees = await connection.getRecentPrioritizationFees();

    if (recentFees.length === 0) {
      // Default estimate: 0.000005 SOL (5000 lamports)
      return 0.000005;
    }

    // Calculate average fee
    const avgFee = recentFees.reduce((sum, fee) => sum + fee.prioritizationFee, 0) / recentFees.length;

    // Add base fee (5000 lamports) + prioritization fee
    const totalLamports = 5000 + avgFee;

    return lamportsToSol(totalLamports);
  } catch (error) {
    console.error('Error estimating transaction fee:', error);
    // Return default estimate
    return 0.000005;
  }
}

/**
 * Format transaction signature for display
 */
export function formatSignature(signature: string, length: number = 8): string {
  return `${signature.slice(0, length)}...${signature.slice(-length)}`;
}

/**
 * Get Solana explorer URL for transaction
 */
export function getExplorerUrl(signature: string, cluster: 'devnet' | 'mainnet' = 'devnet'): string {
  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

/**
 * Batch verify multiple transactions
 */
export async function batchVerifyTransactions(
  signatures: string[]
): Promise<Map<string, TransactionVerification>> {
  const results = new Map<string, TransactionVerification>();

  for (const signature of signatures) {
    const verification = await verifyTransaction(signature);
    results.set(signature, verification);
  }

  return results;
}

/**
 * Check transaction finality
 */
export async function waitForFinalization(
  signature: string,
  timeoutMs: number = 60000
): Promise<{ finalized: boolean; error?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await connection.getSignatureStatus(signature);

      if (status.value?.err) {
        return { finalized: false, error: 'Transaction failed' };
      }

      if (status.value?.confirmationStatus === 'finalized') {
        return { finalized: true };
      }

      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error waiting for finalization:', error);
    }
  }

  return { finalized: false, error: 'Timeout waiting for finalization' };
}

/**
 * Get transaction summary for logging
 */
export function summarizeTransaction(details: TransactionDetails): string {
  return `Transaction ${formatSignature(details.signature)}: ${details.amount} SOL from ${formatSignature(details.from)} to ${formatSignature(details.to)} (${details.status})`;
}
