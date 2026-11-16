import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_TOKENS_PER_WALLET,
  decideRegister,
  findUnregisteredTokens,
  isExpoPushToken,
} from '@/lib/mobile/push-token';
import {
  REMINDER_WINDOW_MS,
  reminderWindowKey,
  selectReminderGoals,
} from '@/lib/mobile/reminders';
import { buildShareCard, isShareable, shortenWallet } from '@/lib/mobile/share';
import { registerPushSchema, shareGoalSchema, unregisterPushSchema } from '@/lib/validation/push-schemas';
import { ExpoPushChannel } from '@/lib/notify';

const TOKEN = 'ExponentPushToken[abcdEFGH1234567890xy]';

describe('isExpoPushToken', () => {
  it('accepts both prefixes', () => {
    expect(isExpoPushToken(TOKEN)).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abcdEFGH1234567890xy]')).toBe(true);
  });
  it.each([
    '',
    'ExponentPushToken[]',
    'ExponentPushToken[short]',
    'ExponentPushToken[abcdEFGH1234567890xy',
    'xExponentPushToken[abcdEFGH1234567890xy]',
    'ExponentPushToken[abcdEFGH1234567890xy]x',
    'ExponentPushToken[abc def 1234567890]',
    `ExponentPushToken[${'a'.repeat(65)}]`,
    'fcm-token',
  ])('rejects %s', (v) => expect(isExpoPushToken(v)).toBe(false));
  it('rejects non-strings', () => {
    expect(isExpoPushToken(null)).toBe(false);
    expect(isExpoPushToken(5)).toBe(false);
    expect(isExpoPushToken(undefined)).toBe(false);
  });
});

describe('decideRegister', () => {
  const tokens = Array.from({ length: MAX_TOKENS_PER_WALLET }, (_, i) => `t${i}`);
  it('allows below the limit', () => expect(decideRegister(tokens.slice(1), 'new')).toBe('ok'));
  it('blocks a new token at the limit', () => expect(decideRegister(tokens, 'new')).toBe('limit'));
  it('allows re-registering an existing token at the limit', () =>
    expect(decideRegister(tokens, 't0')).toBe('ok'));
  it('allows the first token', () => expect(decideRegister([], 'x')).toBe('ok'));
  it('honours a custom max', () => expect(decideRegister(['a'], 'b', 1)).toBe('limit'));
});

describe('findUnregisteredTokens', () => {
  const dead = { status: 'error', details: { error: 'DeviceNotRegistered' } };
  it('returns tokens matching DeviceNotRegistered tickets by index', () => {
    expect(findUnregisteredTokens(['a', 'b', 'c'], [{ status: 'ok' }, dead, dead])).toEqual(['b', 'c']);
  });
  it('ignores other errors', () => {
    expect(
      findUnregisteredTokens(['a'], [{ status: 'error', details: { error: 'MessageRateExceeded' } }])
    ).toEqual([]);
  });
  it('ignores ok tickets, nulls and missing details', () => {
    expect(findUnregisteredTokens(['a', 'b', 'c'], [{ status: 'ok' }, null, { status: 'error' }])).toEqual([]);
  });
  it('ignores tickets beyond the token list', () => {
    expect(findUnregisteredTokens(['a'], [{ status: 'ok' }, dead])).toEqual([]);
  });
  it('handles malformed input', () => {
    expect(findUnregisteredTokens(['a'], undefined)).toEqual([]);
    expect(findUnregisteredTokens(['a'], { data: 1 })).toEqual([]);
    expect(findUnregisteredTokens([], [dead])).toEqual([]);
  });
});

describe('reminders', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const mk = (deadline: string, status = 'active', id = 'g') => ({
    id,
    wallet_address: 'w',
    title: 't',
    deadline,
    status,
  });
  it('selects goals due within 24h', () => {
    const g = mk('2026-01-01T12:00:00Z');
    expect(selectReminderGoals([g], now)).toEqual([g]);
  });
  it('includes the exact 24h boundary', () => {
    expect(selectReminderGoals([mk('2026-01-02T00:00:00Z')], now)).toHaveLength(1);
  });
  it('excludes beyond 24h', () => {
    expect(selectReminderGoals([mk('2026-01-02T00:00:01Z')], now)).toHaveLength(0);
  });
  it('excludes past and exactly-now deadlines', () => {
    expect(selectReminderGoals([mk('2025-12-31T23:59:59Z'), mk('2026-01-01T00:00:00Z')], now)).toHaveLength(0);
  });
  it('excludes non-active statuses', () => {
    for (const s of ['completed', 'failed', 'pending_validation']) {
      expect(selectReminderGoals([mk('2026-01-01T12:00:00Z', s)], now)).toHaveLength(0);
    }
  });
  it('excludes invalid dates', () => {
    expect(selectReminderGoals([mk('not-a-date')], now)).toHaveLength(0);
  });
  it('respects a custom window', () => {
    expect(selectReminderGoals([mk('2026-01-01T02:00:00Z')], now, 60 * 60 * 1000)).toHaveLength(0);
    expect(REMINDER_WINDOW_MS).toBe(86_400_000);
  });
  it('window key is stable across date formats and changes with the deadline', () => {
    expect(reminderWindowKey('2026-01-01T12:00:00Z')).toBe(reminderWindowKey('2026-01-01T12:00:00.000+00:00'));
    expect(reminderWindowKey('2026-01-01T12:00:00Z')).not.toBe(reminderWindowKey('2026-01-01T13:00:00Z'));
    expect(reminderWindowKey('garbage')).toBe('due24h:garbage');
  });
});

