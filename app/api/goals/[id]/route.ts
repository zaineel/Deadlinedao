import { NextRequest, NextResponse } from 'next/server';
import { getGoalById, updateGoalStatus } from '@/lib/supabase';

/**
 * GET /api/goals/[id]
 * Get goal by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const { data: goal, error } = await getGoalById(id);

    if (error || !goal) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      goal,
    });

  } catch (error) {
    console.error('Get goal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/goals/[id]
 * Update goal status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Validate status value
    const validStatuses = ['active', 'pending_validation', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    const { data: goal, error } = await updateGoalStatus(id, status);

    if (error || !goal) {
      return NextResponse.json(
        { error: 'Failed to update goal' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      goal,
    });

  } catch (error) {
    console.error('Update goal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
