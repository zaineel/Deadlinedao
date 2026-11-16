// Supabase Client
export { supabase } from './client';
export type { Database } from './client';

// Goals Operations
export {
  createGoal,
  getGoalById,
  getGoalsByWallet,
  getActiveGoals,
  getExpiredGoals,
  updateGoalStatus,
  transitionGoalStatus,
  updateGoal,
  deleteGoal,
  getGoalsByCategory,
  getRecentGoals,
  getAllGoals,
} from './goals';

// Proofs Operations
export {
  createProof,
  getProofById,
  getProofsByGoal,
  getLatestProofForGoal,
  updateProofWithValidation,
  updateProof,
  getProofsNeedingReview,
  getProofsByVerdict,
  getHighQualityProofs,
  deleteProof,
  hasProofForGoal,
} from './proofs';

// Payouts Operations
export {
  createPayout,
  createPayouts,
  getPayoutById,
  getPayoutsByWallet,
  getPayoutsByGoal,
  getTotalPayoutsForWallet,
  getTotalRewardsForWallet,
  getRecentPayouts,
  getPayoutsByType,
  hasPayoutForGoal,
  claimPayout,
  finalizePayout,
  releasePayout,
  getWalletPayoutStats,
} from './payouts';

// Analytics Operations
export {
  getPlatformStats,
  getStatsByCategory,
  getUserStats,
  getAIValidationStats,
  getLeaderboard,
  getTrendingGoals,
} from './analytics';
