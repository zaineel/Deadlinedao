-- 005_orgs.sql: employer integration (corporate wellness sponsor pools).
-- Idempotent and additive; apply manually in the Supabase SQL editor.
-- Requires 002_payout_types.sql (payout type 'sponsor_match').
-- All amounts are integer lamports (1 SOL = 1_000_000_000) to avoid float drift.

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  admin_wallets TEXT[] NOT NULL CHECK (cardinality(admin_wallets) BETWEEN 1 AND 10),
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- member opted in to being counted in employer-visible AGGREGATE stats
  consent_aggregate BOOLEAN NOT NULL DEFAULT FALSE,
  -- running total of sponsor matches reserved/paid to this member (per-member cap)
  matched_lamports BIGINT NOT NULL DEFAULT 0 CHECK (matched_lamports >= 0),
  UNIQUE (org_id, wallet)
);
CREATE INDEX IF NOT EXISTS idx_org_members_wallet ON org_members(wallet);

CREATE TABLE IF NOT EXISTS org_pools (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  funded_lamports BIGINT NOT NULL DEFAULT 0 CHECK (funded_lamports >= 0),
  remaining_lamports BIGINT NOT NULL DEFAULT 0 CHECK (remaining_lamports >= 0),
  withdrawn_lamports BIGINT NOT NULL DEFAULT 0 CHECK (withdrawn_lamports >= 0),
  match_rate_bps INTEGER NOT NULL CHECK (match_rate_bps BETWEEN 1 AND 10000),
  per_member_cap_lamports BIGINT NOT NULL CHECK (per_member_cap_lamports > 0),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  CHECK (window_end > window_start),
  CHECK (remaining_lamports + withdrawn_lamports <= funded_lamports)
);

CREATE TABLE IF NOT EXISTS org_fundings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  funder_wallet TEXT NOT NULL,
  amount_lamports BIGINT NOT NULL CHECK (amount_lamports > 0),
  tx_signature TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One sponsor match per goal. A row exists while a match is reserved or paid.
CREATE TABLE IF NOT EXISTS org_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL UNIQUE REFERENCES goals(id),
  wallet TEXT NOT NULL,
  amount_lamports BIGINT NOT NULL CHECK (amount_lamports > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'paid')),
  tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_matches_org ON org_matches(org_id);

-- Unspent pool withdrawals, with their own claim-before-send uniqueness
-- (separate from the payouts table).
CREATE TABLE IF NOT EXISTS org_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  admin_wallet TEXT NOT NULL,
  amount_lamports BIGINT NOT NULL CHECK (amount_lamports > 0),
  tx_signature TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- at most one in-flight withdrawal per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_withdrawals_pending
  ON org_withdrawals(org_id) WHERE tx_signature = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_withdrawals_sig
  ON org_withdrawals(tx_signature) WHERE tx_signature <> 'pending';

-- Cross-feature signature reuse guard: one on-chain transfer may be credited
-- once, either as a goal stake or as an org funding, never both. Enforced
-- atomically in the database (advisory lock per signature serialises the two
-- tables). Add the same check for any future table that stores such signatures.
CREATE OR REPLACE FUNCTION org_fundings_sig_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('txsig:' || NEW.tx_signature));
  IF EXISTS (SELECT 1 FROM goals WHERE stake_tx_signature = NEW.tx_signature) THEN
    RAISE EXCEPTION 'signature already used as a goal stake' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_org_fundings_sig_guard ON org_fundings;
CREATE TRIGGER trg_org_fundings_sig_guard BEFORE INSERT ON org_fundings
  FOR EACH ROW EXECUTE FUNCTION org_fundings_sig_guard();

CREATE OR REPLACE FUNCTION goals_sig_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stake_tx_signature IS NULL OR NEW.stake_tx_signature = 'pending'
     OR NEW.stake_tx_signature LIKE 'demo_tx_%' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('txsig:' || NEW.stake_tx_signature));
  IF EXISTS (SELECT 1 FROM org_fundings WHERE tx_signature = NEW.stake_tx_signature) THEN
    RAISE EXCEPTION 'signature already used as an org funding' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_goals_sig_guard ON goals;
CREATE TRIGGER trg_goals_sig_guard BEFORE INSERT OR UPDATE OF stake_tx_signature ON goals
  FOR EACH ROW EXECUTE FUNCTION goals_sig_guard();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_fundings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_withdrawals ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (which bypasses RLS) may touch these.

