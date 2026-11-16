import { notify } from '@/lib/notify';
import type { NotificationEvent } from '@/lib/notify';

/**
 * Fire-and-forget notification. A notification problem must never change the
 * outcome of the money / status flow that triggered it, so everything is
 * swallowed (and logged without personal data).
 */
export async function safeNotify(event: NotificationEvent, wallet: string): Promise<void> {
  try {
    await notify(event, { wallet });
  } catch (err) {
    console.error(`[disputes] notification ${event.kind} failed:`, err instanceof Error ? err.name : 'unknown');
  }
}
