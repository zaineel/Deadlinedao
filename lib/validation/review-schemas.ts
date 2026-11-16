import { z } from 'zod';
import { uuidSchema } from './schemas';

export const reviewDecisionSchema = z.object({
  goalId: uuidSchema,
  decision: z.enum(['approve', 'reject']),
});

export const reconcilePayoutsSchema = z
  .object({
    /** Only reconcile this payout row; default is every unresolved row. */
    payoutId: uuidSchema.optional(),
  })
  .strict();
