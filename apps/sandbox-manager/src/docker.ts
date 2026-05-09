/**
 * Docker sandbox launcher and lifecycle manager.
 *
 * Uses Docker CLI (not Docker Engine API) for implementation clarity.
 * All Docker interactions go through this single module.
 *
 * Security model:
 *   - Read-only root filesystem (--read-only)
 *   - Writable tmpfs at /tmp only
 *   - CPU limit (--cpus)
 *   - Memory limit (--memory)
 *   - PID limit (--pids-limit)
 *   - No privileged mode
 *   - Capabilities dropped (--cap-drop ALL)
 *   - No Docker socket mounted
 *   - No network unless required (--network none by default; Phase 5 overrides)
 *   - Random localhost-bound host port for local dev readiness checking
 *
 * TODO(Phase N): Replace Docker CLI with Docker Engine API / Kubernetes for production.
 */
import { execSync, spawn } from 'child_process';
import { SandboxLimits, ContainerInfo, RuntimeManifest } from './types';
import { SandboxLogger } from './sandboxLogger';
import net from 'net';

// ── Default resource limits ───────────────────────────────────────────────

export const DEFAULT_LIMITS: SandboxLimits = {
  cpus: '1.0',
  cpusetCpus: '0', // Assign to CPU 0 by default for MVP
  memoryMb: 512,
  pidsLimit: 256,
  readOnlyRootfs: true,
  tmpfsSizeMb: 64,
  startupTimeoutMs: 15_000,
  readinessTimeoutMs: 30_000
};

// ── Language → Docker image mapping ───────────────────────────────────────

const LANGUAGE_IMAGES: Record<string, string> = {
  node: 'node:18-alpine',
  python: 'python:3.11-slim',
  go: 'golang:1.21-alpine',
  rust: 'rust:1.73-slim',
  cpp: 'gcc:13',
  java: 'eclipse-temurin:17-jre-alpine'
};

/** Find a free port on localhost for host-binding */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('Could not find free port'));
      }
    });
    srv.on('error', reject);
  });
}

/** Execute a docker CLI command synchronously, returning stdout */
function dockerExec(args: string, logger: SandboxLogger, step: string): string {
  const cmd = `docker ${args}`;
  logger.info(step, `Executing: ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30_000 }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString() ?? '';
    const stdout = err.stdout?.toString() ?? '';
    throw new Error(`Docker command failed: ${cmd}\nstderr: ${stderr}\nstdout: ${stdout}`);
  }
}

// ── Launch ────────────────────────────────────────────────────────────────

export interface LaunchResult {
  containerId: string;
  containerName: string;
  hostPort: number;
  internalPort: number;
}

/**
 * Launch a contestant's submission in an isolated Docker container.
 *
 * @param benchmarkRunId  Used for deterministic container name
 * @param workspaceSrcDir Absolute path to the built submission source on host
 * @param manifest        Parsed manifest from the successful BuildJob
 * @param limits          Resource limits (defaults applied if not provided)
 * @param logger          Structured logger for lifecycle events
 */
export async function launchSandbox(
  benchmarkRunId: string,
  workspaceSrcDir: string,
  manifest: RuntimeManifest,
  imageOverride: string | null,
  logger: SandboxLogger,
  limits: SandboxLimits = DEFAULT_LIMITS
): Promise<LaunchResult> {
  const containerName = `sandbox-${benchmarkRunId}`;
  const internalPort = manifest.port;
  const hostPort = await findFreePort();
  const image = imageOverride || (LANGUAGE_IMAGES[manifest.language] ?? 'node:18-alpine');

  logger.info('launch', 'Preparing sandbox container', {
    containerName,
    image,
    internalPort,
    hostPort,
    limits
  });

  // Convert Windows path to Docker-compatible mount path
  // On Docker Desktop for Windows, C:\foo becomes /c/foo or //c/foo
  const mountSource = workspaceSrcDir.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');

  const args = [
    'create',
    `--name ${containerName}`,
    // Resource limits
    `--cpus=${limits.cpus}`,
    limits.cpusetCpus ? `--cpuset-cpus=${limits.cpusetCpus}` : '',
    `--memory=${limits.memoryMb}m`,
    `--pids-limit=${limits.pidsLimit}`,
    // Security hardening
    limits.readOnlyRootfs ? '--read-only' : '',
    `--tmpfs /tmp:rw,noexec,nosuid,size=${limits.tmpfsSizeMb}m`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--no-healthcheck',
    // No restart policy — we control lifecycle explicitly
    '--restart=no',
    // Network: bridge for local dev so we can port-forward
    // TODO(Phase 5): use --network=none and inject load-generator into same network
    '--network=bridge',
    // Port binding: only on localhost, random host port → internal port
    `-p 127.0.0.1:${hostPort}:${internalPort}`,
    // Mount workspace read-only
    `-v "${mountSource}:/app:ro"`,
    // Working directory
    '-w /app',
    // Environment: minimal, only PORT
    `-e PORT=${internalPort}`,
    // Image
    image,
    // Command: use sh -c to interpret the manifest's run command
    `sh -c "${manifest.run.replace(/"/g, '\\"')}"`
  ].filter(Boolean).join(' ');

  const containerId = dockerExec(args, logger, 'launch');
  logger.info('launch', `Container created`, { containerId, containerName });

  // Start the container
  dockerExec(`start ${containerId}`, logger, 'launch');
  logger.info('launch', 'Container started');

  return { containerId, containerName, hostPort, internalPort };
}

