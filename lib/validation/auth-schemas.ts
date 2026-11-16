import { z } from 'zod';
import { walletAddressSchema } from '@/lib/validation/schemas';

export const nonceRequestSchema = z.object({
  wallet: walletAddressSchema,
});

export const verifyRequestSchema = z.object({
  wallet: walletAddressSchema,
  nonce: z.string().min(1).max(512),
  issuedAt: z.number().int().positive(),
  // base64 ed25519 signature (64 bytes -> 88 chars)
  signature: z.string().min(1).max(200),
});
