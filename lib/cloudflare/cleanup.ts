import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getR2Client, getR2Bucket, parseObjectKey } from './client';

/**
 * Deletion and cleanup functionality for Cloudflare R2
 */

export interface DeleteResult {
  success: boolean;
  deletedCount: number;
  errors: string[];
}

/**
 * Delete a single object from R2
 */
export async function deleteObject(key: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await client.send(command);

    return { success: true };
  } catch (error) {
    console.error(`Failed to delete object ${key}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
}

/**
 * Delete multiple objects (batch delete)
 */
export async function deleteObjects(keys: string[]): Promise<DeleteResult> {
  if (keys.length === 0) {
    return { success: true, deletedCount: 0, errors: [] };
  }

  try {
    const client = getR2Client();
    const bucket = getR2Bucket();

    // R2 allows up to 1000 objects per batch delete
    const batchSize = 1000;
    let totalDeleted = 0;
    const errors: string[] = [];

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      const command = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map(key => ({ Key: key })),
          Quiet: false,
        },
      });

      const response = await client.send(command);

      totalDeleted += response.Deleted?.length || 0;

      if (response.Errors && response.Errors.length > 0) {
        response.Errors.forEach(err => {
          errors.push(`${err.Key}: ${err.Message}`);
        });
      }
    }

    return {
      success: errors.length === 0,
      deletedCount: totalDeleted,
      errors,
    };
  } catch (error) {
    console.error('Batch delete failed:', error);
    return {
      success: false,
      deletedCount: 0,
      errors: [error instanceof Error ? error.message : 'Batch delete failed'],
    };
  }
}

/**
 * Delete proof image by goal ID
 */
export async function deleteProofImage(goalId: string): Promise<DeleteResult> {
  try {
    // List all objects with this goal ID in metadata
    const objects = await listObjectsByPrefix(`proofs/`);

    // Filter objects that belong to this goal
    // Note: In production, you'd want to store key in database for faster deletion
    const keysToDelete = objects.filter(obj => {
      // Check if metadata contains goalId
      // This is a simplified approach - in production use database
      return obj.key.includes(goalId);
    }).map(obj => obj.key);

    if (keysToDelete.length === 0) {
      return { success: true, deletedCount: 0, errors: [] };
    }

    return await deleteObjects(keysToDelete);
  } catch (error) {
    console.error('Failed to delete proof images:', error);
    return {
      success: false,
      deletedCount: 0,
      errors: [error instanceof Error ? error.message : 'Delete failed'],
    };
  }
}

/**
 * Delete all objects for a user
 */
export async function deleteUserObjects(userId: string): Promise<DeleteResult> {
  try {
    const objects = await listObjectsByPrefix(`proofs/${userId}/`);
    const keys = objects.map(obj => obj.key);

    if (keys.length === 0) {
      return { success: true, deletedCount: 0, errors: [] };
    }

    return await deleteObjects(keys);
  } catch (error) {
    console.error('Failed to delete user objects:', error);
    return {
      success: false,
      deletedCount: 0,
      errors: [error instanceof Error ? error.message : 'Delete failed'],
    };
  }
}

/**
 * List objects by prefix
 */
export async function listObjectsByPrefix(prefix: string): Promise<
  Array<{
    key: string;
    size: number;
    lastModified: Date;
  }>
> {
  try {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const objects: Array<{ key: string; size: number; lastModified: Date }> = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            objects.push({
              key: obj.Key,
              size: obj.Size || 0,
              lastModified: obj.LastModified || new Date(),
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  } catch (error) {
    console.error('Failed to list objects:', error);
    return [];
  }
}

/**
 * Clean up old objects (older than specified days)
 */
export async function cleanupOldObjects(
  prefix: string,
  olderThanDays: number
): Promise<DeleteResult> {
  try {
    const objects = await listObjectsByPrefix(prefix);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const oldObjects = objects.filter(obj => obj.lastModified < cutoffDate);
    const keys = oldObjects.map(obj => obj.key);

    if (keys.length === 0) {
      return { success: true, deletedCount: 0, errors: [] };
    }

    console.log(`Cleaning up ${keys.length} objects older than ${olderThanDays} days`);

    return await deleteObjects(keys);
  } catch (error) {
    console.error('Cleanup failed:', error);
    return {
      success: false,
      deletedCount: 0,
      errors: [error instanceof Error ? error.message : 'Cleanup failed'],
    };
  }
}

/**
 * Clean up orphaned proofs (proofs without corresponding goals)
 */
export async function cleanupOrphanedProofs(
  validGoalIds: string[]
): Promise<DeleteResult> {
  try {
    const objects = await listObjectsByPrefix('proofs/');

    // Filter objects that don't match any valid goal ID
    const orphanedKeys = objects
      .filter(obj => {
        // Extract potential goal ID from key
        // This is simplified - in production use database lookup
        return !validGoalIds.some(id => obj.key.includes(id));
      })
      .map(obj => obj.key);

    if (orphanedKeys.length === 0) {
      return { success: true, deletedCount: 0, errors: [] };
    }

    console.log(`Cleaning up ${orphanedKeys.length} orphaned proofs`);

    return await deleteObjects(orphanedKeys);
  } catch (error) {
    console.error('Orphaned cleanup failed:', error);
    return {
      success: false,
      deletedCount: 0,
      errors: [error instanceof Error ? error.message : 'Cleanup failed'],
    };
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(prefix?: string): Promise<{
  totalObjects: number;
  totalSize: number;
  sizeByType: Record<string, { count: number; size: number }>;
}> {
  try {
    const objects = await listObjectsByPrefix(prefix || '');

    const stats = {
      totalObjects: objects.length,
      totalSize: objects.reduce((sum, obj) => sum + obj.size, 0),
      sizeByType: {} as Record<string, { count: number; size: number }>,
    };

    // Group by file type
    for (const obj of objects) {
      const ext = obj.key.split('.').pop()?.toLowerCase() || 'unknown';

      if (!stats.sizeByType[ext]) {
        stats.sizeByType[ext] = { count: 0, size: 0 };
      }

      stats.sizeByType[ext].count += 1;
      stats.sizeByType[ext].size += obj.size;
    }

    return stats;
  } catch (error) {
    console.error('Failed to get storage stats:', error);
    return {
      totalObjects: 0,
      totalSize: 0,
      sizeByType: {},
    };
  }
}

/**
 * Check if cleanup is needed
 */
export async function needsCleanup(
  maxSizeGB: number = 10,
  maxObjects: number = 10000
): Promise<{
  needsCleanup: boolean;
  reason?: string;
  stats: {
    totalObjects: number;
    totalSizeGB: number;
  };
}> {
  try {
    const stats = await getStorageStats();
    const totalSizeGB = stats.totalSize / (1024 * 1024 * 1024);

    if (stats.totalObjects > maxObjects) {
      return {
        needsCleanup: true,
        reason: `Object count (${stats.totalObjects}) exceeds limit (${maxObjects})`,
        stats: {
          totalObjects: stats.totalObjects,
          totalSizeGB,
        },
      };
    }

    if (totalSizeGB > maxSizeGB) {
      return {
        needsCleanup: true,
        reason: `Storage size (${totalSizeGB.toFixed(2)}GB) exceeds limit (${maxSizeGB}GB)`,
        stats: {
          totalObjects: stats.totalObjects,
          totalSizeGB,
        },
      };
    }

    return {
      needsCleanup: false,
      stats: {
        totalObjects: stats.totalObjects,
        totalSizeGB,
      },
    };
  } catch (error) {
    console.error('Failed to check cleanup need:', error);
    return {
      needsCleanup: false,
      stats: {
        totalObjects: 0,
        totalSizeGB: 0,
      },
    };
  }
}
