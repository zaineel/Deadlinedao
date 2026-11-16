import { NextRequest, NextResponse } from 'next/server';
import { createNonce, buildSignInMessage } from '@/lib/auth/session';
import { parseBody } from '@/lib/validation/schemas';
import { nonceRequestSchema } from '@/lib/validation/auth-schemas';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, nonceRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const nonce = createNonce();
    const issuedAt = Date.now();
    const message = buildSignInMessage({ wallet: parsed.data.wallet, nonce, issuedAt });
    return NextResponse.json({ nonce, issuedAt, message });
  } catch {
    return NextResponse.json({ error: 'Authentication is not configured' }, { status: 503 });
  }
}
