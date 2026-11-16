import { z } from 'zod';
import { uuidSchema } from '@/lib/validation/schemas';

/** Evidence images must be https and, when R2 is configured, hosted by us. */
const evidenceImageUrl = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith('https://'), 'Image URL must be https')
  .refine((u) => {
    const base = process.env.CLOUDFLARE_R2_PUBLIC_URL;
    return !base || u.startsWith(base.replace(/\/$/, '') + '/');
  }, 'Image must be uploaded through DeadlineDAO');

export const createDisputeSchema = z.object({
  goalId: uuidSchema,
  reason: z.string().trim().min(10).max(1000),
  extraImageUrl: evidenceImageUrl.nullish(),
  // base58 tx signature (~88 chars) or a demo_tx_* placeholder
  bondSignature: z.string().min(1).max(128),
});

export const resolveDisputeSchema = z.object({
  disputeId: uuidSchema,
  decision: z.enum(['overturn', 'uphold']),
});
