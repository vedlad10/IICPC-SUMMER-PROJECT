/**
 * Centralized path resolver for the build-runner.
 *
 * All workspace and artifact paths are constructed here.
 * No other module should build raw path strings independently.
 *
 * Local layout:
 *   build-workspaces/
 *     {buildJobId}/
 *       src/          ← extracted submission files
 *       logs/         ← structured log file
 *       output/       ← build-result.json
 *
 * Submission artifacts are stored by submission-api at:
 *   apps/submission-api/storage/submissions/{submissionId}/original/artifact.{ext}
 */
import path from 'path';
import fs from 'fs';

// Root of the build-runner's own workspace area
const WORKSPACES_ROOT = path.resolve(__dirname, '..', 'build-workspaces');

// Root where submission-api stores uploaded artifacts
// This assumes both services share the local filesystem (monorepo dev env).
// TODO(Phase 4): replace with an object-storage download call.
const SUBMISSION_STORAGE_ROOT = path.resolve(
  __dirname,
  '..',    // build-runner/
  '..',    // apps/
  'submission-api',
  'storage'
);

export function workspaceRoot(buildJobId: string): string {
  return path.join(WORKSPACES_ROOT, buildJobId);
}

export function workspaceSrcDir(buildJobId: string): string {
  return path.join(workspaceRoot(buildJobId), 'src');
}

export function workspaceLogsDir(buildJobId: string): string {
  return path.join(workspaceRoot(buildJobId), 'logs');
}

export function workspaceOutputDir(buildJobId: string): string {
  return path.join(workspaceRoot(buildJobId), 'output');
}

export function logFilePath(buildJobId: string): string {
  return path.join(workspaceLogsDir(buildJobId), 'build.log.json');
}

export function buildResultPath(buildJobId: string): string {
  return path.join(workspaceOutputDir(buildJobId), 'build-result.json');
}

/**
 * Resolve the absolute path of a submission's stored artifact.
 * Uses the storedPath persisted in the Submission DB record.
 * storedPath is relative to the submission-api storage root.
 */
export function artifactAbsolutePath(storedPath: string): string {
  return path.join(SUBMISSION_STORAGE_ROOT, storedPath);
}

/** Create all workspace subdirectories, wiping any pre-existing content */
export function initWorkspace(buildJobId: string): void {
  const root = workspaceRoot(buildJobId);
  if (fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fs.mkdirSync(workspaceSrcDir(buildJobId), { recursive: true });
  fs.mkdirSync(workspaceLogsDir(buildJobId), { recursive: true });
  fs.mkdirSync(workspaceOutputDir(buildJobId), { recursive: true });
}

/** Logical paths (relative to their respective roots) for DB storage */
export function logicalPaths(buildJobId: string): {
  workspacePath: string;
  outputPath: string;
  logPath: string;
} {
  return {
    workspacePath: path.join(buildJobId, 'src'),
    outputPath: path.join(buildJobId, 'output'),
    logPath: path.join(buildJobId, 'logs', 'build.log.json')
  };
}
