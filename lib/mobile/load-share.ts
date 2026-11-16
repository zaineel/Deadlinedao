import { z } from 'zod';
import { supabase } from '@/lib/supabase/client';
import { isFeatureEnabled } from '@/lib/config/features';
import { buildShareCard, type ShareCard, type ShareableGoalRow } from '@/lib/mobile/share';

/**
 * Loads the public share card for a goal id. Returns null (so callers 404)
 * when the flag is off, the id is malformed, the goal is missing, not
 * completed, or not opted in. Selects only whitelisted columns.
 */
export async function loadShareCard(id: string): Promise<ShareCard | null> {
  if (!isFeatureEnabled('push')) return null;
  if (!z.string().uuid().safeParse(id).success) return null;
  const { data, error } = await supabase
    .from('goals')
    .select('id, title, category, stake_amount, status, share_public, wallet_address')
    .eq('id', id)
    .eq('share_public', true)
    .eq('status', 'completed')
    .maybeSingle();
  if (error || !data) return null;
  return buildShareCard(data as ShareableGoalRow);
}
