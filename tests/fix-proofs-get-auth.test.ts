import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getProofsByGoal: vi.fn(),
  getGoalById: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createProof: vi.fn(),
  updateProofWithValidation: vi.fn(),
  getProofsByGoal: m.getProofsByGoal,
  getGoalById: m.getGoalById,
  transitionGoalStatus: vi.fn(),
}));
vi.mock('@/lib/snowflake', () => ({
  validateProof: vi.fn(),
  logValidation: vi.fn(),
  AIPerformanceMonitor: class {},
}));
vi.mock('@/lib/solana', () => ({ returnStake: vi.fn() }));

import { GET } from '@/app/api/proofs/route';
import { issueSession } from '@/lib/auth/session';

const GOAL = '3f8b0f6e-6a3c-4d64-9b0e-2f6e7a1c9d10';
const OWNER = 'OwnerWallet111111111111111111111111111111111';

function req(headers: Record<string, string> = {}, goalId: string | null = GOAL) {
  const url = `http://localhost/api/proofs${goalId ? `?goal_id=${goalId}` : ''}`;
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = 'b'.repeat(40);
  process.env.ADMIN_API_KEY = 'admin-secret-key';
  m.getGoalById.mockResolvedValue({ data: { id: GOAL, wallet_address: OWNER }, error: null });
  m.getProofsByGoal.mockResolvedValue({ data: [{ id: 'p1', text_description: 'secret' }], error: null });
});

describe('GET /api/proofs auth', () => {
  it('rejects anonymous callers', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(m.getProofsByGoal).not.toHaveBeenCalled();
  });

  it('validates the goal id', async () => {
    expect((await GET(req({}, 'nope'))).status).toBe(400);
    expect((await GET(req({}, null))).status).toBe(400);
  });

  it('allows the admin key', async () => {
    const res = await GET(req({ 'x-admin-key': 'admin-secret-key' }));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });

  it('rejects a wrong admin key without a session', async () => {
    const res = await GET(req({ 'x-admin-key': 'wrong-key-value!' }));
    expect(res.status).toBe(401);
  });

  it('allows the session wallet that owns the goal', async () => {
    const token = issueSession(OWNER);
    const res = await GET(req({ authorization: `Bearer ${token}` }));
    expect(res.status).toBe(200);
  });

  it('hides the goal from a different wallet (404)', async () => {
    const token = issueSession('OtherWallet11111111111111111111111111111111');
    const res = await GET(req({ authorization: `Bearer ${token}` }));
    expect(res.status).toBe(404);
    expect(m.getProofsByGoal).not.toHaveBeenCalled();
  });
});
