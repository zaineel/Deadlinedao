import { NextRequest, NextResponse } from 'next/server';
import { generateProofUploadUrl } from '@/lib/cloudflare';

/**
 * POST /api/upload/presigned
 * Generate presigned URL for direct R2 upload
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      filename,
      goal_id,
      user_id,
    } = body;

    // Validate required fields
    if (!filename || !goal_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing required fields: filename, goal_id, user_id' },
        { status: 400 }
      );
    }

    // Validate filename is an image
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const hasValidExtension = validExtensions.some(ext =>
      filename.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images are allowed (jpg, png, gif, webp)' },
        { status: 400 }
      );
    }

    // Generate presigned URL
    const presignedUrl = await generateProofUploadUrl(
      filename,
      goal_id,
      user_id
    );

    return NextResponse.json({
      success: true,
      upload_url: presignedUrl.uploadUrl,
      public_url: presignedUrl.publicUrl,
      key: presignedUrl.key,
      expires_in: presignedUrl.expiresIn,
      instructions: {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/*',
        },
        notes: [
          'Upload the file using a PUT request to upload_url',
          'After successful upload, use public_url to access the image',
          `Upload must complete within ${presignedUrl.expiresIn} seconds`,
        ],
      },
    });

  } catch (error) {
    console.error('Generate presigned URL error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
