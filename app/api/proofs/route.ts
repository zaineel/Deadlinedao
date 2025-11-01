import { NextRequest, NextResponse } from 'next/server';
import { createProof, updateProofWithValidation, getProofsByGoal } from '@/lib/supabase';
import { getGoalById, updateGoalStatus, createPayout } from '@/lib/supabase';
import { validateProof, logValidation, AIPerformanceMonitor } from '@/lib/snowflake';
import { processCompletionPayout } from '@/lib/solana';

/**
 * POST /api/proofs
 * Submit proof for validation
 * THIS IS THE CORE ENDPOINT - Integrates Snowflake AI!
 */
export async function POST(request: NextRequest) {
  const monitor = new AIPerformanceMonitor('proof_validation');

  try {
    const body = await request.json();

    const {
      goal_id,
      text_description,
      image_url,
    } = body;

    // Validate required fields
    if (!goal_id || !text_description) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get goal details
    const { data: goal, error: goalError } = await getGoalById(goal_id);

    if (goalError || !goal) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      );
    }

    // Check goal status
    if (goal.status !== 'active') {
      return NextResponse.json(
        { error: `Cannot submit proof for ${goal.status} goal` },
        { status: 400 }
      );
    }

    // Check deadline hasn't passed
    if (new Date(goal.deadline) < new Date()) {
      return NextResponse.json(
        { error: 'Goal deadline has passed' },
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
      image_url
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
      // Update goal status
      await updateGoalStatus(goal.id, 'completed');

      // Process payout
      const payoutResult = await processCompletionPayout(goal, []);

      if (payoutResult.signature) {
        // Record payout in database
        await createPayout({
          goal_id: goal.id,
          wallet_address: goal.wallet_address,
          amount: goal.stake_amount,
          tx_signature: payoutResult.signature,
          payout_type: 'original_stake',
        });
      }

      monitor.complete({ verdict: 'approved', payout: payoutResult.signature });

      return NextResponse.json({
        success: true,
        proof: updatedProof || proof,
        validation: validationResult,
        goal_status: 'completed',
        payout: payoutResult.signature ? {
          signature: payoutResult.signature,
          amount: goal.stake_amount,
        } : null,
      }, { status: 200 });

    } else if (validationResult.verdict === 'rejected') {
      // Update goal status to failed
      await updateGoalStatus(goal.id, 'failed');

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
      await updateGoalStatus(goal.id, 'pending_validation');

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
