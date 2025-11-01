/**
 * Test different Snowflake REST API endpoint formats
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const account = 'CUGFKKD-TT48942';
const username = 'ZAINEEL';

// Read keys and generate token
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

const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
  sub: `${account}.${username}`,
  iat: now,
  exp: now + 3600,
};

const token = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  header: { alg: 'RS256', typ: 'JWT' },
  noTimestamp: true,
});

console.log('Testing different Snowflake REST API endpoints...\n');
console.log('JWT Token generated');
console.log('Public Key Fingerprint:', publicKeyFingerprint);
console.log('');

// Test configurations
const tests = [
  {
    name: 'Standard /api/v2/statements',
    url: `https://${account}.snowflakecomputing.com/api/v2/statements`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    },
    body: {
      statement: 'SELECT CURRENT_USER();',
      timeout: 60,
    },
  },
  {
    name: 'With database and schema context',
    url: `https://${account}.snowflakecomputing.com/api/v2/statements`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    },
    body: {
      statement: 'SELECT CURRENT_USER();',
      timeout: 60,
      database: 'SNOWFLAKE',
      schema: 'ACCOUNT_USAGE',
    },
  },
  {
    name: 'Session-based auth (/session/v1/login-request)',
    url: `https://${account}.snowflakecomputing.com/session/v1/login-request`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    },
    body: {
      data: {
        ACCOUNT_NAME: account,
        LOGIN_NAME: username,
        AUTHENTICATOR: 'SNOWFLAKE_JWT',
        TOKEN: token,
      },
    },
  },
  {
    name: 'Without X-Snowflake-Authorization-Token-Type header',
    url: `https://${account}.snowflakecomputing.com/api/v2/statements`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: {
      statement: 'SELECT CURRENT_USER();',
      timeout: 60,
    },
  },
  {
    name: 'Using /queries endpoint',
    url: `https://${account}.snowflakecomputing.com/queries`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    },
    body: {
      statement: 'SELECT CURRENT_USER();',
      timeout: 60,
    },
  },
  {
    name: 'Using /api/statements (without v2)',
    url: `https://${account}.snowflakecomputing.com/api/statements`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    },
    body: {
      statement: 'SELECT CURRENT_USER();',
      timeout: 60,
    },
  },
];

async function runTest(test: any, index: number) {
  console.log(`${'='.repeat(70)}`);
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log(`${'='.repeat(70)}`);
  console.log('URL:', test.url);
  console.log('Headers:', JSON.stringify(Object.keys(test.headers)));
  console.log('');

  try {
    const response = await fetch(test.url, {
      method: test.method,
      headers: test.headers,
      body: JSON.stringify(test.body),
    });

    console.log('Status:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ SUCCESS!');
      console.log('Result:', JSON.stringify(result, null, 2));
      console.log('');
      console.log('🎉 WORKING ENDPOINT FOUND!');
      console.log(`Endpoint: ${test.url}`);
      console.log('Headers:', JSON.stringify(test.headers, null, 2));
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
    const success = await runTest(tests[i], i);
    if (success) {
      return;
    }
  }

  console.log('❌ None of the endpoint variations worked.');
  console.log('');
  console.log('This suggests the issue is not with the endpoint format.');
  console.log('Possible issues:');
  console.log('1. REST API access not enabled for this user');
  console.log('2. Network policies blocking REST API access');
  console.log('3. Account-level security settings');
  console.log('4. JWT authentication not enabled for REST API');
  console.log('');
  console.log('Next steps:');
  console.log('Run these queries in your Snowflake SQL worksheet:');
  console.log('');
  console.log('-- Check user details');
  console.log('DESC USER ZAINEEL;');
  console.log('');
  console.log('-- Check network policies');
  console.log('SHOW NETWORK POLICIES;');
  console.log('');
  console.log('-- Check account parameters');
  console.log('SHOW PARAMETERS LIKE \'%NETWORK%\' IN ACCOUNT;');
  console.log('SHOW PARAMETERS LIKE \'%OAUTH%\' IN ACCOUNT;');
  console.log('');
  console.log('-- Check if REST API is enabled');
  console.log('SELECT SYSTEM$ALLOWLIST();');
}

main().catch(console.error);
