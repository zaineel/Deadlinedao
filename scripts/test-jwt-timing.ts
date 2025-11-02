/**
 * Test JWT with different timing configurations
 * to rule out clock skew issues
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

console.log('Testing JWT with different timing configurations...\n');

const timingTests = [
  {
    name: 'IAT 60 seconds in the past (clock skew tolerance)',
    getPayload: () => {
      const now = Math.floor(Date.now() / 1000) - 60;
      return {
        iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
        sub: `${account}.${username}`,
        iat: now,
        exp: now + 3600,
      };
    },
  },
  {
    name: 'Without IAT claim (let Snowflake infer)',
    getPayload: () => {
      const now = Math.floor(Date.now() / 1000);
      return {
        iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
        sub: `${account}.${username}`,
        exp: now + 3600,
      };
    },
  },
  {
    name: 'Longer expiry (24 hours)',
    getPayload: () => {
      const now = Math.floor(Date.now() / 1000);
      return {
        iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
        sub: `${account}.${username}`,
        iat: now,
        exp: now + 86400,
      };
    },
  },
  {
    name: 'Using account locator only (TT48942)',
    getPayload: () => {
      const now = Math.floor(Date.now() / 1000);
      return {
        iss: `TT48942.${username}.SHA256:${publicKeyFingerprint}`,
        sub: `TT48942.${username}`,
        iat: now,
        exp: now + 3600,
      };
    },
  },
];

async function testTiming(test: any, index: number) {
  console.log(`${'='.repeat(70)}`);
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log(`${'='.repeat(70)}`);

  const payload = test.getPayload();

  console.log('JWT Payload:');
  console.log(JSON.stringify(payload, null, 2));

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT' },
    noTimestamp: true,
  });

  console.log('');

  try {
    const response = await fetch(
      `https://${account}.snowflakecomputing.com/session/v1/login-request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
        },
        body: JSON.stringify({
          data: {
            ACCOUNT_NAME: account,
            LOGIN_NAME: username,
            AUTHENTICATOR: 'SNOWFLAKE_JWT',
            TOKEN: token,
          },
        }),
      }
    );

    const result = await response.json();

    console.log('Status:', response.status);
    console.log('Response:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success === true) {
      console.log('');
      console.log('🎉 SUCCESS! This timing configuration works!');
      console.log('');
      console.log('Use this configuration:');
      console.log(JSON.stringify(payload, null, 2));
      return true;
    } else {
      console.log('❌ Failed');
    }
  } catch (error) {
    console.log('❌ Exception:', error);
  }

  console.log('');
  return false;
}

async function main() {
  for (let i = 0; i < timingTests.length; i++) {
    const success = await testTiming(timingTests[i], i);
    if (success) {
      return;
    }
  }

  console.log('━'.repeat(70));
  console.log('❌ None of the timing variations worked.');
  console.log('');
  console.log('This strongly suggests that keypair JWT authentication');
  console.log('is NOT enabled for REST API access on your Snowflake account.');
  console.log('');
  console.log('Next steps:');
  console.log('');
  console.log('1. Contact your Snowflake administrator or support');
  console.log('2. Ask them to verify if REST API keypair authentication is enabled');
  console.log('3. Check if your account requires OAuth tokens for REST API access');
  console.log('4. Run this query in Snowflake to check account parameters:');
  console.log('   SHOW PARAMETERS LIKE \'%JWT%\' IN ACCOUNT;');
  console.log('   SHOW PARAMETERS LIKE \'%OAUTH%\' IN ACCOUNT;');
  console.log('');
  console.log('5. Check Snowflake documentation for your account edition:');
  console.log('   https://docs.snowflake.com/en/developer-guide/sql-api/authenticating');
  console.log('');
}

main().catch(console.error);
