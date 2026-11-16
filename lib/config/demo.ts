/**
 * Demo mode is decided ONLY by server-side env. It must never be driven by
 * anything the client sends. DEMO_MODE is preferred; NEXT_PUBLIC_DEMO_MODE is
 * read as a fallback so existing .env files keep working.
 *
 * Demo mode skips on-chain stake verification, so keep it OFF in production.
 */
export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE ?? process.env.NEXT_PUBLIC_DEMO_MODE) === 'true';
}
