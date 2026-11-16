import type { ApiClient, UploadFile } from './api/client';
import type { CreateGoalInput, SubmitProofResponse } from './api/types';
import { buildSignInMessage } from './auth/signin-message';
import type { StoredSession } from './auth/session';
import { proofMessageFor } from './proof/proof-message';
import { fromBase64, toBase64, utf8Bytes } from './wallet/encoding';
import type { WalletProvider } from './wallet/types';

/**
 * Orchestration of multi-step flows. Pure of React / native modules so the
 * logic is unit-testable with a fake wallet and a mocked API.
 */

/** connect (if needed) -> nonce -> wallet signs -> verify -> session. */
export async function signInWithWallet(wallet: WalletProvider, api: ApiClient): Promise<StoredSession> {
  const address = wallet.publicKey ?? (await wallet.connect());
  const { nonce, issuedAt, message } = await api.getNonce(address);

  // Never sign server-provided text blindly: it must be exactly the sign-in message.
  const expected = buildSignInMessage({ wallet: address, nonce, issuedAt });
  if (message !== expected) throw new Error('Unexpected sign-in message from server; refusing to sign');

  const sig = await wallet.signMessage(utf8Bytes(expected));
  const verified = await api.verify({ wallet: address, nonce, issuedAt, signature: toBase64(sig) });
  return { token: verified.token, wallet: verified.wallet, expiresAt: verified.expiresAt };
}

/** create goal (server builds the escrow transfer) -> wallet signs+sends -> server confirms on chain. */
export async function createAndStakeGoal(
  wallet: WalletProvider,
  api: ApiClient,
  input: Omit<CreateGoalInput, 'walletAddress'>,
  walletAddress: string
): Promise<{ goalId: string }> {
  const created = await api.createGoal({ ...input, walletAddress });
  if (created.demoMode || !created.transaction) {
    // Server is in demo mode: it accepts a demo_tx_ placeholder signature.
    await api.confirmGoal(created.goalId, `demo_tx_${Date.now()}`);
    return { goalId: created.goalId };
  }
  const signature = await wallet.signAndSendTransaction(fromBase64(created.transaction));
  await api.confirmGoal(created.goalId, signature);
  return { goalId: created.goalId };
}

/** (optional image upload) -> wallet signs proof message -> POST /api/proofs. */
export async function submitProofWithWallet(
  wallet: WalletProvider,
  api: ApiClient,
  p: { goalId: string; text: string; image?: UploadFile | null; now?: () => number }
): Promise<SubmitProofResponse> {
  let imageUrl: string | null = null;
  if (p.image) imageUrl = (await api.uploadProofImage(p.goalId, p.image)).url;

  const timestamp = (p.now ?? Date.now)();
  const message = proofMessageFor({ goalId: p.goalId, textDescription: p.text, imageUrl, timestamp });
  const sig = await wallet.signMessage(utf8Bytes(message));
  return api.submitProof({
    goal_id: p.goalId,
    text_description: p.text,
    image_url: imageUrl,
    timestamp,
    signature: toBase64(sig),
  });
}

