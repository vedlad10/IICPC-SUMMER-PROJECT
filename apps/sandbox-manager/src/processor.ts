/**
 * Core sandbox lifecycle processor.
 *
 * Orchestrates:
 *   claim → resolve runtime contract → init workspace → launch container →
 *   readiness check → update DB → (sandbox is now READY for Phase 5 traffic)
 *
 * Also provides stop/cleanup flow.
 */
import fs from 'fs';
import { prisma } from '@benchmark/db';
import { claimNextRun, ClaimedRun } from './claim';
import { SandboxLogger } from './sandboxLogger';
import {
  launchSandbox,
  waitForReadiness,
  stopAndRemoveContainer,
  getContainerLogs,
  inspectContainer,
  DEFAULT_LIMITS
} from './docker';
import { RuntimeManifest, RuntimeResult, SandboxLimits } from './types';
import {
  buildWorkspaceSrcDir,
  initSandboxWorkspace,
  runtimeLogPath,
  runtimeResultPath,
  logicalPaths
} from './workspace';

// ── Process next ──────────────────────────────────────────────────────────

export interface ProcessResult {
  claimed: boolean;
  benchmarkRunId?: string;
  status?: 'READY' | 'FAILED';
  error?: string;
  runtimeHost?: string;
  runtimePort?: number;
  containerId?: string;
}

export async function processNextRun(): Promise<ProcessResult> {
  // ── Claim ──────────────────────────────────────────────────────────────
  let claimed: ClaimedRun | null;
  try {
    claimed = await claimNextRun();
  } catch (err) {
    return { claimed: false, error: `Failed to claim run: ${String(err)}` };
  }

  if (!claimed) return { claimed: false };

  const { benchmarkRun, submission, buildJob } = claimed;
  const logger = new SandboxLogger(benchmarkRun.id);
  const logical = logicalPaths(benchmarkRun.id);
  const startedAt = new Date().toISOString();

  logger.info('claim', 'Claimed BenchmarkRun', {
    benchmarkRunId: benchmarkRun.id,
    submissionId: submission.id,
    buildJobId: buildJob.id
  });

  // Helper: fail the run cleanly
  const failRun = async (reason: string): Promise<ProcessResult> => {
    logger.error('finalize', reason);

    // Init workspace if it hasn't been yet, so we can write the log
    try { initSandboxWorkspace(benchmarkRun.id); } catch { /* may already exist */ }

    logger.flush(runtimeLogPath(benchmarkRun.id));

    const result: RuntimeResult = {
      benchmarkRunId: benchmarkRun.id,
      submissionId: submission.id,
      buildJobId: buildJob.id,
      status: 'FAILED',
      failureReason: reason,
      containerId: null,
      containerName: null,
      runtimeHost: null,
      runtimePort: null,
      internalPort: 0,
      readinessAt: null,
      cleanupAt: null,
      limits: DEFAULT_LIMITS,
      manifest: { name: '', language: '', entrypoint: '', port: 0, run: '' },
      startedAt,
      completedAt: new Date().toISOString()
    };

    try {
      fs.writeFileSync(runtimeResultPath(benchmarkRun.id), JSON.stringify(result, null, 2));
    } catch { /* non-fatal */ }

    await prisma.benchmarkRun.update({
      where: { id: benchmarkRun.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: reason,
        logPath: logical.logPath,
        outputPath: logical.outputPath
      }
    });

    return { claimed: true, benchmarkRunId: benchmarkRun.id, status: 'FAILED', error: reason };
  };

  // ── Resolve runtime contract ───────────────────────────────────────────
  logger.info('resolve', 'Resolving runtime contract from successful BuildJob');

  if (buildJob.status !== 'SUCCESS') {
    return failRun(`BuildJob ${buildJob.id} is not in SUCCESS state (got ${buildJob.status})`);
  }

  // Load manifest from the BuildJob's snapshot
  const manifestSnapshot = buildJob.manifestSnapshot as Record<string, unknown> | null;
  if (!manifestSnapshot) {
    return failRun('No manifest snapshot found on BuildJob');
  }

  const manifest: RuntimeManifest = {
    name: String(manifestSnapshot.name ?? ''),
    language: String(manifestSnapshot.language ?? ''),
    entrypoint: String(manifestSnapshot.entrypoint ?? ''),
    port: Number(manifestSnapshot.port ?? 0),
    run: String(manifestSnapshot.run ?? '')
  };

  if (!manifest.run || !manifest.port || !manifest.language) {
    return failRun('Manifest is missing required runtime fields (run, port, language)');
  }

  // Resolve workspace
  if (!buildJob.workspacePath) {
    return failRun('BuildJob has no workspacePath');
  }

  // workspacePath is stored as "{buildJobId}/src" — extract the buildJobId
  const srcDir = buildWorkspaceSrcDir(buildJob.id);

  if (!fs.existsSync(srcDir)) {
    return failRun(`Build workspace not found on disk: ${srcDir}`);
  }

  logger.info('resolve', 'Runtime contract resolved', { manifest, srcDir });

  // ── Init sandbox workspace ─────────────────────────────────────────────
  initSandboxWorkspace(benchmarkRun.id);

  // ── Launch container ───────────────────────────────────────────────────
  let launch;
  try {
    const customImage = (manifestSnapshot as any).hasDockerfile 
      ? `engine-${submission.id.toLowerCase()}` 
      : null;

    launch = await launchSandbox(
      benchmarkRun.id,
      srcDir,
      manifest,
      customImage,
      logger,
      DEFAULT_LIMITS
    );
  } catch (err) {
    return failRun(`Failed to launch sandbox container: ${String(err)}`);
  }

  logger.info('launch', 'Sandbox container running', {
    containerId: launch.containerId,
    hostPort: launch.hostPort
  });

  // Update DB with container info immediately
  await prisma.benchmarkRun.update({
    where: { id: benchmarkRun.id },
    data: {
      containerId: launch.containerId,
      containerName: launch.containerName,
      runtimeHost: '127.0.0.1',
      runtimePort: launch.hostPort,
      internalPort: launch.internalPort,
      sandboxMetadata: {
        image: manifest.language,
        limits: DEFAULT_LIMITS,
        manifest
      } as object
    }
  });

  // ── Readiness check ────────────────────────────────────────────────────
  const ready = await waitForReadiness(
    launch.hostPort,
    DEFAULT_LIMITS.readinessTimeoutMs,
    logger
  );

  if (!ready) {
    // Container started but service didn't become reachable
    const containerLogs = getContainerLogs(launch.containerId, logger);
    logger.error('readiness', 'Container logs at failure', { logs: containerLogs });

    // Stop the failed container
    stopAndRemoveContainer(launch.containerId, logger);

    return failRun(`Sandbox failed readiness check within ${DEFAULT_LIMITS.readinessTimeoutMs}ms`);
  }

  const readinessAt = new Date();
  logger.info('readiness', 'Sandbox is READY', {
    readinessAt: readinessAt.toISOString(),
    hostPort: launch.hostPort
  });

  // ── Write result + flush logs ──────────────────────────────────────────
  const completedAt = new Date().toISOString();

  const result: RuntimeResult = {
    benchmarkRunId: benchmarkRun.id,
    submissionId: submission.id,
    buildJobId: buildJob.id,
    status: 'READY',
    containerId: launch.containerId,
    containerName: launch.containerName,
    runtimeHost: '127.0.0.1',
    runtimePort: launch.hostPort,
    internalPort: launch.internalPort,
    readinessAt: readinessAt.toISOString(),
    cleanupAt: null,
    limits: DEFAULT_LIMITS,
    manifest,
    startedAt,
    completedAt
  };

  fs.writeFileSync(runtimeResultPath(benchmarkRun.id), JSON.stringify(result, null, 2));
  logger.flush(runtimeLogPath(benchmarkRun.id));

  // ── Update DB → READY ─────────────────────────────────────────────────
  await prisma.benchmarkRun.update({
    where: { id: benchmarkRun.id },
    data: {
      status: 'READY',
      readinessAt,
      logPath: logical.logPath,
      outputPath: logical.outputPath
    }
  });

  // Update parent Submission status
  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: 'RUNNING' }
  });

  return {
    claimed: true,
    benchmarkRunId: benchmarkRun.id,
    status: 'READY',
    runtimeHost: '127.0.0.1',
    runtimePort: launch.hostPort,
    containerId: launch.containerId
  };
}

