import type { DashboardGoal } from '../api/disputes';

export type GoalFilter = 'active' | 'completed' | 'failed' | 'all';
export const GOAL_FILTERS: { key: GoalFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'All' },
];

/** "Active" means anything not yet settled (includes validation, appeal and dispute states). */
export function matchesFilter(g: Pick<DashboardGoal, 'status'>, f: GoalFilter): boolean {
  if (f === 'all') return true;
  if (f === 'completed') return g.status === 'completed';
  if (f === 'failed') return g.status === 'failed';
  return g.status !== 'completed' && g.status !== 'failed';
}

/** Filter then order: Active by nearest deadline first, everything else most recent deadline first. */
export function filterGoals(goals: DashboardGoal[], f: GoalFilter): DashboardGoal[] {
  const t = (g: DashboardGoal) => new Date(g.deadline).getTime() || 0;
  return goals.filter((g) => matchesFilter(g, f)).sort((a, b) => (f === 'active' ? t(a) - t(b) : t(b) - t(a)));
}
