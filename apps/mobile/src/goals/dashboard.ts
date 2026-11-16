import type { DashboardGoal, FullGoalStatus } from '../api/disputes';

export interface DashboardStats {
  active: number;
  completed: number;
  failed: number;
  /** goals awaiting validation / appeal / dispute */
  inReview: number;
  /** SOL still at stake: every goal that is not yet completed or failed */
  totalStaked: number;
}

export function computeStats(goals: DashboardGoal[]): DashboardStats {
  const s: DashboardStats = { active: 0, completed: 0, failed: 0, inReview: 0, totalStaked: 0 };
  for (const g of goals) {
    if (g.status === 'active') s.active++;
    else if (g.status === 'completed') s.completed++;
    else if (g.status === 'failed') s.failed++;
    else s.inReview++;
    if (g.status !== 'completed' && g.status !== 'failed') s.totalStaked += Number(g.stake_amount) || 0;
  }
  s.totalStaked = Math.round(s.totalStaked * 1e9) / 1e9;
  return s;
}

/** "2d 3h left", "5h 10m left", "12m left", or "closed" once past. Null for a missing/invalid date. */
export function countdown(deadline: string | null | undefined, now: number): string | null {
  if (!deadline) return null;
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - now;
  if (ms <= 0) return 'closed';
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(m, 1)}m left`;
}

export const STATUS_LABEL: Record<FullGoalStatus, string> = {
  active: 'Active',
  pending_validation: 'Pending validation',
  completed: 'Completed',
  failed: 'Failed',
  rejected_appealable: 'Rejected (appealable)',
  disputed: 'Under appeal',
};

/** Only completed goals can be shared (server enforces it too). */
export const canShare = (g: Pick<DashboardGoal, 'status'>): boolean => g.status === 'completed';

export function shareUrl(baseUrl: string, goalId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/p/${encodeURIComponent(goalId)}`;
}
