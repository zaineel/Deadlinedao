# On-chain escrow program (Phase 6)

**Status: EXPERIMENTAL. UNAUDITED. DEVNET-ONLY. NOT WIRED INTO THE APP.**
Nothing in `programs/escrow/` is imported by the web app, deployed, or safe for real funds.

## 1. Problem
Escrow today is one server-held keypair (`lib/solana/escrow.ts`). Anyone who obtains that key, or the server environment, can drain every stake. The product therefore cannot honestly be called "trustless". This design replaces the key with a program whose rules, not an operator, decide where funds go.

## 2. Trust assumptions (what is and is NOT trustless)
Trustless after this change:
- No key can send escrowed funds to an arbitrary address. Payout destinations are fixed by state: the goal owner, or the pool address stored in config.
- Stake is returned to the owner if the resolver goes silent (owner reclaim after a grace period).

Still trusted (be honest in marketing):
- **Resolver key** decides approved vs rejected. A compromised or malicious resolver can wrongly forfeit stakes to the pool (after the appeal window) or wrongly approve. It cannot redirect funds to itself.
- **Authority (multisig)** can rotate the resolver, pause new goals, and queue timelocked refunds to owners. It cannot move funds anywhere but to owners, and not at all after an outcome is decided.
- **Pool address** (config) receives forfeits. It is set at initialization; changing it requires an upgrade (see section 9).
- **Upgrade authority** can replace the program (section 9). Until it is burned or behind a long timelock + multisig, the program is upgradable-trust, not trustless.
- **AI validation quality** and the off-chain dispute reviewers are unchanged trust points.

The honest claim after Phase 6: "funds cannot be stolen by a server key; outcome decisions are made by a rotatable resolver, appealable, and refundable on resolver failure."

## 3. Threat model
| Threat | Mitigation |
|---|---|
| Server/resolver key stolen | Resolver can only choose outcomes, never destinations. Authority rotates it (`set_resolver`) immediately. Damage bounded to wrongful forfeits inside appeal windows; owners can dispute and bond. Per-goal stake cap. |
| Authority/multisig compromised | Cannot redirect funds; emergency path only refunds owners and is timelocked and cancelable. Can pause new goals, rotate resolver (a real risk: attacker-controlled resolver). Mitigated by multisig threshold and monitoring of `set_resolver` events. |
| Attacker passes a fake destination account | `address = goal.owner` / `address = config.pool` constraints; PDA seeds bind goal, vault and config. |
| Fake vault / goal substitution | All PDAs verified by seeds + stored bumps; goal seeds include owner and goal_id; vault seeds include the goal key. |
| Replay / double payout | One-way status machine; payout moves state to a terminal status before the CPI, same transaction. Goal PDA is `init` so a (owner, goal_id) cannot be recreated. |
| Re-entrancy | Only System Program CPIs; state is written before transfers. |
| Race: resolver vs. emergency vs. reclaim | Emergency requires an undecided status at execution time; once a resolver decides, `execute_emergency` fails. Reclaim only after a long grace. |
| Griefing by tiny/dust goals | `MIN_STAKE`; owner pays goal-account rent. |
| Rent-exemption traps | Vault is a zero-data system PDA; stake >= MIN_STAKE exceeds the rent minimum, and payouts drain it to exactly 0, which is allowed. |
| Integer overflow | `checked_*` everywhere, u128 for bond math (tested). |
| Clock manipulation | Uses `Clock::unix_timestamp` only for coarse windows (hours to days). |
| Corrupt status byte | Unknown values decode as a terminal status so they can never pay out. |
| Wrong cluster / program id | Placeholder id; real id generated at first build. Client takes the id as a parameter. |
| Upgrade-key abuse | Section 9. |

## 4. Accounts
- `Config` PDA `["config"]`: `authority`, `pending_authority`, `resolver`, `pool`, `appeal_window_secs`, `emergency_timelock_secs`, `reclaim_grace_secs`, `paused`, `bump`.
- `GoalAccount` PDA `["goal", owner, goal_id_le_u64]`: `owner`, `goal_id`, `status`, `stake`, `bond`, `deadline`, `appeal_deadline`, `disputed_at`, `emergency_eta`, bumps.
- Vault PDA `["vault", goal]`: a system-owned account (no data) that holds lamports. Only the program can sign for it (`invoke_signed` with the vault seeds).

