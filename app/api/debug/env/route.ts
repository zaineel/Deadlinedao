import { NextResponse } from 'next/server';

/**
 * Debug endpoint to check environment variables
 * DELETE THIS BEFORE PRODUCTION!
 */
export async function GET() {
  return NextResponse.json({
    cloudflare: {
      hasEndpoint: !!process.env.CLOUDFLARE_R2_ENDPOINT,
      hasAccessKey: !!process.env.CLOUDFLARE_R2_ACCESS_KEY,
      hasSecretKey: !!process.env.CLOUDFLARE_R2_SECRET_KEY,
      hasBucket: !!process.env.CLOUDFLARE_R2_BUCKET,
      hasPublicUrl: !!process.env.CLOUDFLARE_R2_PUBLIC_URL,
      // Show first/last chars only for debugging
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT ?
        `${process.env.CLOUDFLARE_R2_ENDPOINT.slice(0, 8)}...${process.env.CLOUDFLARE_R2_ENDPOINT.slice(-8)}` :
        'NOT SET',
      bucket: process.env.CLOUDFLARE_R2_BUCKET || 'NOT SET',
    },
    snowflake: {
      hasAccount: !!process.env.SNOWFLAKE_ACCOUNT,
      hasUsername: !!process.env.SNOWFLAKE_USERNAME,
      hasWarehouse: !!process.env.SNOWFLAKE_WAREHOUSE,
      hasPrivateKey: !!process.env.SNOWFLAKE_PRIVATE_KEY,
    },
    solana: {
      hasRpcUrl: !!process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
      hasEscrowKey: !!process.env.SOLANA_ESCROW_PRIVATE_KEY,
    },
    supabase: {
      hasUrl: !!process.env.SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
  });
}
