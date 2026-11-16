import { supabase } from '@/lib/supabase/client';
import { MAX_TOKENS_PER_WALLET, decideOwnership, decideRegister } from '@/lib/mobile/push-token';

/** DB access for push_tokens (service role). */

export async function getTokensForWallet(wallet: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('push_tokens')
    .select('expo_token')
    .eq('wallet_address', wallet);
  if (error) throw error;
  return (data ?? []).map((r: { expo_token: string }) => r.expo_token);
}

export type RegisterResult = 'ok' | 'limit' | 'conflict';

export async function registerToken(
  wallet: string,
  token: string,
  platform: 'ios' | 'android'
): Promise<RegisterResult> {
  const existing = await getTokensForWallet(wallet);
  if (decideRegister(existing, token, MAX_TOKENS_PER_WALLET) === 'limit') return 'limit';
  const now = new Date().toISOString();
  const { data: row, error: lookupError } = await supabase
    .from('push_tokens')
    .select('wallet_address, last_seen')
    .eq('expo_token', token)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const decision = decideOwnership(row, wallet, Date.now());
  if (decision === 'conflict') return 'conflict';

  if (decision === 'insert') {
    const { error } = await supabase
      .from('push_tokens')
      .insert({ wallet_address: wallet, expo_token: token, platform, last_seen: now });
    if (error) {
      if (error.code === '23505') return 'conflict'; // lost a race to another wallet
      throw error;
    }
    return 'ok';
  }

  // refresh (own token) or reassign (stale): compare-and-set on the observed owner
  const { data: updated, error } = await supabase
    .from('push_tokens')
    .update({ wallet_address: wallet, platform, last_seen: now })
    .eq('expo_token', token)
    .eq('wallet_address', row!.wallet_address)
    .select('id');
  if (error) throw error;
  return updated && updated.length > 0 ? 'ok' : 'conflict';
}

export async function unregisterToken(wallet: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('wallet_address', wallet)
    .eq('expo_token', token);
  if (error) throw error;
}

/** Remove tokens Expo reported as DeviceNotRegistered. */
export async function deleteTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await supabase.from('push_tokens').delete().in('expo_token', tokens);
  if (error) throw error;
}
