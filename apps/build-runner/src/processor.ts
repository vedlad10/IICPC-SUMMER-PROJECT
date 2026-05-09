/**
 * Core build job processor.
 *
 * Orchestrates the full Phase 3 build pipeline:
 *   claim → resolve artifact → init workspace → extract →
 *   validate manifest → build → write result → update DB
 *
 * Each step calls the appropriate utility module.
 * This module owns no path logic, no file I/O, and no DB queries beyond
 * the final status updates — all delegated to their respective modules.
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '@benchmark/db';
import { claimNextJob, ClaimedJob } from './claim';
import { BuildLogger } from './buildLogger';
import { validateManifest } from './manifest';
import { extractArtifact } from './extractor';
import { runCommand } from './executor';
import { BuildResult, SubmissionManifest } from './types';
import {
  artifactAbsolutePath,
  initWorkspace,
  logFilePath,
  buildResultPath,
  workspaceSrcDir,
  workspaceOutputDir,
  logicalPaths
} from './workspace';

const BUILD_TIMEOUT_MS = parseInt(process.env.BUILD_TIMEOUT_MS ?? '120000', 10);

export interface ProcessResult {
  claimed: boolean;
  buildJobId?: string;
  status?: 'SUCCESS' | 'FAILED';
  error?: string;
}

/** Run one complete build job end-to-end */
export async function processNextJob(): Promise<ProcessResult> {
  // ── Claim ──────────────────────────────────────────────────────────────
  let claimed: ClaimedJob | null;
  try {
    claimed = await claimNextJob();
  } catch (err) {
    return { claimed: false, error: `Failed to claim job: ${String(err)}` };
  }

  if (!claimed) return { claimed: false };

  const { buildJob, submission } = claimed;
  const logger = new BuildLogger(buildJob.id);
  const logical = logicalPaths(buildJob.id);
  const startedAt = new Date().toISOString();

  logger.info('claim', `Claimed BuildJob`, { buildJobId: buildJob.id, submissionId: submission.id });

  // Helper: fail the job cleanly
  const failJob = async (reason: string, exitCode: number | null = null): Promise<ProcessResult> => {
    logger.error('finalize', reason);
    logger.flush();

    const manifest: SubmissionManifest | null = null;
    const result: BuildResult = {
      buildJobId: buildJob.id,
      submissionId: submission.id,
      status: 'FAILED',
      failureReason: reason,
      buildExitCode: exitCode,
      hasDockerfile: false,
      manifest,
      workspacePath: logical.workspacePath,
      outputPath: logical.outputPath,
      logPath: logical.logPath,
      startedAt,
      completedAt: new Date().toISOString()
    };

    // Best-effort write result file (workspace may not exist yet on early failures)
    try {
      const outputDir = workspaceOutputDir(buildJob.id);
      if (fs.existsSync(outputDir)) {
        fs.writeFileSync(buildResultPath(buildJob.id), JSON.stringify(result, null, 2));
      }
    } catch { /* non-fatal */ }

    await prisma.buildJob.update({
      where: { id: buildJob.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: reason,
        buildExitCode: exitCode,
        logPath: logical.logPath,
        workspacePath: logical.workspacePath,
        outputPath: logical.outputPath
      }
    });

    return { claimed: true, buildJobId: buildJob.id, status: 'FAILED', error: reason };
  };

  // ── Resolve artifact ───────────────────────────────────────────────────
  logger.info('resolve', 'Resolving submission artifact');

  if (!submission.storedPath) {
    return failJob('Submission has no stored artifact path');
  }

  const artifactPath = artifactAbsolutePath(submission.storedPath);

  if (!fs.existsSync(artifactPath)) {
    return failJob(`Artifact file not found on disk: ${submission.storedPath}`);
  }

  logger.info('resolve', 'Artifact located', { artifactPath });

  // ── Init workspace ─────────────────────────────────────────────────────
  logger.info('workspace', 'Initializing build workspace');
  try {
    initWorkspace(buildJob.id);
  } catch (err) {
    return failJob(`Failed to create workspace: ${String(err)}`);
  }

  const srcDir = workspaceSrcDir(buildJob.id);

  // ── Extract ────────────────────────────────────────────────────────────
  logger.info('extract', 'Extracting archive', { format: path.extname(artifactPath) });

  const extraction = await extractArtifact(artifactPath, srcDir, logger);
  if (!extraction.ok) {
    return failJob(`Extraction failed: ${extraction.error}`);
  }

  logger.info('extract', 'Extraction complete', {
    fileCount: extraction.fileCount,
    totalBytes: extraction.totalBytes
  });

  // ── Validate manifest ──────────────────────────────────────────────────
  logger.info('validate', 'Validating submission manifest');

  const validation = validateManifest(srcDir);
  if (!validation.ok) {
    return failJob(`Manifest validation failed: ${validation.error}`);
  }

  const manifest = validation.manifest!;
  logger.info('validate', 'Manifest valid', { manifest });

  // ── Check Dockerfile presence ──────────────────────────────────────────
  const dockerfilePath = path.join(srcDir, 'Dockerfile');
  const hasDockerfile = fs.existsSync(dockerfilePath);

  if (hasDockerfile) {
    logger.info('validate', 'Dockerfile detected — container build deferred to Phase 4');
  } else {
    logger.info('validate', 'No Dockerfile found — proceeding with manifest build command');
  }

  // ── Execute build command ──────────────────────────────────────────────
  let buildExitCode: number | null = null;

  if (manifest.build) {
    const execResult = await runCommand(manifest.build, srcDir, logger, BUILD_TIMEOUT_MS);
    buildExitCode = execResult.exitCode;

    if (execResult.timedOut) {
      return failJob(`Build command timed out after ${BUILD_TIMEOUT_MS}ms`, buildExitCode);
    }

    if (execResult.exitCode !== 0) {
      return failJob(
        `Build command exited with code ${execResult.exitCode}`,
        execResult.exitCode
      );
    }

    logger.info('build', `Build command completed`, {
      exitCode: execResult.exitCode,
      durationMs: execResult.durationMs
    });
  } else {
    logger.info('build', 'No build command in manifest — skipping build step (no-op)');
  }

  // ── Docker Build ───────────────────────────────────────────────────────
  if (hasDockerfile) {
    logger.info('docker', 'Starting Docker image build');
    const imageName = `engine-${submission.id.toLowerCase()}`;
    const dockerBuildCmd = `docker build -t ${imageName} .`;
    
    const dockerResult = await runCommand(dockerBuildCmd, srcDir, logger, BUILD_TIMEOUT_MS * 2);
    if (dockerResult.exitCode !== 0) {
      return failJob(`Docker build failed with code ${dockerResult.exitCode}`, dockerResult.exitCode);
    }
    
    logger.info('docker', 'Docker image built successfully', { imageName });
  }

  // ── Write build-result.json ────────────────────────────────────────────
  const completedAt = new Date().toISOString();
  logger.info('finalize', 'Build succeeded — writing result');

  const result: BuildResult = {
    buildJobId: buildJob.id,
    submissionId: submission.id,
    status: 'SUCCESS',
    buildExitCode,
    hasDockerfile,
    manifest,
    workspacePath: logical.workspacePath,
    outputPath: logical.outputPath,
    logPath: logical.logPath,
    startedAt,
    completedAt
  };

  fs.writeFileSync(buildResultPath(buildJob.id), JSON.stringify(result, null, 2));
  logger.flush();

  // ── Update DB ──────────────────────────────────────────────────────────
  await prisma.buildJob.update({
    where: { id: buildJob.id },
    data: {
      status: 'SUCCESS',
      completedAt: new Date(),
      buildExitCode,
      manifestSnapshot: { ...manifest, hasDockerfile } as object,
      logPath: logical.logPath,
      workspacePath: logical.workspacePath,
      outputPath: logical.outputPath
    }
  });

  // Mark parent Submission as BUILDING (Phase 4 will advance it further)
  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: 'BUILDING' }
  });

  return { claimed: true, buildJobId: buildJob.id, status: 'SUCCESS' };
}
