# DeadlineDAO roadmap: build plan

Covers the four "what's next" items plus the groundwork they need. Each phase ends in something shippable and tested. Detailed design for phase 1 is in [validation-disputes.md](./validation-disputes.md).

## Ground rules (apply to every phase)
- One branch per phase off the latest merged base; PR + CI green before the next phase starts.
- Every money movement uses the claim-before-send pattern (`claimPayout` / `finalizePayout` / `releasePayout`) with a unique index per (goal, payout type). New payout types extend the `payouts.payout_type` check.
- Every state change that gates money uses `transitionGoalStatus`-style atomic updates.
- Every route: zod schema, auth (wallet signature / admin key / cron secret), no error details to callers, tests.
- Numbered, idempotent SQL migrations in `supabase-migrations/`, applied before the code that needs them is deployed.
- Features behind env flags (`FEATURE_DISPUTES`, `FEATURE_TEAMS`, `FEATURE_ORGS`) so main stays deployable.

## Phase 0: Foundations (before any new feature)
Unblocks everything else; mostly open items from the audit.
1. Merge PR #4 and apply `001_payout_safety.sql`; set `ADMIN_API_KEY`, `CRON_SECRET`; rotate the Snowflake key and purge it from history; untrack `rsa_key_base64.txt`, `snowflake.log`, `.claude/settings.local.json`.
2. **Wallet sessions**: replace per-request signing with sign-in-with-wallet (nonce -> signature -> short-lived signed session cookie / bearer token). Needed by teams, orgs, disputes and mobile. New `lib/auth/session.ts`, `POST /api/auth/nonce`, `POST /api/auth/verify`, `requireSession()` helper. Keep per-request proof signing as defense in depth.
3. **UTC deadline helper**: one `sameDeadlineDay()` / SQL filter replacing the four copies; fixes timezone drift in pools and rewards.
4. Presigned upload: require session + enforce content-type and size, or delete it (unused today).
5. Rate limiting (Vercel Firewall rules or Upstash) on proofs, uploads, auth.
6. Image proofs: wire `analyzeProofImage` into `validateProof` or remove the claim from the README.
7. Notification service skeleton (`lib/notify`): interface + email/web-push stub. Used by appeal windows, team invites, mobile push.
8. Escrow honesty: README/pitch say "trustless", but escrow is a server-held keypair. Decide: (a) reword the claim now, (b) schedule the on-chain escrow program (Phase 6).

Exit criteria: CI green, devnet smoke test of create -> stake -> proof -> payout -> reward run passes, secrets rotated.

## Phase 1: Validation disputes (v1, admin resolver)
See design doc. Summary: `rejected_appealable` + 48h window, 5% bond, `disputed`, admin resolves, bond refund/forfeit, finalize cron, reward/pool code only counts final `failed`.
- Migration `002_disputes.sql`; routes `/api/disputes`, `/api/admin/disputes`, `/api/cron/finalize-appeals`.
- Notify owner on rejection (appeal link), window closing, resolution.

## Phase 2: Team deadlines (stake together, win together)
### Model
- `teams` (id, name, owner_wallet, invite_code, created_at)
- `team_members` (team_id, wallet, role, joined_at; unique team+wallet)
- `team_goals` (id, team_id, title, description, category, deadline, stake_per_member, rule, status)
- `goals.team_goal_id` (nullable FK): each member's stake/proof is still an individual `goals` row, so staking, proofs, AI validation and payouts are reused unchanged.
### Rules (decision needed, recommended default first)
- **Team-first redistribution (recommended):** members who fail forfeit into the *team's* pool first, split among teammates who completed; any remainder, or the whole pool if nobody completes, goes to the global pool as today.
- All-or-nothing: team succeeds only if every member completes; bonus on success. Harsher, simpler to explain.
### Flow
Create team -> invite code -> members join -> team goal created -> each member stakes (existing confirm flow) -> individual proofs -> settlement at deadline (after appeal windows) via `trigger-rewards`-style team settlement with per-member claim rows.
### Work
- Migration `003_teams.sql`; `/api/teams`, `/api/teams/[id]/join`, `/api/team-goals`, admin team settlement; UI: teams page, invite link, team progress view, leaderboard.
- Settlement reuses `computeRewardPayouts` style pure function with tests (pro rata inside the team, rounding, nobody completed, single member).

