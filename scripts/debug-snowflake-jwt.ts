/**
 * Debug Snowflake JWT authentication
 * Try different account identifier formats
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

// Different account format variations to try
const accountFormats = [
  { name: 'Full org-account', value: 'CUGFKKD-TT48942' },
  { name: 'Account locator only', value: 'TT48942' },
  { name: 'Org.Account (dot)', value: 'CUGFKKD.TT48942' },
];

const username = 'ZAINEEL';

async function testAccountFormat(account: string, formatName: string) {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing: ${formatName}`);
    console.log(`Account: ${account}`);
    console.log(`${'='.repeat(70)}\n`);

    // Read keys
    const privateKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.p8');
    const privateKey = readFileSync(privateKeyPath, 'utf8');

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

    console.log('Public Key Fingerprint (SHA256):', publicKeyFingerprint);

    // Try different qualified username formats
    const qualifiedUsernameFormats = [
      `${account}.${username}`,
      `${account.toUpperCase()}.${username.toUpperCase()}`,
    ];

    for (const qualifiedUsername of qualifiedUsernameFormats) {
      const issuer = `${qualifiedUsername}.SHA256:${publicKeyFingerprint}`;

      // Create JWT payload
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: issuer,
        sub: qualifiedUsername,
        iat: now,
        exp: now + 3600,
      };

      console.log('\n📋 JWT Payload:');
      console.log('   Issuer:', payload.iss);
      console.log('   Subject:', payload.sub);
      console.log('   Issued At:', new Date(payload.iat * 1000).toISOString());
      console.log('   Expires:', new Date(payload.exp * 1000).toISOString());

      // Sign JWT
      const token = jwt.sign(payload, privateKey, {
        algorithm: 'RS256',
        header: {
          alg: 'RS256',
          typ: 'JWT'
        },
        noTimestamp: true
      });

      console.log('\n🎫 Generated Token (first 100 chars):', token.substring(0, 100) + '...');

      // Test the token with Snowflake API
      console.log('\n🔍 Testing token with Snowflake API...');

      const testQuery = 'SELECT CURRENT_USER();';
      const apiEndpoint = `https://${account}.snowflakecomputing.com`;

      try {
        const response = await fetch(`${apiEndpoint}/api/v2/statements`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
          },
          body: JSON.stringify({
            statement: testQuery,
            timeout: 60,
          }),
        });

        console.log('   Response Status:', response.status, response.statusText);

        if (response.ok) {
          const result = await response.json();
          console.log('   ✅ SUCCESS! Token is valid!');
          console.log('   Result:', JSON.stringify(result, null, 2));

          console.log('\n' + '='.repeat(70));
          console.log('🎉 WORKING CONFIGURATION FOUND!');
          console.log('='.repeat(70));
          console.log('\nAdd these to your .env.local:');
          console.log(`SNOWFLAKE_ACCOUNT=${account}`);
          console.log(`SNOWFLAKE_API_ENDPOINT=${apiEndpoint}`);
          console.log(`SNOWFLAKE_JWT_TOKEN=${token}`);
          console.log('');
          return true;
        } else {
          const errorText = await response.text();
          console.log('   ❌ FAILED');
          console.log('   Error:', errorText);
        }
      } catch (error) {
        console.log('   ❌ FAILED');
        console.log('   Error:', error);
      }
    }

    return false;
  } catch (error) {
    console.error('❌ Error:', error);
    return false;
  }
}

async function main() {
  console.log('🔐 Snowflake JWT Authentication Debugger');
  console.log('========================================\n');
  console.log('Testing different account identifier formats...\n');

  for (const format of accountFormats) {
    const success = await testAccountFormat(format.value, format.name);
    if (success) {
      console.log('\n✅ Found working configuration! You can stop here.');
      return;
    }
  }

  console.log('\n❌ No working configuration found.');
  console.log('\nNext steps:');
  console.log('1. Verify public key was uploaded correctly in Snowflake');
  console.log('2. Run: DESC USER ZAINEEL; and check RSA_PUBLIC_KEY_FP');
  console.log('3. Make sure you have the correct permissions');
  console.log('4. Check Snowflake account is not suspended');
}

main().catch(console.error);
