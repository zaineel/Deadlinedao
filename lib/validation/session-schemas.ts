import { z } from 'zod';
import { createGoalSchema } from '@/lib/validation/schemas';

/**
 * Goal creation under sessions: the wallet comes from the session. A body that
 * still carries `walletAddress` (older clients, the mobile app) is accepted
 * only if it equals the session wallet; the route enforces that.
 */
export const sessionCreateGoalSchema = createGoalSchema.partial({ walletAddress: true });
export type SessionCreateGoal = z.infer<typeof sessionCreateGoalSchema>;
