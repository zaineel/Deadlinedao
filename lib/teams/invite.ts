import { randomInt } from 'crypto';

/** No 0/O/1/I/L so codes survive being read aloud or retyped. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 10;

export function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return out;
}

/** Trim, uppercase and drop dashes/spaces so "abcde-fghj2" still matches. */
export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidInviteCode(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return false;
  return true;
}
