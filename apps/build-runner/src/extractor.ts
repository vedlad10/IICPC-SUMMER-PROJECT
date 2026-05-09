/**
 * Archive extraction with path-traversal protection.
 *
 * Supports .zip and .tar / .tar.gz submission archives.
 * Enforces max file count and max total size limits.
 */
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import tar from 'tar';
import { BuildLogger } from './buildLogger';

const MAX_FILES = 2000;
const MAX_TOTAL_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

/** Sanitize an entry path to prevent traversal attacks */
function safePath(entryPath: string, destDir: string): string | null {
  // Normalize separators first — archive entries may use forward slashes on Windows
  const normalized = entryPath.replace(/\//g, path.sep).replace(/\\/g, path.sep);
  const resolved = path.resolve(destDir, normalized);
  const destResolved = path.resolve(destDir);
  // Must remain strictly inside destDir (add sep to prevent partial-name false-positives)
  if (!resolved.startsWith(destResolved + path.sep) && resolved !== destResolved) {
    return null; // traversal attempt blocked
  }
  return resolved;
}

export interface ExtractionResult {
  ok: boolean;
  fileCount: number;
  totalBytes: number;
  error: string | null;
}

/** Extract a zip archive safely */
function extractZip(archivePath: string, destDir: string, logger: BuildLogger): ExtractionResult {
  let zip: AdmZip;
  try {
    zip = new AdmZip(archivePath);
  } catch (err) {
    return { ok: false, fileCount: 0, totalBytes: 0, error: `Failed to open zip: ${String(err)}` };
  }

  const entries = zip.getEntries();
  if (entries.length > MAX_FILES) {
    return { ok: false, fileCount: 0, totalBytes: 0, error: `Archive exceeds max file count (${MAX_FILES})` };
  }

  let totalBytes = 0;
  let fileCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const dest = safePath(entry.entryName, destDir);
    if (!dest) {
      logger.warn('extract', `Skipping path-traversal entry: ${entry.entryName}`);
      continue;
    }

    totalBytes += entry.header.size;
    if (totalBytes > MAX_TOTAL_SIZE_BYTES) {
      return { ok: false, fileCount, totalBytes, error: `Archive exceeds max total size (${MAX_TOTAL_SIZE_BYTES} bytes)` };
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.getData());
    fileCount++;
  }

  return { ok: true, fileCount, totalBytes, error: null };
}

/** Extract a tar / tar.gz archive safely */
async function extractTar(archivePath: string, destDir: string, logger: BuildLogger): Promise<ExtractionResult> {
  let fileCount = 0;
  let totalBytes = 0;

  try {
    await tar.extract({
      file: archivePath,
      cwd: destDir,
      filter: (entryPath, stat) => {
        const dest = safePath(entryPath, destDir);
        if (!dest) {
          logger.warn('extract', `Skipping path-traversal entry: ${entryPath}`);
          return false;
        }
        fileCount++;
        totalBytes += stat.size ?? 0;
        if (fileCount > MAX_FILES) throw new Error(`Archive exceeds max file count (${MAX_FILES})`);
        if (totalBytes > MAX_TOTAL_SIZE_BYTES) throw new Error(`Archive exceeds max total size`);
        return true;
      },
      strict: true
    });
  } catch (err) {
    return { ok: false, fileCount, totalBytes, error: String(err) };
  }

  return { ok: true, fileCount, totalBytes, error: null };
}

/** Detect format and dispatch to the correct extractor */
export async function extractArtifact(
  archivePath: string,
  destDir: string,
  logger: BuildLogger
): Promise<ExtractionResult> {
  const base = path.basename(archivePath).toLowerCase();

  if (base.endsWith('.zip')) {
    logger.info('extract', 'Detected zip archive');
    return extractZip(archivePath, destDir, logger);
  }

  if (base.endsWith('.tar.gz') || base.endsWith('.tgz') || base.endsWith('.tar')) {
    logger.info('extract', 'Detected tar archive');
    return extractTar(archivePath, destDir, logger);
  }

  return {
    ok: false,
    fileCount: 0,
    totalBytes: 0,
    error: `Unsupported archive format: ${base}. Expected .zip, .tar.gz, or .tar`
  };
}
