import { supabase } from '@/lib/supabase/client';
import { MAX_TOKENS_PER_WALLET, decideRegister } from '@/lib/mobile/push-token';

/** DB access for push_tokens (service role). */

export async function getTokensForWallet(wallet: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('push_tokens')
    .select('expo_token')
    .eq('wallet_address', wallet);
  if (error) throw error;
  return (data ?? []).map((r: { expo_token: string }) => r.expo_token);
}

export type RegisterResult = 'ok' | 'limit';

export async function registerToken(
  wallet: string,
  token: string,
  platform: 'ios' | 'android'
): Promise<RegisterResult> {
  const existing = await getTokensForWallet(wallet);
  if (decideRegister(existing, token, MAX_TOKENS_PER_WALLET) === 'limit') return 'limit';
  const now = new Date().toISOString();
  // token is unique: a device that signs in as a different wallet moves to it
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { wallet_address: wallet, expo_token: token, platform, last_seen: now },
      { onConflict: 'expo_token' }
    );
  if (error) throw error;
  return 'ok';
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
