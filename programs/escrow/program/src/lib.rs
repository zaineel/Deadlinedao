//! EXPERIMENTAL / UNAUDITED / DEVNET-ONLY. UNBUILT: written without an Anchor
//! toolchain. See docs/designs/escrow-program.md.
//!
//! Account model:
//!   Config  PDA ["config"]                  : authority, resolver, pool, params, pause flag
//!   Goal    PDA ["goal", owner, goal_id_le] : state machine record (see escrow-core)
//!   Vault   PDA ["vault", goal]             : system-owned PDA that holds the lamports
//!
//! All decisions come from `escrow_core::Goal`; this file validates accounts,
//! checks signers and moves lamports to destinations fixed by the state.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use escrow_core as core;

declare_id!("Escr0wDDao1111111111111111111111111111111111");

#[program]
pub mod deadlinedao_escrow {
    use super::*;

    /// One-time setup. Whoever calls this becomes the initial authority, so
    /// the deployer must call it in the same step as deployment and then
    /// transfer authority to the multisig via `propose/accept_authority`.
    pub fn initialize(ctx: Context<Initialize>, resolver: Pubkey, pool: Pubkey, params: ParamsArg) -> Result<()> {
        let p = params.into_core();
        p.validate().map_err(map_err)?;
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.pending_authority = Pubkey::default();
        c.resolver = resolver;
        c.pool = pool;
        c.appeal_window_secs = p.appeal_window_secs;
        c.emergency_timelock_secs = p.emergency_timelock_secs;
        c.reclaim_grace_secs = p.reclaim_grace_secs;
        c.paused = false;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    /// Authority rotates the resolver key (fast: a compromised resolver must be replaceable immediately).
    pub fn set_resolver(ctx: Context<AdminOnly>, resolver: Pubkey) -> Result<()> {
        require_keys_neq!(resolver, Pubkey::default(), EscrowErr::InvalidParams);
        ctx.accounts.config.resolver = resolver;
        Ok(())
    }

    /// Pausing blocks only `create_goal`. Exits are never pausable.
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// Two-step authority handover so a typo cannot brick the program.
    pub fn propose_authority(ctx: Context<AdminOnly>, new_authority: Pubkey) -> Result<()> {
        ctx.accounts.config.pending_authority = new_authority;
        Ok(())
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let c = &mut ctx.accounts.config;
        require_keys_neq!(c.pending_authority, Pubkey::default(), EscrowErr::InvalidParams);
        c.authority = c.pending_authority;
        c.pending_authority = Pubkey::default();
        Ok(())
    }

    /// Owner stakes `stake` lamports into a fresh vault PDA.
    pub fn create_goal(ctx: Context<CreateGoal>, goal_id: u64, stake: u64, deadline: i64) -> Result<()> {
        require!(!ctx.accounts.config.paused, EscrowErr::Paused);
        let now = Clock::get()?.unix_timestamp;
        let g = core::Goal::new(stake, deadline, now).map_err(map_err)?;

        let goal = &mut ctx.accounts.goal;
        goal.owner = ctx.accounts.owner.key();
        goal.goal_id = goal_id;
        goal.vault_bump = ctx.bumps.vault;
        goal.bump = ctx.bumps.goal;
        goal.store(&g);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            stake,
        )?;
        emit!(GoalCreated { goal: goal.key(), owner: goal.owner, goal_id, stake, deadline });
        Ok(())
    }

    // ---- resolver instructions (resolver key from config) -----------------

    pub fn resolve_approved(ctx: Context<Resolve>) -> Result<()> {
        mutate(&mut ctx.accounts.goal, |g| g.resolve_approved())?;
        emit!(Resolved { goal: ctx.accounts.goal.key(), outcome: 1 });
        Ok(())
    }

    pub fn resolve_rejected(ctx: Context<Resolve>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = ctx.accounts.config.params();
        mutate(&mut ctx.accounts.goal, |g| g.resolve_rejected(now, &p))?;
        emit!(Resolved { goal: ctx.accounts.goal.key(), outcome: 2 });
        Ok(())
    }

    pub fn resolve_expired(ctx: Context<Resolve>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        mutate(&mut ctx.accounts.goal, |g| g.resolve_expired(now))?;
        emit!(Resolved { goal: ctx.accounts.goal.key(), outcome: 3 });
        Ok(())
    }

