/**
 * Test Snowflake REST API with warehouse and role
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

async function testWithContext() {
  console.log('Testing Snowflake REST API with full context...\n');

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

  console.log('JWT Token generated');
  console.log('Issuer:', payload.iss);
  console.log('Subject:', payload.sub);
  console.log('');

  // Test 1: Try with warehouse specification
  console.log('Test 1: With warehouse parameter');
  console.log('='.repeat(70));

  try {
    const response = await fetch(`https://${account}.snowflakecomputing.com/api/v2/statements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
      },
      body: JSON.stringify({
        statement: 'SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE();',
        timeout: 60,
        warehouse: 'COMPUTE_WH', // Default warehouse
      }),
    });

    console.log('Status:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ SUCCESS!');
      console.log('Result:', JSON.stringify(result, null, 2));
      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ Failed');
      console.log('Error:', errorText.substring(0, 300));
    }
  } catch (error) {
    console.log('❌ Exception:', error);
  }

  console.log('');

  // Test 2: Try with role and warehouse
  console.log('Test 2: With role and warehouse');
  console.log('='.repeat(70));

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
        warehouse: 'COMPUTE_WH',
        role: 'ACCOUNTADMIN',
      }),
    });

    console.log('Status:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ SUCCESS!');
      console.log('Result:', JSON.stringify(result, null, 2));
      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ Failed');
      console.log('Error:', errorText.substring(0, 300));
    }
  } catch (error) {
    console.log('❌ Exception:', error);
  }

  console.log('');

  // Test 3: Check account status
  console.log('Test 3: Check if account allows REST API');
  console.log('='.repeat(70));
  console.log('');
  console.log('Please check in Snowflake:');
  console.log('1. Go to Admin > Security');
  console.log('2. Check "Network Policies" - REST API might be blocked');
  console.log('3. Check if your user has REST API access enabled');
  console.log('4. Run: SHOW PARAMETERS LIKE \'%OAUTH%\' IN ACCOUNT;');
  console.log('5. Run: DESC USER ZAINEEL;');
  console.log('');

  return false;
}

testWithContext().catch(console.error);
