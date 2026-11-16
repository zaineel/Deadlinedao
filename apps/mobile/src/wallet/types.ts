/**
 * Wallet abstraction. The app only talks to this interface so another
 * provider (Solflare deep links, Android Mobile Wallet Adapter) can be added
 * by implementing it and registering it in src/wallet/index.ts.
 */
export interface WalletProvider {
  readonly name: string;
  /** Base58 address of the connected wallet, or null when not connected. */
  readonly publicKey: string | null;
  /** Re-hydrate a previous connection from secure storage (no wallet app round trip). */
  restore(): Promise<string | null>;
  /** Opens the wallet app, resolves with the wallet address once the user approves. */
  connect(): Promise<string>;
  /** Returns the raw 64-byte ed25519 signature of `message`. */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  /** Wallet signs a serialized transaction and it is submitted to the network; resolves with its base58 signature. */
  signAndSendTransaction(serializedTransaction: Uint8Array): Promise<string>;
  disconnect(): Promise<void>;
  /** Feed an incoming deep link; returns true when it belonged to a pending wallet request. */
  handleRedirect(url: string): boolean;
}

export class WalletError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