    pub fn resolve_dispute(ctx: Context<Resolve>, overturn: bool) -> Result<()> {
        mutate(&mut ctx.accounts.goal, |g| g.resolve_dispute(overturn))?;
        emit!(Resolved { goal: ctx.accounts.goal.key(), outcome: if overturn { 4 } else { 5 } });
        Ok(())
    }

    // ---- owner instructions ----------------------------------------------

    /// Owner appeals an AI rejection and posts the bond into the vault.
    pub fn open_dispute(ctx: Context<OwnerAction>, bond: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        mutate(&mut ctx.accounts.goal, |g| g.open_dispute(now, bond))?;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            bond,
        )?;
        Ok(())
    }

    /// Resolver silent past the grace period: owner takes the funds back.
    pub fn owner_reclaim(ctx: Context<OwnerPayout>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = ctx.accounts.config.params();
        let payout = mutate_payout(&mut ctx.accounts.goal, |g| g.owner_reclaim(now, &p))?;
        pay_from_vault(&ctx.accounts.goal, &ctx.accounts.vault, &ctx.accounts.owner.to_account_info(), &ctx.accounts.system_program, payout.amount)
    }

    // ---- permissionless cranks -------------------------------------------

    pub fn finalize_unappealed(ctx: Context<Crank>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        mutate(&mut ctx.accounts.goal, |g| g.finalize_unappealed(now))
    }

    /// Pays stake (+ bond on overturn) to the goal owner. Callable by anyone.
    pub fn release_to_owner(ctx: Context<OwnerPayout>) -> Result<()> {
        let payout = mutate_payout(&mut ctx.accounts.goal, |g| g.release_to_owner())?;
        pay_from_vault(&ctx.accounts.goal, &ctx.accounts.vault, &ctx.accounts.owner.to_account_info(), &ctx.accounts.system_program, payout.amount)
    }

    /// Pays stake (+ bond) to the pool address in config. Callable by anyone.
    pub fn forfeit_to_pool(ctx: Context<PoolPayout>) -> Result<()> {
        let payout = mutate_payout(&mut ctx.accounts.goal, |g| g.forfeit_to_pool())?;
        pay_from_vault(&ctx.accounts.goal, &ctx.accounts.vault, &ctx.accounts.pool.to_account_info(), &ctx.accounts.system_program, payout.amount)
    }

    // ---- emergency path (authority; timelocked; destination = owner) ------

    pub fn queue_emergency(ctx: Context<AdminGoal>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = ctx.accounts.config.params();
        mutate(&mut ctx.accounts.goal, |g| g.queue_emergency(now, &p))?;
        emit!(EmergencyQueued { goal: ctx.accounts.goal.key(), eta: ctx.accounts.goal.emergency_eta });
        Ok(())
    }

    pub fn cancel_emergency(ctx: Context<AdminGoal>) -> Result<()> {
        mutate(&mut ctx.accounts.goal, |g| g.cancel_emergency())
    }

    /// Anyone may execute once the timelock elapsed (so owners are not
    /// dependent on the authority to complete a refund it already queued).
    pub fn execute_emergency(ctx: Context<OwnerPayout>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let payout = mutate_payout(&mut ctx.accounts.goal, |g| g.execute_emergency(now))?;
        pay_from_vault(&ctx.accounts.goal, &ctx.accounts.vault, &ctx.accounts.owner.to_account_info(), &ctx.accounts.system_program, payout.amount)
    }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

fn map_err(e: core::EscrowError) -> Error {
    // Offsets into EscrowErr; keep the two enums in the same order.
    Error::from(match e {
        core::EscrowError::InvalidStake => EscrowErr::InvalidStake,
        core::EscrowError::InvalidDeadline => EscrowErr::InvalidDeadline,
        core::EscrowError::InvalidStatus => EscrowErr::InvalidStatus,
        core::EscrowError::TooEarly => EscrowErr::TooEarly,
        core::EscrowError::TooLate => EscrowErr::TooLate,
        core::EscrowError::BondTooSmall => EscrowErr::BondTooSmall,
        core::EscrowError::MathOverflow => EscrowErr::MathOverflow,
        core::EscrowError::EmergencyAlreadyQueued => EscrowErr::EmergencyAlreadyQueued,
        core::EscrowError::EmergencyNotQueued => EscrowErr::EmergencyNotQueued,
        core::EscrowError::InvalidParams => EscrowErr::InvalidParams,
    })
}

