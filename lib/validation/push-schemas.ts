import { z } from 'zod';
import { isExpoPushToken } from '@/lib/mobile/push-token';
import { uuidSchema } from '@/lib/validation/schemas';

const expoToken = z.string().max(128).refine(isExpoPushToken, 'Invalid Expo push token');

export const registerPushSchema = z.object({
  token: expoToken,
  platform: z.enum(['ios', 'android']),
});

export const unregisterPushSchema = z.object({ token: expoToken });

export const shareGoalSchema = z.object({
  goalId: uuidSchema,
  share: z.boolean(),
});
