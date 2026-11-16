import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';
import { toBase58, fromBase58, utf8Bytes } from '../src/wallet/encoding';
import {
  createDappKeyPair,
  decryptPayload,
  deriveSharedSecret,
  encryptPayload,
} from '../src/wallet/phantom/crypto';
import {
  buildConnectUrl,
  buildEncryptedActionUrl,
  parseCallbackUrl,
} from '../src/wallet/phantom/links';
import { PhantomWalletProvider } from '../src/wallet/phantom/provider';
import type { KeyValueStore } from '../src/wallet/types';

const rand = (n: number) => nacl.randomBytes(n);

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

function query(url: string): Record<string, string> {
  const u = new URL(url);
  return Object.fromEntries(u.searchParams.entries());
}

describe('phantom links', () => {
  it('builds the connect URL with all required params', () => {
    const url = buildConnectUrl({
      appUrl: 'https://app.example.com',
      dappPublicKey: 'DAPPKEY',
      redirectLink: 'deadlinedao://phantom/connect',
      cluster: 'devnet',
    });
    expect(url.startsWith('https://phantom.app/ul/v1/connect?')).toBe(true);
    expect(query(url)).toEqual({
      app_url: 'https://app.example.com',
      dapp_encryption_public_key: 'DAPPKEY',
      redirect_link: 'deadlinedao://phantom/connect',
      cluster: 'devnet',
    });
  });

  it('builds signMessage / signAndSendTransaction URLs', () => {
    const url = buildEncryptedActionUrl('signMessage', {
      dappPublicKey: 'K',
      nonce: 'N',
      redirectLink: 'deadlinedao://phantom/signMessage',
      payload: 'P',
    });
    expect(url.startsWith('https://phantom.app/ul/v1/signMessage?')).toBe(true);
    expect(query(url)).toEqual({
      dapp_encryption_public_key: 'K',
      nonce: 'N',
      redirect_link: 'deadlinedao://phantom/signMessage',
      payload: 'P',
    });
    expect(
      buildEncryptedActionUrl('signAndSendTransaction', { dappPublicKey: 'K', nonce: 'N', redirectLink: 'r', payload: 'P' })
    ).toContain('/ul/v1/signAndSendTransaction?');
  });

  it('parses callbacks, including errors and encoded values', () => {
    expect(parseCallbackUrl('deadlinedao://phantom/connect?data=abc&nonce=n%2B1&phantom_encryption_public_key=pk')).toEqual({
      action: 'connect',
      params: { data: 'abc', nonce: 'n+1', phantom_encryption_public_key: 'pk' },
    });
    expect(parseCallbackUrl('deadlinedao://phantom/signMessage?errorCode=4001&errorMessage=User%20rejected')).toEqual({
      action: 'signMessage',
      params: { errorCode: '4001', errorMessage: 'User rejected' },
    });
    expect(parseCallbackUrl('exp://192.168.1.2:8081/--/phantom/connect?data=x')?.action).toBe('connect');
    expect(parseCallbackUrl('deadlinedao://goals/123')).toBeNull();
  });
});

describe('phantom encryption', () => {
  it('both sides derive the same secret and round-trip a payload', () => {
    const dapp = createDappKeyPair(rand);
    const phantom = nacl.box.keyPair();
    const dappShared = deriveSharedSecret(toBase58(phantom.publicKey), dapp.secretKey);
    const phantomShared = nacl.box.before(dapp.publicKey, phantom.secretKey);
    expect(Buffer.from(dappShared).equals(Buffer.from(phantomShared))).toBe(true);

    const enc = encryptPayload({ message: 'hi', session: 's' }, dappShared, rand);
    expect(decryptPayload(enc.payload, enc.nonce, phantomShared)).toEqual({ message: 'hi', session: 's' });
  });

  it('rejects tampered ciphertext and wrong keys', () => {
    const a = nacl.box.keyPair();
    const b = nacl.box.keyPair();
    const shared = nacl.box.before(b.publicKey, a.secretKey);
    const enc = encryptPayload({ x: 1 }, shared, rand);
    const bytes = fromBase58(enc.payload);
    bytes[0] ^= 0xff;
    expect(() => decryptPayload(toBase58(bytes), enc.nonce, shared)).toThrow();
    const other = nacl.box.before(b.publicKey, nacl.box.keyPair().secretKey);
    expect(() => decryptPayload(enc.payload, enc.nonce, other)).toThrow();
  });
});