/// Load -> apply pure transition -> store. State is only written on success.
fn mutate<F>(goal: &mut Account<GoalAccount>, f: F) -> Result<()>
where
    F: FnOnce(&mut core::Goal) -> core::Res<()>,
{
    let mut g = goal.load();
    f(&mut g).map_err(map_err)?;
    goal.store(&g);
    Ok(())
}

fn mutate_payout<F>(goal: &mut Account<GoalAccount>, f: F) -> Result<core::Payout>
where
    F: FnOnce(&mut core::Goal) -> core::Res<core::Payout>,
{
    let mut g = goal.load();
    let p = f(&mut g).map_err(map_err)?;
    goal.store(&g);
    Ok(p)
}

/// Moves `amount` out of the vault PDA. State was already advanced to a
/// terminal status (checks-effects-interactions); a CPI failure reverts the tx.
fn pay_from_vault<'info>(
    goal: &Account<'info, GoalAccount>,
    vault: &SystemAccount<'info>,
    to: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    let goal_key = goal.key();
    let seeds: &[&[u8]] = &[b"vault", goal_key.as_ref(), &[goal.vault_bump]];
    system_program::transfer(
        CpiContext::new_with_signer(
            system_program.to_account_info(),
            Transfer { from: vault.to_account_info(), to: to.clone() },
            &[seeds],
        ),
        amount,
    )
}

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub pending_authority: Pubkey,
    pub resolver: Pubkey,
    pub pool: Pubkey,
    pub appeal_window_secs: i64,
    pub emergency_timelock_secs: i64,
    pub reclaim_grace_secs: i64,
    pub paused: bool,
    pub bump: u8,
}
impl Config {
    pub const SPACE: usize = 8 + 32 * 4 + 8 * 3 + 1 + 1;
    pub fn params(&self) -> core::Params {
        core::Params {
            appeal_window_secs: self.appeal_window_secs,
            emergency_timelock_secs: self.emergency_timelock_secs,
            reclaim_grace_secs: self.reclaim_grace_secs,
        }
    }
}

#[account]
pub struct GoalAccount {
    pub owner: Pubkey,
    pub goal_id: u64,
    pub status: u8,
    pub stake: u64,
    pub bond: u64,
    pub deadline: i64,
    pub appeal_deadline: i64,
    pub disputed_at: i64,
    pub emergency_eta: i64,
    pub bump: u8,
    pub vault_bump: u8,
}
impl GoalAccount {
    pub const SPACE: usize = 8 + 32 + 8 + 1 + 8 * 6 + 1 + 1;

    pub fn load(&self) -> core::Goal {
        core::Goal {
            status: status_from_u8(self.status),
            stake: self.stake,
            bond: self.bond,
            deadline: self.deadline,
            appeal_deadline: self.appeal_deadline,
            disputed_at: self.disputed_at,
            emergency_eta: self.emergency_eta,
        }
    }
    pub fn store(&mut self, g: &core::Goal) {
        self.status = g.status as u8;
        self.stake = g.stake;
        self.bond = g.bond;
        self.deadline = g.deadline;
        self.appeal_deadline = g.appeal_deadline;
        self.disputed_at = g.disputed_at;
        self.emergency_eta = g.emergency_eta;
    }
}

fn status_from_u8(v: u8) -> core::Status {
    use core::Status::*;
    match v {
        0 => Active,
        1 => Appealable,
        2 => Disputed,
        3 => Approved,
        4 => Failed,
        5 => PaidOwner,
        // Unknown values are treated as terminal so corrupt data can never pay out.
        _ => PaidPool,
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ParamsArg {
    pub appeal_window_secs: i64,
    pub emergency_timelock_secs: i64,
    pub reclaim_grace_secs: i64,
}
impl ParamsArg {
    fn into_core(self) -> core::Params {
        core::Params {
            appeal_window_secs: self.appeal_window_secs,
            emergency_timelock_secs: self.emergency_timelock_secs,
            reclaim_grace_secs: self.reclaim_grace_secs,
        }
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = Config::SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority @ EscrowErr::Unauthorized)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump,
        constraint = config.pending_authority == new_authority.key() @ EscrowErr::Unauthorized)]
    pub config: Account<'info, Config>,
    pub new_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(goal_id: u64)]
