import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { featureDisabledResponse } from '@/lib/config/features';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { registerPushSchema } from '@/lib/validation/push-schemas';
import { registerToken } from '@/lib/notify/token-store';

export const runtime = 'nodejs';

/** POST /api/push/register { token, platform } for the signed-in wallet. */
export async function POST(request: NextRequest) {
  const disabled = featureDisabledResponse('push');
  if (disabled) return disabled;

  const auth = requireSession(request);
  if (!auth.ok) return auth.response;

  const limited = rateLimit(request, {
    name: 'push-register',
    limit: 20,
    windowMs: 60_000,
    key: auth.wallet,
  });
  if (limited) return limited;

  const body = await parseBody(request, registerPushSchema);
  if (!body.ok) return body.response;

  try {
    const result = await registerToken(auth.wallet, body.data.token, body.data.platform);
    if (result === 'limit') {
      return NextResponse.json({ error: 'Too many devices registered' }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/register] error:', error);
    return NextResponse.json({ error: 'Failed to register token' }, { status: 500 });
  }
}
