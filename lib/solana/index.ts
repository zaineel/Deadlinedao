// Solana Client and Utilities
export {
  connection,
  getEscrowKeypair,
  solToLamports,
  lamportsToSol,
  getBalance,
  getEscrowPublicKey,
  isValidPublicKey,
  getCurrentSlot,
  confirmTransaction,
  getRecentBlockhash,
  formatPublicKey,
  hasSufficientBalance,
  airdropSol,
} from './client';

export type { Connection, PublicKey, Keypair } from './client';

// Escrow Management
export {
  getEscrowBalance,
  verifyStakeTransaction,
  sendPayoutFromEscrow,
  calculateEscrowHealth,
  getEscrowAddress,
} from './escrow';

// Staking Functions
export {
  processStake,
  validateStakeParams,
  calculateRecommendedStake,
  verifyStakeIsRecent,
  checkUserBalance,
  getStakeStatus,
} from './staking';

export type { StakeResult, StakeStatus } from './staking';

// Payout and Redistribution
export {
  computeRewardPayouts,
  calculatePotentialEarnings,
  formatPayoutBreakdown,
} from './payouts';

export type {
  PayoutResult,
} from './payouts';

// Transaction Verification
export {
  getTransactionDetails,
  verifyTransaction,
  isTransactionConfirmed,
  getTransactionAge,
  getRecentTransactions,
  estimateTransactionFee,
  formatSignature,
  getExplorerUrl,
  batchVerifyTransactions,
  waitForFinalization,
  summarizeTransaction,
} from './transactions';

export type {
  TransactionDetails,
  TransactionVerification,
} from './transactions';

export { returnStake } from './stake-return';
export type { StakeReturnResult } from './stake-return';
