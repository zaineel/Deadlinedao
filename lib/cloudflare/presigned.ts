import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, getR2Bucket, generateObjectKey, getContentType } from './client';

/**
 * Presigned URL generation for Cloudflare R2
 * Allows secure direct uploads from client
 */

export interface PresignedUploadUrl {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
}

export interface PresignedDownloadUrl {
  downloadUrl: string;
  expiresIn: number;
}

/**
 * Generate presigned URL for uploading
 * Allows frontend to upload directly to R2 without going through backend
 */
export async function generatePresignedUploadUrl(
  filename: string,
  options?: {
    prefix?: string;
    userId?: string;
    expiresIn?: number; // seconds
    maxFileSize?: number;
    contentType?: string;
  }
): Promise<PresignedUploadUrl> {
  try {
    const client = getR2Client();
    const bucket = getR2Bucket();

    // Generate unique key
    const prefix = options?.prefix || 'proofs';
    const key = generateObjectKey(prefix, filename, options?.userId);

    // Determine content type
    const contentType = options?.contentType || getContentType(filename);

    // Create put command
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    // Generate presigned URL
    const expiresIn = options?.expiresIn || 3600; // Default: 1 hour
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });

    // Construct public URL (for accessing after upload)
    const { constructPublicUrl } = await import('./client');
    const publicUrl = constructPublicUrl(key);

    return {
      uploadUrl,
      key,
      publicUrl,
      expiresIn,
    };
  } catch (error) {
    console.error('Failed to generate presigned upload URL:', error);
    throw new Error('Failed to generate upload URL');
  }
}

/**
 * Generate presigned URL for downloading/viewing
 * Useful for private objects or temporary access
 */
export async function generatePresignedDownloadUrl(
  key: string,
  options?: {
    expiresIn?: number; // seconds
    downloadFilename?: string;
  }
): Promise<PresignedDownloadUrl> {
  try {
    const client = getR2Client();
    const bucket = getR2Bucket();

    // Create get command
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: options?.downloadFilename
        ? `attachment; filename="${options.downloadFilename}"`
        : undefined,
    });

    // Generate presigned URL
    const expiresIn = options?.expiresIn || 3600; // Default: 1 hour
    const downloadUrl = await getSignedUrl(client, command, { expiresIn });

    return {
      downloadUrl,
      expiresIn,
    };
  } catch (error) {
    console.error('Failed to generate presigned download URL:', error);
    throw new Error('Failed to generate download URL');
  }
}

/**
 * Generate presigned upload URL for proof image
 * Specialized for proof submissions with validation
 */
export async function generateProofUploadUrl(
  filename: string,
  goalId: string,
  userId: string
): Promise<PresignedUploadUrl> {
  // Validate filename is an image
  const { isImageFile } = await import('./client');
  if (!isImageFile(filename)) {
    throw new Error('Only image files are allowed for proofs');
  }

  return await generatePresignedUploadUrl(filename, {
    prefix: 'proofs',
    userId,
    expiresIn: 300, // 5 minutes for security
    maxFileSize: 10 * 1024 * 1024, // 10MB
  });
}

/**
 * Batch generate presigned upload URLs
 */
export async function batchGenerateUploadUrls(
  filenames: string[],
  options?: {
    prefix?: string;
    userId?: string;
    expiresIn?: number;
  }
): Promise<PresignedUploadUrl[]> {
  const results = await Promise.all(
    filenames.map(filename =>
      generatePresignedUploadUrl(filename, options)
    )
  );

  return results;
}

/**
 * Generate upload instructions for frontend
 */
export function getUploadInstructions(presignedUrl: PresignedUploadUrl): {
  method: string;
  url: string;
  headers: Record<string, string>;
  instructions: string[];
} {
  return {
    method: 'PUT',
    url: presignedUrl.uploadUrl,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    instructions: [
      '1. Make a PUT request to the uploadUrl',
      '2. Set Content-Type header to match your file type',
      '3. Send the file as the request body',
      '4. After upload, use publicUrl to access the file',
      `5. Upload must complete within ${presignedUrl.expiresIn} seconds`,
    ],
  };
}

/**
 * Verify upload was successful
 */
export async function verifyUpload(key: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { objectExists } = await import('./upload');
    const exists = await objectExists(key);

    if (!exists) {
      return {
        success: false,
        error: 'File was not uploaded or does not exist',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Upload verification failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Generate signed URL with custom expiry for proof viewing
 */
export async function generateProofViewUrl(
  key: string,
  expiresInMinutes: number = 60
): Promise<string> {
  const { downloadUrl } = await generatePresignedDownloadUrl(key, {
    expiresIn: expiresInMinutes * 60,
  });

  return downloadUrl;
}

/**
 * Create a temporary shareable link
 */
export async function createShareableLink(
  key: string,
  expiresInHours: number = 24
): Promise<{
  url: string;
  expiresAt: Date;
}> {
  const expiresIn = expiresInHours * 3600;

  const { downloadUrl } = await generatePresignedDownloadUrl(key, {
    expiresIn,
  });

  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  return {
    url: downloadUrl,
    expiresAt,
  };
}
