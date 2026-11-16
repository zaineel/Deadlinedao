import nacl from 'tweetnacl';
import { fromBase58, toBase58, utf8Bytes } from '../encoding';

/**
 * Phantom deep-link encryption: x25519 key agreement + nacl.box (xsalsa20-poly1305).
 * https://docs.phantom.com/phantom-deeplinks/encryption
 *
 * Randomness is injected (`randomBytes`) because React Native has no default
 * CSPRNG for tweetnacl; the app passes expo-crypto's getRandomBytes.
 */
export type RandomBytes = (length: number) => Uint8Array;

export interface DappKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function createDappKeyPair(randomBytes: RandomBytes): DappKeyPair {
  const kp = nacl.box.keyPair.fromSecretKey(randomBytes(nacl.box.secretKeyLength));
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function deriveSharedSecret(phantomPublicKeyB58: string, dappSecretKey: Uint8Array): Uint8Array {
  return nacl.box.before(fromBase58(phantomPublicKeyB58), dappSecretKey);
}

export function encryptPayload(
  payload: unknown,
  sharedSecret: Uint8Array,
  randomBytes: RandomBytes
): { nonce: string; payload: string } {
  const nonce = randomBytes(nacl.box.nonceLength);
  const box = nacl.box.after(utf8Bytes(JSON.stringify(payload)), nonce, sharedSecret);
  return { nonce: toBase58(nonce), payload: toBase58(box) };
}

export function decryptPayload<T>(dataB58: string, nonceB58: string, sharedSecret: Uint8Array): T {
  const opened = nacl.box.open.after(fromBase58(dataB58), fromBase58(nonceB58), sharedSecret);
  if (!opened) throw new Error('Could not decrypt wallet response');
  return JSON.parse(new TextDecoder().decode(opened)) as T;
}
