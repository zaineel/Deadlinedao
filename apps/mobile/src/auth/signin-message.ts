/**
 * DUPLICATED from the web app: lib/auth/session.ts (buildSignInMessage, DOMAIN_LABEL).
 * The server verifies the signature over exactly this text, so it must match byte for byte.
 * tests/drift.test.ts imports the web builder and fails if the two diverge.
 */
const DOMAIN_LABEL = 'DeadlineDAO';

export function buildSignInMessage(params: { wallet: string; nonce: string; issuedAt: number }): string {
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
