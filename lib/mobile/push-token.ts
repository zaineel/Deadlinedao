/** Pure helpers for Expo push token handling. */

export const MAX_TOKENS_PER_WALLET = 5;

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,64}\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && EXPO_TOKEN_RE.test(value);
}

export type RegisterDecision = 'ok' | 'limit';

/**
 * A wallet may hold at most `max` distinct tokens. Re-registering a token it
 * already holds is always fine (it just refreshes last_seen).
 */
export function decideRegister(
  existingTokens: readonly string[],
  token: string,
  max: number = MAX_TOKENS_PER_WALLET
): RegisterDecision {
  if (existingTokens.includes(token)) return 'ok';
  return existingTokens.length >= max ? 'limit' : 'ok';
}

interface ExpoTicket {
  status?: unknown;
  details?: { error?: unknown } | null;
}

/**
 * Given the tokens a batch was sent to and Expo's ticket array (same order),
 * return the tokens Expo reports as DeviceNotRegistered. Malformed input
 * yields an empty list.
 */
export function findUnregisteredTokens(tokens: readonly string[], tickets: unknown): string[] {
  if (!Array.isArray(tickets)) return [];
  const dead: string[] = [];
  tickets.forEach((t: ExpoTicket | null, i) => {
    if (
      t &&
      typeof t === 'object' &&
      t.status === 'error' &&
      t.details?.error === 'DeviceNotRegistered' &&
      i < tokens.length
    ) {
      dead.push(tokens[i]);
    }
  });
  return dead;
}

/** A token owned by another wallet may only be taken over once it is this stale. */
export const TOKEN_REASSIGN_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export type OwnershipDecision = 'insert' | 'refresh' | 'reassign' | 'conflict';

/**
 * Anti-hijack: a token already bound to a DIFFERENT wallet is never silently
 * moved (a leaked token would otherwise redirect another user's reminders).
 * The owner must unregister it first, or it must not have been seen for
 * `staleMs`.
 */
export function decideOwnership(
  row: { wallet_address: string; last_seen: string | null } | null,
  wallet: string,
  nowMs: number,
  staleMs: number = TOKEN_REASSIGN_STALE_MS
): OwnershipDecision {
  if (!row) return 'insert';
  if (row.wallet_address === wallet) return 'refresh';
  const seen = row.last_seen ? new Date(row.last_seen).getTime() : NaN;
  if (Number.isNaN(seen) || nowMs - seen >= staleMs) return 'reassign';
  return 'conflict';
}
