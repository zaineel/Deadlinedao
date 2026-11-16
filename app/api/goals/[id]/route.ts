import { NextRequest, NextResponse } from 'next/server';
import { getGoalById, updateGoalStatus } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth/admin';
import { parseBody, parseValue, uuidSchema, goalStatusUpdateSchema } from '@/lib/validation/schemas';

/**
 * GET /api/goals/[id]
 * Get goal by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idResult = parseValue((await params).id, uuidSchema);
    if (!idResult.ok) return idResult.response;
    const id = idResult.data;

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
  { params }: { params: Promise<{ id: string }> }
) {
  // Status changes drive payouts, so only an admin may set them directly
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const idResult = parseValue((await params).id, uuidSchema);
    if (!idResult.ok) return idResult.response;
    const id = idResult.data;

    const parsed = await parseBody(request, goalStatusUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const { status } = parsed.data;

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
