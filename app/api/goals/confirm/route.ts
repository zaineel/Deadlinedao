import { NextRequest, NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import { verifyStakeTransaction } from '@/lib/solana/escrow';
import { isSignatureUsed } from '@/lib/solana/signature-registry';
import { isDemoMode } from '@/lib/config/demo';
import { parseBody, confirmGoalSchema } from '@/lib/validation/schemas';
import { requireUserSession } from '@/lib/auth/csrf';
import { canConfirmStake, PENDING_STAKE_SIGNATURE } from '@/lib/goals/confirm-guard';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Solana connection
const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

export async function POST(request: NextRequest) {
  const auth = requireUserSession(request, { mutating: true });
  if (!auth.ok) return auth.response;

  try {
    const parsed = await parseBody(request, confirmGoalSchema);
    if (!parsed.ok) return parsed.response;
    const { goalId, signature } = parsed.data;

    // Load the goal so we can verify the on-chain transfer against it
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('id, wallet_address, stake_amount, status, stake_tx_signature')
      .eq('id', goalId)
      .single();

    if (goalError || !goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    // Same 404 as a missing goal so goal ids cannot be probed
    if (goal.wallet_address !== auth.wallet) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    if (!canConfirmStake(goal)) {
      return NextResponse.json({ error: 'Goal is not awaiting stake confirmation' }, { status: 409 });
    }

    const isDemoSignature = isDemoMode() && signature.startsWith('demo_tx_');

    // Replay protection: a signature may only back one goal, and never one
    // that was already credited as an org funding (or any other feature).
    if (!isDemoSignature && (await isSignatureUsed(signature))) {
      return NextResponse.json({ error: 'Transaction already used' }, { status: 409 });
    }

    // Verify on-chain: user -> escrow, for at least the stake amount
    const { valid, error: verifyError } = isDemoSignature
      ? { valid: true, error: null }
      : await verifyStakeTransaction(signature, Number(goal.stake_amount), goal.wallet_address);

    if (!valid) {
      return NextResponse.json(
        { error: verifyError?.message || 'Stake transaction could not be verified. Please wait and try again.' },
        { status: 400 }
      );
    }

    // Update goal status in database
    const { data, error } = await supabase
      .from('goals')
      .update({
        status: 'active',
        stake_tx_signature: signature,
      })
      .eq('id', goalId)
      .eq('status', 'pending_validation')
      .eq('stake_tx_signature', PENDING_STAKE_SIGNATURE)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to update goal' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      goal: data,
      message: 'Goal activated! Your SOL has been staked.',
    });

  } catch (error: any) {
    console.error('Error confirming transaction:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
