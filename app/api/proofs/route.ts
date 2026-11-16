import { NextRequest, NextResponse } from 'next/server';
import { createProof, updateProofWithValidation, getProofsByGoal } from '@/lib/supabase';
import { getGoalById, transitionGoalStatus } from '@/lib/supabase';
import { validateProof, logValidation, AIPerformanceMonitor } from '@/lib/snowflake';
import { returnStake } from '@/lib/solana';
import { GOAL_GRACE_PERIOD_MS } from '@/lib/config/goals';
import { parseBody, submitProofSchema } from '@/lib/validation/schemas';
import { verifyProofAuth } from '@/lib/auth/wallet';

// Vercel configuration for Snowflake AI validation
export const runtime = 'nodejs';
export const maxDuration = 60; // AI validation can take 30-60 seconds
export const dynamic = 'force-dynamic';

/**
 * POST /api/proofs
 * Submit proof for validation
 * THIS IS THE CORE ENDPOINT - Integrates Snowflake AI!
 */
export async function POST(request: NextRequest) {
  const monitor = new AIPerformanceMonitor('proof_validation');

  try {
    const parsed = await parseBody(request, submitProofSchema);
    if (!parsed.ok) return parsed.response;
    const { goal_id, text_description, image_url, timestamp, signature } = parsed.data;

    // Get goal details
    const { data: goal, error: goalError } = await getGoalById(goal_id);

    if (goalError || !goal) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      );
    }

    // Only the goal's owner may submit proof (wallet-signed request)
    const auth = verifyProofAuth({
      walletAddress: goal.wallet_address,
      goalId: goal_id,
      textDescription: text_description,
      imageUrl: image_url,
      timestamp,
      signature,
    });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // Check goal status
    if (goal.status !== 'active') {
      return NextResponse.json(
        { error: `Cannot submit proof for ${goal.status} goal` },
        { status: 400 }
      );
    }

    // Check deadline hasn't passed (allow 7 days grace period for demo)
    const deadline = new Date(goal.deadline);
    const now = new Date();
    if (deadline.getTime() + GOAL_GRACE_PERIOD_MS < now.getTime()) {
      return NextResponse.json(
        { error: 'Goal deadline has passed beyond grace period' },
        { status: 400 }
      );
    }

    console.log(`[API] Validating proof for goal: ${goal.id}`);

    // Create proof record (initially without validation)
    const { data: proof, error: proofError } = await createProof({
      goal_id,
      text_description,
      image_url: image_url || null,
      ai_verdict: null,
      ai_confidence: null,
      quality_score: null,
      ai_reasoning: null,
    });

    if (proofError || !proof) {
      return NextResponse.json(
        { error: 'Failed to create proof record' },
        { status: 500 }
      );
    }

    // ⭐ SNOWFLAKE AI VALIDATION - PRIMARY FEATURE
    const validationResult = await validateProof(
      goal,
      text_description,
      image_url ?? undefined
    );

    console.log(`[API] Validation result: ${validationResult.verdict} (confidence: ${validationResult.confidence})`);

    // Update proof with validation results
    const { data: updatedProof, error: updateError } = await updateProofWithValidation(
      proof.id,
      validationResult
    );

    if (updateError) {
      console.error('[API] Failed to update proof with validation:', updateError);
    }

    // Log validation for analytics
    logValidation({
      goalId: goal.id,
      verdict: validationResult.verdict,
      confidence: validationResult.confidence,
      qualityScore: validationResult.quality_score,
      processingTimeMs: Date.now() - monitor['startTime'],
      redFlags: validationResult.red_flags,
      model: 'snowflake-cortex',
    });

    // Handle based on verdict
    if (validationResult.verdict === 'approved') {
      // Atomically claim the completion. If a concurrent request already moved
      // this goal out of 'active', it must not be paid a second time.
      const { data: claimedGoal } = await transitionGoalStatus(goal.id, 'active', 'completed');
      if (!claimedGoal) {
        return NextResponse.json(
          { error: 'This goal has already been processed' },
          { status: 409 }
        );
      }

      // Return the stake (reserved in the DB before any SOL is sent)
      const payoutResult = await returnStake(goal);

      if (payoutResult.status === 'failed') {
        // Reopen the goal so the user can retry
        await transitionGoalStatus(goal.id, 'completed', 'active');
        console.error(`[API] Stake payout failed for goal ${goal.id}: ${payoutResult.error}`);
        monitor.complete({ verdict: 'approved', payout: undefined });
        return NextResponse.json(
          { error: 'Proof approved but the stake payout failed. Please try again shortly.' },
          { status: 502 }
        );
      }

      const payoutSignature = payoutResult.status === 'sent' ? payoutResult.signature : undefined;

      monitor.complete({ verdict: 'approved', payout: payoutSignature });

      return NextResponse.json({
        success: true,
        proof: updatedProof || proof,
        validation: validationResult,
        goal_status: 'completed',
        payout: payoutSignature ? {
          phase: 'stake_returned',
          signature: payoutSignature,
          amount: payoutResult.amount,
          type: 'original_stake',
          message: 'Your stake has been returned! Rewards will be distributed after the deadline.',
        } : null,
        reward_info: {
          status: 'pending',
          message: `Rewards will be calculated and distributed after the deadline (${new Date(goal.deadline).toLocaleDateString()})`,
          note: 'Your reward depends on how many participants complete vs fail their goals',
        },
      }, { status: 200 });

    } else if (validationResult.verdict === 'rejected') {
      // Update goal status to failed
      await transitionGoalStatus(goal.id, 'active', 'failed');

      monitor.complete({ verdict: 'rejected' });

      return NextResponse.json({
        success: false,
        proof: updatedProof || proof,
        validation: validationResult,
        goal_status: 'failed',
        message: 'Proof rejected by AI validation',
      }, { status: 200 });

    } else {
      // needs_review
      await transitionGoalStatus(goal.id, 'active', 'pending_validation');

      monitor.complete({ verdict: 'needs_review' });

      return NextResponse.json({
        success: true,
        proof: updatedProof || proof,
        validation: validationResult,
        goal_status: 'pending_validation',
        message: 'Proof requires manual review',
      }, { status: 200 });
    }

  } catch (error) {
    monitor.error(error as Error);
    console.error('Submit proof error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/proofs?goal_id=xxx
 * Get proofs for a goal
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const goal_id = searchParams.get('goal_id');

    if (!goal_id) {
      return NextResponse.json(
        { error: 'goal_id is required' },
        { status: 400 }
      );
    }

    const { data: proofs, error } = await getProofsByGoal(goal_id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch proofs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      proofs: proofs || [],
      count: proofs?.length || 0,
    });

  } catch (error) {
    console.error('Get proofs error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