describe('share card', () => {
  const row = {
    id: 'id',
    title: 'Ship it',
    category: 'work',
    stake_amount: '0.5000',
    status: 'completed',
    share_public: true,
    wallet_address: 'So11111111111111111111111111111111111111112',
  };
  it('shortens wallets', () => {
    expect(shortenWallet(row.wallet_address)).toBe('So11...1112');
    expect(shortenWallet('short')).toBe('***');
  });
  it('builds a redacted card', () => {
    const card = buildShareCard({ ...row, description: 'secret', proof: 'secret' } as typeof row);
    expect(card).toEqual({ title: 'Ship it', category: 'work', stakeSol: '0.5', walletShort: 'So11...1112' });
    expect(JSON.stringify(card)).not.toContain(row.wallet_address);
    expect(Object.keys(card!).sort()).toEqual(['category', 'stakeSol', 'title', 'walletShort']);
  });
  it('requires opt-in AND completion', () => {
    expect(buildShareCard({ ...row, share_public: false })).toBeNull();
    expect(buildShareCard({ ...row, share_public: null })).toBeNull();
    for (const status of ['active', 'failed', 'pending_validation']) {
      expect(buildShareCard({ ...row, status })).toBeNull();
      expect(isShareable({ status, share_public: true })).toBe(false);
    }
    expect(buildShareCard(null)).toBeNull();
    expect(buildShareCard(undefined)).toBeNull();
  });
  it('clamps unknown category, long title and bad stake', () => {
    const card = buildShareCard({ ...row, category: 'x', title: 'a'.repeat(300), stake_amount: 'abc' });
    expect(card?.category).toBe('learning');
    expect(card?.title).toHaveLength(100);
    expect(card?.stakeSol).toBe('0');
  });
});

describe('push schemas', () => {
  it('validates register', () => {
    expect(registerPushSchema.safeParse({ token: TOKEN, platform: 'ios' }).success).toBe(true);
    expect(registerPushSchema.safeParse({ token: TOKEN, platform: 'web' }).success).toBe(false);
    expect(registerPushSchema.safeParse({ token: 'nope', platform: 'ios' }).success).toBe(false);
    expect(registerPushSchema.safeParse({ platform: 'ios' }).success).toBe(false);
  });
  it('validates unregister and share', () => {
    expect(unregisterPushSchema.safeParse({ token: TOKEN }).success).toBe(true);
    expect(unregisterPushSchema.safeParse({ token: 'x' }).success).toBe(false);
    const goalId = '123e4567-e89b-12d3-a456-426614174000';
    expect(shareGoalSchema.safeParse({ goalId, share: true }).success).toBe(true);
    expect(shareGoalSchema.safeParse({ goalId, share: 'yes' }).success).toBe(false);
    expect(shareGoalSchema.safeParse({ goalId: 'bad', share: true }).success).toBe(false);
  });
});

describe('ExpoPushChannel receipts', () => {
  const event = { kind: 'deadline_reminder', goalId: 'g', goalTitle: 'T', deadline: 'soon' } as const;
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('reports DeviceNotRegistered tokens to the callback', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
      }),
    } as Response);
    const onUnregistered = vi.fn().mockResolvedValue(undefined);
    const res = await new ExpoPushChannel({ onUnregistered }).send(event, {
      wallet: 'w',
      expoPushTokens: ['a', 'b'],
    });
    expect(res.ok).toBe(true);
    expect(onUnregistered).toHaveBeenCalledWith(['b']);
  });
  it('does not fail the send when the body is unparseable or the callback throws', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as Response);
    const res = await new ExpoPushChannel({ onUnregistered: vi.fn() }).send(event, {
      wallet: 'w',
      expoPushTokens: ['a'],
    });
    expect(res.ok).toBe(true);
  });
  it('does not call the callback when nothing is dead', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: 'ok' }] }),
    } as Response);
    const onUnregistered = vi.fn();
    await new ExpoPushChannel({ onUnregistered }).send(event, { wallet: 'w', expoPushTokens: ['a'] });
    expect(onUnregistered).not.toHaveBeenCalled();
  });
});
