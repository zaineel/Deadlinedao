import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

let n = 0;
const req = (ip: string) =>
  new NextRequest('http://localhost/api/x', { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });
const opts = () => ({ name: `t${n}`, limit: 3, windowMs: 60_000 });

describe('rateLimit', () => {
  beforeEach(() => {
    n += 1;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('allows up to the limit then blocks', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit(req('1.1.1.1'), opts())).toBeNull();
    expect(rateLimit(req('1.1.1.1'), opts())?.status).toBe(429);
  });

  it('resets after the window', () => {
    for (let i = 0; i < 4; i++) rateLimit(req('1.1.1.1'), opts());
    vi.advanceTimersByTime(60_001);
    expect(rateLimit(req('1.1.1.1'), opts())).toBeNull();
  });

  it('keeps separate keys independent', () => {
    for (let i = 0; i < 4; i++) rateLimit(req('1.1.1.1'), opts());
    expect(rateLimit(req('2.2.2.2'), opts())).toBeNull();
    for (let i = 0; i < 3; i++) rateLimit(req('3.3.3.3'), { ...opts(), key: 'a' });
    expect(rateLimit(req('3.3.3.3'), { ...opts(), key: 'a' })?.status).toBe(429);
    expect(rateLimit(req('3.3.3.3'), { ...opts(), key: 'b' })).toBeNull();
  });

  it('sets 429 body and headers', async () => {
    for (let i = 0; i < 3; i++) rateLimit(req('1.1.1.1'), opts());
    const res = rateLimit(req('1.1.1.1'), opts())!;
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.get('X-RateLimit-Reset')).toBe(String(Math.ceil((Date.now() + 60_000) / 1000)));
  });

  it('falls back to x-real-ip', () => {
    const r = () => new NextRequest('http://localhost/x', { headers: { 'x-real-ip': '9.9.9.9' } });
    for (let i = 0; i < 3; i++) rateLimit(r(), opts());
    expect(rateLimit(r(), opts())?.status).toBe(429);
    expect(rateLimit(req('8.8.8.8'), opts())).toBeNull();
  });
});
