import { isFeatureEnabled, featureDisabledResponse } from '@/lib/config/features';

/** Governance only runs on top of disputes: both flags must be on. */
export function isGovernanceEnabled(): boolean {
  return isFeatureEnabled('governance') && isFeatureEnabled('disputes');
}

/** 404 Response when governance (or disputes) is off, else null. */
export function governanceDisabledResponse(): Response | null {
  return featureDisabledResponse('governance') ?? featureDisabledResponse('disputes');
}
