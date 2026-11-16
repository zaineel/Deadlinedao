import { NextRequest, NextResponse } from 'next/server';
import { verifySignIn, issueSession, setSessionCookie } from '@/lib/auth/session';
import { parseBody } from '@/lib/validation/schemas';
import { verifyRequestSchema } from '@/lib/validation/auth-schemas';

export const runtime = 'nodejs';

const TTL_SECONDS = 24 * 3600;

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, verifyRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    if (!verifySignIn(parsed.data)) {
      return NextResponse.json({ error: 'Invalid or expired sign-in' }, { status: 401 });
    }
    const token = issueSession(parsed.data.wallet, TTL_SECONDS);
    const expiresAt = (Math.floor(Date.now() / 1000) + TTL_SECONDS) * 1000;
    const response = NextResponse.json({ token, wallet: parsed.data.wallet, expiresAt });
    setSessionCookie(response, token, TTL_SECONDS);
    return response;
  } catch {
    return NextResponse.json({ error: 'Authentication is not configured' }, { status: 503 });
  }
}
