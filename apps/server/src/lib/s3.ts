/**
 * s3.ts — S3Client singleton for MinIO + presigned URL helpers
 *
 * MinIO is S3-compatible, so we use the official AWS SDK.
 * forcePathStyle: true is required for MinIO (no virtual-hosted buckets).
 *
 * Presigned URLs are rewritten to go through the nginx /storage/ proxy
 * so browsers can resolve them (Docker-internal minio:9000 is not routable).
 */

import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "http://minio:9000";

export const s3 = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: "us-east-1", // MinIO ignores this but SDK requires it
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER!,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD!,
  },
  forcePathStyle: true,
});

export const ATTACHMENTS_BUCKET = "attachments";
export const AVATARS_BUCKET = "avatars";

/**
 * Create buckets if they don't already exist.
 * Called once on server startup.
 */
export async function initBuckets(): Promise<void> {
  for (const bucket of [ATTACHMENTS_BUCKET, AVATARS_BUCKET]) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }
}

/**
 * Rewrite a presigned URL from minio:9000 to the nginx /storage/ proxy path.
 * Browser can't resolve Docker-internal hostnames.
 */
function rewritePresignedUrl(presignedUrl: string): string {
  const url = new URL(presignedUrl);
  // Replace the minio host:port with a relative /storage/ path
  // Original: http://minio:9000/bucket/key?X-Amz-...
  // Rewritten: /storage/bucket/key?X-Amz-...
  return `/storage${url.pathname}${url.search}`;
}

/**
 * Generate a presigned PUT URL for uploading a file to MinIO.
 */
export async function getPresignedPutUrl(
  bucket: string,
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const raw = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
  return rewritePresignedUrl(raw);
}

/**
 * Generate a presigned GET URL for downloading a file from MinIO.
 */
export async function getPresignedGetUrl(
  bucket: string,
  key: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  const raw = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
  return rewritePresignedUrl(raw);
}
