/**
 * Auto-generate JWT token for Snowflake
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const account = 'CUGFKKD-TT48942';
const username = 'ZAINEEL';

try {
  // Read private key
  const privateKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.p8');
  const privateKey = readFileSync(privateKeyPath, 'utf8');

  // Read public key to calculate fingerprint
  const publicKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.pub');
  const publicKey = readFileSync(publicKeyPath, 'utf8');

  // Calculate SHA256 fingerprint of public key
  const publicKeyDER = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  const publicKeyFingerprint = crypto
    .createHash('sha256')
    .update(Buffer.from(publicKeyDER, 'base64'))
    .digest('base64');

  // Construct qualified username
  const qualifiedUsername = `${account}.${username}`;
  const issuer = `${qualifiedUsername}.SHA256:${publicKeyFingerprint}`;

  // Create JWT payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    sub: qualifiedUsername,
    iat: now,
    exp: now + 3600, // 1 hour expiration
  };

  // Sign JWT with RS256
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: {
      alg: 'RS256',
      typ: 'JWT'
    },
    noTimestamp: true
  });

  console.log('✅ JWT Token Generated Successfully!\n');
  console.log('🎫 Your JWT Token:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(token);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📝 Add these to your .env.local file:\n');
  console.log(`SNOWFLAKE_ACCOUNT=${account}`);
  console.log(`SNOWFLAKE_API_ENDPOINT=https://${account}.snowflakecomputing.com`);
  console.log(`SNOWFLAKE_JWT_TOKEN=${token}`);
  console.log('');
  console.log('⏰ Token expires in 1 hour at:', new Date((now + 3600) * 1000).toLocaleString());
  console.log('');

} catch (error) {
  console.error('❌ Error generating JWT:', error);
  process.exit(1);
}
