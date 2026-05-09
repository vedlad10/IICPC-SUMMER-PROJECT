/**
 * Storage abstraction for the submission-api.
 *
 * Currently backed by the local filesystem.
 * All public methods are the stable interface — swap the implementation
 * here when migrating to MinIO/S3 without changing callers.
 */
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export interface StoredArtifact {
  storedFilename: string;
  storedPath: string;    // logical path relative to storage root
  absolutePath: string;  // physical path on disk (local only — do not expose)
  sizeBytes: bigint;
}

/**
 * Stores a submission artifact under:
 *   storage/submissions/{submissionId}/original/{storedFilename}
 *
 * The stored filename is always the submissionId to eliminate any
 * user-controlled path segments. The original filename is preserved
 * only as metadata in the DB.
 *
 * @param submissionId  UUID of the newly created Submission
 * @param originalFilename  Client-provided name (stored as metadata only)
 * @param stream  Readable stream of the uploaded file body
 * @returns StoredArtifact with path and size info
 */
export async function storeSubmissionArtifact(
  submissionId: string,
  originalFilename: string,
  stream: Readable
): Promise<StoredArtifact> {
  const STORAGE_ROOT = path.resolve(__dirname, '..', 'storage');
  const dir = path.join(STORAGE_ROOT, 'submissions', submissionId, 'original');
  fs.mkdirSync(dir, { recursive: true });

  // Use a sanitized extension from the original name only; no user path segments.
  const ext = path.extname(originalFilename).replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
  const storedFilename = `artifact${ext}`;
  const absolutePath = path.join(dir, storedFilename);

  await pipeline(stream, fs.createWriteStream(absolutePath));

  const { size } = fs.statSync(absolutePath);
  const storedPath = path.join('submissions', submissionId, 'original', storedFilename);

  return {
    storedFilename,
    storedPath,
    absolutePath,
    sizeBytes: BigInt(size)
  };
}
