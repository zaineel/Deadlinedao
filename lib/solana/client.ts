import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';

// Get RPC URL from environment (defaults to devnet)
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('devnet');

// Create Solana connection
export const connection = new Connection(RPC_URL, 'confirmed');

/**
 * Get the escrow wallet keypair from environment variable
 * The private key should be stored as a JSON array in the environment
 */
export function getEscrowKeypair(): Keypair {
  const privateKeyString = process.env.SOLANA_ESCROW_PRIVATE_KEY;

  if (!privateKeyString) {
    throw new Error('SOLANA_ESCROW_PRIVATE_KEY environment variable is not set');
  }

  try {
    const privateKeyArray = JSON.parse(privateKeyString);
    return Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
  } catch (error) {
    throw new Error('Invalid SOLANA_ESCROW_PRIVATE_KEY format. Must be a JSON array of numbers.');
  }
}

/**
 * Convert SOL amount to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Get account balance in SOL
 */
export async function getBalance(publicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(publicKey);
  return lamportsToSol(balance);
}

/**
 * Get escrow wallet public key
 */
export function getEscrowPublicKey(): PublicKey {
  return getEscrowKeypair().publicKey;
}

/**
 * Validate a Solana public key string
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current slot (block height)
 */
export async function getCurrentSlot(): Promise<number> {
  return await connection.getSlot();
}

/**
 * Wait for transaction confirmation
 */
export async function confirmTransaction(signature: string): Promise<boolean> {
  try {
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    return !confirmation.value.err;
  } catch (error) {
    console.error('Error confirming transaction:', error);
    return false;
  }
}

/**
 * Get recent blockhash for transactions
 */
export async function getRecentBlockhash() {
  return await connection.getLatestBlockhash('confirmed');
}

/**
 * Format public key for display (truncated)
 */
export function formatPublicKey(publicKey: PublicKey | string, length: number = 8): string {
  const address = typeof publicKey === 'string' ? publicKey : publicKey.toBase58();
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

/**
 * Check if wallet has sufficient balance
 */
export async function hasSufficientBalance(
  publicKey: PublicKey,
  requiredAmount: number
): Promise<boolean> {
  const balance = await getBalance(publicKey);
  return balance >= requiredAmount;
}

/**
 * Airdrop SOL to an address (devnet/testnet only)
 */
export async function airdropSol(
  publicKey: PublicKey,
  amount: number = 1
): Promise<{ signature: string | null; error: Error | null }> {
  try {
    const lamports = solToLamports(amount);
    const signature = await connection.requestAirdrop(publicKey, lamports);
    await confirmTransaction(signature);
    return { signature, error: null };
  } catch (error) {
    console.error('Airdrop failed:', error);
    return { signature: null, error: error as Error };
  }
}

// Export connection and utility types
export type { Connection, PublicKey, Keypair };
