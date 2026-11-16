export interface StoredSession {
  token: string;
  wallet: string;
  /** epoch milliseconds */
  expiresAt: number;
}

/** Treat a session as expired a minute early so requests don't race the server clock. */
export function isSessionExpired(s: StoredSession, now = Date.now()): boolean {
  return s.expiresAt - 60_000 <= now;
}
