import bs58 from 'bs58';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

export const toBase58 = (bytes: Uint8Array): string => bs58.encode(bytes);
export const fromBase58 = (s: string): Uint8Array => bs58.decode(s);
export const toBase64 = (bytes: Uint8Array): string => encodeBase64(bytes);
export const fromBase64 = (s: string): Uint8Array => decodeBase64(s);

const encoder = new TextEncoder();
export const utf8Bytes = (s: string): Uint8Array => encoder.encode(s);

/** The API expects wallet signatures as base64; Phantom returns base58. */
export const base58SignatureToBase64 = (sig58: string): string => toBase64(fromBase58(sig58));
