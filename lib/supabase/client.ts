import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Server-side client with service role (bypass RLS)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Database types for better TypeScript support
export type Database = {
  public: {
    Tables: {
      goals: {
        Row: {
          id: string;
          wallet_address: string;
          title: string;
          description: string;
          deadline: string;
          stake_amount: number;
          stake_tx_signature: string;
          status: 'active' | 'pending_validation' | 'completed' | 'failed';
          category: 'learning' | 'work' | 'health';
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['goals']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          status?: 'active' | 'pending_validation' | 'completed' | 'failed';
        };
        Update: Partial<Database['public']['Tables']['goals']['Insert']>;
      };
      proofs: {
        Row: {
          id: string;
          goal_id: string;
          image_url: string | null;
          text_description: string;
          submitted_at: string;
          ai_verdict: 'approved' | 'rejected' | 'needs_review' | null;
          ai_confidence: number | null;
          quality_score: number | null;
          ai_reasoning: string | null;
        };
        Insert: Omit<Database['public']['Tables']['proofs']['Row'], 'id' | 'submitted_at'> & {
          id?: string;
          submitted_at?: string;
        };
        Update: Partial<Database['public']['Tables']['proofs']['Insert']>;
      };
      payouts: {
        Row: {
          id: string;
          goal_id: string | null;
          wallet_address: string;
          amount: number;
          tx_signature: string;
          payout_type: 'completion_reward' | 'original_stake';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payouts']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['payouts']['Insert']>;
      };
    };
  };
};