## Phase 3: Employer integration (corporate wellness)
### Model
- `organizations` (id, name, admin_wallets[], created_at), `org_members` (org_id, wallet, joined_at, consent flag), `org_pools` (org_id, funded_amount, remaining, match_rate, per_member_cap, active window).
- `goals.org_id` (nullable); new payout type `sponsor_match`.
### Flow
Employer funds a sponsor pool (on-chain transfer verified like stakes) -> employees join via invite -> employee stakes their own SOL -> on completion the employee gets their stake back plus a match from the pool (up to cap and remaining balance, claimed atomically) -> unspent pool can be withdrawn by org admin after the program ends.
### Rules
- Employers see **aggregate, opt-in** stats only (participation, completion rate, spend). Never an individual's proofs or descriptions without that employee's consent.
- Org admin actions need a session whose wallet is in `admin_wallets`.
### Work
Migration `004_orgs.sql`; `/api/orgs`, `/api/orgs/[id]/fund`, `/api/orgs/[id]/members`, `/api/orgs/[id]/stats`; employer dashboard; tests for match caps and pool exhaustion races.

## Phase 4: Mobile app (React Native / Expo)
### Prerequisites
Phase 0 sessions (mobile cannot use per-request browser wallet popups).
### Setup
- Convert repo to workspaces: `apps/web` (current app), `apps/mobile` (Expo), `packages/shared` (zod schemas, types, API client, message builders such as `lib/auth/proof-message`). Done as its own refactor PR first, with web behavior unchanged.
### Features
- **iPhone first (Expo, iOS).** Solana Mobile Wallet Adapter is Android-only, so iOS connects via wallet deep links (Phantom/Solflare): the app opens the wallet to connect, sign-in message, and sign/send transactions, then receives the result through a universal link/URL scheme. Sign-in-with-wallet session stored in the iOS Keychain (`expo-secure-store`). Android can follow later with MWA behind the same wallet interface.
- Create goal / stake, submit proof with camera + upload, dashboard, appeal flow, team and org views.
- Push notifications (deadline reminders, appeal window, team activity) via Expo push; `push_tokens` table + `lib/notify` sender.
- **Social proof sharing:** public share page `/p/[id]` with OG image card for completed goals (opt-in, no wallet, no private text), deep link back into the app.
### Work
Migration `005_push_tokens.sql`; `/api/push/register`; `/p/[id]` page + OG route; app screens and EAS build config.

## Phase 5: DAO governance (disputes v2)
- Replace single-admin resolution with panel voting: eligible voters are wallets with at least N completed goals; each dispute draws M voters (random, excluding parties); votes are signed; majority decides; admin override stays as an emergency break.
- Incentive: voters on the winning side split a share of the bond; a missed vote has a small penalty.
- New tables `dispute_votes`, `voter_stats`; settlement is claim-before-send per voter.
- Governance-lite for parameters (bond %, window, quorum): admin-set at first, voteable later. No token in v2; decide separately whether a token adds anything.

## Phase 6: On-chain escrow (optional, security milestone)
Move from a server-held escrow keypair to an Anchor program with PDA vaults per goal and authority-gated release (program checks proof/dispute outcome signed by a resolver key or multisig). Removes the single key that can drain escrow and makes "trustless" true. Largest effort and needs a program audit before mainnet, so schedule it before any real-money launch.

## Sequencing and dependencies
```
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3
              \                    \
               -> Phase 5            -> (needs 0) Phase 4 (mobile, can start after Phase 1 UI is stable)
Phase 6 gates mainnet; do before any real-money launch
```
Suggested order: 0, 1, 2, 3, 4, 5, with 6 before mainnet. Mobile can run in parallel with 2/3 once Phase 0 sessions exist.

## Cross-cutting risks
- **Legal/compliance:** staking real money on personal goals with pooled redistribution can fall under gambling/wagering rules depending on jurisdiction; employer integration adds employment-law and privacy issues (consent, data minimization). Needs review before any mainnet or employer pilot.
- **Custody:** until Phase 6, the platform holds user funds with one key. Keep devnet-only or tiny limits.
- **AI judge reliability:** disputes and teams raise the stakes of wrong verdicts; keep the fail-closed behavior and measure appeal-overturn rate as the quality signal.
- **Reward timing:** every new non-final state (appeal, dispute, team settlement) must block reward runs for its deadline day; covered by a shared `deadlineIsSettled()` check and tests.

## Open decisions (defaults assumed if unanswered)
1. Team rule: team-first redistribution (default) vs all-or-nothing.
2. Employer funding in SOL on-chain (default) vs off-chain budget with invoicing.
3. Mobile: **iPhone first with Expo** (decided); wallet via Phantom/Solflare deep links. Android/MWA later.
4. Governance voter eligibility threshold (default: 3 completed goals) and panel size (default: 5).
5. Is mainnet in scope for the next release, or devnet/demo only (default)?
