import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Require the `x-admin-key` header to match ADMIN_API_KEY.
 * Returns a NextResponse to send back if the request is NOT authorized,
 * or null if it is. Fails closed when ADMIN_API_KEY is not configured.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: 'Admin API is not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-admin-key') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
