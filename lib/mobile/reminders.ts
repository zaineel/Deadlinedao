/** Pure deadline-reminder selection. */

export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ReminderCandidate {
  id: string;
  wallet_address: string;
  title: string;
  deadline: string;
  status: string;
}

/** One reminder per goal per deadline value. */
export function reminderWindowKey(deadline: string): string {
  const t = new Date(deadline).getTime();
  return `due24h:${Number.isNaN(t) ? deadline : new Date(t).toISOString()}`;
}

/**
 * Active goals whose deadline is in the future and within `windowMs` of now.
 * Past-due, invalid-date and non-active goals are excluded.
 */
export function selectReminderGoals<T extends ReminderCandidate>(
  goals: readonly T[],
  now: number,
  windowMs: number = REMINDER_WINDOW_MS
): T[] {
  return goals.filter((g) => {
    if (g.status !== 'active') return false;
    const t = new Date(g.deadline).getTime();
    if (Number.isNaN(t)) return false;
    return t > now && t - now <= windowMs;
  });
}
