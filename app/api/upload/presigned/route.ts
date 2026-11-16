import { NextRequest, NextResponse } from 'next/server';
import { generateProofUploadUrl } from '@/lib/cloudflare';
import { parseBody, presignedUploadSchema } from '@/lib/validation/schemas';

/**
 * POST /api/upload/presigned
 * Generate presigned URL for direct R2 upload
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, presignedUploadSchema);
    if (!parsed.ok) return parsed.response;
    const { filename, goal_id, user_id } = parsed.data;

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
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
