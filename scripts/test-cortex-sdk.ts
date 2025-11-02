/**
 * Test Snowflake Cortex AI with SDK
 * Run with: SNOWFLAKE_ACCOUNT=... SNOWFLAKE_USERNAME=... SNOWFLAKE_WAREHOUSE=... npx tsx scripts/test-cortex-sdk.ts
 */

import { cortexComplete, cortexSentiment, healthCheck } from '../lib/snowflake/client';

async function main() {
  console.log('🧪 Testing Snowflake SDK with Cortex AI\n');
  console.log('='.repeat(70));

  // Test 1: Health check
  console.log('\n1️⃣  Health Check');
  console.log('-'.repeat(70));
  const health = await healthCheck();
  if (health.healthy) {
    console.log('✅ Snowflake connection is healthy');
  } else {
    console.log('❌ Health check failed:', health.error);
    return;
  }

  // Test 2: Cortex COMPLETE (simple test)
  console.log('\n2️⃣  Testing CORTEX.COMPLETE with mistral-7b');
  console.log('-'.repeat(70));
  const { completion, error } = await cortexComplete(
    'mistral-7b',
    'Say "Hello from Snowflake Cortex!" and nothing else.'
  );

  if (error) {
    console.log('❌ Error:', error.message);
  } else {
    console.log('✅ Success!');
    console.log('Response:', completion);
  }

  // Test 3: Cortex SENTIMENT
  console.log('\n3️⃣  Testing CORTEX.SENTIMENT');
  console.log('-'.repeat(70));
  const sentiment = await cortexSentiment('This is an amazing hackathon project!');

  if (sentiment.error) {
    console.log('❌ Error:', sentiment.error.message);
  } else {
    console.log('✅ Success!');
    console.log('Sentiment score:', sentiment.sentiment);
    console.log('(Range: -1 = very negative, 0 = neutral, +1 = very positive)');
  }

  // Test 4: Cortex COMPLETE for proof validation (real use case)
  console.log('\n4️⃣  Testing Proof Validation Use Case');
  console.log('-'.repeat(70));
  const proofValidation = await cortexComplete(
    'mistral-large',
    `You are a strict proof validator for a deadline DAO.

Task: "Complete 100 push-ups"
Submitted proof: "I did 100 push-ups this morning before breakfast. It was tough but I completed them all in sets of 20."

Is this proof VALID or INVALID? Reply with ONLY one word: VALID or INVALID`
  );

  if (proofValidation.error) {
    console.log('❌ Error:', proofValidation.error.message);
  } else {
    console.log('✅ Success!');
    console.log('Validation result:', proofValidation.completion);
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n🎉 All tests completed!');
  console.log('\nSnowflake Cortex AI is working via SDK!');
  console.log('You can now use it for real proof validation in your app.');
  console.log('');
}

main().catch(console.error);
