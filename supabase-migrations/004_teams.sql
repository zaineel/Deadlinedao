-- Phase 2: team deadlines. Idempotent and additive; safe to re-run.
-- Run once in the Supabase SQL editor BEFORE enabling FEATURE_TEAMS.
-- Requires 002_payout_types.sql (payout type 'team_reward').

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  owner_wallet TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (team_id, wallet_address)
);
CREATE INDEX IF NOT EXISTS idx_team_members_wallet ON team_members(wallet_address);

CREATE TABLE IF NOT EXISTS team_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('learning', 'work', 'health')),
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  stake_per_member DECIMAL(10,4) NOT NULL CHECK (stake_per_member > 0),
  rule TEXT NOT NULL DEFAULT 'team_first' CHECK (rule IN ('team_first')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  settled_at TIMESTAMP WITH TIME ZONE
);
-- Recorded ONCE at settlement (write-if-null): the amount left after the team
-- distribution that joins the global pool of the deadline day. Never rewritten.
ALTER TABLE team_goals ADD COLUMN IF NOT EXISTS remainder_to_global DECIMAL(10,4);
CREATE INDEX IF NOT EXISTS idx_team_goals_deadline ON team_goals(deadline);
CREATE INDEX IF NOT EXISTS idx_team_goals_team ON team_goals(team_id);

-- Each member's stake/proof is an ordinary goals row linked to the team goal.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS team_goal_id UUID REFERENCES team_goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_goals_team_goal ON goals(team_goal_id) WHERE team_goal_id IS NOT NULL;
-- A member can stake at most once per team goal (also makes the stake endpoint race-safe).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_goals_team_goal_wallet
  ON goals (team_goal_id, wallet_address)
  WHERE team_goal_id IS NOT NULL;

-- The app uses the service role; anon gets no policies at all.
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_goals ENABLE ROW LEVEL SECURITY;
