/**
 * How long after its deadline a goal can still receive proof.
 * Shared by proof submission and the expiry cron so they never disagree:
 * a goal is only failed once this window has fully closed.
 */
export const GOAL_GRACE_PERIOD_DAYS = 7;
export const GOAL_GRACE_PERIOD_MS = GOAL_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
