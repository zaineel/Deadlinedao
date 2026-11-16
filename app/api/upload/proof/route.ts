import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { parseValue, uuidSchema } from '@/lib/validation/schemas';
import { requireUserSession } from '@/lib/auth/csrf';
import { getGoalById } from '@/lib/supabase/goals';

// Vercel configuration for R2 uploads
export const runtime = 'nodejs';
export const maxDuration = 30; // R2 uploads typically complete within 30s
export const dynamic = 'force-dynamic';

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
  const limited = rateLimit(request, { name: 'upload-proof', limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = requireUserSession(request, { mutating: true });
  if (!auth.ok) return auth.response;

  try {
    console.log('[Upload API] Starting upload...');

    // Initialize R2 client
    const r2Client = getR2Client();
    console.log('[Upload API] R2 client initialized');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const goalIdRaw = formData.get('goalId');

    console.log('[Upload API] File received:', file?.name, 'Size:', file?.size);

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const goalIdResult = parseValue(goalIdRaw, uuidSchema);
    if (!goalIdResult.ok) return goalIdResult.response;
    const goalId = goalIdResult.data;

    // Only the owner of an existing, active goal may upload proof for it.
    // Missing and not-yours share one 404 so goal ids cannot be probed.
    const { data: goal, error: goalError } = await getGoalById(goalId);
    if (goalError || !goal || goal.wallet_address !== auth.wallet) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    if (goal.status !== 'active') {
      return NextResponse.json({ error: 'Goal is not accepting proof' }, { status: 409 });
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
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // file.type is client-asserted: confirm the actual bytes are a JPEG or PNG
    const isPng = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (!isPng && !isJpeg) {
      return NextResponse.json(
        { error: 'File content is not a valid JPEG or PNG image' },
        { status: 400 }
      );
    }

    // Extension comes from the verified content, never from the user's filename
    const fileExtension = isPng ? 'png' : 'jpg';
    const fileName = `proofs/${goalId}/${randomUUID()}.${fileExtension}`;

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
      ContentType: isPng ? 'image/png' : 'image/jpeg',
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
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