`goal_id` is chosen by the owner (the off-chain app can use a per-wallet counter; the DB UUID is stored off-chain and mapped to `goal_id`).

## 5. State machine (implemented in `programs/escrow/core`)
```
Active --resolve_approved--------------------> Approved --release_to_owner--> PaidOwner
Active --resolve_rejected--> Appealable --finalize_unappealed (after window)--> Failed --forfeit_to_pool--> PaidPool
Active --resolve_expired (after deadline)----> Failed
Appealable --open_dispute (owner, bond, in window)--> Disputed
Disputed --resolve_dispute(overturn)--> Approved   (stake + bond to owner)
Disputed --resolve_dispute(uphold)----> Failed     (stake + bond to pool)
Active|Disputed --owner_reclaim (resolver silent > grace)--> PaidOwner
Active|Appealable|Disputed --queue_emergency (authority) ... timelock ... execute_emergency--> PaidOwner
```
`PaidOwner` and `PaidPool` are terminal.

## 6. Instructions and who may call them
| Instruction | Caller | Notes |
|---|---|---|
| `initialize` | first caller becomes authority | Must be called atomically with deploy, then authority handed to the multisig. |
| `set_resolver`, `set_paused` | authority | Pause blocks only `create_goal`; exits are never pausable. |
| `propose_authority` / `accept_authority` | authority / new authority | Two-step to avoid typos. |
| `create_goal(goal_id, stake, deadline)` | owner (signer) | Transfers stake to the vault. Validated range and horizon. |
| `resolve_approved`, `resolve_rejected`, `resolve_expired`, `resolve_dispute` | resolver | Cannot choose a destination. |
| `open_dispute(bond)` | owner | Within the appeal window; bond >= 5% of stake, held in the vault. One per goal. |
| `finalize_unappealed` | anyone | After the window. |
| `release_to_owner`, `forfeit_to_pool` | anyone (crank) | Destination pinned by account constraints. Anyone can finish an already-decided payout, so decided outcomes cannot be stalled. |
| `owner_reclaim` | anyone (pays owner) | Active past `deadline + grace`, or Disputed past `disputed_at + grace`. |
| `queue_emergency`, `cancel_emergency` | authority | Undecided goals only. |
| `execute_emergency` | anyone, after timelock | Pays the owner only. |

## 7. Replay, double-spend, rent and fees
- No off-chain signed messages to replay: the resolver signs the Solana transaction itself, which already carries a recent blockhash and fee-payer. Offline-signed ed25519 attestations were considered and rejected because they add nonce management for no benefit.
- Idempotency: every instruction is valid in exactly one status; a duplicate call returns `InvalidStatus` and moves nothing. The off-chain resolver service must still use the existing DB claim-before-send discipline (see section 10) so it does not spam duplicate transactions.
- Rent: the owner pays the `GoalAccount` rent. (Gap: closing the account to reclaim rent after the terminal state is not implemented in the scaffold; add `close = owner` on a `close_goal` instruction.) The vault needs no rent.
- Fees: v0 has none. The only sinks are the owner and the pool. A protocol fee (bps on forfeits, capped) is a possible later addition and must be audited as a new fund flow.

