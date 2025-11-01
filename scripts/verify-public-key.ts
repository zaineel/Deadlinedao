/**
 * Verify public key format and generate correct upload command
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

const account = 'CUGFKKD-TT48942';
const username = 'ZAINEEL';

try {
  // Read the public key
  const publicKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.pub');
  const publicKey = readFileSync(publicKeyPath, 'utf8');

  console.log('📋 Current Public Key File Content:');
  console.log('━'.repeat(70));
  console.log(publicKey);
  console.log('━'.repeat(70));
  console.log('');

  // Extract the key content (without headers)
  const publicKeyDER = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  console.log('🔑 Public Key (Base64, no headers):');
  console.log('━'.repeat(70));
  console.log(publicKeyDER);
  console.log('━'.repeat(70));
  console.log('');

  // Calculate SHA256 fingerprint
  const publicKeyFingerprint = crypto
    .createHash('sha256')
    .update(Buffer.from(publicKeyDER, 'base64'))
    .digest('base64');

  console.log('🔍 Calculated SHA256 Fingerprint:');
  console.log('━'.repeat(70));
  console.log(publicKeyFingerprint);
  console.log('━'.repeat(70));
  console.log('');

  console.log('✅ CORRECT SQL Command to Upload Public Key:');
  console.log('━'.repeat(70));
  console.log('');
  console.log('-- Run this in your Snowflake SQL worksheet:');
  console.log('');
  console.log(`ALTER USER ${username} SET RSA_PUBLIC_KEY='${publicKeyDER}';`);
  console.log('');
  console.log('━'.repeat(70));
  console.log('');

  console.log('📝 Verification Steps:');
  console.log('');
  console.log('1. Run the ALTER USER command above in Snowflake');
  console.log('');
  console.log('2. Then verify with this query:');
  console.log(`   DESC USER ${username};`);
  console.log('');
  console.log('3. Check that RSA_PUBLIC_KEY_FP matches:');
  console.log(`   Expected: SHA256:${publicKeyFingerprint}`);
  console.log('');
  console.log('4. The RSA_PUBLIC_KEY should match the base64 string above (without headers)');
  console.log('');

  console.log('⚠️  IMPORTANT NOTES:');
  console.log('━'.repeat(70));
  console.log('');
  console.log('- The public key must NOT include -----BEGIN PUBLIC KEY----- or -----END PUBLIC KEY-----');
  console.log('- The public key must be a single line (no newlines)');
  console.log('- The fingerprint in Snowflake should be prefixed with SHA256:');
  console.log('- If the fingerprint does not match, re-upload the key using the command above');
  console.log('');

} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
