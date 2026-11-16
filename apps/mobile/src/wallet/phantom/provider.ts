import { fromBase58, toBase58 } from '../encoding';
import { KeyValueStore, WalletError, WalletProvider } from '../types';
import {
  createDappKeyPair,
  decryptPayload,
  deriveSharedSecret,
  encryptPayload,
  DappKeyPair,
  RandomBytes,
} from './crypto';
import {
  buildConnectUrl,
  buildEncryptedActionUrl,
  parseCallbackUrl,
  PhantomAction,
  PhantomCluster,
} from './links';

const STORAGE_KEY = 'dd.phantom.v1';
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

export interface PhantomProviderDeps {
  storage: KeyValueStore;
  randomBytes: RandomBytes;
  /** Opens a URL (Linking.openURL). Phantom's universal link opens the app or falls back to the web. */
  openUrl: (url: string) => Promise<unknown>;
  /** https URL shown to the user by Phantom as the requesting app. */
  appUrl: string;
  /** App URL scheme base, e.g. `deadlinedao://phantom`. `/<action>` is appended. */
  redirectBase: string;
  cluster: PhantomCluster;
  timeoutMs?: number;
}

interface Pending {
  resolve: (params: Record<string, string>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PersistedState {
  dappSecretKey: string; // base58
  dappPublicKey: string; // base58
  phantomPublicKey: string; // base58 (phantom_encryption_public_key)
  session: string;
  wallet: string;
}

/**
 * Phantom deep-link wallet. One request may be in flight per action; the
 * response arrives as a redirect into our app, which the app forwards to
 * handleRedirect(). State (dapp key pair, Phantom session) is persisted so a
 * relaunch does not require another connect approval.
 */
export class PhantomWalletProvider implements WalletProvider {
  readonly name = 'Phantom';
  private keyPair: DappKeyPair | null = null;
  private sharedSecret: Uint8Array | null = null;
  private phantomPublicKey: string | null = null;
  private session: string | null = null;
  private wallet: string | null = null;
  private pending = new Map<string, Pending>();

  constructor(private readonly deps: PhantomProviderDeps) {}

  get publicKey(): string | null {
    return this.wallet;
  }

  async restore(): Promise<string | null> {
    try {
      const raw = await this.deps.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as PersistedState;
      const secretKey = fromBase58(s.dappSecretKey);
      this.keyPair = { secretKey, publicKey: fromBase58(s.dappPublicKey) };
      this.phantomPublicKey = s.phantomPublicKey;
      this.sharedSecret = deriveSharedSecret(s.phantomPublicKey, secretKey);
      this.session = s.session;
      this.wallet = s.wallet;
      return this.wallet;
    } catch {
      await this.clearState();
      return null;
    }
  }

  async connect(): Promise<string> {
    // Fresh key pair per connection
    this.keyPair = createDappKeyPair(this.deps.randomBytes);
    const dappPublicKey = toBase58(this.keyPair.publicKey);
    const url = buildConnectUrl({
      appUrl: this.deps.appUrl,
      dappPublicKey,
      redirectLink: this.redirect('connect'),
      cluster: this.deps.cluster,
    });
    const params = await this.request('connect', url);

    const phantomPub = params.phantom_encryption_public_key;
    if (!phantomPub || !params.data || !params.nonce) {
      throw new WalletError('Unexpected response from Phantom');
    }
    const shared = deriveSharedSecret(phantomPub, this.keyPair.secretKey);
    const data = decryptPayload<{ public_key: string; session: string }>(params.data, params.nonce, shared);
    if (!data.public_key || !data.session) throw new WalletError('Unexpected response from Phantom');

    this.sharedSecret = shared;
    this.phantomPublicKey = phantomPub;
    this.session = data.session;
    this.wallet = data.public_key;
    await this.persist();
    return this.wallet;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const res = await this.encryptedRequest<{ signature: string }>('signMessage', {
      message: toBase58(message),
      display: 'utf8',
    });
    if (!res.signature) throw new WalletError('Phantom did not return a signature');
    return fromBase58(res.signature);
  }

  async signAndSendTransaction(serializedTransaction: Uint8Array): Promise<string> {
    const res = await this.encryptedRequest<{ signature: string }>('signAndSendTransaction', {
      transaction: toBase58(serializedTransaction),
    });
    if (!res.signature) throw new WalletError('Phantom did not return a transaction signature');
    return res.signature;
  }

  async disconnect(): Promise<void> {
    // Best effort: tell Phantom to drop the session, but never block sign-out on it.
    await this.clearState();
  }

  handleRedirect(url: string): boolean {
    const parsed = parseCallbackUrl(url);
    if (!parsed) return false;
    const pending = this.pending.get(parsed.action);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(parsed.action);
    const { errorCode, errorMessage } = parsed.params;
    if (errorCode || errorMessage) {
      pending.reject(new WalletError(errorMessage || 'Wallet request was rejected', errorCode));
    } else {
      pending.resolve(parsed.params);
    }
    return true;
  }

  /* ---------- internals ---------- */

  private redirect(action: PhantomAction): string {
    return `${this.deps.redirectBase}/${action}`;
  }

  private async encryptedRequest<T>(
    action: Exclude<PhantomAction, 'connect'>,
    body: Record<string, unknown>
  ): Promise<T> {
    if (!this.keyPair || !this.sharedSecret || !this.session) {
      throw new WalletError('Wallet is not connected');
    }
    const { nonce, payload } = encryptPayload({ ...body, session: this.session }, this.sharedSecret, this.deps.randomBytes);
    const url = buildEncryptedActionUrl(action, {
      dappPublicKey: toBase58(this.keyPair.publicKey),
      nonce,
      redirectLink: this.redirect(action),
      payload,
    });
    const params = await this.request(action, url);
    if (!params.data || !params.nonce) throw new WalletError('Unexpected response from Phantom');
    return decryptPayload<T>(params.data, params.nonce, this.sharedSecret);
  }

  private request(action: PhantomAction, url: string): Promise<Record<string, string>> {
    const existing = this.pending.get(action);
    if (existing) {
      clearTimeout(existing.timer);
      existing.reject(new WalletError('Superseded by a newer wallet request'));
      this.pending.delete(action);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(action);
        reject(new WalletError('Timed out waiting for the wallet'));
      }, this.deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
      this.pending.set(action, { resolve, reject, timer });
      this.deps.openUrl(url).catch((e: unknown) => {
        clearTimeout(timer);
        this.pending.delete(action);
        reject(new WalletError(e instanceof Error ? e.message : 'Could not open Phantom'));
      });
    });
  }

  private async persist(): Promise<void> {
    if (!this.keyPair || !this.phantomPublicKey || !this.session || !this.wallet) return;
    const state: PersistedState = {
      dappSecretKey: toBase58(this.keyPair.secretKey),
      dappPublicKey: toBase58(this.keyPair.publicKey),
      phantomPublicKey: this.phantomPublicKey,
      session: this.session,
      wallet: this.wallet,
    };
    await this.deps.storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private async clearState(): Promise<void> {
    this.keyPair = null;
    this.sharedSecret = null;
    this.phantomPublicKey = null;
    this.session = null;
    this.wallet = null;
    await this.deps.storage.removeItem(STORAGE_KEY);
  }
}
