import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { featureDisabledResponse } from '@/lib/config/features';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { shareGoalSchema } from '@/lib/validation/push-schemas';
import { supabase } from '@/lib/supabase/client';

export const runtime = 'nodejs';

/**
 * POST /api/goals/share { goalId, share }
 * Owner-only opt-in/out of the public share page. Only COMPLETED goals can be
 * toggled; ownership and status are enforced inside the UPDATE itself.
 */
export async function POST(request: NextRequest) {
  const disabled = featureDisabledResponse('push');
  if (disabled) return disabled;

  const auth = requireSession(request);
  if (!auth.ok) return auth.response;

  const limited = rateLimit(request, {
    name: 'goal-share',
    limit: 30,
    windowMs: 60_000,
    key: auth.wallet,
  });
  if (limited) return limited;

  const body = await parseBody(request, shareGoalSchema);
  if (!body.ok) return body.response;

  try {
    const { data, error } = await supabase
      .from('goals')
      .update({ share_public: body.data.share })
      .eq('id', body.data.goalId)
      .eq('wallet_address', auth.wallet)
      .eq('status', 'completed')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // not found, not yours, or not completed: indistinguishable on purpose
      return NextResponse.json({ error: 'Goal not found or not shareable' }, { status: 404 });
    }
    return NextResponse.json({ success: true, shared: body.data.share });
  } catch (error) {
    console.error('[goals/share] error:', error);
    return NextResponse.json({ error: 'Failed to update sharing' }, { status: 500 });
  }
}