-- Credit a verified on-chain funding transfer. The unique tx_signature insert
-- and the pool credit happen in one transaction; a replayed signature raises
-- unique_violation (23505) and credits nothing.
CREATE OR REPLACE FUNCTION org_fund_pool(
  p_org UUID, p_wallet TEXT, p_signature TEXT, p_lamports BIGINT
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE new_remaining BIGINT;
BEGIN
  IF p_lamports <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  INSERT INTO org_fundings(org_id, funder_wallet, amount_lamports, tx_signature)
    VALUES (p_org, p_wallet, p_lamports, p_signature);
  UPDATE org_pools
     SET funded_lamports = funded_lamports + p_lamports,
         remaining_lamports = remaining_lamports + p_lamports
   WHERE org_id = p_org AND window_end > NOW()
   RETURNING remaining_lamports INTO new_remaining;
  IF NOT FOUND THEN RAISE EXCEPTION 'pool_closed'; END IF;
  RETURN new_remaining;
END $$;

-- Atomically reserve a sponsor match for one completed goal. Re-checks every
-- invariant against the database (membership, window, completed status,
-- remaining balance, per-member cap) so a stale caller can never overspend.
-- Returns the org_matches id, or NULL when the reservation is refused.
CREATE OR REPLACE FUNCTION org_reserve_match(
  p_org UUID, p_wallet TEXT, p_goal UUID, p_amount BIGINT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  pl org_pools%ROWTYPE;
  m org_members%ROWTYPE;
  g RECORD;
  mid UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN NULL; END IF;
  SELECT * INTO pl FROM org_pools WHERE org_id = p_org FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT created_at, wallet_address, status INTO g FROM goals WHERE id = p_goal;
  IF NOT FOUND OR g.status <> 'completed' OR g.wallet_address <> p_wallet THEN RETURN NULL; END IF;
  IF g.created_at < pl.window_start OR g.created_at > pl.window_end THEN RETURN NULL; END IF;
  SELECT * INTO m FROM org_members WHERE org_id = p_org AND wallet = p_wallet FOR UPDATE;
  IF NOT FOUND OR m.joined_at > g.created_at THEN RETURN NULL; END IF;
  IF pl.remaining_lamports < p_amount THEN RETURN NULL; END IF;
  IF m.matched_lamports + p_amount > pl.per_member_cap_lamports THEN RETURN NULL; END IF;

  BEGIN
    INSERT INTO org_matches(org_id, goal_id, wallet, amount_lamports)
      VALUES (p_org, p_goal, p_wallet, p_amount) RETURNING id INTO mid;
  EXCEPTION WHEN unique_violation THEN
    RETURN NULL; -- this goal already has a match
  END;

  UPDATE org_pools SET remaining_lamports = remaining_lamports - p_amount WHERE org_id = p_org;
  UPDATE org_members SET matched_lamports = matched_lamports + p_amount WHERE id = m.id;
  RETURN mid;
END $$;

-- Return a reservation after the transfer definitively failed (nothing was sent).
CREATE OR REPLACE FUNCTION org_release_match(p_match UUID) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE r org_matches%ROWTYPE;
BEGIN
  DELETE FROM org_matches WHERE id = p_match AND status = 'reserved' RETURNING * INTO r;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE org_pools SET remaining_lamports = remaining_lamports + r.amount_lamports WHERE org_id = r.org_id;
  UPDATE org_members SET matched_lamports = matched_lamports - r.amount_lamports
    WHERE org_id = r.org_id AND wallet = r.wallet;
  RETURN TRUE;
END $$;

-- Claim the unspent balance for withdrawal (claim-before-send). Only an org
-- admin, only after the program window ended, only when no member still has an
-- active goal that started inside the window. Zeroes the pool in the same
-- transaction. Returns {ok, reason?, id?, amount?}.
CREATE OR REPLACE FUNCTION org_claim_withdrawal(p_org UUID, p_wallet TEXT) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  o organizations%ROWTYPE;
  pl org_pools%ROWTYPE;
  wid UUID;
BEGIN
  SELECT * INTO o FROM organizations WHERE id = p_org;
  IF NOT FOUND OR NOT (p_wallet = ANY(o.admin_wallets)) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_admin');
  END IF;
  SELECT * INTO pl FROM org_pools WHERE org_id = p_org FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_pool'); END IF;
  IF NOW() <= pl.window_end THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'window_open');
  END IF;
  IF pl.remaining_lamports <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'nothing_to_withdraw');
  END IF;
  IF EXISTS (
    SELECT 1 FROM goals g
      JOIN org_members m ON m.org_id = p_org AND m.wallet = g.wallet_address
     WHERE (g.status = 'active'
            OR (g.status = 'pending_validation' AND g.stake_tx_signature <> 'pending'))
       AND g.created_at >= m.joined_at
       AND g.created_at BETWEEN pl.window_start AND pl.window_end
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'goals_in_progress');
  END IF;
  BEGIN
    INSERT INTO org_withdrawals(org_id, admin_wallet, amount_lamports)
      VALUES (p_org, p_wallet, pl.remaining_lamports) RETURNING id INTO wid;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'withdrawal_in_flight');
  END;
  UPDATE org_pools
     SET withdrawn_lamports = withdrawn_lamports + remaining_lamports, remaining_lamports = 0
   WHERE org_id = p_org;
  RETURN jsonb_build_object('ok', TRUE, 'id', wid, 'amount', pl.remaining_lamports);
END $$;

-- Undo a claimed withdrawal after the transfer definitively failed.
CREATE OR REPLACE FUNCTION org_release_withdrawal(p_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE r org_withdrawals%ROWTYPE;
BEGIN
  DELETE FROM org_withdrawals WHERE id = p_id AND tx_signature = 'pending' RETURNING * INTO r;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE org_pools
     SET remaining_lamports = remaining_lamports + r.amount_lamports,
         withdrawn_lamports = withdrawn_lamports - r.amount_lamports
   WHERE org_id = r.org_id;
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION org_fund_pool(UUID, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_reserve_match(UUID, TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_release_match(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_claim_withdrawal(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_release_withdrawal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION org_fund_pool(UUID, TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION org_reserve_match(UUID, TEXT, UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION org_release_match(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION org_claim_withdrawal(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION org_release_withdrawal(UUID) TO service_role;
