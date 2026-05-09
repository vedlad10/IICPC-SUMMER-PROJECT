/**
 * Correctness engine processor.
 *
 * Eligibility: BenchmarkRun must be in SUCCESS status
 * (benchmark completed) with telemetry + summary artifacts on disk.
 *
 * Flow:
 *   1. Find eligible run (SUCCESS status, no correctnessStatus yet)
 *   2. Load telemetry + summary artifacts
 *   3. Run all correctness checks
 *   4. Write correctness-report.json
 *   5. Update DB with correctness results
 */
import fs from 'fs';
import { prisma } from '@benchmark/db';
import { loadInputs } from './loader';
import { buildReport } from './reportBuilder';
import { CorrectnessReport } from './types';
import {
  initCorrectnessDir,
  correctnessReportPath,
  logicalCorrectnessPath
} from './workspace';

export interface CorrectnessProcessResult {
  processed: boolean;
  benchmarkRunId?: string;
  classification?: string;
  error?: string;
  report?: CorrectnessReport;
}

/**
 * Find and evaluate the next eligible BenchmarkRun.
 */
export async function processNextCorrectness(): Promise<CorrectnessProcessResult> {
  // Find runs that completed benchmark but haven't been correctness-checked
  const candidate = await prisma.benchmarkRun.findFirst({
    where: {
      status: 'SUCCESS',
      correctnessStatus: null
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!candidate) return { processed: false };

  return evaluateRun(candidate.id);
}

/**
 * Evaluate a specific BenchmarkRun for correctness.
 */
export async function evaluateRun(benchmarkRunId: string): Promise<CorrectnessProcessResult> {
  const run = await prisma.benchmarkRun.findUnique({ where: { id: benchmarkRunId } });
  if (!run) return { processed: false, error: 'BenchmarkRun not found' };
  if (run.status !== 'SUCCESS') {
    return { processed: false, error: `BenchmarkRun is ${run.status}, expected SUCCESS` };
  }
  if (run.correctnessStatus) {
    return { processed: false, error: `Already evaluated: ${run.correctnessStatus}` };
  }

  console.log(`[correctness] Evaluating run ${benchmarkRunId}`);

  // ── Load inputs ────────────────────────────────────────────────────────
  let inputs;
  try {
    inputs = loadInputs(benchmarkRunId);
  } catch (err) {
    const reason = `Failed to load inputs: ${String(err)}`;
    console.error(`[correctness] ${reason}`);
    await prisma.benchmarkRun.update({
      where: { id: benchmarkRunId },
      data: {
        correctnessStatus: 'FAIL',
        correctnessWarnings: 0,
        correctnessFailures: 1,
        errorMessage: reason
      }
    });
    return { processed: true, benchmarkRunId, classification: 'FAIL', error: reason };
  }

  // ── Build report ───────────────────────────────────────────────────────
  const report = buildReport(benchmarkRunId, inputs.events, inputs.summary);

  console.log(`[correctness] Classification: ${report.classification}`);
  console.log(`[correctness] Checks: ${report.summary.totalChecks} total, ` +
    `${report.summary.passed} pass, ${report.summary.warnings} warn, ${report.summary.failures} fail`);

  // ── Persist report ─────────────────────────────────────────────────────
  initCorrectnessDir(benchmarkRunId);
  fs.writeFileSync(correctnessReportPath(benchmarkRunId), JSON.stringify(report, null, 2), 'utf8');

  // ── Update DB ──────────────────────────────────────────────────────────
  await prisma.benchmarkRun.update({
    where: { id: benchmarkRunId },
    data: {
      correctnessStatus: report.classification,
      correctnessReportPath: logicalCorrectnessPath(benchmarkRunId),
      correctnessWarnings: report.summary.warnings,
      correctnessFailures: report.summary.failures
    }
  });

  return {
    processed: true,
    benchmarkRunId,
    classification: report.classification,
    report
  };
}
