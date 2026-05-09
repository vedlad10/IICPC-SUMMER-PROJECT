/**
 * Internal types for the build-runner service.
 * Not exported to the workspace; use packages/shared-types for cross-service contracts.
 */

/** Allowed contestant submission languages */
export const ALLOWED_LANGUAGES = ['node', 'python', 'go', 'rust', 'cpp', 'java'] as const;
export type Language = typeof ALLOWED_LANGUAGES[number];

/** The parsed and validated benchmark.manifest.json contract */
export interface SubmissionManifest {
  name: string;
  version: string;
  language: Language;
  entrypoint: string;
  port: number;
  build: string | null;  // null = no build step required
  run: string;
}

/** A single structured log entry */
export interface LogEntry {
  ts: string;       // ISO timestamp
  step: string;     // e.g. 'claim', 'extract', 'validate', 'build'
  level: 'info' | 'warn' | 'error';
  msg: string;
  data?: Record<string, unknown>;
}

/** Final outcome written to build-result.json */
export interface BuildResult {
  buildJobId: string;
  submissionId: string;
  status: 'SUCCESS' | 'FAILED';
  failureReason?: string;
  buildExitCode: number | null;
  hasDockerfile: boolean;
  manifest: SubmissionManifest | null;
  workspacePath: string;
  outputPath: string;
  logPath: string;
  startedAt: string;
  completedAt: string;
}
