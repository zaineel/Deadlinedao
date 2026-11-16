import { findUnregisteredTokens } from '@/lib/mobile/push-token';
import type {
  Channel,
  NotificationEvent,
  Recipient,
  RenderedMessage,
  SendResult,
} from './types';

export type {
  Channel,
  NotificationEvent,
  NotificationKind,
  Recipient,
  RenderedMessage,
  SendResult,
} from './types';

/** Pure: title and body text for each event kind. */
export function renderMessage(event: NotificationEvent): RenderedMessage {
  switch (event.kind) {
    case 'appeal_window_open':
      return {
        title: 'Appeal window open',
        body: `You can appeal the decision on "${event.goalTitle}" until ${event.closesAt}.`,
      };
    case 'appeal_resolved':
      return {
        title: 'Appeal resolved',
        body:
          event.outcome === 'overturned'
            ? `Your appeal on "${event.goalTitle}" succeeded and the decision was overturned.`
            : `Your appeal on "${event.goalTitle}" was reviewed and the original decision stands.`,
      };
    case 'deadline_reminder':
      return {
        title: 'Deadline approaching',
        body: `"${event.goalTitle}" is due ${event.deadline}. Submit your proof in time.`,
      };
    case 'proof_result': {
      const text =
        event.verdict === 'approved'
          ? 'was approved'
          : event.verdict === 'rejected'
            ? 'was rejected'
            : 'needs manual review';
      return { title: 'Proof result', body: `Your proof for "${event.goalTitle}" ${text}.` };
    }
    case 'team_invite':
      return {
        title: 'Team invite',
        body: `${event.invitedBy} invited you to join team "${event.teamName}".`,
      };
    case 'reward_paid':
      return {
        title: 'Reward paid',
        body: `${event.amountSol} SOL was sent to your wallet (tx ${event.signature.slice(0, 8)}...).`,
      };
  }
}

function redactWallet(wallet: string): string {
  return wallet.length > 8 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : '***';
}

/** Default channel: logs a one-liner with the wallet redacted and no message body. */
export class ConsoleChannel implements Channel {
  name = 'console';
  async send(event: NotificationEvent, recipient: Recipient): Promise<SendResult> {
    console.log(`[notify] ${event.kind} -> ${redactWallet(recipient.wallet)}`);
    return { ok: true };
  }
}

/** Sends email through Resend. Only enabled when both env vars are set. */
export class EmailChannel implements Channel {
  name = 'email';
  static isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
  }
  async send(event: NotificationEvent, recipient: Recipient): Promise<SendResult> {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.NOTIFY_FROM_EMAIL;
    if (!key || !from) return { ok: false, error: 'email not configured' };
    if (!recipient.email) return { ok: false, error: 'recipient has no email' };
    const { title, body } = renderMessage(event);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [recipient.email], subject: title, text: body }),
    });
    if (!res.ok) return { ok: false, error: `resend responded ${res.status}` };
    return { ok: true };
  }
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Sends Expo push notifications to the recipient's Expo push tokens. */
export class ExpoPushChannel implements Channel {
  name = 'expo-push';
  constructor(private options: { onUnregistered?: (tokens: string[]) => Promise<void> } = {}) {}
  async send(event: NotificationEvent, recipient: Recipient): Promise<SendResult> {
    const tokens = recipient.expoPushTokens ?? [];
    if (tokens.length === 0) return { ok: false, error: 'recipient has no push tokens' };
    const { title, body } = renderMessage(event);
    const messages = tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      data: { kind: event.kind },
    }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return { ok: false, error: `expo responded ${res.status}` };
    if (this.options.onUnregistered) {
      try {
        const json: unknown = await res.json();
        const tickets = (json as { data?: unknown } | null)?.data;
        const dead = findUnregisteredTokens(tokens, tickets);
        if (dead.length > 0) await this.options.onUnregistered(dead);
      } catch {
        // receipts are best-effort; the send itself succeeded
      }
    }
    return { ok: true };
  }
}

/** Channels used when none are passed: console always, email only if configured. */
export function defaultChannels(): Channel[] {
  const channels: Channel[] = [new ConsoleChannel()];
  if (EmailChannel.isConfigured()) channels.push(new EmailChannel());
  return channels;
}

/**
 * Dispatch to every channel. Never throws: a failing channel is reported in
 * the result map and does not affect the others or the calling flow.
 */
export async function notify(
  event: NotificationEvent,
  recipient: Recipient,
  channels: Channel[] = defaultChannels()
): Promise<Record<string, SendResult>> {
  const entries = await Promise.all(
    channels.map(async (channel): Promise<[string, SendResult]> => {
      try {
        return [channel.name, await channel.send(event, recipient)];
      } catch (err) {
        return [
          channel.name,
          { ok: false, error: err instanceof Error ? err.message : 'unknown error' },
        ];
      }
    })
  );
  return Object.fromEntries(entries);
}
