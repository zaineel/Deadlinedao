/**
 * Generate JWT token for Snowflake authentication
 * Run with: tsx scripts/generate-snowflake-jwt.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

// You'll need to install jsonwebtoken package
// Run: npm install jsonwebtoken @types/jsonwebtoken

interface SnowflakeJWTPayload {
  iss: string; // Issuer: <account>.<user>.SHA256(<public_key>)
  sub: string; // Subject: <account>.<user>
  iat: number; // Issued at
  exp: number; // Expiration (max 1 hour)
}

async function generateSnowflakeJWT() {
  console.log('🔐 Generating Snowflake JWT Token');
  console.log('==================================\n');

  // Read configuration from user input
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise(resolve => {
      readline.question(query, resolve);
    });
  };

  try {
    // Get Snowflake account information
    console.log('📝 Enter your Snowflake account information:\n');

    const account = await question('Account identifier (e.g., xy12345): ');
    const username = await question('Username (e.g., MYUSER): ');

    // Read private key
    const privateKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.p8');
    console.log(`\n🔑 Reading private key from: ${privateKeyPath}\n`);

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
    const qualifiedUsername = `${account.toUpperCase()}.${username.toUpperCase()}`;
    const issuer = `${qualifiedUsername}.SHA256:${publicKeyFingerprint}`;

    // Create JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload: SnowflakeJWTPayload = {
      iss: issuer,
      sub: qualifiedUsername,
      iat: now,
      exp: now + 3600, // 1 hour expiration
    };

    console.log('📋 JWT Payload:');
    console.log('   Issuer:', payload.iss);
    console.log('   Subject:', payload.sub);
    console.log('   Issued At:', new Date(payload.iat * 1000).toISOString());
    console.log('   Expires:', new Date(payload.exp * 1000).toISOString());
    console.log('');

    // Sign JWT with RS256
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      header: {
        alg: 'RS256',
        typ: 'JWT'
      },
      noTimestamp: true // We're providing iat manually
    });

    console.log('✅ JWT Token Generated Successfully!\n');
    console.log('🎫 Your JWT Token:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(token);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Generate .env.local format
    console.log('📝 Add these to your .env.local file:\n');
    console.log(`SNOWFLAKE_ACCOUNT=${account.toUpperCase()}`);
    console.log(`SNOWFLAKE_API_ENDPOINT=https://${account}.snowflakecomputing.com`);
    console.log(`SNOWFLAKE_JWT_TOKEN=${token}`);
    console.log('');

    console.log('⚠️  Note: JWT tokens expire after 1 hour.');
    console.log('   You\'ll need to regenerate the token periodically.');
    console.log('');

    readline.close();

  } catch (error) {
    console.error('❌ Error generating JWT:', error);
    readline.close();
    process.exit(1);
  }
}

generateSnowflakeJWT();