// ── Inspect ───────────────────────────────────────────────────────────────

export function inspectContainer(containerId: string, logger: SandboxLogger): ContainerInfo | null {
  try {
    const raw = dockerExec(
      `inspect --format "{{.State.Status}}|{{.State.Pid}}|{{.State.StartedAt}}|{{.Name}}" ${containerId}`,
      logger,
      'inspect'
    );
    // Parse raw: running|12345|2026-01-01T00:00:00Z|/sandbox-xxx
    const parts = raw.replace(/"/g, '').split('|');
    return {
      containerId,
      containerName: parts[3]?.replace(/^\//, '') ?? '',
      state: parts[0] ?? 'unknown',
      pid: parseInt(parts[1] ?? '0', 10),
      startedAt: parts[2] ?? '',
      hostPort: null, // filled by caller from launch result
      internalPort: 0  // filled by caller
    };
  } catch {
    return null;
  }
}

// ── Readiness check ───────────────────────────────────────────────────────

/**
 * Wait for the container's service to become reachable.
 * Probes the host-bound port via TCP connect.
 * Returns true if ready within timeout, false otherwise.
 */
export async function waitForReadiness(
  hostPort: number,
  timeoutMs: number,
  logger: SandboxLogger
): Promise<boolean> {
  const start = Date.now();
  const pollIntervalMs = 500;

  logger.info('readiness', `Waiting for TCP port ${hostPort} (timeout ${timeoutMs}ms)`);

  while (Date.now() - start < timeoutMs) {
    const ok = await tcpProbe('127.0.0.1', hostPort);
    if (ok) {
      logger.info('readiness', `Port ${hostPort} is reachable`);
      return true;
    }
    await sleep(pollIntervalMs);
  }

  logger.error('readiness', `Timeout: port ${hostPort} not reachable after ${timeoutMs}ms`);
  return false;
}

function tcpProbe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1000);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Stop + Cleanup ────────────────────────────────────────────────────────

/**
 * Stop and remove a sandbox container.
 * Tolerates containers that are already stopped.
 */
export function stopAndRemoveContainer(containerId: string, logger: SandboxLogger): void {
  try {
    dockerExec(`stop --time=5 ${containerId}`, logger, 'cleanup');
  } catch {
    logger.warn('cleanup', `Container ${containerId} may already be stopped`);
  }

  try {
    dockerExec(`rm -f ${containerId}`, logger, 'cleanup');
    logger.info('cleanup', `Container ${containerId} removed`);
  } catch {
    logger.warn('cleanup', `Failed to remove container ${containerId}`);
  }
}

/**
 * Fetch the container's stdout/stderr logs from Docker.
 */
export function getContainerLogs(containerId: string, logger: SandboxLogger): string {
  try {
    return dockerExec(`logs --tail=200 ${containerId}`, logger, 'logs');
  } catch {
    return '(unable to retrieve container logs)';
  }
}
