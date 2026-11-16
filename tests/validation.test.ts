import { describe, it, expect } from 'vitest';
import {
  createGoalSchema,
  submitProofSchema,
  dateOnlySchema,
} from '@/lib/validation/schemas';

const wallet = '11111111111111111111111111111111';
const goal = {
  title: 'Ship it',
  description: 'Finish the feature',
  deadline: new Date(Date.now() + 86_400_000).toISOString(),
  category: 'work',
  stakeAmount: '0.5',
  walletAddress: wallet,
};

describe('createGoalSchema', () => {
  it('accepts a valid goal and coerces the stake', () => {
    const r = createGoalSchema.safeParse(goal);
    expect(r.success && r.data.stakeAmount).toBe(0.5);
  });
  it.each([
    ['non-numeric stake', { stakeAmount: 'abc' }],
    ['negative stake', { stakeAmount: -1 }],
    ['stake over the cap', { stakeAmount: 5000 }],
    ['more than 4 decimals', { stakeAmount: 0.00001 }],
    ['past deadline', { deadline: '2020-01-01' }],
    ['unknown category', { category: 'fun' }],
    ['bad wallet', { walletAddress: 'nope' }],
  ])('rejects %s', (_name, patch) => {
    expect(createGoalSchema.safeParse({ ...goal, ...patch }).success).toBe(false);
  });
});

describe('submitProofSchema', () => {
  const proof = {
    goal_id: '3f2b8c1e-9d4a-4b6e-8a1f-2c3d4e5f6a7b',
    text_description: 'did it',
    timestamp: Date.now(),
    signature: 'a'.repeat(88),
  };
  it('accepts a proof without an image', () => {
    expect(submitProofSchema.safeParse(proof).success).toBe(true);
    expect(submitProofSchema.safeParse({ ...proof, image_url: null }).success).toBe(true);
  });
  it('rejects non-https images and bad ids', () => {
    expect(submitProofSchema.safeParse({ ...proof, image_url: 'http://x.com/a.png' }).success).toBe(false);
    expect(submitProofSchema.safeParse({ ...proof, goal_id: '1' }).success).toBe(false);
  });
});

describe('dateOnlySchema', () => {
  it('only accepts real YYYY-MM-DD dates', () => {
    expect(dateOnlySchema.safeParse('2026-11-16').success).toBe(true);
    expect(dateOnlySchema.safeParse('2026-13-45').success).toBe(false);
    expect(dateOnlySchema.safeParse('tomorrow').success).toBe(false);
  });
});
