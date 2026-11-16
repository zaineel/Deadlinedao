import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';

/**
 * CSRF defense for cookie-authenticated, state-changing requests.
 *
 * The session cookie is SameSite=Lax. As defense in depth, a request that
 * authenticates via the cookie must be provably same-origin:
 *  - `Sec-Fetch-Site: same-origin` (sent by all current browsers), or
 *  - an `Origin` header whose host equals the request host.
 * A cookie request with neither header is rejected (browsers always send one
 * on POST). Requests authenticated with `Authorization: Bearer` are exempt: a
 * browser never attaches that header on its own, so it is not forgeable.
 */

/** True when the request carries a bearer token (so cookies are not what authenticates it). */
export function usesBearerAuth(request: Request): boolean {
  return /^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '');
}

function requestHost(request: Request): string {
  const h = request.headers;
  const forwarded = h.get('x-forwarded-host')?.split(',')[0]?.trim();
  return (forwarded || h.get('host') || new URL(request.url).host).toLowerCase();
}

export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site.toLowerCase() === 'same-origin';
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host.toLowerCase() === requestHost(request);
  } catch {
    return false;
  }
}

/** Returns a 403 response when a cookie-authenticated request is cross-site, else null. */
export function csrfViolation(request: Request): NextResponse | null {
  if (usesBearerAuth(request) || isSameOriginRequest(request)) return null;
  return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 });
}

/**
 * Session check for user routes. `mutating: true` also applies the CSRF rule.
 * 401 with no/invalid session; 403 for a cross-site cookie request.
 */
export function requireUserSession(
  request: Request,
  opts: { mutating?: boolean } = {}
): { ok: true; wallet: string } | { ok: false; response: NextResponse } {
  const session = requireSession(request);
  if (!session.ok) return session;
  if (opts.mutating) {
    const blocked = csrfViolation(request);
    if (blocked) return { ok: false, response: blocked };
  }
  return session;
}
