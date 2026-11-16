import type { ApiClient, Optional } from './client';
import { ApiError } from './client';
import type { Goal } from './types';

/** Goal statuses added by the disputes feature (src/api/types.ts only knows the original four). */
export type FullGoalStatus =
  | 'active'
  | 'pending_validation'
  | 'completed'
  | 'failed'
  | 'rejected_appealable'
  | 'disputed';

/** Row from GET /api/goals (select *): the original Goal plus appeal/share columns. */
export type DashboardGoal = Omit<Goal, 'status'> & {
  status: FullGoalStatus;
  appeal_deadline?: string | null;
  share_public?: boolean | null;
};

export type DisputeStatus = 'open' | 'overturned' | 'upheld';

export interface AppealableGoal {
  goalId: string;
  appealDeadline: string;
  /** SOL */
  bondAmount: number;
}

export interface DisputeSummary {
  id: string;
  goalId: string;
  reason: string;
  /** SOL */
  bondAmount: number;
  status: DisputeStatus;
  createdAt?: string;
  resolvedAt?: string | null;
}

export interface DisputesResponse {
  escrowAddress: string | null;
  appealable: AppealableGoal[];
  disputes: DisputeSummary[];
}

export interface OpenDisputeInput {
  goalId: string;
  /** 10..1000 chars */
  reason: string;
  /** base58 signature of the confirmed bond transfer to escrow */
  bondSignature: string;
}

export const REASON_MIN = 10;
export const REASON_MAX = 1000;

export function createDisputesApi(client: Pick<ApiClient, 'request'>) {
  return {
    /** GET /api/disputes. 404 (flag off) => { available: false }; 401 propagates as ApiError. */
    async list(): Promise<Optional<DisputesResponse>> {
      try {
        const d = await client.request<Partial<DisputesResponse>>('GET', '/api/disputes');
        return {
          available: true,
          data: { escrowAddress: d.escrowAddress ?? null, appealable: d.appealable ?? [], disputes: d.disputes ?? [] },
        };
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return { available: false };
        throw e;
      }
    },
    /** POST /api/disputes (201). The wallet comes from the session. */
    openDispute: (input: OpenDisputeInput) =>
      client.request<{ success: boolean; disputeId: string; bondAmount: number; goal_status: 'disputed' }>(
        'POST',
        '/api/disputes',
        { json: { goalId: input.goalId, reason: input.reason.trim(), bondSignature: input.bondSignature } }
      ),
    /** GET /api/goals (all goals for the session wallet), typed with the appeal/share columns. */
    async goals(wallet: string): Promise<DashboardGoal[]> {
      return (await client.request<{ goals: DashboardGoal[] }>('GET', `/api/goals?wallet=${encodeURIComponent(wallet)}`))
        .goals;
    },
    async goal(id: string): Promise<DashboardGoal> {
      return (await client.request<{ goal: DashboardGoal }>('GET', `/api/goals/${encodeURIComponent(id)}`)).goal;
    },
  };
}

export type DisputesApi = ReturnType<typeof createDisputesApi>;
