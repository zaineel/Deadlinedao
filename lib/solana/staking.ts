import { PublicKey } from '@solana/web3.js';
import { verifyStakeTransaction } from './escrow';
import { connection, solToLamports, isValidPublicKey } from './client';

/**
 * Staking logic for DeadlineDAO
 * Users stake SOL when creating goals
 */

export interface StakeResult {
  success: boolean;
  transactionSignature?: string;
  error?: string;
}

/**
 * Process a stake (called when user creates a goal)
 * Verifies that the user sent SOL to escrow before creating the goal
 */
export async function processStake(
  userWalletAddress: string,
  stakeAmount: number,
  transactionSignature: string
): Promise<StakeResult> {
  try {
    // Validate inputs
    if (!isValidPublicKey(userWalletAddress)) {
      return {
        success: false,
        error: 'Invalid wallet address',
      };
    }

    if (stakeAmount <= 0) {
      return {
        success: false,
        error: 'Stake amount must be greater than 0',
      };
    }

    if (stakeAmount < 0.01) {
      return {
        success: false,
        error: 'Minimum stake is 0.01 SOL',
      };
    }

    // Verify the transaction
    const { valid, error } = await verifyStakeTransaction(
      transactionSignature,
      stakeAmount,
      userWalletAddress
    );

    if (!valid) {
      return {
        success: false,
        error: error?.message || 'Transaction verification failed',
      };
    }

    // Transaction is valid
    return {
      success: true,
      transactionSignature,
    };
  } catch (error) {
    console.error('Error processing stake:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Validate stake parameters before creating transaction
 * This is called on the frontend before the user signs the transaction
 */
export function validateStakeParams(
  walletAddress: string,
  stakeAmount: number
): { valid: boolean; error?: string } {
  if (!isValidPublicKey(walletAddress)) {
    return { valid: false, error: 'Invalid wallet address' };
  }

  if (stakeAmount <= 0) {
    return { valid: false, error: 'Stake amount must be greater than 0' };
  }

  if (stakeAmount < 0.01) {
    return { valid: false, error: 'Minimum stake is 0.01 SOL' };
  }

  if (stakeAmount > 100) {
    return { valid: false, error: 'Maximum stake is 100 SOL for safety' };
  }

  return { valid: true };
}

/**
 * Calculate recommended stake amount based on goal type
 */
export function calculateRecommendedStake(category: 'learning' | 'work' | 'health'): {
  min: number;
  recommended: number;
  max: number;
} {
  const stakes = {
    learning: { min: 0.05, recommended: 0.2, max: 2 },
    work: { min: 0.1, recommended: 0.5, max: 5 },
    health: { min: 0.05, recommended: 0.3, max: 3 },
  };

  return stakes[category];
}

/**
 * Verify that a stake transaction is recent (within last 10 minutes)
 * Prevents replay attacks with old transaction signatures
 */
export async function verifyStakeIsRecent(
  transactionSignature: string,
  maxAgeMinutes: number = 10
): Promise<{ isRecent: boolean; error?: string }> {
  try {
    const tx = await connection.getParsedTransaction(transactionSignature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { isRecent: false, error: 'Transaction not found' };
    }

    if (!tx.blockTime) {
      return { isRecent: false, error: 'Transaction has no timestamp' };
    }

    const txTime = tx.blockTime * 1000; // Convert to milliseconds
    const now = Date.now();
    const ageMinutes = (now - txTime) / 1000 / 60;

    if (ageMinutes > maxAgeMinutes) {
      return {
        isRecent: false,
        error: `Transaction is ${Math.floor(ageMinutes)} minutes old (max: ${maxAgeMinutes} minutes)`,
      };
    }

    return { isRecent: true };
  } catch (error) {
    console.error('Error checking transaction age:', error);
    return {
      isRecent: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if user has sufficient balance for stake + fees
 */
export async function checkUserBalance(
  walletAddress: string,
  stakeAmount: number
): Promise<{ sufficient: boolean; balance?: number; error?: string }> {
  try {
    if (!isValidPublicKey(walletAddress)) {
      return { sufficient: false, error: 'Invalid wallet address' };
    }

    const publicKey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(publicKey);
    const balanceSol = balance / 1e9;

    // Need stake amount + ~0.001 SOL for transaction fees
    const requiredAmount = stakeAmount + 0.001;

    return {
      sufficient: balanceSol >= requiredAmount,
      balance: balanceSol,
    };
  } catch (error) {
    console.error('Error checking user balance:', error);
    return {
      sufficient: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get stake status summary
 */
export interface StakeStatus {
  isValid: boolean;
  transactionSignature: string;
  amount: number;
  userWallet: string;
  blockTime?: number;
  confirmations?: number;
}

export async function getStakeStatus(
  transactionSignature: string
): Promise<StakeStatus | null> {
  try {
    const tx = await connection.getParsedTransaction(transactionSignature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return null;
    }

    const instructions = tx.transaction.message.instructions;
    let amount = 0;
    let userWallet = '';

    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.program === 'system') {
        const parsed = instruction.parsed;
        if (parsed.type === 'transfer') {
          amount = parsed.info.lamports / 1e9;
          userWallet = parsed.info.source;
          break;
        }
      }
    }

    return {
      isValid: !tx.meta?.err,
      transactionSignature,
      amount,
      userWallet,
      blockTime: tx.blockTime || undefined,
      confirmations: tx.slot,
    };
  } catch (error) {
    console.error('Error getting stake status:', error);
    return null;
  }
}
