-- Phase 5: DAO governance v2 (panel voting on disputes). Idempotent and additive.
-- Run once in the Supabase SQL editor BEFORE enabling FEATURE_GOVERNANCE.
-- Requires 003_disputes.sql (disputes table). Teams/orgs tables (004/005) are
-- only READ by the app (conflict-of-interest exclusion) and are not required here.

-- 1. One governance record per dispute: how it is decided and its state.
--    The unique primary key makes the panel draw idempotent (draw once).
CREATE TABLE IF NOT EXISTS dispute_governance (
  dispute_id UUID PRIMARY KEY REFERENCES disputes(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('panel', 'admin')),
  state TEXT NOT NULL CHECK (state IN ('voting', 'escalated', 'admin', 'resolved')),
  -- why the admin flow was used instead of a panel (e.g. too few eligible voters)
  fallback_reason TEXT,
  -- parameters in force at draw time, kept so the decision is auditable
  panel_size INTEGER NOT NULL DEFAULT 0 CHECK (panel_size >= 0),
  quorum INTEGER NOT NULL DEFAULT 0 CHECK (quorum >= 0),
  eligible_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voting_ends_at TIMESTAMPTZ,
  escalated_reason TEXT,
  decision TEXT CHECK (decision IN ('overturn', 'uphold')),
  resolved_by TEXT CHECK (resolved_by IN ('panel', 'admin', 'admin_override')),
  resolved_at TIMESTAMPTZ,
  -- voter stats applied exactly once (flipped by the same statement that resolves)
  stats_applied BOOLEAN NOT NULL DEFAULT FALSE,
  rewards_settled BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_dispute_governance_state ON dispute_governance (state);

-- 2. The drawn panel: reproducible and auditable. One row per (dispute, wallet).
CREATE TABLE IF NOT EXISTS dispute_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dispute_id, wallet)
);
CREATE INDEX IF NOT EXISTS idx_dispute_panels_wallet ON dispute_panels (wallet);

-- 3. Sealed votes: one per (dispute, voter), and only by a drawn panelist
--    (composite FK to the panel). Visibility is enforced by the API.
CREATE TABLE IF NOT EXISTS dispute_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  voter_wallet TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('overturn', 'uphold')),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dispute_id, voter_wallet),
  FOREIGN KEY (dispute_id, voter_wallet) REFERENCES dispute_panels (dispute_id, wallet) ON DELETE CASCADE
);

-- 4. Voter rewards. NOT in the payouts table (unique (goal_id, payout_type)
--    cannot hold several voters). Claim-before-send: the row is the claim.
--    status: claimed (in flight) -> paid | unconfirmed (ambiguous send, never released).
CREATE TABLE IF NOT EXISTS governance_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  voter_wallet TEXT NOT NULL,
  amount_lamports BIGINT NOT NULL CHECK (amount_lamports > 0),
  tx_signature TEXT,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'paid', 'unconfirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dispute_id, voter_wallet)
);

-- 5. Voter statistics (reputation display). A missed vote only counts.
CREATE TABLE IF NOT EXISTS governance_voter_stats (
  wallet TEXT PRIMARY KEY,
  votes_cast INTEGER NOT NULL DEFAULT 0 CHECK (votes_cast >= 0),
  votes_agreed INTEGER NOT NULL DEFAULT 0 CHECK (votes_agreed >= 0),
  votes_missed INTEGER NOT NULL DEFAULT 0 CHECK (votes_missed >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION governance_bump_stats(p_wallet TEXT, p_cast INTEGER, p_agreed INTEGER, p_missed INTEGER)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO governance_voter_stats (wallet, votes_cast, votes_agreed, votes_missed)
  VALUES (p_wallet, p_cast, p_agreed, p_missed)
  ON CONFLICT (wallet) DO UPDATE SET
    votes_cast = governance_voter_stats.votes_cast + EXCLUDED.votes_cast,
    votes_agreed = governance_voter_stats.votes_agreed + EXCLUDED.votes_agreed,
    votes_missed = governance_voter_stats.votes_missed + EXCLUDED.votes_missed,
    updated_at = NOW();
$$;

-- Only the service role may call it (never exposed to anon/authenticated RPC).
REVOKE ALL ON FUNCTION governance_bump_stats(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- 6. Audit log (panel resolutions, escalations, admin overrides with reasons).
CREATE TABLE IF NOT EXISTS governance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_governance_audit_dispute ON governance_audit (dispute_id);

-- 7. The app uses the service role; anon gets no access (RLS on, NO policies).
ALTER TABLE dispute_governance ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_voter_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_audit ENABLE ROW LEVEL SECURITY;