pub struct CreateGoal<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = owner, space = GoalAccount::SPACE,
        seeds = [b"goal", owner.key().as_ref(), &goal_id.to_le_bytes()], bump
    )]
    pub goal: Account<'info, GoalAccount>,
    #[account(mut, seeds = [b"vault", goal.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = resolver @ EscrowErr::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"goal", goal.owner.as_ref(), &goal.goal_id.to_le_bytes()], bump = goal.bump)]
    pub goal: Account<'info, GoalAccount>,
    pub resolver: Signer<'info>,
}

#[derive(Accounts)]
pub struct OwnerAction<'info> {
    #[account(
        mut, seeds = [b"goal", owner.key().as_ref(), &goal.goal_id.to_le_bytes()], bump = goal.bump,
        has_one = owner @ EscrowErr::Unauthorized
    )]
    pub goal: Account<'info, GoalAccount>,
    #[account(mut, seeds = [b"vault", goal.key().as_ref()], bump = goal.vault_bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Payout to the owner, used by `release_to_owner`, `owner_reclaim` and
/// `execute_emergency`. Any signer may pay the fee and crank it; this is safe
/// because the destination is pinned to `goal.owner` and the amount and
/// legality come only from the state machine.
#[derive(Accounts)]
pub struct OwnerPayout<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"goal", goal.owner.as_ref(), &goal.goal_id.to_le_bytes()], bump = goal.bump)]
    pub goal: Account<'info, GoalAccount>,
    #[account(mut, seeds = [b"vault", goal.key().as_ref()], bump = goal.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: pinned to goal.owner by the constraint below; only receives lamports.
    #[account(mut, address = goal.owner @ EscrowErr::WrongDestination)]
    pub owner: UncheckedAccount<'info>,
    pub caller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PoolPayout<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"goal", goal.owner.as_ref(), &goal.goal_id.to_le_bytes()], bump = goal.bump)]
    pub goal: Account<'info, GoalAccount>,
    #[account(mut, seeds = [b"vault", goal.key().as_ref()], bump = goal.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: pinned to config.pool; only receives lamports.
    #[account(mut, address = config.pool @ EscrowErr::WrongDestination)]
    pub pool: UncheckedAccount<'info>,
    pub caller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Crank<'info> {
    #[account(mut, seeds = [b"goal", goal.owner.as_ref(), &goal.goal_id.to_le_bytes()], bump = goal.bump)]
    pub goal: Account<'info, GoalAccount>,
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminGoal<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority @ EscrowErr::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"goal", goal.owner.as_ref(), &goal.goal_id.to_le_bytes()], bump = goal.bump)]
    pub goal: Account<'info, GoalAccount>,
    pub authority: Signer<'info>,
}

// ---------------------------------------------------------------------------
// events and errors
// ---------------------------------------------------------------------------

#[event]
pub struct GoalCreated {
    pub goal: Pubkey,
    pub owner: Pubkey,
    pub goal_id: u64,
    pub stake: u64,
    pub deadline: i64,
}

/// outcome: 1 approved, 2 rejected (appealable), 3 expired, 4 dispute overturned, 5 dispute upheld
#[event]
pub struct Resolved {
    pub goal: Pubkey,
    pub outcome: u8,
}

#[event]
pub struct EmergencyQueued {
    pub goal: Pubkey,
    pub eta: i64,
}

// Keep in the same order as escrow_core::EscrowError.
#[error_code]
pub enum EscrowErr {
    #[msg("Stake outside allowed range")]
    InvalidStake,
    #[msg("Deadline invalid")]
    InvalidDeadline,
    #[msg("Invalid status for this action")]
    InvalidStatus,
    #[msg("Too early")]
    TooEarly,
    #[msg("Too late")]
    TooLate,
    #[msg("Dispute bond too small")]
    BondTooSmall,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Emergency already queued")]
    EmergencyAlreadyQueued,
    #[msg("Emergency not queued")]
    EmergencyNotQueued,
    #[msg("Invalid parameters")]
    InvalidParams,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Program is paused for new goals")]
    Paused,
    #[msg("Wrong destination account")]
    WrongDestination,
}
