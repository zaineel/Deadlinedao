import { NextResponse } from 'next/server';

/**
 * GET /api
 * API index - lists all available endpoints
 */
export async function GET() {
  return NextResponse.json({
    name: 'DeadlineDAO API',
    version: '1.0.0',
    description: 'AI-Powered Accountability Platform with Solana, Snowflake, and Cloudflare',
    endpoints: {
      health: {
        path: '/api/health',
        method: 'GET',
        description: 'Health check for all services',
      },
      goals: {
        create: {
          path: '/api/goals',
          method: 'POST',
          description: 'Create a new goal with SOL stake',
          body: {
            wallet_address: 'string',
            title: 'string',
            description: 'string',
            deadline: 'ISO 8601 date',
            stake_amount: 'number (SOL)',
            stake_tx_signature: 'string',
            category: 'learning | work | health',
          },
        },
        list: {
          path: '/api/goals',
          method: 'GET',
          description: 'List goals with optional filters',
          params: {
            wallet: 'string (optional)',
            status: 'active | pending_validation | completed | failed (optional)',
            category: 'learning | work | health (optional)',
            limit: 'number (default: 10)',
          },
        },
        get: {
          path: '/api/goals/[id]',
          method: 'GET',
          description: 'Get goal by ID',
        },
        update: {
          path: '/api/goals/[id]',
          method: 'PUT',
          description: 'Update goal status',
          body: {
            status: 'active | pending_validation | completed | failed',
          },
        },
      },
      proofs: {
        submit: {
          path: '/api/proofs',
          method: 'POST',
          description: '⭐ Submit proof for AI validation (Snowflake Cortex)',
          body: {
            goal_id: 'string (UUID)',
            text_description: 'string',
            image_url: 'string (optional)',
          },
          note: 'This endpoint uses Snowflake AI for validation - the PRIMARY FEATURE',
        },
        list: {
          path: '/api/proofs',
          method: 'GET',
          description: 'Get proofs for a goal',
          params: {
            goal_id: 'string (UUID)',
          },
        },
      },
      upload: {
        presigned: {
          path: '/api/upload/presigned',
          method: 'POST',
          description: 'Get presigned URL for direct R2 upload',
          body: {
            filename: 'string',
            goal_id: 'string (UUID)',
            user_id: 'string',
          },
        },
      },
      analytics: {
        platform: {
          path: '/api/analytics/platform',
          method: 'GET',
          description: 'Get platform-wide statistics and AI metrics',
        },
        user: {
          path: '/api/analytics/user/[wallet]',
          method: 'GET',
          description: 'Get user-specific statistics',
        },
      },
    },
    tech_stack: {
      blockchain: 'Solana (devnet)',
      ai: 'Snowflake Cortex API',
      storage: 'Cloudflare R2',
      database: 'Supabase (PostgreSQL)',
      framework: 'Next.js 14',
    },
    features: {
      ai_validation: {
        provider: 'Snowflake Cortex',
        models: ['Claude 3.5 Sonnet', 'Mistral Large', 'Llama 3'],
        layers: [
          'Text analysis',
          'Sentiment analysis',
          'Fraud detection',
          'Specificity checking',
          'Quality scoring',
        ],
      },
      blockchain: {
        network: 'Solana Devnet',
        features: [
          'Escrow wallet management',
          'Stake verification',
          'Proportional redistribution',
          'Automatic payouts',
        ],
      },
      storage: {
        provider: 'Cloudflare R2',
        features: [
          'Direct client uploads (presigned URLs)',
          'Image validation',
          'Automatic cleanup',
        ],
      },
    },
    links: {
      documentation: 'See README.md',
      repository: 'https://github.com/...',
    },
  });
}
