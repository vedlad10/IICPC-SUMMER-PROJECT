/**
 * Centralized path resolver for the sandbox-manager.
 *
 * Sandbox workspace layout:
 *   sandbox-workspaces/
 *     {benchmarkRunId}/
 *       logs/           ← runtime.log.json
 *       output/         ← runtime-result.json
 *
 * Build workspaces (read from build-runner's area):
 *   apps/build-runner/build-workspaces/{buildJobId}/src/
 *
 * No other module should construct raw path strings.
 */
import path from 'path';
import fs from 'fs';

const SANDBOX_WORKSPACES_ROOT = path.resolve(__dirname, '..', 'sandbox-workspaces');

// Build-runner's workspace area (same monorepo, shared filesystem)
// TODO(Phase N): replace with object-storage download for multi-host deployment.
const BUILD_WORKSPACES_ROOT = path.resolve(
  __dirname,
  '..',     // sandbox-manager/
  '..',     // apps/
  'build-runner',
  'build-workspaces'
);

// ── Sandbox workspace paths ───────────────────────────────────────────────

export function sandboxRoot(benchmarkRunId: string): string {
  return path.join(SANDBOX_WORKSPACES_ROOT, benchmarkRunId);
}

export function sandboxLogsDir(benchmarkRunId: string): string {
  return path.join(sandboxRoot(benchmarkRunId), 'logs');
}

export function sandboxOutputDir(benchmarkRunId: string): string {
  return path.join(sandboxRoot(benchmarkRunId), 'output');
}

export function runtimeLogPath(benchmarkRunId: string): string {
  return path.join(sandboxLogsDir(benchmarkRunId), 'runtime.log.json');
}

export function runtimeResultPath(benchmarkRunId: string): string {
  return path.join(sandboxOutputDir(benchmarkRunId), 'runtime-result.json');
}

// ── Build workspace resolution (read-only from build-runner) ──────────────

export function buildWorkspaceSrcDir(buildJobId: string): string {
  return path.join(BUILD_WORKSPACES_ROOT, buildJobId, 'src');
}

// ── Init / cleanup ───────────────────────────────────────────────────────

export function initSandboxWorkspace(benchmarkRunId: string): void {
  const root = sandboxRoot(benchmarkRunId);
  if (fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fs.mkdirSync(sandboxLogsDir(benchmarkRunId), { recursive: true });
  fs.mkdirSync(sandboxOutputDir(benchmarkRunId), { recursive: true });
}

/** Logical paths for DB storage (relative, not absolute) */
export function logicalPaths(benchmarkRunId: string): {
  logPath: string;
  outputPath: string;
} {
  return {
    logPath: path.join(benchmarkRunId, 'logs', 'runtime.log.json'),
    outputPath: path.join(benchmarkRunId, 'output', 'runtime-result.json')
  };
}
