import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/api/client';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async (_url: unknown, _init?: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  );
}

describe('api client request shaping', () => {
  it('POSTs the nonce request without auth and with JSON', async () => {
    const f = mockFetch(200, { nonce: 'n', issuedAt: 1, message: 'm' });
    const api = createApiClient({ baseUrl: 'https://x.test/', getToken: () => 'TOK', fetchImpl: f as unknown as typeof fetch });
    await api.getNonce('WALLET');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/auth/nonce');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ wallet: 'WALLET' }));
    const h = init.headers as Record<string, string>;
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Authorization).toBeUndefined();
  });

  it('sends the bearer token on authenticated calls and encodes the wallet query', async () => {
    const f = mockFetch(200, { goals: [{ id: 'g1' }] });
    const api = createApiClient({ baseUrl: 'https://x.test', getToken: async () => 'TOK', fetchImpl: f as unknown as typeof fetch });
    const goals = await api.getGoals('a b');
    expect(goals).toEqual([{ id: 'g1' }]);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/goals?wallet=a%20b');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOK');
  });

  it('shapes create and confirm bodies', async () => {
    const f = mockFetch(200, { success: true, goalId: 'g' });
    const api = createApiClient({ baseUrl: 'https://x.test', fetchImpl: f as unknown as typeof fetch });
    await api.confirmGoal('g', 'SIG');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/goals/confirm');
    expect(JSON.parse(init.body as string)).toEqual({ goalId: 'g', signature: 'SIG' });
  });

  it('throws ApiError with the server message and triggers onUnauthorized on 401', async () => {
    const f = mockFetch(401, { error: 'Unauthorized' });
    const onUnauthorized = vi.fn();
    const api = createApiClient({ baseUrl: 'https://x.test', getToken: () => 'TOK', onUnauthorized, fetchImpl: f as unknown as typeof fetch });
    await expect(api.getGoal('g')).rejects.toMatchObject({ name: 'ApiError', status: 401, message: 'Unauthorized' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not call onUnauthorized for unauthenticated 401s (bad sign-in)', async () => {
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: 'https://x.test',
      onUnauthorized,
      fetchImpl: mockFetch(401, { error: 'Invalid or expired sign-in' }) as unknown as typeof fetch,
    });
    await expect(api.verify({ wallet: 'w', nonce: 'n', issuedAt: 1, signature: 's' })).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-JSON errors', async () => {
    const f = vi.fn(async () => new Response('<html>', { status: 502 }));
    const api = createApiClient({ baseUrl: 'https://x.test', fetchImpl: f as unknown as typeof fetch });
    await expect(api.getGoal('g')).rejects.toMatchObject({ status: 502, message: 'Request failed (502)' });
  });

  it('tolerates 404 on share and push endpoints but not other errors', async () => {
    const api404 = createApiClient({ baseUrl: 'https://x.test', fetchImpl: mockFetch(404, { error: 'Not found' }) as unknown as typeof fetch });
    expect(await api404.shareGoal('g')).toEqual({ available: false });
    expect(await api404.registerPush({ token: 't', platform: 'ios' })).toEqual({ available: false });

    const api500 = createApiClient({ baseUrl: 'https://x.test', fetchImpl: mockFetch(500, { error: 'boom' }) as unknown as typeof fetch });
    await expect(api500.shareGoal('g')).rejects.toBeInstanceOf(ApiError);

    const apiOk = createApiClient({ baseUrl: 'https://x.test', fetchImpl: mockFetch(200, { url: 'https://s' }) as unknown as typeof fetch });
    expect(await apiOk.shareGoal('g')).toEqual({ available: true, data: { url: 'https://s' } });
  });

  it('uploads proofs as multipart form data', async () => {
    const f = mockFetch(200, { success: true, url: 'https://r2/x.jpg' });
    const api = createApiClient({ baseUrl: 'https://x.test', fetchImpl: f as unknown as typeof fetch });
    // Node's FormData rejects RN-style descriptors; stub it for this test.
    const appended: Array<[string, unknown]> = [];
    const Original = globalThis.FormData;
    class FakeForm {
      append(k: string, v: unknown) {
        appended.push([k, v]);
      }
    }
    globalThis.FormData = FakeForm as unknown as typeof FormData;
    try {
      const res = await api.uploadProofImage('goal-1', { uri: 'file:///a.jpg', name: 'proof.jpg', type: 'image/jpeg' });
      expect(res.url).toBe('https://r2/x.jpg');
    } finally {
      globalThis.FormData = Original;
    }
    expect(appended).toEqual([
      ['goalId', 'goal-1'],
      ['file', { uri: 'file:///a.jpg', name: 'proof.jpg', type: 'image/jpeg' }],
    ]);
    const [, init] = f.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});
