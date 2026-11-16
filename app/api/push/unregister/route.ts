import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { featureDisabledResponse } from '@/lib/config/features';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { unregisterPushSchema } from '@/lib/validation/push-schemas';
import { unregisterToken } from '@/lib/notify/token-store';

export const runtime = 'nodejs';

/** POST /api/push/unregister { token }: removes the token only if this wallet owns it. */
export async function POST(request: NextRequest) {
  const disabled = featureDisabledResponse('push');
  if (disabled) return disabled;

  const auth = requireSession(request);
  if (!auth.ok) return auth.response;

  const limited = rateLimit(request, {
    name: 'push-unregister',
    limit: 20,
    windowMs: 60_000,
    key: auth.wallet,
  });
  if (limited) return limited;

  const body = await parseBody(request, unregisterPushSchema);
  if (!body.ok) return body.response;

  try {
    await unregisterToken(auth.wallet, body.data.token);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/unregister] error:', error);
    return NextResponse.json({ error: 'Failed to unregister token' }, { status: 500 });
  }
}
