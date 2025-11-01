/**
 * Verify that our JWT is properly signed and can be decoded
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const account = 'CUGFKKD-TT48942';
const username = 'ZAINEEL';

try {
  // Read keys
  const privateKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.p8');
  const privateKey = readFileSync(privateKeyPath, 'utf8');

  const publicKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.pub');
  const publicKey = readFileSync(publicKeyPath, 'utf8');

  // Calculate fingerprint
  const publicKeyDER = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  const publicKeyFingerprint = crypto
    .createHash('sha256')
    .update(Buffer.from(publicKeyDER, 'base64'))
    .digest('base64');

  console.log('🔐 JWT Signature Verification');
  console.log('━'.repeat(70));
  console.log('');

  // Create JWT
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
    sub: `${account}.${username}`,
    iat: now,
    exp: now + 3600,
  };

  console.log('1️⃣  Creating JWT with payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT' },
    noTimestamp: true,
  });

  console.log('2️⃣  JWT Token generated:');
  console.log(token.substring(0, 100) + '...');
  console.log('');

  // Decode without verification to inspect
  const decoded = jwt.decode(token, { complete: true });
  console.log('3️⃣  Decoded JWT (without verification):');
  console.log(JSON.stringify(decoded, null, 2));
  console.log('');

  // Verify with public key
  console.log('4️⃣  Verifying JWT signature with public key...');
  try {
    const verified = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
    });

    console.log('✅ JWT signature is VALID!');
    console.log('');
    console.log('Verified payload:');
    console.log(JSON.stringify(verified, null, 2));
    console.log('');
    console.log('━'.repeat(70));
    console.log('');
    console.log('The JWT is properly signed with the RSA private key');
    console.log('and can be verified with the public key.');
    console.log('');
    console.log('This confirms the JWT itself is valid.');
    console.log('The issue is with Snowflake accepting it for REST API authentication.');
    console.log('');
  } catch (verifyError: any) {
    console.log('❌ JWT signature verification FAILED!');
    console.log('Error:', verifyError.message);
    console.log('');
    console.log('This indicates a problem with the key pair or signing process.');
  }

  // Additional checks
  console.log('━'.repeat(70));
  console.log('5️⃣  Additional Checks:');
  console.log('');

  // Check if private and public keys are a matching pair
  const testData = 'test message';
  const sign = crypto.createSign('SHA256');
  sign.update(testData);
  const signature = sign.sign(privateKey);

  const verify = crypto.createVerify('SHA256');
  verify.update(testData);
  const isValidPair = verify.verify(publicKey, signature);

  if (isValidPair) {
    console.log('✅ Private and public keys are a matching pair');
  } else {
    console.log('❌ Private and public keys DO NOT match!');
  }
  console.log('');

  // Check key formats
  console.log('Private key format:', privateKey.includes('BEGIN PRIVATE KEY') ? 'PKCS#8' :
                                      privateKey.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1' : 'Unknown');
  console.log('Public key format:', publicKey.includes('BEGIN PUBLIC KEY') ? 'X.509/SPKI' : 'Unknown');
  console.log('');

  console.log('━'.repeat(70));
  console.log('');
  console.log('📋 Summary:');
  console.log('');
  console.log('If all checks passed, the JWT and keys are valid.');
  console.log('The issue is that Snowflake REST API is not accepting keypair JWT authentication.');
  console.log('');
  console.log('Recommended next steps:');
  console.log('1. Run the diagnostic SQL queries in scripts/snowflake-diagnostics.sql');
  console.log('2. Check with Snowflake support if REST API keypair auth is enabled');
  console.log('3. Consider using OAuth authentication instead');
  console.log('');

} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
