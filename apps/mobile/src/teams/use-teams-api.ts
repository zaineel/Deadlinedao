import { useMemo } from 'react';
import { useAuth } from '../auth/auth-context';
import { createTeamsApi } from '../api/teams';
import { ApiError } from '../api/client';
import { errorMessage } from '../ui/kit';

export function useTeamsApi() {
  const { api } = useAuth();
  return useMemo(() => createTeamsApi(api), [api]);
}

/** Friendly text for the failure states every teams screen shares (404 also covers the flag being off). */
export function teamsErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 404 && /^Request failed/.test(e.message)) return 'Teams are not available right now.';
  return errorMessage(e);
}
