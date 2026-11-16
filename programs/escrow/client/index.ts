/**
 * EXPERIMENTAL / UNAUDITED / DEVNET-ONLY. A SKETCH, NOT WIRED INTO THE APP.
 * Excluded from the web typecheck and lint. Types and PDA derivation only;
 * instruction encoding would come from the Anchor-generated IDL
 * (`anchor build` emits target/idl/deadlinedao_escrow.json) once built.
 */
import { PublicKey } from '@solana/web3.js';

export const ESCROW_PROGRAM_ID = new PublicKey('Escr0wDDao1111111111111111111111111111111111'); // placeholder

export type GoalStatus =
  | 'active'
  | 'appealable'
  | 'disputed'
  | 'approved'
  | 'failed'
  | 'paid_owner'
  | 'paid_pool';

export const STATUS_BY_CODE: Record<number, GoalStatus> = {
  0: 'active',
  1: 'appealable',
  2: 'disputed',
  3: 'approved',
  4: 'failed',
  5: 'paid_owner',
  6: 'paid_pool',
};

export interface EscrowParams {
  appealWindowSecs: bigint;
  emergencyTimelockSecs: bigint;
  reclaimGraceSecs: bigint;
}

export interface GoalAccountData {
  owner: PublicKey;
  goalId: bigint;
  status: GoalStatus;
  stake: bigint;
  bond: bigint;
  deadline: bigint;
  appealDeadline: bigint;
  disputedAt: bigint;
  emergencyEta: bigint;
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

export function configPda(programId = ESCROW_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], programId)[0];
}

export function goalPda(owner: PublicKey, goalId: bigint, programId = ESCROW_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('goal'), owner.toBuffer(), u64le(goalId)], programId)[0];
}

export function vaultPda(goal: PublicKey, programId = ESCROW_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), goal.toBuffer()], programId)[0];
}

/** Argument shapes for each instruction; names match the Rust handlers. */
export interface EscrowInstructionArgs {
  initialize: { resolver: PublicKey; pool: PublicKey; params: EscrowParams };
  setResolver: { resolver: PublicKey };
  setPaused: { paused: boolean };
  proposeAuthority: { newAuthority: PublicKey };
  acceptAuthority: Record<string, never>;
  createGoal: { goalId: bigint; stake: bigint; deadline: bigint };
  resolveApproved: Record<string, never>;
  resolveRejected: Record<string, never>;
  resolveExpired: Record<string, never>;
  resolveDispute: { overturn: boolean };
  openDispute: { bond: bigint };
  ownerReclaim: Record<string, never>;
  finalizeUnappealed: Record<string, never>;
  releaseToOwner: Record<string, never>;
  forfeitToPool: Record<string, never>;
  queueEmergency: Record<string, never>;
  cancelEmergency: Record<string, never>;
  executeEmergency: Record<string, never>;
}

/** Who must sign each instruction (documentation as types). */
export const REQUIRED_SIGNER: Record<keyof EscrowInstructionArgs, 'authority' | 'resolver' | 'owner' | 'anyone' | 'newAuthority'> = {
  initialize: 'authority',
  setResolver: 'authority',
  setPaused: 'authority',
  proposeAuthority: 'authority',
  acceptAuthority: 'newAuthority',
  createGoal: 'owner',
  resolveApproved: 'resolver',
  resolveRejected: 'resolver',
  resolveExpired: 'resolver',
  resolveDispute: 'resolver',
  openDispute: 'owner',
  ownerReclaim: 'anyone',
  finalizeUnappealed: 'anyone',
  releaseToOwner: 'anyone',
  forfeitToPool: 'anyone',
  queueEmergency: 'authority',
  cancelEmergency: 'authority',
  executeEmergency: 'anyone',
};

/**
 * Map of an off-chain DB goal status to the on-chain call the resolver service
 * would make. The resolver service holds the resolver key (rotatable by the
 * multisig authority) and is the ONLY thing that can pick approved vs rejected.
 */
export function resolverCallFor(
  dbStatus: 'completed' | 'rejected_appealable' | 'failed_expired' | 'dispute_overturned' | 'dispute_upheld',
): keyof EscrowInstructionArgs {
  switch (dbStatus) {
    case 'completed':
      return 'resolveApproved';
    case 'rejected_appealable':
      return 'resolveRejected';
    case 'failed_expired':
      return 'resolveExpired';
    case 'dispute_overturned':
    case 'dispute_upheld':
      return 'resolveDispute';
  }
}
