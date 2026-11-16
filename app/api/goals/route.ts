import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseValue, walletAddressSchema } from '@/lib/validation/schemas';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletResult = parseValue(searchParams.get('wallet'), walletAddressSchema);
    if (!walletResult.ok) return walletResult.response;
    const wallet = walletResult.data;

    // Fetch goals for the wallet
    const { data: goals, error } = await supabase
      .from('goals')
      .select('*')
      .eq('wallet_address', wallet)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch goals' },
        { status: 500 }
      );
    }

    return NextResponse.json({ goals: goals || [] });

  } catch (error: any) {
    console.error('Error fetching goals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
