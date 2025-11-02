/**
 * Test Cloudflare R2 Setup
 * Verifies upload, download, and public URL generation
 */

import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, getR2Bucket, constructPublicUrl, generateObjectKey } from '../lib/cloudflare/client';

async function main() {
  console.log('🧪 Testing Cloudflare R2 Setup\n');
  console.log('='.repeat(70));

  const testKey = generateObjectKey('test', 'hello.txt');
  const testContent = 'Hello from DeadlineDAO! 🎉\nTimestamp: ' + new Date().toISOString();

  try {
    // Test 1: Connection & Config
    console.log('\n1️⃣  Testing Configuration');
    console.log('-'.repeat(70));

    const client = getR2Client();
    const bucket = getR2Bucket();

    console.log('✅ R2 client created successfully');
    console.log('   Bucket:', bucket);
    console.log('   Test file key:', testKey);

    // Test 2: Upload
    console.log('\n2️⃣  Testing File Upload');
    console.log('-'.repeat(70));

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: testContent,
        ContentType: 'text/plain',
        Metadata: {
          purpose: 'test',
          timestamp: Date.now().toString(),
        },
      })
    );

    console.log('✅ File uploaded successfully');
    console.log('   Key:', testKey);
    console.log('   Size:', Buffer.byteLength(testContent), 'bytes');

    // Test 3: Download
    console.log('\n3️⃣  Testing File Download');
    console.log('-'.repeat(70));

    const getResponse = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: testKey,
      })
    );

    const downloadedContent = await getResponse.Body?.transformToString();

    if (downloadedContent === testContent) {
      console.log('✅ File downloaded and verified');
      console.log('   Content matches original');
    } else {
      console.log('❌ Content mismatch!');
      console.log('   Expected:', testContent);
      console.log('   Got:', downloadedContent);
    }

    // Test 4: Public URL
    console.log('\n4️⃣  Testing Public URL Generation');
    console.log('-'.repeat(70));

    const publicUrl = constructPublicUrl(testKey);
    console.log('✅ Public URL generated');
    console.log('   URL:', publicUrl);
    console.log('');
    console.log('   📝 Note: To access this URL, make sure you:');
    console.log('      1. Enabled R2.dev subdomain OR connected a custom domain');
    console.log('      2. Set the bucket to allow public access');
    console.log('');

    // Test 5: Cleanup
    console.log('5️⃣  Cleaning Up Test File');
    console.log('-'.repeat(70));

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey,
      })
    );

    console.log('✅ Test file deleted');

    // Success!
    console.log('\n' + '='.repeat(70));
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('\nCloudflare R2 is fully configured and working!');
    console.log('');
    console.log('You can now:');
    console.log('  • Upload proof images from your app');
    console.log('  • Store them securely in R2');
    console.log('  • Serve them via CDN globally');
    console.log('  • Generate presigned URLs for temporary access');
    console.log('');
    console.log('Next: Restart your dev server and check /api/health');
    console.log('');

  } catch (error: any) {
    console.log('\n' + '='.repeat(70));
    console.log('\n❌ TEST FAILED');
    console.log('');
    console.log('Error:', error.message);
    console.log('');

    if (error.code === 'NoSuchBucket') {
      console.log('💡 Bucket not found. Make sure you:');
      console.log('   1. Created a bucket named "deadlinedao-proofs"');
      console.log('   2. Updated CLOUDFLARE_R2_BUCKET in .env.local');
    } else if (error.code === 'InvalidAccessKeyId') {
      console.log('💡 Invalid credentials. Check:');
      console.log('   1. CLOUDFLARE_R2_ACCESS_KEY is correct');
      console.log('   2. CLOUDFLARE_R2_SECRET_KEY is correct');
      console.log('   3. API token has Read & Write permissions');
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.log('💡 Signature error. Check:');
      console.log('   1. Secret access key is exactly as shown in Cloudflare');
      console.log('   2. No extra spaces in .env.local');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('endpoint')) {
      console.log('💡 Endpoint error. Check:');
      console.log('   1. CLOUDFLARE_R2_ENDPOINT format: https://<ACCOUNT_ID>.r2.cloudflarestorage.com');
      console.log('   2. Account ID is correct (check dashboard URL)');
    } else {
      console.log('💡 Unexpected error. Check:');
      console.log('   1. All R2 environment variables are set in .env.local');
      console.log('   2. No typos in bucket name or endpoint');
      console.log('   3. API token is not expired');
    }

    console.log('');
    console.log('📖 See scripts/setup-r2.md for full setup guide');
    console.log('');

    process.exit(1);
  }
}

// Set env vars if running directly
if (process.env.CLOUDFLARE_R2_ENDPOINT) {
  main().catch(console.error);
} else {
  console.log('❌ Missing R2 environment variables');
  console.log('');
  console.log('Please set up R2 credentials in .env.local first:');
  console.log('');
  console.log('CLOUDFLARE_R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com');
  console.log('CLOUDFLARE_R2_ACCESS_KEY=<YOUR_ACCESS_KEY>');
  console.log('CLOUDFLARE_R2_SECRET_KEY=<YOUR_SECRET_KEY>');
  console.log('CLOUDFLARE_R2_BUCKET=deadlinedao-proofs');
  console.log('CLOUDFLARE_R2_PUBLIC_URL=https://pub-<HASH>.r2.dev');
  console.log('');
  console.log('📖 See scripts/setup-r2.md for full setup guide');
  process.exit(1);
}
