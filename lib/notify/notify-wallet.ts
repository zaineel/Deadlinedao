import { ExpoPushChannel, notify } from '@/lib/notify';
import type { NotificationEvent, SendResult } from '@/lib/notify';
import { deleteTokens, getTokensForWallet } from '@/lib/notify/token-store';

/**
 * Push `event` to every Expo token registered for `wallet`. Never throws.
 * Tokens Expo reports as DeviceNotRegistered are deleted.
 */
export async function notifyWallet(
  event: NotificationEvent,
  wallet: string
): Promise<Record<string, SendResult>> {
  try {
    const tokens = await getTokensForWallet(wallet);
    if (tokens.length === 0) return { 'expo-push': { ok: false, error: 'no push tokens' } };
    const channel = new ExpoPushChannel({
      onUnregistered: async (dead) => {
        try {
          await deleteTokens(dead);
        } catch (err) {
          console.error('[notify] failed to delete dead tokens:', err);
        }
      },
    });
    return await notify(event, { wallet, expoPushTokens: tokens }, [channel]);
  } catch (err) {
    console.error('[notify] notifyWallet failed:', err);
    return { 'expo-push': { ok: false, error: 'lookup failed' } };
  }
}
