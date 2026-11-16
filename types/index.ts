import type { PayoutType } from '@/lib/config/payout-types';

export type GoalStatus =
  | 'active'
  | 'pending_validation'
  | 'completed'
  | 'failed'
  | 'rejected_appealable'
  | 'disputed';

export interface Goal {
  id: string;
  wallet_address: string;
  title: string;
  description: string;
  deadline: string;
  stake_amount: number;
  stake_tx_signature: string;
  status: GoalStatus;
  /** Set when status is rejected_appealable: end of the 48h appeal window. */
  appeal_deadline?: string | null;
  category: 'learning' | 'work' | 'health';
  created_at: string;
  updated_at: string;
}

export interface Proof {
  id: string;
  goal_id: string;
  image_url: string;
  text_description: string;
  submitted_at: string;
  ai_verdict: 'approved' | 'rejected' | 'needs_review' | null;
  ai_confidence: number;
  quality_score: number;
  ai_reasoning: string;
}

export interface Payout {
  id: string;
  goal_id: string;
  wallet_address: string;
  amount: number;
  tx_signature: string;
  payout_type: PayoutType;
  created_at: string;
}

export interface ValidationResult {
  verdict: 'approved' | 'rejected' | 'needs_review';
  confidence: number;
  quality_score: number;
  text_match_score: number;
  specificity_score: number;
  red_flags: string[];
  reasoning: string;
}