// ── Stop sandbox ──────────────────────────────────────────────────────────

export async function stopRun(benchmarkRunId: string): Promise<{ ok: boolean; error?: string }> {
  const run = await prisma.benchmarkRun.findUnique({
    where: { id: benchmarkRunId }
  });

  if (!run) return { ok: false, error: 'BenchmarkRun not found' };

  if (!run.containerId) {
    return { ok: false, error: 'No container associated with this run' };
  }

  const logger = new SandboxLogger(benchmarkRunId);

  // Fetch container logs before stopping
  const containerLogs = getContainerLogs(run.containerId, logger);
  logger.info('stop', 'Container stdout/stderr captured', { logsLength: containerLogs.length });

  // Stop and remove
  stopAndRemoveContainer(run.containerId, logger);

  const cleanupAt = new Date();
  logger.info('cleanup', 'Sandbox stopped and cleaned up', { cleanupAt: cleanupAt.toISOString() });

  // Flush updated logs
  try {
    initSandboxWorkspace(benchmarkRunId); // ensure dirs exist for log write
  } catch { /* may exist */ }
  logger.flush(runtimeLogPath(benchmarkRunId));

  // Update DB
  await prisma.benchmarkRun.update({
    where: { id: benchmarkRunId },
    data: {
      status: 'STOPPED',
      completedAt: cleanupAt,
      cleanupAt
    }
  });

  return { ok: true };
}
