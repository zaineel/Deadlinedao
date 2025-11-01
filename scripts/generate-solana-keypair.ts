/**
 * Generate a new Solana keypair for the escrow wallet
 * Run with: npx tsx scripts/generate-solana-keypair.ts
 */

import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

async function generateKeypair() {
  console.log('🔑 Generating new Solana keypair for escrow wallet...\n');

  // Generate keypair
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const secretKeyArray = Array.from(keypair.secretKey);

  console.log('✅ Keypair generated!\n');
  console.log('📋 Public Key (Escrow Address):');
  console.log(publicKey);
  console.log('\n🔐 Private Key (for .env.local):');
  console.log(JSON.stringify(secretKeyArray));

  console.log('\n📝 Add this to your .env.local file:');
  console.log('─────────────────────────────────────────────────────');
  console.log(`SOLANA_ESCROW_PRIVATE_KEY=${JSON.stringify(secretKeyArray)}`);
  console.log('─────────────────────────────────────────────────────');

  console.log('\n💰 Fund your escrow wallet (devnet):');
  console.log(`   Visit: https://faucet.solana.com`);
  console.log(`   Address: ${publicKey}`);

  console.log('\n🔗 View on Solana Explorer:');
  console.log(`   https://explorer.solana.com/address/${publicKey}?cluster=devnet`);

  // Optionally save to a file
  const saveToFile = process.argv.includes('--save');
  if (saveToFile) {
    const outputPath = path.join(process.cwd(), 'escrow-keypair.json');
    fs.writeFileSync(
      outputPath,
      JSON.stringify({
        publicKey,
        secretKey: secretKeyArray,
      }, null, 2)
    );
    console.log(`\n💾 Keypair saved to: ${outputPath}`);
    console.log('⚠️  IMPORTANT: Keep this file secure and do NOT commit it to git!');
  }

  console.log('\n✨ Setup complete!\n');
}

generateKeypair().catch(console.error);
