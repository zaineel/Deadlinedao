/**
 * Pure check used by on-chain verification of user -> escrow transfers
 * (stake confirmation and dispute bonds). No network access.
 */
export interface ParsedInstructionLike {
  program?: string;
  parsed?: unknown;
}

export function hasEscrowTransfer(
  instructions: ReadonlyArray<unknown>,
  escrowAddress: string,
  senderAddress: string,
  minLamports: number
): boolean {
  for (const raw of instructions) {
    const instruction = raw as ParsedInstructionLike;
    if (!instruction || !('parsed' in instruction) || instruction.program !== 'system') continue;
    const parsed = instruction.parsed as
      | { type?: string; info?: { destination?: string; source?: string; lamports?: number } }
      | undefined;
    if (parsed?.type !== 'transfer' || !parsed.info) continue;
    const { destination, source, lamports } = parsed.info;
    if (
      destination === escrowAddress &&
      source === senderAddress &&
      typeof lamports === 'number' &&
      lamports >= minLamports
    ) {
      return true;
    }
  }
  return false;
}
