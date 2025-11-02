import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

// Create R2 client factory function (lazy initialization)
function getR2Client() {
  // Validate environment variables
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  const accessKey = process.env.CLOUDFLARE_R2_ACCESS_KEY;
  const secretKey = process.env.CLOUDFLARE_R2_SECRET_KEY;

  if (!endpoint || !accessKey || !secretKey) {
    throw new Error('Missing Cloudflare R2 configuration. Please check environment variables.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Upload API] Starting upload...');

    // Initialize R2 client
    const r2Client = getR2Client();
    console.log('[Upload API] R2 client initialized');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const goalId = formData.get('goalId') as string;

    console.log('[Upload API] File received:', file?.name, 'Size:', file?.size);

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!goalId) {
      return NextResponse.json(
        { error: 'Goal ID is required' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG and PNG images are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop();
    const fileName = `proofs/${goalId}/${randomUUID()}.${fileExtension}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Cloudflare R2
    const bucket = process.env.CLOUDFLARE_R2_BUCKET;
    if (!bucket) {
      throw new Error('CLOUDFLARE_R2_BUCKET environment variable not set');
    }

    console.log('[Upload API] Uploading to bucket:', bucket, 'Key:', fileName);

    const uploadCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: fileName,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        goalId,
        uploadedAt: new Date().toISOString(),
      },
    });

    await r2Client.send(uploadCommand);
    console.log('[Upload API] Upload successful!');

    // Construct public URL
    const publicUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName,
      fileSize: file.size,
      fileType: file.type,
    });

  } catch (error: any) {
    console.error('[Upload API] Error uploading file:', error);
    console.error('[Upload API] Error stack:', error.stack);

    // Return detailed error for debugging
    return NextResponse.json(
      {
        error: 'Failed to upload file',
        details: error.message,
        errorType: error.constructor.name,
        // Include env var status (without values)
        envCheck: {
          hasEndpoint: !!process.env.CLOUDFLARE_R2_ENDPOINT,
          hasAccessKey: !!process.env.CLOUDFLARE_R2_ACCESS_KEY,
          hasSecretKey: !!process.env.CLOUDFLARE_R2_SECRET_KEY,
          hasBucket: !!process.env.CLOUDFLARE_R2_BUCKET,
          hasPublicUrl: !!process.env.CLOUDFLARE_R2_PUBLIC_URL,
        }
      },
      { status: 500 }
    );
  }
}
