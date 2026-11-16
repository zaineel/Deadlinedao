import { z } from 'zod';
import { uuidSchema } from '@/lib/validation/schemas';

export const castVoteSchema = z.object({
  disputeId: uuidSchema,
  vote: z.enum(['overturn', 'uphold']),
  reason: z.string().trim().max(500).optional(),
});

export const adminGovernanceSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('run') }),
  z.object({
    action: z.literal('override'),
    disputeId: uuidSchema,
    decision: z.enum(['overturn', 'uphold']),
    reason: z.string().trim().min(5).max(500),
  }),
]);
