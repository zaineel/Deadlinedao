import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/config/demo';
import { parseBody } from '@/lib/validation/schemas';
import { sessionCreateGoalSchema } from '@/lib/validation/session-schemas';
import { requireUserSession } from '@/lib/auth/csrf';

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
  const limited = rateLimit(request, { name: 'goals-create', limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = requireUserSession(request, { mutating: true });
  if (!auth.ok) return auth.response;
  const walletAddress = auth.wallet;

  try {
    const parsed = await parseBody(request, sessionCreateGoalSchema);
    if (!parsed.ok) return parsed.response;
    const { title, description, deadline, category, stakeAmount } = parsed.data;
    // A wallet in the body is never trusted: it must match the session
    if (parsed.data.walletAddress !== undefined && parsed.data.walletAddress !== walletAddress) {
      return NextResponse.json({ error: 'Wallet does not match session' }, { status: 403 });
    }

    const userPublicKey = new PublicKey(walletAddress);

    // Get escrow wallet address from env
    const escrowPrivateKeyArray = JSON.parse(process.env.SOLANA_ESCROW_PRIVATE_KEY || '[]');
    if (escrowPrivateKeyArray.length === 0) {
      return NextResponse.json(
        { error: 'Escrow wallet not configured' },
        { status: 500 }
      );
    }

    // Calculate escrow public key from the private key
    const { Keypair } = await import('@solana/web3.js');
    const escrowKeypair = Keypair.fromSecretKey(Uint8Array.from(escrowPrivateKeyArray));
    const escrowPublicKey = escrowKeypair.publicKey;

    // Convert SOL to lamports
    const lamports = Math.round(stakeAmount * LAMPORTS_PER_SOL);

    // Create the escrow transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: escrowPublicKey,
        lamports: lamports,
      })
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;

    // Serialize the transaction for the client to sign
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    // Insert goal into Supabase (status: pending_validation until transaction confirms)
    const { data: goalData, error: dbError } = await supabase
      .from('goals')
      .insert({
        wallet_address: walletAddress,
        title,
        description,
        deadline: new Date(deadline).toISOString(),
        category,
        stake_amount: stakeAmount,
        stake_tx_signature: 'pending',
        status: 'pending_validation',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to save goal to database' },
        { status: 500 }
      );
    }

    // If demo mode, skip transaction creation
    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        goalId: goalData.id,
        demoMode: true,
        message: 'Goal created in demo mode (no blockchain transaction).',
      });
    }

    return NextResponse.json({
      success: true,
      goalId: goalData.id,
      transaction: serializedTransaction,
      escrowAddress: escrowPublicKey.toString(),
      message: 'Goal created. Please sign the transaction to stake your SOL.',
    });

  } catch (error: any) {
    console.error('Error creating goal:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
