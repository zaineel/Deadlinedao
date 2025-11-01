import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 Storage Client
 * R2 is S3-compatible, so we use the AWS SDK
 */

interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

/**
 * Get R2 configuration from environment
 */
function getR2Config(): R2Config {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'deadlinedao-proofs';
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey || !publicUrl) {
    throw new Error(
      'Missing Cloudflare R2 environment variables. Check CLOUDFLARE_R2_ENDPOINT, ' +
      'CLOUDFLARE_R2_ACCESS_KEY, CLOUDFLARE_R2_SECRET_KEY, and CLOUDFLARE_R2_PUBLIC_URL'
    );
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
  };
}

/**
 * Create S3 client for R2
 */
export function createR2Client(): S3Client {
  const config = getR2Config();

  return new S3Client({
    region: 'auto', // R2 uses 'auto' for region
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Get R2 bucket name
 */
export function getR2Bucket(): string {
  return getR2Config().bucket;
}

/**
 * Get R2 public URL base
 */
export function getR2PublicUrl(): string {
  return getR2Config().publicUrl;
}

/**
 * Construct full public URL for an object
 */
export function constructPublicUrl(key: string): string {
  const publicUrl = getR2PublicUrl();
  // Remove trailing slash from public URL if present
  const baseUrl = publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl;
  // Remove leading slash from key if present
  const objectKey = key.startsWith('/') ? key.slice(1) : key;
  return `${baseUrl}/${objectKey}`;
}

/**
 * Generate a unique key for an object
 */
export function generateObjectKey(
  prefix: string,
  filename: string,
  userId?: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

  if (userId) {
    return `${prefix}/${userId}/${timestamp}-${random}-${safeName}`;
  }

  return `${prefix}/${timestamp}-${random}-${safeName}`;
}

/**
 * Parse object key to extract metadata
 */
export function parseObjectKey(key: string): {
  prefix: string;
  userId?: string;
  timestamp?: number;
  filename: string;
} {
  const parts = key.split('/');

  if (parts.length === 2) {
    // Format: prefix/filename
    return {
      prefix: parts[0],
      filename: parts[1],
    };
  } else if (parts.length === 3) {
    // Format: prefix/userId/filename
    const filenameParts = parts[2].split('-');
    const timestamp = parseInt(filenameParts[0]);

    return {
      prefix: parts[0],
      userId: parts[1],
      timestamp: isNaN(timestamp) ? undefined : timestamp,
      filename: parts[2],
    };
  }

  return {
    prefix: '',
    filename: key,
  };
}

/**
 * Validate object key format
 */
export function isValidObjectKey(key: string): boolean {
  // Check for valid characters and reasonable length
  if (!key || key.length > 1024) {
    return false;
  }

  // R2 allows most characters, but let's be safe
  const invalidChars = /[<>"|?*\x00-\x1f]/;
  if (invalidChars.test(key)) {
    return false;
  }

  return true;
}

/**
 * Get content type from filename
 */
export function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();

  const contentTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    txt: 'text/plain',
    json: 'application/json',
  };

  return contentTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Check if file is an image
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '');
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Health check for R2 connection
 */
export async function healthCheckR2(): Promise<{ healthy: boolean; error: Error | null }> {
  try {
    const config = getR2Config();

    // Just validate config exists
    if (!config.endpoint || !config.accessKeyId || !config.secretAccessKey) {
      return {
        healthy: false,
        error: new Error('R2 configuration is incomplete'),
      };
    }

    return { healthy: true, error: null };
  } catch (error) {
    console.error('R2 health check failed:', error);
    return { healthy: false, error: error as Error };
  }
}

// Export singleton client instance
let r2ClientInstance: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!r2ClientInstance) {
    r2ClientInstance = createR2Client();
  }
  return r2ClientInstance;
}
