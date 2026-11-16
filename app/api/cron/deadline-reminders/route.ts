import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabase } from '@/lib/supabase/client';
import { featureDisabledResponse } from '@/lib/config/features';
import { notifyWallet } from '@/lib/notify/notify-wallet';
import {
  REMINDER_WINDOW_MS,
  reminderWindowKey,
  selectReminderGoals,
  type ReminderCandidate,
} from '@/lib/mobile/reminders';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/cron/deadline-reminders
 * Pushes a reminder for active goals due within 24h. Each (goal, deadline) is
 * claimed in deadline_reminders_sent BEFORE sending (unique constraint), so a
 * rerun or overlapping run never double-sends. A failed push is not retried.
 */
export async function GET(request: NextRequest) {
  const disabled = featureDisabledResponse('push');
  if (disabled) return disabled;
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = Date.now();
    const { data, error } = await supabase
      .from('goals')
      .select('id, wallet_address, title, deadline, status')
      .eq('status', 'active')
      .gt('deadline', new Date(now).toISOString())
      .lte('deadline', new Date(now + REMINDER_WINDOW_MS).toISOString());
    if (error) throw error;

    const due = selectReminderGoals((data ?? []) as ReminderCandidate[], now);
    let sent = 0;
    let skipped = 0;
    for (const goal of due) {
      const { error: claimError } = await supabase
        .from('deadline_reminders_sent')
        .insert({ goal_id: goal.id, window_key: reminderWindowKey(goal.deadline) });
      if (claimError) {
        if (claimError.code === '23505') skipped++; // already claimed
        else console.error('[Cron] deadline-reminders claim error:', claimError);
        continue;
      }
      const result = await notifyWallet(
        {
          kind: 'deadline_reminder',
          goalId: goal.id,
          goalTitle: goal.title,
          deadline: new Date(goal.deadline).toUTCString(),
        },
        goal.wallet_address
      );
      if (result['expo-push']?.ok) sent++;
    }

    console.log(`[Cron] deadline-reminders: ${sent} sent, ${skipped} already sent, ${due.length} due`);
    return NextResponse.json({ success: true, due: due.length, sent, skipped });
  } catch (error) {
    console.error('[Cron] deadline-reminders error:', error);
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 });
  }
}
