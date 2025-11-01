import { NextResponse } from 'next/server';
import { healthCheck as snowflakeHealth } from '@/lib/snowflake';
import { healthCheckR2 } from '@/lib/cloudflare';
import { getEscrowBalance } from '@/lib/solana';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/health
 * Health check for all services
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // Check Supabase
    const supabaseHealthy = await checkSupabase();

    // Check Solana
    const solanaHealthy = await checkSolana();

    // Check Snowflake
    const snowflakeHealthy = await checkSnowflake();

    // Check Cloudflare R2
    const r2Healthy = await checkR2();

    const allHealthy = supabaseHealthy && solanaHealthy && snowflakeHealthy && r2Healthy;
    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      services: {
        supabase: {
          status: supabaseHealthy ? 'up' : 'down',
        },
        solana: {
          status: solanaHealthy ? 'up' : 'down',
        },
        snowflake: {
          status: snowflakeHealthy ? 'up' : 'down',
        },
        cloudflare_r2: {
          status: r2Healthy ? 'up' : 'down',
        },
      },
      version: '1.0.0',
    }, {
      status: allHealthy ? 200 : 503,
    });

  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    }, {
      status: 500,
    });
  }
}

async function checkSupabase(): Promise<boolean> {
  try {
    const { error } = await supabase.from('goals').select('count').limit(1);
    return !error;
  } catch (error) {
    console.error('Supabase health check failed:', error);
    return false;
  }
}

async function checkSolana(): Promise<boolean> {
  try {
    // Try to get escrow balance
    await getEscrowBalance();
    return true;
  } catch (error) {
    console.error('Solana health check failed:', error);
    return false;
  }
}

async function checkSnowflake(): Promise<boolean> {
  try {
    const { healthy } = await snowflakeHealth();
    return healthy;
  } catch (error) {
    console.error('Snowflake health check failed:', error);
    return false;
  }
}

async function checkR2(): Promise<boolean> {
  try {
    const { healthy } = await healthCheckR2();
    return healthy;
  } catch (error) {
    console.error('R2 health check failed:', error);
    return false;
  }
}
