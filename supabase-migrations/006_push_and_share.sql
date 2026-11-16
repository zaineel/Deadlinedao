-- Push tokens, reminder de-duplication and opt-in public sharing.
-- Idempotent; run once in the Supabase SQL editor. Service role only (RLS on, no policies).

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  expo_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_wallet ON push_tokens(wallet_address);
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- One row per (goal, reminder window) once claimed; reruns can never double-send.
CREATE TABLE IF NOT EXISTS deadline_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  window_key TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (goal_id, window_key)
);
ALTER TABLE deadline_reminders_sent ENABLE ROW LEVEL SECURITY;

ALTER TABLE goals ADD COLUMN IF NOT EXISTS share_public BOOLEAN NOT NULL DEFAULT FALSE;
