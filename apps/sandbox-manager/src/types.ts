/**
 * Internal types for the sandbox-manager service.
 */

/** Structured sandbox log entry */
export interface SandboxLogEntry {
  ts: string;
  step: string;   // 'claim' | 'resolve' | 'launch' | 'readiness' | 'stop' | 'cleanup' | 'finalize'
  level: 'info' | 'warn' | 'error';
  msg: string;
  data?: Record<string, unknown>;
}

/** Resource limits applied to the sandbox container */
export interface SandboxLimits {
  cpus: string;           // e.g. "1.0"
  cpusetCpus?: string;    // e.g. "0" or "0-1"
  memoryMb: number;       // e.g. 512
  pidsLimit: number;      // e.g. 256
  readOnlyRootfs: boolean;
  tmpfsSizeMb: number;    // writable /tmp size
  startupTimeoutMs: number;
  readinessTimeoutMs: number;
}

/** Manifest fields relevant to sandbox launch */
export interface RuntimeManifest {
  name: string;
  language: string;
  entrypoint: string;
  port: number;
  run: string;
}

/** Docker container inspect summary (subset of full inspect output) */
export interface ContainerInfo {
  containerId: string;
  containerName: string;
  state: string;     // "running" | "exited" | "created" etc.
  pid: number;
  startedAt: string;
  hostPort: number | null;
  internalPort: number;
}

/** Final outcome written to runtime-result.json */
export interface RuntimeResult {
  benchmarkRunId: string;
  submissionId: string;
  buildJobId: string;
  status: 'READY' | 'FAILED' | 'STOPPED';
  failureReason?: string;
  containerId: string | null;
  containerName: string | null;
  runtimeHost: string | null;
  runtimePort: number | null;
  internalPort: number;
  readinessAt: string | null;
  cleanupAt: string | null;
  limits: SandboxLimits;
  manifest: RuntimeManifest;
  startedAt: string;
  completedAt: string;
}
