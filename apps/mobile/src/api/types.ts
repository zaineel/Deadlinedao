/**
 * Minimal API types, duplicated from the web app: types/index.ts (Goal, Proof)
 * and the request/response shapes in app/api/**. Keep in sync by hand.
 */
export type GoalStatus = 'active' | 'pending_validation' | 'completed' | 'failed';
export type GoalCategory = 'learning' | 'work' | 'health';

export interface Goal {
  id: string;
  wallet_address: string;
  title: string;
  description: string;
  deadline: string;
  stake_amount: number;
  stake_tx_signature: string;
  status: GoalStatus;
  category: GoalCategory;
  created_at: string;
  updated_at: string;
}

export interface NonceResponse {
  nonce: string;
  issuedAt: number;
  message: string;
}

export interface VerifyResponse {
  token: string;
  wallet: string;
  /** epoch milliseconds */
  expiresAt: number;
}

export interface CreateGoalInput {
  title: string;
  description: string;
  /** ISO date/time in the future */
  deadline: string;
  category: GoalCategory;
  stakeAmount: number;
  walletAddress: string;
}

export interface CreateGoalResponse {
  success: boolean;
  goalId: string;
  /** base64 serialized legacy transaction (absent in demo mode) */
  transaction?: string;
  escrowAddress?: string;
  demoMode?: boolean;
  message?: string;
}

export interface SubmitProofInput {
  goal_id: string;
  text_description: string;
  image_url?: string | null;
  timestamp: number;
  /** base64 ed25519 signature */
  signature: string;
}

export interface SubmitProofResponse {
  success: boolean;
  goal_status: GoalStatus;
  validation?: { verdict: 'approved' | 'rejected' | 'needs_review'; confidence: number; reasoning?: string };
  message?: string;
}

export interface ShareGoalResponse {
  shared?: boolean;
  url?: string;
  message?: string;
}

export interface PushRegisterInput {
  token: string;
  platform: 'ios';
}
