/**
 * Test JWT variations based on Snowflake feedback
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as jwt from 'jsonwebtoken';

const account = 'CUGFKKD-TT48942';
const username = 'ZAINEEL';
const publicKeyFingerprint = 'jGuUiDKHkUln0uqZ5u+DyCrrGPZ/gYuyfU59VhNt09U=';

// Read private key
const privateKeyPath = join(process.cwd(), '.snowflake-keys', 'rsa_key.p8');
const privateKey = readFileSync(privateKeyPath, 'utf8');

const variations = [
  {
    name: 'Standard format with SHA256 prefix',
    iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
    sub: `${account}.${username}`,
  },
  {
    name: 'Without SHA256 prefix',
    iss: `${account}.${username}.${publicKeyFingerprint}`,
    sub: `${account}.${username}`,
  },
  {
    name: 'Uppercase everything',
    iss: `${account.toUpperCase()}.${username.toUpperCase()}.SHA256:${publicKeyFingerprint}`,
    sub: `${account.toUpperCase()}.${username.toUpperCase()}`,
  },
  {
    name: 'Different IAT (30 seconds ago)',
    iss: `${account}.${username}.SHA256:${publicKeyFingerprint}`,
    sub: `${account}.${username}`,
    iatOffset: -30,
  },
];

async function testVariation(config: any, index: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Test ${index + 1}: ${config.name}`);
  console.log(`${'='.repeat(70)}`);

  const now = Math.floor(Date.now() / 1000) + (config.iatOffset || 0);
  const payload = {
    iss: config.iss,
    sub: config.sub,
    iat: now,
    exp: now + 3600,
  };

  console.log('Issuer:', payload.iss);
  console.log('Subject:', payload.sub);
  console.log('IAT:', new Date(payload.iat * 1000).toISOString());

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT' },
    noTimestamp: true,
  });

  console.log('Token (first 80 chars):', token.substring(0, 80) + '...');

  try {
    const response = await fetch(`https://${account}.snowflakecomputing.com/api/v2/statements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
      },
      body: JSON.stringify({
        statement: 'SELECT CURRENT_USER();',
        timeout: 60,
      }),
    });

    console.log('Status:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ SUCCESS!');
      console.log('Result:', JSON.stringify(result, null, 2));
      console.log('\n🎉 WORKING TOKEN FOUND!');
      console.log('\nUse these values:');
      console.log(`SNOWFLAKE_ACCOUNT=${account}`);
      console.log(`SNOWFLAKE_API_ENDPOINT=https://${account}.snowflakecomputing.com`);
      console.log(`SNOWFLAKE_JWT_TOKEN=${token}`);
      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ Failed');
      console.log('Error:', errorText.substring(0, 200));
    }
  } catch (error) {
    console.log('❌ Failed with exception:', error);
  }

  return false;
}

async function main() {
  console.log('Testing JWT variations with known good public key...\n');
  console.log('Public Key Fingerprint from Snowflake:', publicKeyFingerprint);

  for (let i = 0; i < variations.length; i++) {
    const success = await testVariation(variations[i], i);
    if (success) {
      return;
    }
  }

  console.log('\n❌ None of the variations worked.');
  console.log('\nThis might be a Snowflake Cortex API access issue.');
  console.log('Please verify:');
  console.log('1. Your account has Cortex AI enabled');
  console.log('2. Run in Snowflake: SELECT SNOWFLAKE.CORTEX.COMPLETE(\'mistral-large\', [{\"role\": \"user\", \"content\": \"test\"}]);');
  console.log('3. If that fails, Cortex AI is not enabled for your account');
}

main().catch(console.error);
