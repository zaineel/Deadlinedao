-- DeadlineDAO Supabase Database Schema
-- Run this in your Supabase SQL Editor

-- Goals table
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  stake_amount DECIMAL(10,4) NOT NULL,
  stake_tx_signature TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending_validation', 'completed', 'failed')),
  category TEXT NOT NULL CHECK (category IN ('learning', 'work', 'health')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for goals table
CREATE INDEX idx_goals_wallet ON goals(wallet_address);
CREATE INDEX idx_goals_status ON goals(status);
CREATE INDEX idx_goals_deadline ON goals(deadline);
CREATE INDEX idx_goals_category ON goals(category);

-- Proofs table
CREATE TABLE proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  image_url TEXT,
  text_description TEXT NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ai_verdict TEXT CHECK (ai_verdict IN ('approved', 'rejected', 'needs_review')),
  ai_confidence DECIMAL(5,2),
  quality_score DECIMAL(5,2),
  ai_reasoning TEXT
);

-- Index for proofs table
CREATE INDEX idx_proofs_goal ON proofs(goal_id);

-- Payouts table
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  wallet_address TEXT NOT NULL,
  amount DECIMAL(10,4) NOT NULL,
  tx_signature TEXT NOT NULL,
  payout_type TEXT NOT NULL CHECK (payout_type IN ('completion_reward', 'original_stake')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for payouts table
CREATE INDEX idx_payouts_wallet ON payouts(wallet_address);
CREATE INDEX idx_payouts_goal ON payouts(goal_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to call the function before update
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - optional but recommended
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Create policies to allow service role full access
CREATE POLICY "Enable all access for service role" ON goals FOR ALL USING (true);
CREATE POLICY "Enable all access for service role" ON proofs FOR ALL USING (true);
CREATE POLICY "Enable all access for service role" ON payouts FOR ALL USING (true);
