import type { ApiClient } from '../api/client';

/** GET /api/features: public booleans (no auth). */
export interface Features {
  disputes: boolean;
  teams: boolean;
  orgs: boolean;
  push: boolean;
  governance: boolean;
}

export const NO_FEATURES: Features = { disputes: false, teams: false, orgs: false, push: false, governance: false };

/** Coerce an untrusted payload into Features; anything not strictly `true` is off. */
export function parseFeatures(raw: unknown): Features {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    disputes: o.disputes === true,
    teams: o.teams === true,
    orgs: o.orgs === true,
    push: o.push === true,
    governance: o.governance === true,
  };
}

/** Fails closed: on any error every feature is reported off. */
export async function fetchFeatures(api: Pick<ApiClient, 'request'>): Promise<Features> {
  try {
    return parseFeatures(await api.request<unknown>('GET', '/api/features', { auth: false }));
  } catch {
    return NO_FEATURES;
  }
}
