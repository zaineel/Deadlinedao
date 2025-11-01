import { NextRequest, NextResponse } from 'next/server';
import { createGoal, getGoalsByWallet, getRecentGoals } from '@/lib/supabase';
import { processStake, validateStakeParams } from '@/lib/solana';

/**
 * POST /api/goals
 * Create a new goal with stake
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      wallet_address,
      title,
      description,
      deadline,
      stake_amount,
      stake_tx_signature,
      category,
    } = body;

    // Validate required fields
    if (!wallet_address || !title || !description || !deadline || !stake_amount || !stake_tx_signature || !category) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate stake parameters
    const stakeValidation = validateStakeParams(wallet_address, stake_amount);
    if (!stakeValidation.valid) {
      return NextResponse.json(
        { error: stakeValidation.error },
        { status: 400 }
      );
    }

    // Verify stake transaction
    const stakeResult = await processStake(
      wallet_address,
      stake_amount,
      stake_tx_signature
    );

    if (!stakeResult.success) {
      return NextResponse.json(
        { error: `Stake verification failed: ${stakeResult.error}` },
        { status: 400 }
      );
    }

    // Create goal in database
    const { data: goal, error } = await createGoal({
      wallet_address,
      title,
      description,
      deadline,
      stake_amount,
      stake_tx_signature,
      category,
      status: 'active',
    });

    if (error || !goal) {
      return NextResponse.json(
        { error: 'Failed to create goal' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      goal,
    }, { status: 201 });

  } catch (error) {
    console.error('Create goal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/goals?wallet=xxx&status=xxx&category=xxx&limit=10
 * List goals with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wallet = searchParams.get('wallet');
    const status = searchParams.get('status') as 'active' | 'pending_validation' | 'completed' | 'failed' | null;
    const category = searchParams.get('category') as 'learning' | 'work' | 'health' | null;
    const limit = parseInt(searchParams.get('limit') || '10');

    if (wallet) {
      // Get goals for specific wallet
      const { data: goals, error } = await getGoalsByWallet(
        wallet,
        {
          status: status || undefined,
          category: category || undefined,
          limit,
        }
      );

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch goals' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        goals: goals || [],
        count: goals?.length || 0,
      });
    } else {
      // Get recent goals
      const { data: goals, error } = await getRecentGoals(limit);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch goals' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        goals: goals || [],
        count: goals?.length || 0,
      });
    }
  } catch (error) {
    console.error('Get goals error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
