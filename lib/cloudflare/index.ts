/**
 * Cloudflare R2 Storage Integration
 * Handles proof image uploads and storage
 */

// Client Configuration
export {
  getR2Client,
  getR2Bucket,
  getR2PublicUrl,
  constructPublicUrl,
  generateObjectKey,
  parseObjectKey,
  isValidObjectKey,
  getContentType,
  isImageFile,
  formatFileSize,
  healthCheckR2,
} from './client';

// Upload Functionality
export {
  uploadFile,
  uploadFromUrl,
  uploadProofImage,
  uploadBase64Image,
  objectExists,
  getObjectMetadata,
  validateImage,
  batchUploadFiles,
} from './upload';

export type { UploadResult } from './upload';

// Presigned URLs
export {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  generateProofUploadUrl,
  batchGenerateUploadUrls,
  getUploadInstructions,
  verifyUpload,
  generateProofViewUrl,
  createShareableLink,
} from './presigned';

export type { PresignedUploadUrl, PresignedDownloadUrl } from './presigned';

// Cleanup and Management
export {
  deleteObject,
  deleteObjects,
  deleteProofImage,
  deleteUserObjects,
  listObjectsByPrefix,
  cleanupOldObjects,
  cleanupOrphanedProofs,
  getStorageStats,
  needsCleanup,
} from './cleanup';

export type { DeleteResult } from './cleanup';
