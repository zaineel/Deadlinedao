//! EXPERIMENTAL / UNAUDITED / DEVNET-ONLY.
//!
//! Pure, dependency-free state machine for the DeadlineDAO escrow. The Anchor
//! program in `../program` only does account validation and lamport movement;
//! every decision about *whether* a transition is legal and *how much* moves
//! is made here so it can be tested with plain `cargo test`.
//!
//! Invariants (enforced by tests):
//! * Status only moves forward; `PaidOwner` and `PaidPool` are terminal.
//! * Funds are paid out at most once, and only to a destination fixed by the
//!   status (owner or pool), never to a caller-chosen address.
//! * All arithmetic is checked; no panics on any input.

/// Lamports.
pub type Lamports = u64;

pub const MIN_STAKE: Lamports = 10_000_000; // 0.01 SOL (devnet scaffold value)
pub const MAX_STAKE: Lamports = 5_000_000_000; // 5 SOL cap per goal while unaudited
pub const MAX_HORIZON_SECS: i64 = 366 * 24 * 3600;
pub const BOND_BPS: u64 = 500; // 5% minimum dispute bond (matches Phase 1 design)
pub const BPS_DENOM: u64 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Status {
    Active = 0,
    /// AI rejected; owner may open a dispute until `appeal_deadline`.
    Appealable = 1,
    Disputed = 2,
    /// Outcome decided: owner is owed stake (+ bond). Payable by anyone.
    Approved = 3,
    /// Outcome decided: pool is owed stake (+ bond). Payable by anyone.
    Failed = 4,
    /// Terminal: paid to owner (normal release, reclaim or emergency).
    PaidOwner = 5,
    /// Terminal: paid to the reward pool.
    PaidPool = 6,
}