## 8. How the off-chain app signs outcomes
A **resolver service** (separate from the web app's request path, holding the resolver key in a KMS/HSM or at minimum an isolated secret) watches the DB:
- goal `completed` -> `resolve_approved`
- goal `rejected_appealable` -> `resolve_rejected` (starts the on-chain 48h window; DB `appeal_deadline` is derived from chain time)
- goal expired with no proof -> `resolve_expired`
- dispute `overturned` / `upheld` -> `resolve_dispute(true|false)`
Then anyone (the app cron, or the owner) cranks `release_to_owner` / `forfeit_to_pool` / `finalize_unappealed`. The chain is the source of truth for money; the DB mirrors it by reading goal accounts or events. The resolver key never lives in the Next.js runtime. A resolver key rotation is a multisig action with no redeploy.

Future hardening: a k-of-n resolver set (e.g. AI service + admin reviewer must both sign) by extending Config with a signer list and threshold. Out of scope for the scaffold.

## 9. Upgrade-authority policy
- Devnet: deployer wallet holds upgrade authority.
- Pre-mainnet: transfer upgrade authority to a multisig (Squads) with a time-delayed upgrade (>= 48h, announced publicly). Publish verifiable builds (`solana-verify`).
- Mainnet GA: either burn upgrade authority or keep a timelocked multisig and say so. Pool address and parameters are immutable post-init in v0, so changing them means an upgrade.
- Config `authority` and upgrade authority should be different multisigs.

## 10. Phase 1 dispute mapping and migration
| DB status | On-chain |
|---|---|
| `active` | Active |
| `completed` | Approved -> PaidOwner |
| `rejected_appealable` | Appealable |
| `disputed` | Disputed (bond in the vault; replaces the separate bond payout) |
| `failed` (upheld / unappealed / expired) | Failed -> PaidPool |

Migration plan from the server-held keypair:
1. Devnet only: ship the program, run the resolver service in shadow mode (observe, no writes) beside the current flow.
2. Feature flag `onchain_escrow` (new): new goals on a test cohort stake via `create_goal`; existing goals finish on the legacy keypair. Never migrate in-flight legacy stakes; drain them to completion.
3. Per-goal DB column `escrow_kind` (`legacy|program`) decides which payout path runs. Legacy payouts still use `claimPayout` -> send -> `finalizePayout`. Program payouts are cranked on-chain and the DB records the signature through the same payout table for reporting.
4. Reward-pool distribution (`team_reward`, `completion_reward`) sources from the pool address; decide whether it becomes a program-owned PDA (recommended, needs an added instruction and audit).
5. Retire the legacy keypair when no legacy goals remain; sweep and rotate.
No part of this migration is implemented here.

## 11. Known gaps in this scaffold
- Not built or run on-chain (see section 13). No integration tests (needs `solana-test-validator` or LiteSVM/Bankrun).
- No goal-account close / rent reclaim.
- Pool is a plain address; reward distribution out of it is not modeled.
- Single resolver key, not k-of-n.
- Dispute bond is a fixed minimum; no resolver fee or reviewer incentives.
- Params are set at init and not updatable.
- SPL-token stakes are out of scope (SOL only).
- Events are minimal.

## 12. Audit scope (minimum)
1. Every instruction: signer checks, `has_one`/`address` constraints, PDA seed/bump derivation, account substitution and duplicate-account attacks.
2. State machine completeness and one-way property; fuzz the core transitions (property tests: conservation of lamports, no double-pay).
3. Lamport accounting: vault drains to exactly zero; rent-exemption edge cases; `invoke_signed` seeds.
4. Authority model: initialization front-running, two-step handover, resolver rotation, pause semantics (exits unpausable).
5. Emergency path and reclaim: timelock bypass, interaction with resolver decisions, stuck-state analysis.
6. Time handling and parameter bounds; integer math.
7. Upgrade authority and deployment procedure; verifiable build reproduction.
8. Off-chain resolver service: key custody, idempotent submission, DB/chain divergence handling.
9. Client builders and IDL consistency (error code order between `EscrowErr` and `escrow_core::EscrowError` is load-bearing).
10. Dependency pinning and Anchor/Solana version advisories.

## 13. What was and was not verified
- Compiled and tested: `programs/escrow/core` (pure state machine, zero dependencies) with `cargo test` on rustc 1.68.2: 19 unit tests pass.
- NOT compiled: `programs/escrow/program` (Anchor). The environment has rustc 1.68.2 and no Anchor CLI or Solana toolchain; Anchor 0.30 needs a newer Rust and the SBF toolchain. The code is written carefully but has never been through a compiler; expect fixes on first build.
- NOT run: any on-chain behavior, PDA derivation parity between Rust and the TS client, or deployment.
- TypeScript client sketch is excluded from typecheck and lint and has not been compiled.
