import type {
  CreateGoalInput,
  CreateGoalResponse,
  Goal,
  NonceResponse,
  PushRegisterInput,
  ShareGoalResponse,
  SubmitProofInput,
  SubmitProofResponse,
  VerifyResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  /** Called on any 401 for an authenticated request, e.g. to sign the user out. */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

export interface UploadFile {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png';
}

export type Optional<T> = { available: true; data: T } | { available: false };

export function createApiClient(opts: ApiClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, '');
  const doFetch: typeof fetch = (...args) => (opts.fetchImpl ?? fetch)(...args);

  async function request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    init: { json?: unknown; form?: FormData; auth?: boolean } = {}
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = init.auth === false ? null : await opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.json);
    } else if (init.form) {
      body = init.form; // fetch sets the multipart boundary itself
    }

    const res = await doFetch(`${base}${path}`, { method, headers, body });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      if (res.status === 401 && token) opts.onUnauthorized?.();
      const msg =
        payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `Request failed (${res.status})`;
      throw new ApiError(msg, res.status);
    }
    return payload as T;
  }

  /** For endpoints that may not exist (feature flag off / backend PR not merged): 404/405 => unavailable. */
  async function optional<T>(call: () => Promise<T>): Promise<Optional<T>> {
    try {
      return { available: true, data: await call() };
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return { available: false };
      throw e;
    }
  }

  return {
    getNonce: (wallet: string) => request<NonceResponse>('POST', '/api/auth/nonce', { json: { wallet }, auth: false }),
    verify: (p: { wallet: string; nonce: string; issuedAt: number; signature: string }) =>
      request<VerifyResponse>('POST', '/api/auth/verify', { json: p, auth: false }),

    getGoals: async (wallet: string) =>
      (await request<{ goals: Goal[] }>('GET', `/api/goals?wallet=${encodeURIComponent(wallet)}`)).goals,
    getGoal: async (id: string) => (await request<{ goal: Goal }>('GET', `/api/goals/${encodeURIComponent(id)}`)).goal,
    createGoal: (input: CreateGoalInput) => request<CreateGoalResponse>('POST', '/api/goals/create', { json: input }),
    confirmGoal: (goalId: string, signature: string) =>
      request<{ success: boolean; goal: Goal }>('POST', '/api/goals/confirm', { json: { goalId, signature } }),

    uploadProofImage: async (goalId: string, file: UploadFile) => {
      const form = new FormData();
      form.append('goalId', goalId);
      // React Native's FormData accepts a { uri, name, type } descriptor in place of a Blob.
      form.append('file', file as unknown as Blob);
      return request<{ success: boolean; url: string }>('POST', '/api/upload/proof', { form });
    },
    submitProof: (input: SubmitProofInput) => request<SubmitProofResponse>('POST', '/api/proofs', { json: input }),

    /**
     * POST /api/goals/share { goalId, share } -> { success, shared }. Owner-only, completed goals only
     * (404 also covers "not found / not yours / not completed" and FEATURE_PUSH off).
     * The public page lives at /p/<goalId>.
     */
    shareGoal: (goalId: string, share = true) =>
      optional(async (): Promise<ShareGoalResponse> => {
        const res = await request<{ success?: boolean; shared?: boolean }>('POST', '/api/goals/share', {
          json: { goalId, share },
        });
        return { shared: res.shared ?? share, url: `${base}/p/${encodeURIComponent(goalId)}` };
      }),
    /** POST /api/push/register (behind FEATURE_PUSH). Unavailable when the flag is off. */
    registerPush: (input: PushRegisterInput) =>
      optional(() => request<{ success?: boolean }>('POST', '/api/push/register', { json: input })),
    /** Generic authenticated request, exposed for the per-feature API modules (src/api/<feature>.ts). */
    request,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
