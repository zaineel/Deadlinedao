import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

/* ---------- primitives ---------- */

export const walletAddressSchema = z
  .string()
  .min(32)
  .max(44)
  .refine((v) => {
    try {
      new PublicKey(v);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid wallet address');

export const uuidSchema = z.string().uuid('Invalid id');

/** YYYY-MM-DD, and a real calendar date */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');

export const MAX_STAKE_SOL = 1000;

/* ---------- request bodies ---------- */

export const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  deadline: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid deadline')
    .refine((v) => new Date(v).getTime() > Date.now(), 'Deadline must be in the future'),
  category: z.enum(['learning', 'work', 'health']),
  stakeAmount: z.coerce
    .number()
    .finite()
    .positive('Stake must be greater than 0')
    .max(MAX_STAKE_SOL)
    // at most 4 decimals, matching the DECIMAL(10,4) column
    .refine((v) => Math.round(v * 1e4) / 1e4 === v, 'Stake supports up to 4 decimal places'),
  walletAddress: walletAddressSchema,
});

export const confirmGoalSchema = z.object({
  goalId: uuidSchema,
  // base58 tx signature (~88 chars) or a demo_tx_* placeholder
  signature: z.string().min(1).max(128),
});

/** Image proofs must live on our own R2 public URL when it is configured. */
const proofImageUrl = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith('https://'), 'Image URL must be https')
  .refine((u) => {
    const base = process.env.CLOUDFLARE_R2_PUBLIC_URL;
    return !base || u.startsWith(base.replace(/\/$/, '') + '/');
  }, 'Image must be uploaded through DeadlineDAO');

export const submitProofSchema = z.object({
  goal_id: uuidSchema,
  text_description: z.string().trim().min(1).max(5000),
  image_url: proofImageUrl.nullish(),
  timestamp: z.number().int().positive(),
  // base64 of a 64-byte ed25519 signature is 88 chars
  signature: z.string().min(80).max(100),
});

export const goalStatusUpdateSchema = z.object({
  status: z.enum(['active', 'pending_validation', 'completed', 'failed']),
});

/* ---------- helper ---------- */

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

function fail(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'Invalid request',
      issues: error.issues.slice(0, 5).map((i) => ({
        field: i.path.join('.') || '(body)',
        message: i.message,
      })),
    },
    { status: 400 }
  );
}

/** Parse + validate a JSON body. Bad JSON or a schema miss becomes a 400. */
export async function parseBody<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<ParseResult<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, response: fail(result.error) };
}

/** Validate an arbitrary value (query params, route params, form fields). */
export function parseValue<T extends z.ZodTypeAny>(
  value: unknown,
  schema: T
): ParseResult<z.infer<T>> {
  const result = schema.safeParse(value);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, response: fail(result.error) };
}
