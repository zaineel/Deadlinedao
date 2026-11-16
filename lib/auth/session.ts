import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyWalletSignature } from '@/lib/auth/wallet';

/**
 * Sign-in-with-wallet sessions.
 *
 * Flow: POST /api/auth/nonce -> wallet signs the returned message ->
 * POST /api/auth/verify -> session token (also set as httpOnly cookie).
 *
 * NOTES
 * - Nonces are STATELESS (HMAC-signed, 5-minute expiry, no server storage), so
 *   a nonce can be reused within its 5-minute window.
 * - Sessions are BEARER tokens: anyone holding the token acts as the wallet
 *   until it expires. There is no server-side revocation.
 * - SESSION_SECRET (>= 32 chars) is required; there is no default.
 */

export const SESSION_COOKIE = 'dd_session';
export const NONCE_TTL_SECONDS = 5 * 60;
export const SIGN_IN_MAX_AGE_MS = NONCE_TTL_SECONDS * 1000;
const FUTURE_SKEW_MS = 30_000;
const DEFAULT_SESSION_TTL = 24 * 3600;
const DOMAIN_LABEL = 'DeadlineDAO';

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return Buffer.from(secret, 'utf8');
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function hmac(purpose: string, data: string): Buffer {
  // purpose gives domain separation so nonces can never be used as sessions
  return createHmac('sha256', getSecret()).update(`${purpose}.${data}`).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Stateless nonce: `<payload>.<sig>` with payload {r, exp}. Throws if SESSION_SECRET is unusable. */
export function createNonce(): string {
  const body = b64url(
    JSON.stringify({
      r: randomBytes(16).toString('hex'),
      exp: Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS,
    })
  );
  return `${body}.${b64url(hmac('nonce', body))}`;
}

function nonceValid(nonce: string): boolean {
  const parts = nonce.split('.');
  if (parts.length !== 2) return false;
  if (!safeEqual(Buffer.from(parts[1], 'base64url'), hmac('nonce', parts[0]))) return false;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return typeof p.exp === 'number' && p.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function buildSignInMessage(params: {
  wallet: string;
  nonce: string;
  issuedAt: number;
}): string {
  const { wallet, nonce, issuedAt } = params;
  return [
    `${DOMAIN_LABEL} wants you to sign in with your Solana wallet.`,
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAt).toISOString()} (${issuedAt})`,
    '',
    'Signing is free and does not send a transaction.',
  ].join('\n');
}

/** Validate nonce + freshness + wallet signature. Returns false on any problem. */
export function verifySignIn(params: {
  wallet: string;
  nonce: string;
  issuedAt: number;
  signature: string;
}): boolean {
  const { wallet, nonce, issuedAt, signature } = params;
  try {
    if (!nonceValid(nonce)) return false;
  } catch {
    return false; // includes missing SESSION_SECRET: fail closed
  }
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() - issuedAt;
  if (age > SIGN_IN_MAX_AGE_MS || age < -FUTURE_SKEW_MS) return false;
  return verifyWalletSignature(wallet, buildSignInMessage({ wallet, nonce, issuedAt }), signature);
}

const JWT_HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

/** Issue an HS256 token. Throws if SESSION_SECRET is unusable. */
export function issueSession(wallet: string, ttlSeconds = DEFAULT_SESSION_TTL): string {
  const iat = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ sub: wallet, iat, exp: iat + ttlSeconds }));
  const signingInput = `${JWT_HEADER}.${body}`;
  return `${signingInput}.${b64url(hmac('session', signingInput))}`;
}

export function verifySession(token: string): { wallet: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== JWT_HEADER) return null;
    const signingInput = `${parts[0]}.${parts[1]}`;
    if (!safeEqual(Buffer.from(parts[2], 'base64url'), hmac('session', signingInput))) return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof p.sub !== 'string' || typeof p.exp !== 'number') return null;
    if (p.exp <= Math.floor(Date.now() / 1000)) return null;
    return { wallet: p.sub, exp: p.exp };
  } catch {
    return null; // includes missing SESSION_SECRET: fail closed
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Token from `Authorization: Bearer <token>` or the `dd_session` cookie. */
export function getSessionFromRequest(
  request: Request | NextRequest
): { wallet: string; exp: number } | null {
  const auth = request.headers.get('authorization');
  const m = auth?.match(/^Bearer\s+(\S+)$/i);
  const token = m?.[1] ?? readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  return token ? verifySession(token) : null;
}

export function requireSession(
  request: Request | NextRequest
): { ok: true; wallet: string } | { ok: false; response: NextResponse } {
  const session = getSessionFromRequest(request);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true, wallet: session.wallet };
}

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

export function setSessionCookie(
  response: NextResponse,
  token: string,
  ttlSeconds = DEFAULT_SESSION_TTL
): void {
  response.cookies.set(SESSION_COOKIE, token, { ...cookieBase(), maxAge: ttlSeconds });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { ...cookieBase(), maxAge: 0 });
}
