import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import {
  getR2Client,
  getR2Bucket,
  generateObjectKey,
  constructPublicUrl,
  getContentType,
  isImageFile,
} from './client';

/**
 * Upload functionality for Cloudflare R2
 */

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  size?: number;
  contentType?: string;
  error?: string;
}

/**
 * Upload a file buffer to R2
 */
export async function uploadFile(
  file: Buffer,
  filename: string,
  options?: {
    prefix?: string;
    userId?: string;
    metadata?: Record<string, string>;
    cacheControl?: string;
  }
): Promise<UploadResult> {
  try {
    const client = getR2Client();
    const bucket = getR2Bucket();

    // Generate unique key
    const prefix = options?.prefix || 'proofs';
    const key = generateObjectKey(prefix, filename, options?.userId);

    // Get content type
    const contentType = getContentType(filename);

    // Prepare metadata
    const metadata = {
      ...options?.metadata,
      uploadedAt: new Date().toISOString(),
      originalFilename: filename,
    };

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
      Metadata: metadata,
      CacheControl: options?.cacheControl || 'public, max-age=31536000', // 1 year
    });

    await client.send(command);

    // Construct public URL
    const url = constructPublicUrl(key);

    return {
      success: true,
      url,
      key,
      size: file.length,
      contentType,
    };
  } catch (error) {
    console.error('R2 upload failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Upload from a URL (fetch and upload)
 */
export async function uploadFromUrl(
  sourceUrl: string,
  options?: {
    prefix?: string;
    userId?: string;
    metadata?: Record<string, string>;
  }
): Promise<UploadResult> {
  try {
    // Fetch the file
    const response = await fetch(sourceUrl);

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch file: ${response.statusText}`,
      };
    }

    // Get buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract filename from URL
    const urlPath = new URL(sourceUrl).pathname;
    const filename = urlPath.split('/').pop() || 'file';

    // Upload
    return await uploadFile(buffer, filename, options);
  } catch (error) {
    console.error('Upload from URL failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload from URL failed',
    };
  }
}

/**
 * Upload proof image (specialized for proof submissions)
 */
export async function uploadProofImage(
  file: Buffer,
  filename: string,
  goalId: string,
  userId: string
): Promise<UploadResult> {
  // Validate it's an image
  if (!isImageFile(filename)) {
    return {
      success: false,
      error: 'File must be an image (jpg, png, gif, webp)',
    };
  }

  // Validate file size (max 10MB)
  if (file.length > 10 * 1024 * 1024) {
    return {
      success: false,
      error: 'File size must be less than 10MB',
    };
  }

  return await uploadFile(file, filename, {
    prefix: 'proofs',
    userId,
    metadata: {
      goalId,
      uploadType: 'proof',
    },
  });
}

/**
 * Upload base64 encoded image
 */
export async function uploadBase64Image(
  base64Data: string,
  filename: string,
  options?: {
    prefix?: string;
    userId?: string;
    metadata?: Record<string, string>;
  }
): Promise<UploadResult> {
  try {
    // Remove data URL prefix if present
    const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');

    // Convert to buffer
    const buffer = Buffer.from(base64String, 'base64');

    return await uploadFile(buffer, filename, options);
  } catch (error) {
    console.error('Base64 upload failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Base64 upload failed',
    };
  }
}

/**
 * Check if object exists in R2
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound') {
      return false;
    }
    console.error('Error checking object existence:', error);
    return false;
  }
}

/**
 * Get object metadata
 */
export async function getObjectMetadata(key: string): Promise<{
  success: boolean;
  metadata?: {
    size: number;
    contentType: string;
    lastModified: Date;
    customMetadata: Record<string, string>;
  };
  error?: string;
}> {
  try {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await client.send(command);

    return {
      success: true,
      metadata: {
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        lastModified: response.LastModified || new Date(),
        customMetadata: response.Metadata || {},
      },
    };
  } catch (error) {
    console.error('Failed to get object metadata:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get metadata',
    };
  }
}

/**
 * Validate image before upload
 */
export async function validateImage(file: Buffer, filename: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check if it's an image file
  if (!isImageFile(filename)) {
    errors.push('File must be an image (jpg, png, gif, webp, svg)');
  }

  // Check file size (max 10MB)
  if (file.length > 10 * 1024 * 1024) {
    errors.push('File size must be less than 10MB');
  }

  // Check minimum file size (at least 1KB)
  if (file.length < 1024) {
    errors.push('File is too small (minimum 1KB)');
  }

  // Check for valid image headers (basic check)
  const isPNG = file[0] === 0x89 && file[1] === 0x50 && file[2] === 0x4E && file[3] === 0x47;
  const isJPEG = file[0] === 0xFF && file[1] === 0xD8 && file[2] === 0xFF;
  const isGIF = file[0] === 0x47 && file[1] === 0x49 && file[2] === 0x46;
  const isWEBP = file[8] === 0x57 && file[9] === 0x45 && file[10] === 0x42 && file[11] === 0x50;

  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'png' && !isPNG) {
    errors.push('File claims to be PNG but has invalid header');
  } else if ((ext === 'jpg' || ext === 'jpeg') && !isJPEG) {
    errors.push('File claims to be JPEG but has invalid header');
  } else if (ext === 'gif' && !isGIF) {
    errors.push('File claims to be GIF but has invalid header');
  } else if (ext === 'webp' && !isWEBP) {
    errors.push('File claims to be WEBP but has invalid header');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Batch upload multiple files
 */
export async function batchUploadFiles(
  files: Array<{ buffer: Buffer; filename: string }>,
  options?: {
    prefix?: string;
    userId?: string;
  }
): Promise<UploadResult[]> {
  const results = await Promise.all(
    files.map(file =>
      uploadFile(file.buffer, file.filename, options)
    )
  );

  return results;
}