impl Status {
    pub fn is_terminal(self) -> bool {
        matches!(self, Status::PaidOwner | Status::PaidPool)
    }
    /// States in which emergency refund / reclaim may apply (outcome undecided).
    pub fn is_undecided(self) -> bool {
        matches!(self, Status::Active | Status::Appealable | Status::Disputed)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum EscrowError {
    InvalidStake = 0,
    InvalidDeadline = 1,
    InvalidStatus = 2,
    TooEarly = 3,
    TooLate = 4,
    BondTooSmall = 5,
    MathOverflow = 6,
    EmergencyAlreadyQueued = 7,
    EmergencyNotQueued = 8,
    InvalidParams = 9,
}

impl EscrowError {
    pub fn code(self) -> u32 {
        self as u32
    }
}

pub type Res<T> = Result<T, EscrowError>;

/// Where a payout goes. The program maps these to fixed accounts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Destination {
    Owner,
    Pool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Payout {
    pub to: Destination,
    pub amount: Lamports,
}

/// Global timing parameters, stored in the config account.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Params {
    pub appeal_window_secs: i64,
    /// Authority-queued emergency refunds execute only after this delay.
    pub emergency_timelock_secs: i64,
    /// If the resolver never acts, the owner may reclaim after this grace.
    pub reclaim_grace_secs: i64,
}

impl Params {
    pub fn validate(&self) -> Res<()> {
        const DAY: i64 = 24 * 3600;
        let ok = self.appeal_window_secs >= 3600
            && self.appeal_window_secs <= 14 * DAY
            && self.emergency_timelock_secs >= DAY
            && self.emergency_timelock_secs <= 30 * DAY
            && self.reclaim_grace_secs >= DAY
            && self.reclaim_grace_secs <= 180 * DAY;
        if ok {
            Ok(())
        } else {
            Err(EscrowError::InvalidParams)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Goal {
    pub status: Status,
    pub stake: Lamports,
    pub bond: Lamports,
    pub deadline: i64,
    pub appeal_deadline: i64,
    pub disputed_at: i64,
    /// 0 = none queued.
    pub emergency_eta: i64,
}

fn add(a: u64, b: u64) -> Res<u64> {
    a.checked_add(b).ok_or(EscrowError::MathOverflow)
}

/// Minimum bond = ceil(stake * BOND_BPS / BPS_DENOM), computed in u128.
pub fn min_bond(stake: Lamports) -> Res<Lamports> {
    let num = (stake as u128)
        .checked_mul(BOND_BPS as u128)
        .and_then(|v| v.checked_add(BPS_DENOM as u128 - 1))
        .ok_or(EscrowError::MathOverflow)?;
    u64::try_from(num / BPS_DENOM as u128).map_err(|_| EscrowError::MathOverflow)
}

impl Goal {
    pub fn new(stake: Lamports, deadline: i64, now: i64) -> Res<Goal> {
        if !(MIN_STAKE..=MAX_STAKE).contains(&stake) {
            return Err(EscrowError::InvalidStake);
        }
        let horizon = now.checked_add(MAX_HORIZON_SECS).ok_or(EscrowError::MathOverflow)?;
        if deadline <= now || deadline > horizon {
            return Err(EscrowError::InvalidDeadline);
        }
        Ok(Goal {
            status: Status::Active,
            stake,
            bond: 0,
            deadline,
            appeal_deadline: 0,
            disputed_at: 0,
            emergency_eta: 0,
        })
    }

    fn require(&self, s: Status) -> Res<()> {
        if self.status == s {
            Ok(())
        } else {
            Err(EscrowError::InvalidStatus)
        }
    }

    pub fn total_held(&self) -> Res<Lamports> {
        add(self.stake, self.bond)
    }

    // ---- resolver-driven transitions -------------------------------------

    /// Active -> Approved (AI/validator accepted the proof).
    pub fn resolve_approved(&mut self) -> Res<()> {
        self.require(Status::Active)?;
        self.status = Status::Approved;
        Ok(())
    }

    /// Active -> Appealable (AI rejected; opens the appeal window).
    pub fn resolve_rejected(&mut self, now: i64, p: &Params) -> Res<()> {
        self.require(Status::Active)?;
        self.appeal_deadline = now.checked_add(p.appeal_window_secs).ok_or(EscrowError::MathOverflow)?;
        self.status = Status::Appealable;
        Ok(())
    }

    /// Active -> Failed when the deadline passed with no proof (nothing to appeal).
    pub fn resolve_expired(&mut self, now: i64) -> Res<()> {
        self.require(Status::Active)?;
        if now <= self.deadline {
            return Err(EscrowError::TooEarly);
        }
        self.status = Status::Failed;
        Ok(())
    }

    /// Disputed -> Approved (overturned) or Failed (upheld).
    pub fn resolve_dispute(&mut self, overturn: bool) -> Res<()> {
        self.require(Status::Disputed)?;
        self.emergency_eta = 0;
        self.status = if overturn { Status::Approved } else { Status::Failed };
        Ok(())
    }

    // ---- owner-driven transitions ----------------------------------------

    /// Appealable -> Disputed. Caller must already have verified the signer is the owner.
    pub fn open_dispute(&mut self, now: i64, bond: Lamports) -> Res<()> {
        self.require(Status::Appealable)?;
        if now > self.appeal_deadline {
            return Err(EscrowError::TooLate);
        }
        if bond < min_bond(self.stake)? {
            return Err(EscrowError::BondTooSmall);
        }
        // Overflow check on the eventual payout.
        add(self.stake, bond)?;
        self.bond = bond;
        self.disputed_at = now;
        self.status = Status::Disputed;
        Ok(())
    }

    /// Owner reclaim when the resolver is silent: Active past deadline+grace,
    /// or Disputed past disputed_at+grace. Returns the payout to the owner.
    pub fn owner_reclaim(&mut self, now: i64, p: &Params) -> Res<Payout> {
        let ready_at = match self.status {
            Status::Active => self.deadline,
            Status::Disputed => self.disputed_at,
            _ => return Err(EscrowError::InvalidStatus),
        };
        let t = ready_at.checked_add(p.reclaim_grace_secs).ok_or(EscrowError::MathOverflow)?;
        if now <= t {
            return Err(EscrowError::TooEarly);
        }
        self.pay(Status::PaidOwner, Destination::Owner)
    }

    // ---- permissionless transitions --------------------------------------

    /// Appealable -> Failed once the window closed with no dispute.
    pub fn finalize_unappealed(&mut self, now: i64) -> Res<()> {
        self.require(Status::Appealable)?;
        if now <= self.appeal_deadline {
            return Err(EscrowError::TooEarly);
        }
        self.status = Status::Failed;
        Ok(())
    }

    /// Approved -> PaidOwner. Anyone may crank; destination is fixed to owner.
    pub fn release_to_owner(&mut self) -> Res<Payout> {
        self.require(Status::Approved)?;
        self.pay(Status::PaidOwner, Destination::Owner)
    }

    /// Failed -> PaidPool. Anyone may crank; destination is fixed to the pool.
    pub fn forfeit_to_pool(&mut self) -> Res<Payout> {
        self.require(Status::Failed)?;
        self.pay(Status::PaidPool, Destination::Pool)
    }

    // ---- emergency path (authority, timelocked, owner-only destination) ---

    pub fn queue_emergency(&mut self, now: i64, p: &Params) -> Res<()> {
        if !self.status.is_undecided() {
            return Err(EscrowError::InvalidStatus);
        }
        if self.emergency_eta != 0 {
            return Err(EscrowError::EmergencyAlreadyQueued);
        }
        self.emergency_eta = now.checked_add(p.emergency_timelock_secs).ok_or(EscrowError::MathOverflow)?;
        Ok(())
    }

    pub fn cancel_emergency(&mut self) -> Res<()> {
        if self.emergency_eta == 0 {
            return Err(EscrowError::EmergencyNotQueued);
        }
        self.emergency_eta = 0;
        Ok(())
    }

    pub fn execute_emergency(&mut self, now: i64) -> Res<Payout> {
        if self.emergency_eta == 0 {
            return Err(EscrowError::EmergencyNotQueued);
        }
        if !self.status.is_undecided() {
            return Err(EscrowError::InvalidStatus);
        }
        if now < self.emergency_eta {
            return Err(EscrowError::TooEarly);
        }
        self.pay(Status::PaidOwner, Destination::Owner)
    }

    fn pay(&mut self, terminal: Status, to: Destination) -> Res<Payout> {
        let amount = self.total_held()?;
        self.status = terminal;
        self.emergency_eta = 0;
        Ok(Payout { to, amount })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000_000;
    const P: Params = Params {
        appeal_window_secs: 48 * 3600,
        emergency_timelock_secs: 7 * 24 * 3600,
        reclaim_grace_secs: 30 * 24 * 3600,
    };
    const STAKE: u64 = 1_000_000_000;

    fn goal() -> Goal {
        Goal::new(STAKE, NOW + 86_400, NOW).unwrap()
    }

    #[test]
    fn new_validates_stake_and_deadline() {
        assert_eq!(Goal::new(MIN_STAKE - 1, NOW + 10, NOW), Err(EscrowError::InvalidStake));
        assert_eq!(Goal::new(MAX_STAKE + 1, NOW + 10, NOW), Err(EscrowError::InvalidStake));
        assert_eq!(Goal::new(STAKE, NOW, NOW), Err(EscrowError::InvalidDeadline));
        assert_eq!(Goal::new(STAKE, NOW - 1, NOW), Err(EscrowError::InvalidDeadline));
        assert_eq!(Goal::new(STAKE, NOW + MAX_HORIZON_SECS + 1, NOW), Err(EscrowError::InvalidDeadline));
        assert_eq!(Goal::new(STAKE, i64::MAX, i64::MAX - 5), Err(EscrowError::MathOverflow));
        assert!(Goal::new(MIN_STAKE, NOW + MAX_HORIZON_SECS, NOW).is_ok());
    }

    #[test]
    fn params_validate() {
        assert!(P.validate().is_ok());
        let mut bad = P;
        bad.emergency_timelock_secs = 60;
        assert_eq!(bad.validate(), Err(EscrowError::InvalidParams));
        bad = P;
        bad.appeal_window_secs = 0;
        assert_eq!(bad.validate(), Err(EscrowError::InvalidParams));
    }

    #[test]
    fn approved_path_pays_owner_once() {
        let mut g = goal();
        g.resolve_approved().unwrap();
        let pay = g.release_to_owner().unwrap();
        assert_eq!(pay, Payout { to: Destination::Owner, amount: STAKE });
        assert_eq!(g.status, Status::PaidOwner);
        assert_eq!(g.release_to_owner(), Err(EscrowError::InvalidStatus));
        assert_eq!(g.forfeit_to_pool(), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn cannot_resolve_twice() {
        let mut g = goal();
        g.resolve_approved().unwrap();
        assert_eq!(g.resolve_approved(), Err(EscrowError::InvalidStatus));
        assert_eq!(g.resolve_rejected(NOW, &P), Err(EscrowError::InvalidStatus));
        assert_eq!(g.resolve_expired(NOW + 10_000_000), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn rejected_without_appeal_forfeits_after_window() {
        let mut g = goal();
        g.resolve_rejected(NOW, &P).unwrap();
        assert_eq!(g.appeal_deadline, NOW + P.appeal_window_secs);
        assert_eq!(g.finalize_unappealed(NOW + P.appeal_window_secs), Err(EscrowError::TooEarly));
        assert_eq!(g.forfeit_to_pool(), Err(EscrowError::InvalidStatus));
        g.finalize_unappealed(NOW + P.appeal_window_secs + 1).unwrap();
        let pay = g.forfeit_to_pool().unwrap();
        assert_eq!(pay, Payout { to: Destination::Pool, amount: STAKE });
        assert_eq!(g.status, Status::PaidPool);
        assert_eq!(g.forfeit_to_pool(), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn dispute_window_and_bond_enforced() {
        let mut g = goal();
        g.resolve_rejected(NOW, &P).unwrap();
        let mb = min_bond(STAKE).unwrap();
        assert_eq!(mb, 50_000_000);
        assert_eq!(g.open_dispute(NOW + 1, mb - 1), Err(EscrowError::BondTooSmall));
        assert_eq!(g.open_dispute(NOW + P.appeal_window_secs + 1, mb), Err(EscrowError::TooLate));
        g.open_dispute(NOW + P.appeal_window_secs, mb).unwrap();
        assert_eq!(g.status, Status::Disputed);
        // second dispute impossible
        assert_eq!(g.open_dispute(NOW + 2, mb), Err(EscrowError::InvalidStatus));
        // cannot finalize as unappealed once disputed
        assert_eq!(g.finalize_unappealed(NOW + 10_000_000), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn dispute_cannot_open_from_active() {
        let mut g = goal();
        assert_eq!(g.open_dispute(NOW, 50_000_000), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn overturned_dispute_refunds_stake_and_bond_to_owner() {
        let mut g = goal();
        g.resolve_rejected(NOW, &P).unwrap();
        g.open_dispute(NOW + 5, 60_000_000).unwrap();
        g.resolve_dispute(true).unwrap();
        let pay = g.release_to_owner().unwrap();
        assert_eq!(pay, Payout { to: Destination::Owner, amount: STAKE + 60_000_000 });
    }

    #[test]
    fn upheld_dispute_sends_stake_and_bond_to_pool() {
        let mut g = goal();
        g.resolve_rejected(NOW, &P).unwrap();
        g.open_dispute(NOW + 5, 50_000_000).unwrap();
        g.resolve_dispute(false).unwrap();
        let pay = g.forfeit_to_pool().unwrap();
        assert_eq!(pay, Payout { to: Destination::Pool, amount: STAKE + 50_000_000 });
        assert_eq!(g.release_to_owner(), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn resolve_dispute_requires_disputed() {
        let mut g = goal();
        assert_eq!(g.resolve_dispute(true), Err(EscrowError::InvalidStatus));
        g.resolve_rejected(NOW, &P).unwrap();
        assert_eq!(g.resolve_dispute(false), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn expiry_requires_deadline_passed() {
        let mut g = goal();
        assert_eq!(g.resolve_expired(g.deadline), Err(EscrowError::TooEarly));
        g.resolve_expired(g.deadline + 1).unwrap();
        assert_eq!(g.status, Status::Failed);
    }

    #[test]
    fn owner_reclaim_after_grace_only() {
        let mut g = goal();
        let t = g.deadline + P.reclaim_grace_secs;
        assert_eq!(g.owner_reclaim(t, &P), Err(EscrowError::TooEarly));
        let pay = g.owner_reclaim(t + 1, &P).unwrap();
        assert_eq!(pay.to, Destination::Owner);
        assert_eq!(pay.amount, STAKE);
        assert_eq!(g.owner_reclaim(t + 2, &P), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn owner_reclaim_from_stuck_dispute_includes_bond() {
        let mut g = goal();
        g.resolve_rejected(NOW, &P).unwrap();
        g.open_dispute(NOW + 10, 50_000_000).unwrap();
        assert_eq!(g.owner_reclaim(NOW + 11, &P), Err(EscrowError::TooEarly));
        let pay = g.owner_reclaim(NOW + 10 + P.reclaim_grace_secs + 1, &P).unwrap();
        assert_eq!(pay.amount, STAKE + 50_000_000);
    }

    #[test]
    fn owner_reclaim_not_allowed_when_decided_or_appealable() {
        let mut g = goal();
        g.resolve_rejected(NOW, &P).unwrap();
        assert_eq!(g.owner_reclaim(i64::MAX - 1, &P), Err(EscrowError::InvalidStatus));
        let mut h = goal();
        h.resolve_approved().unwrap();
        assert_eq!(h.owner_reclaim(i64::MAX - 1, &P), Err(EscrowError::InvalidStatus));
    }

    #[test]
    fn emergency_is_timelocked_cancelable_and_owner_only() {
        let mut g = goal();
        assert_eq!(g.execute_emergency(NOW), Err(EscrowError::EmergencyNotQueued));
        g.queue_emergency(NOW, &P).unwrap();
        assert_eq!(g.queue_emergency(NOW, &P), Err(EscrowError::EmergencyAlreadyQueued));
        assert_eq!(g.execute_emergency(NOW + P.emergency_timelock_secs - 1), Err(EscrowError::TooEarly));
        g.cancel_emergency().unwrap();
        assert_eq!(g.cancel_emergency(), Err(EscrowError::EmergencyNotQueued));
        g.queue_emergency(NOW, &P).unwrap();
        let pay = g.execute_emergency(NOW + P.emergency_timelock_secs).unwrap();
        assert_eq!(pay, Payout { to: Destination::Owner, amount: STAKE });
        assert_eq!(g.status, Status::PaidOwner);
        assert_eq!(g.execute_emergency(NOW + 10_000_000), Err(EscrowError::EmergencyNotQueued));
    }

    #[test]
    fn emergency_cannot_override_decided_outcomes() {
        let mut g = goal();
        g.resolve_approved().unwrap();
        assert_eq!(g.queue_emergency(NOW, &P), Err(EscrowError::InvalidStatus));
        // queued while active, then resolver decides: emergency must not execute
        let mut h = goal();
        h.queue_emergency(NOW, &P).unwrap();
        h.resolve_expired(h.deadline + 1).unwrap();
        assert_eq!(h.execute_emergency(NOW + 100_000_000), Err(EscrowError::InvalidStatus));
        assert_eq!(h.forfeit_to_pool().unwrap().to, Destination::Pool);
    }

    #[test]
    fn terminal_states_never_move() {
        for terminal in [Status::PaidOwner, Status::PaidPool] {
            let mut g = goal();
            g.status = terminal;
            assert!(g.status.is_terminal());
            assert!(g.resolve_approved().is_err());
            assert!(g.resolve_rejected(NOW, &P).is_err());
            assert!(g.resolve_expired(i64::MAX - 1).is_err());
            assert!(g.open_dispute(NOW, 60_000_000).is_err());
            assert!(g.resolve_dispute(true).is_err());
            assert!(g.finalize_unappealed(i64::MAX - 1).is_err());
            assert!(g.release_to_owner().is_err());
            assert!(g.forfeit_to_pool().is_err());
            assert!(g.owner_reclaim(i64::MAX - 1, &P).is_err());
            assert!(g.queue_emergency(NOW, &P).is_err());
        }
    }

    #[test]
    fn checked_math_no_overflow_panics() {
        assert!(min_bond(u64::MAX).is_ok());
        let mut g = goal();
        g.stake = u64::MAX;
        g.status = Status::Appealable;
        g.appeal_deadline = NOW + 100;
        assert_eq!(g.open_dispute(NOW, u64::MAX), Err(EscrowError::MathOverflow));
        let mut h = goal();
        assert_eq!(h.resolve_rejected(i64::MAX, &P), Err(EscrowError::MathOverflow));
        let mut k = goal();
        assert_eq!(k.queue_emergency(i64::MAX, &P), Err(EscrowError::MathOverflow));
    }

    #[test]
    fn payout_conserves_funds() {
        let mut g = goal();
        g.resolve_rejected(NOW, &P).unwrap();
        g.open_dispute(NOW + 1, 123_456_789).unwrap();
        let held = g.total_held().unwrap();
        g.resolve_dispute(false).unwrap();
        assert_eq!(g.forfeit_to_pool().unwrap().amount, held);
    }
}
