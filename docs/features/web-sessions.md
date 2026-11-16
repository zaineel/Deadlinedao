# Web sessions

The web app now signs in with the wallet (free message signature) and the server
derives the user's wallet from the session. A `walletAddress` in a request body or
query string is never trusted.

## What changed
- `components/auth/SessionProvider.tsx` (`useSession`): `{ wallet, status, error, signIn, signOut, authFetch }`.
  Flow: `POST /api/auth/nonce` -> `wallet.signMessage` -> `POST /api/auth/verify`; the server sets the httpOnly
  `dd_session` cookie. The session is restored on load via `GET /api/auth/session`. A session for a different wallet
  than the connected one counts as signed out (re-prompt). Wallets without `signMessage` get a clear error.
- `WalletButton` shows Sign in / Sign out next to the wallet button. Dashboard and Create are gated by `SignInGate`.
- `authFetch` sends credentials and, on a 401 whose session is really gone, prompts sign-in once and retries.
- `GET /api/features` returns `{disputes, teams, orgs, push, governance}` booleans (public, no secrets); `useFeatures()` hook.
  The header shows Teams / Organizations only when enabled; completed goals get a share toggle when `push` is on.

## Route contract
| Route | Auth | Notes |
|---|---|---|
| `POST /api/goals/create` | session + CSRF rule | body `walletAddress` optional; if present must equal the session wallet, else 403 |
| `POST /api/goals/confirm` | session + CSRF rule | goal must belong to the session wallet, else 404 |
| `GET /api/goals` | session | returns the session wallet's goals; `?wallet=` optional, must equal session wallet else 403 |
| `POST /api/upload/proof` | session + CSRF rule | goal must exist, be owned by the session wallet (else 404) and be `active` (else 409) |
| `POST /api/proofs` | session + CSRF rule + per-request wallet signature | goal must be owned by the session wallet (404) |
| `GET /api/prize-pool`, `/api/platform-stats`, `/api/analytics/*` | public | aggregate endpoints, unchanged |

Status codes: **401** no/invalid/expired session; **403** wallet mismatch or cross-site cookie request;
**404** goal missing or not yours (indistinguishable on purpose).

## Cookie vs bearer
`requireSession` accepts `Authorization: Bearer <token>` (mobile app) or the `dd_session` cookie (web). Bearer wins when
both are present. The token is the same HS256 session token either way.

## CSRF rule
The cookie is `SameSite=Lax`. In addition, state-changing routes (`lib/auth/csrf.ts`,
`requireUserSession(req, { mutating: true })`) accept a cookie-authenticated request only if it is same-origin:
`Sec-Fetch-Site: same-origin`, or, when that header is absent, an `Origin` whose host equals the request host
(`X-Forwarded-Host` honored). A cookie request with neither is rejected with 403. Bearer requests are exempt
(browsers never attach that header on their own).

## Env
`SESSION_SECRET` (at least 32 chars) is required; without it nonce/verify return 503 and every session check fails closed.
Sessions last 24h and cannot be revoked server-side (logout only clears the cookie).
