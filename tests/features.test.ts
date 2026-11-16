import { describe, it, expect, afterEach } from 'vitest';
import { isFeatureEnabled, featureDisabledResponse } from '@/lib/config/features';

afterEach(() => { delete process.env.FEATURE_TEAMS; });

describe('feature flags', () => {
  it('are off by default', () => {
    expect(isFeatureEnabled('teams')).toBe(false);
    expect(featureDisabledResponse('teams')?.status).toBe(404);
  });
  it('turn on only with exactly "true"', () => {
    process.env.FEATURE_TEAMS = 'true';
    expect(isFeatureEnabled('teams')).toBe(true);
    expect(featureDisabledResponse('teams')).toBeNull();
    process.env.FEATURE_TEAMS = '1';
    expect(isFeatureEnabled('teams')).toBe(false);
  });
});
