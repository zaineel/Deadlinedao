import { NextRequest, NextResponse } from 'next/server';

/**
 * Small fixed-window rate limiter with a pluggable store.
 *
 * IMPORTANT: the default store is in-memory. On serverless platforms (Vercel)
 * each function instance has its own memory, so limits are per-instance and
 * best-effort only. In production, back this with Vercel Firewall rate-limit
 * rules (WAF) and/or supply an Upstash Redis-backed `RateLimitStore` via
 * `setRateLimitStore()`.
 */

export interface RateLimitState {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  /** Increment the counter for `key` in the current window and return state. */
  increment(key: string, windowMs: number, now: number): RateLimitState;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private entries = new Map<string, RateLimitState>();
  private lastPrune = 0;

  increment(key: string, windowMs: number, now: number): RateLimitState {
    this.prune(now, windowMs);
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
  }

  private prune(now: number, windowMs: number) {
    if (now - this.lastPrune < Math.max(windowMs, 1000)) return;
    this.lastPrune = now;
    for (const [k, v] of this.entries) {
      if (v.resetAt <= now) this.entries.delete(k);
    }
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();

export function setRateLimitStore(next: RateLimitStore) {
  store = next;
}

export interface RateLimitOptions {
  name: string;
  limit: number;
  windowMs: number;
  /** Optional extra key component, e.g. a wallet address. */
  key?: string;
}

export function getClientIp(request: NextRequest): string {
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (first) return first;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Returns a 429 response when over the limit, or null when allowed. */
export function rateLimit(
  request: NextRequest,
  { name, limit, windowMs, key }: RateLimitOptions
): NextResponse | null {
  const now = Date.now();
  const id = `${name}:${getClientIp(request)}${key ? `:${key}` : ''}`;
  const result = store.increment(id, windowMs, now);
  if (result.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - now) / 1000));
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}