/** A fake Phantom app that answers deep links the way the real one does. */
function makeFakePhantom(provider: () => PhantomWalletProvider) {
  const phantomKp = nacl.box.keyPair();
  const wallet = nacl.sign.keyPair();
  const walletAddress = toBase58(wallet.publicKey);
  const opened: string[] = [];
  let reject: { code: string; message: string } | null = null;

  const openUrl = async (url: string) => {
    opened.push(url);
    const q = query(url);
    const action = url.match(/\/ul\/v1\/(\w+)\?/)![1];
    const redirect = q.redirect_link;
    queueMicrotask(() => {
      if (reject) {
        provider().handleRedirect(`${redirect}?errorCode=${reject.code}&errorMessage=${encodeURIComponent(reject.message)}`);
        return;
      }
      const dappPub = fromBase58(q.dapp_encryption_public_key);
      const shared = nacl.box.before(dappPub, phantomKp.secretKey);
      let body: unknown;
      if (action === 'connect') {
        body = { public_key: walletAddress, session: 'SESSION1' };
      } else {
        const req = decryptPayload<{ session: string; message?: string; transaction?: string }>(q.payload, q.nonce, shared);
        expect(req.session).toBe('SESSION1');
        if (action === 'signMessage') {
          body = { signature: toBase58(nacl.sign.detached(fromBase58(req.message!), wallet.secretKey)) };
        } else {
          body = { signature: 'TXSIG' + req.transaction!.length };
        }
      }
      const enc = encryptPayload(body, shared, rand);
      const extra = action === 'connect' ? `&phantom_encryption_public_key=${toBase58(phantomKp.publicKey)}` : '';
      provider().handleRedirect(`${redirect}?nonce=${enc.nonce}&data=${enc.payload}${extra}`);
    });
  };
  return {
    openUrl,
    opened,
    wallet,
    walletAddress,
    rejectNext: (code: string, message: string) => {
      reject = { code, message };
    },
  };
}

describe('PhantomWalletProvider (against a fake Phantom)', () => {
  function setup(store = memoryStore()) {
    let p!: PhantomWalletProvider;
    const fake = makeFakePhantom(() => p);
    p = new PhantomWalletProvider({
      storage: store,
      randomBytes: rand,
      openUrl: fake.openUrl,
      appUrl: 'https://app.example.com',
      redirectBase: 'deadlinedao://phantom',
      cluster: 'devnet',
      timeoutMs: 500,
    });
    return { p, fake, store };
  }

  it('connects, signs a message verifiably, and signs+sends a transaction', async () => {
    const { p, fake } = setup();
    expect(await p.connect()).toBe(fake.walletAddress);
    expect(p.publicKey).toBe(fake.walletAddress);

    const msg = utf8Bytes('hello deadlinedao');
    const sig = await p.signMessage(msg);
    expect(nacl.sign.detached.verify(msg, sig, fake.wallet.publicKey)).toBe(true);

    const txSig = await p.signAndSendTransaction(new Uint8Array([1, 2, 3, 4]));
    expect(txSig.startsWith('TXSIG')).toBe(true);
  });

  it('surfaces wallet rejection as a WalletError with the code', async () => {
    const { p, fake } = setup();
    fake.rejectNext('4001', 'User rejected the request');
    await expect(p.connect()).rejects.toMatchObject({ name: 'WalletError', code: '4001' });
  });

  it('refuses to sign when not connected', async () => {
    const { p } = setup();
    await expect(p.signMessage(new Uint8Array([1]))).rejects.toThrow('not connected');
  });

  it('restores a persisted connection and clears it on disconnect', async () => {
    const store = memoryStore();
    const first = setup(store);
    await first.p.connect();
    expect(store.data.size).toBe(1);

    // New provider instance, same storage: no wallet round trip needed to be "connected"
    const second = setup(store);
    expect(await second.p.restore()).toBe(first.fake.walletAddress);
    await second.p.disconnect();
    expect(second.p.publicKey).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('times out when the wallet never answers, and ignores unrelated links', async () => {
    let p!: PhantomWalletProvider;
    p = new PhantomWalletProvider({
      storage: memoryStore(),
      randomBytes: rand,
      openUrl: async () => undefined,
      appUrl: 'https://a',
      redirectBase: 'deadlinedao://phantom',
      cluster: 'devnet',
      timeoutMs: 20,
    });
    expect(p.handleRedirect('deadlinedao://phantom/connect?data=x')).toBe(false);
    await expect(p.connect()).rejects.toThrow('Timed out');
  });
});
