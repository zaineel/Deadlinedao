import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConsoleChannel,
  EmailChannel,
  ExpoPushChannel,
  defaultChannels,
  notify,
  renderMessage,
  type Channel,
  type NotificationEvent,
} from '@/lib/notify';

const recipient = {
  wallet: 'So11111111111111111111111111111111111111112',
  email: 'a@example.com',
  expoPushTokens: ['ExponentPushToken[abc]'],
};
const event: NotificationEvent = {
  kind: 'proof_result',
  goalId: 'g1',
  goalTitle: 'Run',
  verdict: 'approved',
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('notify', () => {
  it('dispatches to all channels and returns per-channel results', async () => {
    const a: Channel = { name: 'a', send: vi.fn().mockResolvedValue({ ok: true }) };
    const b: Channel = { name: 'b', send: vi.fn().mockResolvedValue({ ok: true }) };
    const res = await notify(event, recipient, [a, b]);
    expect(res).toEqual({ a: { ok: true }, b: { ok: true } });
    expect(a.send).toHaveBeenCalledWith(event, recipient);
  });

  it('a throwing or failing channel does not affect others and never throws', async () => {
    const bad: Channel = { name: 'bad', send: vi.fn().mockRejectedValue(new Error('boom')) };
    const failing: Channel = {
      name: 'failing',
      send: vi.fn().mockResolvedValue({ ok: false, error: 'x' }),
    };
    const good: Channel = { name: 'good', send: vi.fn().mockResolvedValue({ ok: true }) };
    const res = await notify(event, recipient, [bad, failing, good]);
    expect(res.bad).toEqual({ ok: false, error: 'boom' });
    expect(res.failing.ok).toBe(false);
    expect(res.good.ok).toBe(true);
  });

  it('console channel redacts the wallet', async () => {
    await new ConsoleChannel().send(event, recipient);
    const line = String(vi.mocked(console.log).mock.calls[0][0]);
    expect(line).toContain('proof_result');
    expect(line).not.toContain(recipient.wallet);
  });
});

describe('EmailChannel', () => {
  it('is skipped by default without env', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('NOTIFY_FROM_EMAIL', '');
    expect(defaultChannels().map((c) => c.name)).toEqual(['console']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is included and calls Resend when configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_key');
    vi.stubEnv('NOTIFY_FROM_EMAIL', 'from@example.com');
    expect(defaultChannels().map((c) => c.name)).toEqual(['console', 'email']);
    const res = await new EmailChannel().send(event, recipient);
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body).to).toEqual(['a@example.com']);
  });

  it('reports an error without env when used directly', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const res = await new EmailChannel().send(event, recipient);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ExpoPushChannel', () => {
  it('posts one message per token with the expected shape', async () => {
    const res = await new ExpoPushChannel().send(event, {
      ...recipient,
      expoPushTokens: ['t1', 't2'],
    });
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const body = JSON.parse(init.body);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      to: 't1',
      title: 'Proof result',
      data: { kind: 'proof_result' },
    });
  });

  it('fails without tokens and on HTTP errors', async () => {
    expect((await new ExpoPushChannel().send(event, { wallet: 'w' })).ok).toBe(false);
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect((await new ExpoPushChannel().send(event, recipient)).ok).toBe(false);
  });
});

describe('renderMessage', () => {
  const events: NotificationEvent[] = [
    { kind: 'appeal_window_open', goalId: 'g', goalTitle: 'T', closesAt: '2026-01-01' },
    { kind: 'appeal_resolved', goalId: 'g', goalTitle: 'T', outcome: 'overturned' },
    { kind: 'appeal_resolved', goalId: 'g', goalTitle: 'T', outcome: 'upheld' },
    { kind: 'deadline_reminder', goalId: 'g', goalTitle: 'T', deadline: '2026-01-02' },
    { kind: 'proof_result', goalId: 'g', goalTitle: 'T', verdict: 'rejected' },
    { kind: 'proof_result', goalId: 'g', goalTitle: 'T', verdict: 'needs_review' },
    { kind: 'team_invite', teamName: 'Crew', invitedBy: 'Ann' },
    { kind: 'reward_paid', amountSol: 0.5, signature: 'abcdefghijkl' },
  ];
  it.each(events)('renders $kind', (e) => {
    const m = renderMessage(e);
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.body.length).toBeGreaterThan(0);
  });
  it('includes key details', () => {
    expect(renderMessage(events[7]).body).toContain('0.5 SOL');
    expect(renderMessage(events[6]).body).toContain('Crew');
  });
});
