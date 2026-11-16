/**
 * Feature flags for roadmap work. Everything ships dark: a feature's routes
 * return 404 and its UI is hidden unless FEATURE_<NAME>=true is set.
 */
export type Feature = 'disputes' | 'teams' | 'orgs' | 'push' | 'governance';

export function isFeatureEnabled(feature: Feature): boolean {
  return process.env[`FEATURE_${feature.toUpperCase()}`] === 'true';
}

/** For route handlers: returns a 404 Response when the feature is off, else null. */
export function featureDisabledResponse(feature: Feature): Response | null {
  return isFeatureEnabled(feature)
    ? null
    : new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
}
