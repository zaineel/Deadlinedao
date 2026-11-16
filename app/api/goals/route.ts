import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseValue, walletAddressSchema } from '@/lib/validation/schemas';
import { requireUserSession } from '@/lib/auth/csrf';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const auth = requireUserSession(request);
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;

  try {
    // `?wallet=` is optional (the mobile app sends it); it must be the session wallet
    const queryWallet = new URL(request.url).searchParams.get('wallet');
    if (queryWallet !== null) {
      const walletResult = parseValue(queryWallet, walletAddressSchema);
      if (!walletResult.ok) return walletResult.response;
      if (walletResult.data !== wallet) {
        return NextResponse.json({ error: 'Wallet does not match session' }, { status: 403 });
      }
    }

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
