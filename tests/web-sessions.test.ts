import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Keypair } from '@solana/web3.js';

/* ---------- mocks (no Supabase / Solana / R2 needed) ---------- */

const m = vi.hoisted(() => ({
  // result the fake supabase chain resolves to, per table operation
  result: { data: null as unknown, error: null as unknown },
  eqCalls: [] as Array<[string, unknown]>,
  inserted: [] as unknown[],
  getGoalById: vi.fn(),
  isSignatureUsed: vi.fn(),
  r2Send: vi.fn(),
}));

function chain() {
  const c: Record<string, unknown> = {};
  for (const k of ['select', 'insert', 'update', 'order', 'limit']) {
    c[k] = (arg?: unknown) => {
      if (k === 'insert') m.inserted.push(arg);
      return c;
    };
  }
  c.eq = (col: string, val: unknown) => {
    m.eqCalls.push([col, val]);
    return c;
  };
  c.single = () => Promise.resolve(m.result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(m.result).then(res);
  return c;
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => chain() }) }));
vi.mock('@solana/web3.js', async (orig) => {
  const actual = await orig<typeof import('@solana/web3.js')>();
  class FakeConnection {
    async getLatestBlockhash() {
      return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 };
    }
  }
  return { ...actual, Connection: FakeConnection };
});
vi.mock('@/lib/solana/escrow', () => ({ verifyStakeTransaction: vi.fn() }));
vi.mock('@/lib/solana/signature-registry', () => ({ isSignatureUsed: m.isSignatureUsed }));
vi.mock('@/lib/supabase/goals', () => ({ getGoalById: m.getGoalById }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = m.r2Send;
  },
  PutObjectCommand: class {},
}));
// proofs route dependencies
vi.mock('@/lib/supabase', () => ({
  createProof: vi.fn(),
  updateProofWithValidation: vi.fn(),
  getProofsByGoal: vi.fn(),
  getGoalById: m.getGoalById,
  transitionGoalStatus: vi.fn(),
}));
vi.mock('@/lib/snowflake', () => ({
  validateProof: vi.fn(),
  logValidation: vi.fn(),
  AIPerformanceMonitor: class {
    complete() {}
    error() {}
  },
}));
vi.mock('@/lib/solana', () => ({ returnStake: vi.fn() }));
vi.mock('@/lib/supabase/disputes', () => ({ openAppealWindow: vi.fn() }));

import { GET as getGoals } from '@/app/api/goals/route';
import { POST as createGoal } from '@/app/api/goals/create/route';
import { POST as confirmGoal } from '@/app/api/goals/confirm/route';
import { POST as uploadProof } from '@/app/api/upload/proof/route';
import { POST as submitProof } from '@/app/api/proofs/route';
import { GET as getFeatures } from '@/app/api/features/route';
import { issueSession } from '@/lib/auth/session';
import { csrfViolation, isSameOriginRequest, requireUserSession, usesBearerAuth } from '@/lib/auth/csrf';

const OWNER = Keypair.generate().publicKey.toBase58();
const OTHER = Keypair.generate().publicKey.toBase58();
const GOAL = '3f8b0f6e-6a3c-4d64-9b0e-2f6e7a1c9d10';
const SAME = { 'sec-fetch-site': 'same-origin' };

