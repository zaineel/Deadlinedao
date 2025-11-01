/**
 * Test JWT using the exact official Snowflake documentation format
 * Based on https://docs.snowflake.com/en/developer-guide/sql-api/authenticating
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const account = 'CUGFKKD-TT48942';
const username = 'ZAINEEL';

// Read keys
const privateKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.p8');
const privateKey = readFileSync(privateKeyPath, 'utf8');

const publicKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.pub');
const publicKey = readFileSync(publicKeyPath, 'utf8');

const publicKeyDER = publicKey
  .replace('-----BEGIN PUBLIC KEY-----', '')
  .replace('-----END PUBLIC KEY-----', '')
  .replace(/\s/g, '');

const publicKeyFingerprint = crypto
  .createHash('sha256')
  .update(Buffer.from(publicKeyDER, 'base64'))
  .digest('base64');

console.log('Testing with OFFICIAL Snowflake Documentation Format\n');
console.log('Documentation: https://docs.snowflake.com/en/developer-guide/sql-api/authenticating');
console.log('');

const tests = [
  {
    name: 'IAT in milliseconds (instead of seconds)',
    getPayload: () => {
      const nowMs = Date.now();
      return {
        iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
        sub: `${account}.${username}`,
        iat: nowMs,
        exp: nowMs + 3600000, // 1 hour in milliseconds
      };
    },
  },
  {
    name: 'Without optional X-Snowflake-Authorization-Token-Type header',
    getPayload: () => {
      const now = Math.floor(Date.now() / 1000);
      return {
        iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
        sub: `${account}.${username}`,
        iat: now,
        exp: now + 3600,
      };
    },
    skipHeader: true,
  },
  {
    name: 'IAT set to exactly NOW (to avoid 60-second window issue)',
    getPayload: () => {
      const now = Math.floor(Date.now() / 1000);
      return {
        iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
        sub: `${account}.${username}`,
        iat: now,
        exp: now + 3600,
      };
    },
    immediate: true, // Generate and send immediately
  },
  {
    name: 'Using ACCOUNTADMIN as qualified user',
    getPayload: () => {
      const now = Math.floor(Date.now() / 1000);
      return {
        iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
        sub: `${account}.${username}`,
        iat: now,
        exp: now + 3600,
      };
    },
    useRole: 'ACCOUNTADMIN',
  },
];

async function testFormat(test: any, index: number) {
  console.log(`${'='.repeat(70)}`);
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log(`${'='.repeat(70)}`);

  const payload = test.getPayload();

  console.log('JWT Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT' },
    noTimestamp: true,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  if (!test.skipHeader) {
    headers['X-Snowflake-Authorization-Token-Type'] = 'KEYPAIR_JWT';
  }

  console.log('Headers:', Object.keys(headers).join(', '));
  console.log('');

  try {
    const requestBody: any = {
      statement: 'SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_ACCOUNT();',
      timeout: 60,
    };

    if (test.useRole) {
      requestBody.role = test.useRole;
    }

    const response = await fetch(
      `https://${account}.snowflakecomputing.com/api/v2/statements`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      }
    );

    console.log('Status:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ SUCCESS!');
      console.log('Result:', JSON.stringify(result, null, 2));
      console.log('');
      console.log('🎉 THIS CONFIGURATION WORKS!');
      console.log('');
      console.log('Update .env.local with:');
      console.log(`SNOWFLAKE_JWT_TOKEN=${token}`);
      console.log('');
      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ Failed');
      console.log('Response:', errorText.substring(0, 300));
    }
  } catch (error) {
    console.log('❌ Exception:', error);
  }

  console.log('');
  return false;
}

async function main() {
  for (let i = 0; i < tests.length; i++) {
    const success = await testFormat(tests[i], i);
    if (success) {
      return;
    }
  }

  console.log('━'.repeat(70));
  console.log('');
  console.log('❌ All official format variations failed.');
  console.log('');
  console.log('⚠️  CRITICAL: Run these SQL commands in Snowflake to check configuration:');
  console.log('');
  console.log('-- Check if LOGIN_NAME matches the username we are using');
  console.log('DESC USER ZAINEEL;');
  console.log('');
  console.log('-- Check LOGIN_NAME vs NAME (they might be different!)');
  console.log('SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.USERS WHERE NAME = \'ZAINEEL\';');
  console.log('');
  console.log('-- Check if keypair authentication is enabled for your user');
  console.log('SHOW PARAMETERS LIKE \'%JWT%\' IN USER ZAINEEL;');
  console.log('');
  console.log('-- Verify public key is correctly set');
  console.log(`-- Expected fingerprint: SHA256:${publicKeyFingerprint}`);
  console.log('');
  console.log('━'.repeat(70));
  console.log('');
  console.log('If all parameters are correct, the issue is likely that:');
  console.log('1. REST API keypair authentication is disabled at account level');
  console.log('2. Your Snowflake account requires OAuth instead of keypair JWT');
  console.log('3. Network policies are blocking REST API access');
  console.log('');
  console.log('Contact Snowflake support or your account administrator to:');
  console.log('- Enable REST API keypair JWT authentication');
  console.log('- Check if network policies allow REST API access');
  console.log('- Verify Enterprise edition features are enabled');
  console.log('');
}

main().catch(console.error);
