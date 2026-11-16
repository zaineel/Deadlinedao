import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  return NextResponse.json({ wallet: session.wallet });
}