const bearer = (w: string) => ({ authorization: `Bearer ${issueSession(w)}` });
const cookie = (w: string) => ({ cookie: `dd_session=${issueSession(w)}` });

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost', ...headers },
    body: JSON.stringify(body),
  });
}
function get(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

const goalBody = () => ({
  title: 'Ship it',
  description: 'Finish the thing',
  deadline: new Date(Date.now() + 86_400_000).toISOString(),
  category: 'work',
  stakeAmount: 0.5,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.result = { data: null, error: null };
  m.eqCalls = [];
  m.inserted = [];
  process.env.SESSION_SECRET = 'c'.repeat(40);
  process.env.DEMO_MODE = 'true';
  process.env.SOLANA_ESCROW_PRIVATE_KEY = JSON.stringify(Array.from(Keypair.generate().secretKey));
  m.isSignatureUsed.mockResolvedValue(false);
});

/* ---------- CSRF helper ---------- */

describe('csrf helper', () => {
  const r = (headers: Record<string, string>) =>
    new Request('http://app.example/api/x', { method: 'POST', headers });

  it('detects bearer auth', () => {
    expect(usesBearerAuth(r({ authorization: 'Bearer abc' }))).toBe(true);
    expect(usesBearerAuth(r({ authorization: 'Basic abc' }))).toBe(false);
    expect(usesBearerAuth(r({}))).toBe(false);
  });

  it('same-origin via Sec-Fetch-Site', () => {
    expect(isSameOriginRequest(r({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isSameOriginRequest(r({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isSameOriginRequest(r({ 'sec-fetch-site': 'same-site' }))).toBe(false);
  });

  it('Sec-Fetch-Site wins over a spoofable Origin', () => {
    expect(
      isSameOriginRequest(r({ 'sec-fetch-site': 'cross-site', origin: 'http://app.example', host: 'app.example' }))
    ).toBe(false);
  });

  it('falls back to Origin host vs request host', () => {
    expect(isSameOriginRequest(r({ origin: 'http://app.example', host: 'app.example' }))).toBe(true);
    expect(isSameOriginRequest(r({ origin: 'http://evil.example', host: 'app.example' }))).toBe(false);
    expect(isSameOriginRequest(r({ origin: 'not a url', host: 'app.example' }))).toBe(false);
    expect(
      isSameOriginRequest(r({ origin: 'https://app.example', host: 'internal:3000', 'x-forwarded-host': 'app.example' }))
    ).toBe(true);
  });

  it('rejects a cookie request with no origin signal, exempts bearer', () => {
    expect(csrfViolation(r({}))?.status).toBe(403);
    expect(csrfViolation(r({ authorization: 'Bearer t' }))).toBeNull();
    expect(csrfViolation(r({ 'sec-fetch-site': 'same-origin' }))).toBeNull();
  });

  it('requireUserSession: 401 first, 403 for cross-site cookie, GET skips csrf', () => {
    expect(requireUserSession(get('/x'), { mutating: true })).toMatchObject({ ok: false });
    const crossCookie = new Request('http://localhost/x', {
      method: 'POST',
      headers: { ...cookie(OWNER), 'sec-fetch-site': 'cross-site' },
    });
    const denied = requireUserSession(crossCookie, { mutating: true });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(403);
    expect(requireUserSession(crossCookie).ok).toBe(true); // non-mutating
  });
});

/* ---------- GET /api/features ---------- */

describe('GET /api/features', () => {
  it('returns only booleans for the five flags', async () => {
    process.env.FEATURE_TEAMS = 'true';
    delete process.env.FEATURE_ORGS;
    const res = await getFeatures();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['disputes', 'governance', 'orgs', 'push', 'teams']);
    expect(body.teams).toBe(true);
    expect(body.orgs).toBe(false);
    delete process.env.FEATURE_TEAMS;
  });
});

/* ---------- GET /api/goals ---------- */

describe('GET /api/goals', () => {
  beforeEach(() => {
    m.result = { data: [{ id: GOAL }], error: null };
  });

  it('401 without a session', async () => {
    expect((await getGoals(get(`/api/goals?wallet=${OWNER}`))).status).toBe(401);
  });

  it('403 when ?wallet= is another wallet', async () => {
    const res = await getGoals(get(`/api/goals?wallet=${OTHER}`, bearer(OWNER)));
    expect(res.status).toBe(403);
    expect(m.eqCalls).toHaveLength(0);
  });

  it('bearer: returns the session wallet goals, with or without the query', async () => {
    expect((await getGoals(get(`/api/goals?wallet=${OWNER}`, bearer(OWNER)))).status).toBe(200);
    const res = await getGoals(get('/api/goals', bearer(OWNER)));
    expect(res.status).toBe(200);
    expect((await res.json()).goals).toHaveLength(1);
    expect(m.eqCalls).toContainEqual(['wallet_address', OWNER]);
  });

  it('cookie is accepted', async () => {
    expect((await getGoals(get('/api/goals', cookie(OWNER)))).status).toBe(200);
  });
});

/* ---------- POST /api/goals/create ---------- */

describe('POST /api/goals/create', () => {
  beforeEach(() => {
    m.result = { data: { id: GOAL }, error: null };
  });

  it('401 without a session', async () => {
    expect((await createGoal(post('/api/goals/create', goalBody(), SAME))).status).toBe(401);
    expect(m.inserted).toHaveLength(0);
  });

  it('403 when the body wallet differs from the session wallet', async () => {
    const res = await createGoal(
      post('/api/goals/create', { ...goalBody(), walletAddress: OTHER }, bearer(OWNER))
    );
    expect(res.status).toBe(403);
    expect(m.inserted).toHaveLength(0);
  });

  it('403 for a cross-site cookie request', async () => {
    const res = await createGoal(
      post('/api/goals/create', goalBody(), { ...cookie(OWNER), 'sec-fetch-site': 'cross-site' })
    );
    expect(res.status).toBe(403);
  });

  it('bearer success, body wallet matching (mobile shape)', async () => {
    const res = await createGoal(
      post('/api/goals/create', { ...goalBody(), walletAddress: OWNER }, bearer(OWNER))
    );
    expect(res.status).toBe(200);
    expect((m.inserted[0] as { wallet_address: string }).wallet_address).toBe(OWNER);
  });

  it('cookie success without a body wallet (web shape); wallet comes from the session', async () => {
    const res = await createGoal(post('/api/goals/create', goalBody(), { ...cookie(OWNER), ...SAME }));
    expect(res.status).toBe(200);
    expect((m.inserted[0] as { wallet_address: string }).wallet_address).toBe(OWNER);
  });
});

/* ---------- POST /api/goals/confirm ---------- */

describe('POST /api/goals/confirm', () => {
  const pendingGoal = (wallet: string) => ({
    id: GOAL,
    wallet_address: wallet,
    stake_amount: 0.5,
    status: 'pending_validation',
    stake_tx_signature: 'pending',
  });
  const body = { goalId: GOAL, signature: 'demo_tx_123' };

  it('401 without a session', async () => {
    expect((await confirmGoal(post('/api/goals/confirm', body, SAME))).status).toBe(401);
  });

  it('404 (no existence leak) when the goal belongs to someone else', async () => {
    m.result = { data: pendingGoal(OTHER), error: null };
    const res = await confirmGoal(post('/api/goals/confirm', body, bearer(OWNER)));
    expect(res.status).toBe(404);
  });

  it('owner succeeds via bearer and via same-origin cookie (demo signature)', async () => {
    m.result = { data: pendingGoal(OWNER), error: null };
    expect((await confirmGoal(post('/api/goals/confirm', body, bearer(OWNER)))).status).toBe(200);
    expect(
      (await confirmGoal(post('/api/goals/confirm', body, { ...cookie(OWNER), ...SAME }))).status
    ).toBe(200);
  });

  it('keeps the pending-signature guard for an already staked goal', async () => {
    m.result = { data: { ...pendingGoal(OWNER), stake_tx_signature: 'realsig' }, error: null };
    expect((await confirmGoal(post('/api/goals/confirm', body, bearer(OWNER)))).status).toBe(409);
  });

  it('cross-site cookie is blocked with 403', async () => {
    const res = await confirmGoal(
      post('/api/goals/confirm', body, { ...cookie(OWNER), 'sec-fetch-site': 'cross-site' })
    );
    expect(res.status).toBe(403);
  });
});

/* ---------- POST /api/upload/proof ---------- */

describe('POST /api/upload/proof', () => {
  process.env.CLOUDFLARE_R2_ENDPOINT = 'https://r2.example';
  process.env.CLOUDFLARE_R2_ACCESS_KEY = 'k';
  process.env.CLOUDFLARE_R2_SECRET_KEY = 's';
  process.env.CLOUDFLARE_R2_BUCKET = 'b';
  process.env.CLOUDFLARE_R2_PUBLIC_URL = 'https://cdn.example';

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  function upload(headers: Record<string, string>) {
    const form = new FormData();
    form.append('goalId', GOAL);
    form.append('file', new File([png], 'p.png', { type: 'image/png' }));
    return new NextRequest('http://localhost/api/upload/proof', { method: 'POST', headers, body: form });
  }

  it('401 without a session', async () => {
    expect((await uploadProof(upload({ ...SAME }))).status).toBe(401);
    expect(m.r2Send).not.toHaveBeenCalled();
  });

  it('404 for a missing goal and for another wallet goal', async () => {
    m.getGoalById.mockResolvedValue({ data: null, error: null });
    expect((await uploadProof(upload(bearer(OWNER)))).status).toBe(404);
    m.getGoalById.mockResolvedValue({ data: { id: GOAL, wallet_address: OTHER, status: 'active' }, error: null });
    expect((await uploadProof(upload(bearer(OWNER)))).status).toBe(404);
    expect(m.r2Send).not.toHaveBeenCalled();
  });

  it('409 when the goal is not active', async () => {
    m.getGoalById.mockResolvedValue({ data: { id: GOAL, wallet_address: OWNER, status: 'completed' }, error: null });
    expect((await uploadProof(upload(bearer(OWNER)))).status).toBe(409);
  });

  it('owner of an active goal can upload (bearer and cookie)', async () => {
    m.getGoalById.mockResolvedValue({ data: { id: GOAL, wallet_address: OWNER, status: 'active' }, error: null });
    expect((await uploadProof(upload(bearer(OWNER)))).status).toBe(200);
    expect((await uploadProof(upload({ ...cookie(OWNER), ...SAME }))).status).toBe(200);
    expect(m.r2Send).toHaveBeenCalledTimes(2);
  });

  it('cross-site cookie is blocked', async () => {
    const res = await uploadProof(upload({ ...cookie(OWNER), 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
  });
});

/* ---------- POST /api/proofs ---------- */

describe('POST /api/proofs (session layer)', () => {
  const body = {
    goal_id: GOAL,
    text_description: 'did it',
    timestamp: Date.now(),
    signature: 'x'.repeat(88),
  };

  it('401 without a session', async () => {
    expect((await submitProof(post('/api/proofs', body, SAME))).status).toBe(401);
    expect(m.getGoalById).not.toHaveBeenCalled();
  });

  it('404 when the session wallet does not own the goal', async () => {
    m.getGoalById.mockResolvedValue({ data: { id: GOAL, wallet_address: OTHER, status: 'active' }, error: null });
    expect((await submitProof(post('/api/proofs', body, bearer(OWNER)))).status).toBe(404);
  });

  it('owner passes the session check and still needs a valid wallet signature (401)', async () => {
    m.getGoalById.mockResolvedValue({ data: { id: GOAL, wallet_address: OWNER, status: 'active' }, error: null });
    expect((await submitProof(post('/api/proofs', body, bearer(OWNER)))).status).toBe(401);
    expect((await submitProof(post('/api/proofs', body, { ...cookie(OWNER), ...SAME }))).status).toBe(401);
  });

  it('cross-site cookie is blocked before any lookup', async () => {
    const res = await submitProof(post('/api/proofs', body, { ...cookie(OWNER), 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
    expect(m.getGoalById).not.toHaveBeenCalled();
  });
});
