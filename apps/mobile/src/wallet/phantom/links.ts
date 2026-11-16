/**
 * Pure URL builders / parsers for the Phantom deep-link protocol.
 * https://docs.phantom.com/phantom-deeplinks
 */
export const PHANTOM_BASE_URL = 'https://phantom.com/ul/v1';

export type PhantomAction = 'connect' | 'disconnect' | 'signMessage' | 'signAndSendTransaction';

export type PhantomCluster = 'mainnet-beta' | 'devnet' | 'testnet';

const q = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

export function buildConnectUrl(p: {
  appUrl: string;
  dappPublicKey: string; // base58
  redirectLink: string;
  cluster: PhantomCluster;
}): string {
  return `${PHANTOM_BASE_URL}/connect?${q({
    app_url: p.appUrl,
    dapp_encryption_public_key: p.dappPublicKey,
    redirect_link: p.redirectLink,
    cluster: p.cluster,
  })}`;
}

export function buildEncryptedActionUrl(
  action: Exclude<PhantomAction, 'connect'>,
  p: { dappPublicKey: string; nonce: string; redirectLink: string; payload: string }
): string {
  return `${PHANTOM_BASE_URL}/${action}?${q({
    dapp_encryption_public_key: p.dappPublicKey,
    nonce: p.nonce,
    redirect_link: p.redirectLink,
    payload: p.payload,
  })}`;
}

export interface ParsedCallback {
  action: string;
  params: Record<string, string>;
}

/** Parses `<scheme>://phantom/<action>?k=v...` without relying on URL/URLSearchParams. */
export function parseCallbackUrl(url: string): ParsedCallback | null {
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#]*\/)*?phantom\/([A-Za-z]+)(?:\?([^#]*))?/);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const pair of (m[2] ?? '').split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const key = decodeURIComponent(i === -1 ? pair : pair.slice(0, i));
    const val = i === -1 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
    params[key] = val;
  }
  return { action: m[1], params };
}
