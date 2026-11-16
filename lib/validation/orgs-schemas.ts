import { z } from 'zod';
import { walletAddressSchema } from '@/lib/validation/schemas';

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');

export const createOrgSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    additionalAdminWallets: z.array(walletAddressSchema).max(9).default([]),
    /** 0.01 - 100 percent of the stake, up to 2 decimals */
    matchRatePercent: z
      .number()
      .finite()
      .min(0.01)
      .max(100)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, 'At most 2 decimal places'),
    perMemberCapSol: z
      .number()
      .finite()
      .min(0.0001)
      .max(1000)
      .refine((v) => Math.round(v * 1e4) / 1e4 === v, 'At most 4 decimal places'),
    windowStart: isoDate,
    windowEnd: isoDate,
  })
  .refine((v) => new Date(v.windowEnd).getTime() > new Date(v.windowStart).getTime(), {
    message: 'Program window must end after it starts',
    path: ['windowEnd'],
  })
  .refine((v) => new Date(v.windowEnd).getTime() > Date.now(), {
    message: 'Program window must end in the future',
    path: ['windowEnd'],
  });

export const fundOrgSchema = z.object({
  // base58 tx signature
  signature: z.string().min(64).max(100).regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid signature'),
});

export const joinOrgSchema = z.object({
  inviteCode: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid invite code'),
});

export const consentSchema = z.object({
  consent: z.boolean(),
});
