/**
 * Deadline-day helpers.
 *
 * A "deadline day" is the UTC calendar date (YYYY-MM-DD) of a goal's deadline
 * timestamp. Everything here is independent of the host timezone, so results
 * are identical on a dev machine and on Vercel (UTC).
 */

/**
 * Returns the UTC calendar date (YYYY-MM-DD) of a timestamp or Date.
 * A bare "YYYY-MM-DD" string is interpreted as that UTC date.
 * @throws RangeError if the input is not a valid date.
 */
export function utcDateKey(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Invalid date: ${String(input)}`);
  }
  return d.toISOString().slice(0, 10);
}

function safeKey(input: string | Date): string | null {
  try {
    return utcDateKey(input);
  } catch {
    return null;
  }
}

/** True when both inputs fall on the same UTC date. Invalid input yields false. */
export function isSameDeadlineDay(a: string | Date, b: string | Date): boolean {
  const ka = safeKey(a);
  const kb = safeKey(b);
  return ka !== null && ka === kb;
}

/**
 * ISO bounds of a UTC day: `start` inclusive, `end` exclusive (next midnight).
 * @throws RangeError if dateKey is not a valid YYYY-MM-DD date.
 */
export function utcDayRange(dateKey: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError(`Invalid date key: ${dateKey}`);
  }
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== dateKey) {
    throw new RangeError(`Invalid date key: ${dateKey}`);
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Goals whose deadline falls on the UTC day of `dateKey` (any date string
 * accepted by utcDateKey). Returns [] if dateKey is invalid; goals with an
 * invalid deadline are skipped.
 */
export function filterGoalsByDeadlineDay<T extends { deadline: string }>(
  goals: T[],
  dateKey: string
): T[] {
  const target = safeKey(dateKey);
  if (target === null) return [];
  return goals.filter(g => safeKey(g.deadline) === target);
}
