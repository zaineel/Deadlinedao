import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { createPrivateKey, sign } from 'crypto';
import {
  createNonce,
  buildSignInMessage,
  verifySignIn,
  issueSession,
  verifySession,
  getSessionFromRequest,
  requireSession,
} from '@/lib/auth/session';

const SECRET = 'a'.repeat(32) + 'primary-secret';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function signMsg(kp: Keypair, message: string) {
  const key = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(kp.secretKey.slice(0, 32))]),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, Buffer.from(message), key).toString('base64');
}

function signIn(kp: Keypair, nonce = createNonce(), issuedAt = Date.now()) {
  const wallet = kp.publicKey.toBase58();
  const signature = signMsg(kp, buildSignInMessage({ wallet, nonce, issuedAt }));
  return { wallet, nonce, issuedAt, signature };
}

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('sign-in', () => {
  const kp = Keypair.generate();

  it('accepts a valid sign-in', () => {
    expect(verifySignIn(signIn(kp))).toBe(true);
  });
  it('message includes domain, wallet, nonce and issued-at', () => {
    const p = signIn(kp);
    const m = buildSignInMessage(p);
    expect(m).toContain('DeadlineDAO');
    expect(m).toContain(p.wallet);
    expect(m).toContain(p.nonce);
    expect(m).toContain(String(p.issuedAt));
  });
  it('rejects a tampered nonce', () => {
    const p = signIn(kp);
    const bad = { ...p, nonce: p.nonce.slice(0, -2) + (p.nonce.endsWith('AA') ? 'BB' : 'AA') };
    expect(verifySignIn(bad)).toBe(false);
  });
  it('rejects a nonce signed with a different secret', () => {
    process.env.SESSION_SECRET = 'b'.repeat(40);
    const foreign = createNonce();
    process.env.SESSION_SECRET = SECRET;
    expect(verifySignIn(signIn(kp, foreign))).toBe(false);
  });
  it('rejects an expired nonce', () => {
    vi.useFakeTimers();
    const p = signIn(kp);
    vi.advanceTimersByTime(6 * 60_000);
    expect(verifySignIn(p)).toBe(false);
  });
  it('rejects stale and future issuedAt', () => {
    expect(verifySignIn(signIn(kp, createNonce(), Date.now() - 10 * 60_000))).toBe(false);
    expect(verifySignIn(signIn(kp, createNonce(), Date.now() + 10 * 60_000))).toBe(false);
  });
  it('rejects a signature from the wrong wallet', () => {
    const p = signIn(kp);
    const other = Keypair.generate();
    expect(verifySignIn({ ...p, signature: signMsg(other, buildSignInMessage(p)) })).toBe(false);
    expect(verifySignIn({ ...p, wallet: other.publicKey.toBase58() })).toBe(false);
  });
});

describe('session tokens', () => {
  const wallet = Keypair.generate().publicKey.toBase58();

  it('round-trips', () => {
    expect(verifySession(issueSession(wallet))?.wallet).toBe(wallet);
  });
  it('rejects expired tokens', () => {
    vi.useFakeTimers();
    const t = issueSession(wallet, 60);
    vi.advanceTimersByTime(61_000);
    expect(verifySession(t)).toBeNull();
  });
  it('rejects tampered tokens', () => {
    const [h, , s] = issueSession(wallet).split('.');
    const body = Buffer.from(
      JSON.stringify({ sub: 'attacker', exp: Math.floor(Date.now() / 1000) + 9999 })
    ).toString('base64url');
    expect(verifySession(`${h}.${body}.${s}`)).toBeNull();
    expect(verifySession('garbage')).toBeNull();
  });
  it('rejects tokens from a foreign secret', () => {
    process.env.SESSION_SECRET = 'c'.repeat(40);
    const t = issueSession(wallet);
    process.env.SESSION_SECRET = SECRET;
    expect(verifySession(t)).toBeNull();
  });
  it('fails closed without a usable SESSION_SECRET', () => {
    const t = issueSession(wallet);
    delete process.env.SESSION_SECRET;
    expect(() => issueSession(wallet)).toThrow();
    expect(() => createNonce()).toThrow();
    expect(verifySession(t)).toBeNull();
    process.env.SESSION_SECRET = 'short';
    expect(() => issueSession(wallet)).toThrow();
    expect(verifySession(t)).toBeNull();
  });
});

describe('request extraction', () => {
  const wallet = Keypair.generate().publicKey.toBase58();

  it('reads a bearer token', () => {
    const r = new Request('http://x/', { headers: { authorization: `Bearer ${issueSession(wallet)}` } });
    expect(getSessionFromRequest(r)?.wallet).toBe(wallet);
  });
  it('reads the dd_session cookie', () => {
    const r = new Request('http://x/', {
      headers: { cookie: `a=b; dd_session=${issueSession(wallet)}; c=d` },
    });
    expect(getSessionFromRequest(r)?.wallet).toBe(wallet);
  });
  it('requireSession returns 401 without a valid token', () => {
    const r = requireSession(new Request('http://x/'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
    expect(
      requireSession(new Request('http://x/', { headers: { authorization: 'Bearer nope' } })).ok
    ).toBe(false);
  });
  it('requireSession returns the wallet', () => {
    const r = requireSession(
      new Request('http://x/', { headers: { authorization: `Bearer ${issueSession(wallet)}` } })
    );
    expect(r).toEqual({ ok: true, wallet });
  });
});
