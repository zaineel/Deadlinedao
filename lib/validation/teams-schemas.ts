import { z } from 'zod';
import { MAX_STAKE_SOL, uuidSchema } from '@/lib/validation/schemas';
import { INVITE_CODE_LENGTH, normalizeInviteCode, isValidInviteCode } from '@/lib/teams/invite';

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const joinTeamSchema = z.object({
  inviteCode: z
    .string()
    .max(INVITE_CODE_LENGTH * 2)
    .transform(normalizeInviteCode)
    .refine(isValidInviteCode, 'Invalid invite code'),
});

export const createTeamGoalSchema = z.object({
  teamId: uuidSchema,
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  category: z.enum(['learning', 'work', 'health']),
  deadline: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid deadline')
    .refine((v) => new Date(v).getTime() > Date.now(), 'Deadline must be in the future'),
  stakePerMember: z.coerce
    .number()
    .finite()
    .positive()
    .max(MAX_STAKE_SOL)
    .refine((v) => Math.round(v * 1e4) / 1e4 === v, 'Stake supports up to 4 decimal places'),
});

export const settleTeamGoalSchema = z.object({
  teamGoalId: uuidSchema,
  dryRun: z.boolean().optional(),
});
