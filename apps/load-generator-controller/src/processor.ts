/**
 * Benchmark execution orchestrator.
 *
 * Flow:
 *   1. claim READY BenchmarkRun → BENCHMARKING
 *   2. resolve runtime host/port
 *   3. verify target is reachable (health check)
 *   4. select scenario
 *   5. execute warmup + main benchmark
 *   6. persist raw telemetry (JSONL) + summary (JSON)
 *   7. update DB with benchmark metrics
 *   8. transition status to SUCCESS
 *
 * The sandbox is left running — Phase 6+ decides cleanup.
 */
import fs from 'fs';
import http from 'http';
import { prisma } from '@benchmark/db';
import { BenchmarkSummary } from './types';
import { getScenario } from './scenarios';
import { runBenchmark } from './engine';
import { computeSummary } from './summary';
import {
  initArtifactDirs,
  rawEventsPath,
  summaryPath,
  replayEventsPath,
  logicalPaths
} from './workspace';

// ── Claim ────────────────────────────────────────────────────────────────

export async function claimNextBenchmarkRun() {
  const candidate = await prisma.benchmarkRun.findFirst({
    where: { status: 'READY' },
    orderBy: { createdAt: 'asc' }
  });

  if (!candidate) return null;

  const { count } = await prisma.benchmarkRun.updateMany({
    where: { id: candidate.id, status: 'READY' },
    data: { status: 'BENCHMARKING', benchmarkStartedAt: new Date() }
  });

  if (count === 0) return claimNextBenchmarkRun(); // race retry

  return prisma.benchmarkRun.findUniqueOrThrow({
    where: { id: candidate.id }
  });
}

// ── Health probe ─────────────────────────────────────────────────────────

function healthProbe(baseUrl: string, timeoutMs: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/health', baseUrl);
    const req = http.get(
      { hostname: url.hostname, port: url.port, path: url.pathname, timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => { body += c; });
        res.on('end', () => resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 400));
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// ── Process ──────────────────────────────────────────────────────────────

export interface BenchmarkProcessResult {
  claimed: boolean;
  benchmarkRunId?: string;
  status?: 'SUCCESS' | 'FAILED';
  error?: string;
  summary?: BenchmarkSummary;
}

/**
 * Claim the next READY BenchmarkRun and execute a full benchmark.
 * @param scenarioName optional scenario override (defaults to 'smoke')
 */
export async function processNextBenchmark(
  scenarioName?: string
): Promise<BenchmarkProcessResult> {
  // ── Claim ──────────────────────────────────────────────────────────────
  const run = await claimNextBenchmarkRun();
  if (!run) return { claimed: false };

  const scenario = getScenario(scenarioName);
  const logical = logicalPaths(run.id);

  console.log(`[benchmark] Claimed run ${run.id}, scenario=${scenario.name}`);

  // Helper: fail cleanly
  const failBenchmark = async (reason: string): Promise<BenchmarkProcessResult> => {
    console.error(`[benchmark] FAILED: ${reason}`);
    await prisma.benchmarkRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        benchmarkCompletedAt: new Date(),
        benchmarkErrorMessage: reason,
        scenarioName: scenario.name
      }
    });
    return { claimed: true, benchmarkRunId: run.id, status: 'FAILED', error: reason };
  };

  // ── Resolve runtime target ─────────────────────────────────────────────
  if (!run.runtimeHost || !run.runtimePort) {
    return failBenchmark('BenchmarkRun has no runtimeHost/runtimePort');
  }

  const baseUrl = `http://${run.runtimeHost}:${run.runtimePort}`;
  console.log(`[benchmark] Target: ${baseUrl}`);

  // ── Health check ───────────────────────────────────────────────────────
  const healthy = await healthProbe(baseUrl);
  if (!healthy) {
    return failBenchmark(`Target ${baseUrl} is not reachable / health check failed`);
  }
  console.log(`[benchmark] Target is healthy`);

  // ── Init artifact dirs ─────────────────────────────────────────────────
  initArtifactDirs(run.id);

  // ── Update scenario name ───────────────────────────────────────────────
  await prisma.benchmarkRun.update({
    where: { id: run.id },
    data: { scenarioName: scenario.name }
  });

  // ── Execute benchmark ──────────────────────────────────────────────────
  const benchmarkStartedAt = new Date().toISOString();

  let engineResult;
  try {
    engineResult = await runBenchmark(
      run.id,
      baseUrl,
      scenario,
      rawEventsPath(run.id),
      replayEventsPath(run.id)
    );
  } catch (err) {
    return failBenchmark(`Benchmark engine error: ${String(err)}`);
  }

  const benchmarkCompletedAt = new Date().toISOString();

  console.log(`[benchmark] Execution complete: ${engineResult.events.length} total events ` +
    `(${engineResult.warmupCount} warmup, ${engineResult.mainCount} main, ` +
    `${engineResult.replayEventsWritten} replay events written)`);

  // ── Compute summary ────────────────────────────────────────────────────
  const summary = computeSummary(
    run.id,
    engineResult.events,
    scenario,
    benchmarkStartedAt,
    benchmarkCompletedAt
  );

  // ── Persist summary ────────────────────────────────────────────────────
  fs.writeFileSync(summaryPath(run.id), JSON.stringify(summary, null, 2), 'utf8');

  console.log(`[benchmark] Summary: ${summary.totalRequests} reqs, ` +
    `${summary.throughputRps} rps, p50=${summary.p50LatencyMs}ms, p99=${summary.p99LatencyMs}ms`);

  // ── Update DB ──────────────────────────────────────────────────────────
  await prisma.benchmarkRun.update({
    where: { id: run.id },
    data: {
      status: 'SUCCESS',
      benchmarkCompletedAt: new Date(),
      telemetryPath: logical.telemetryPath,
      summaryPath: logical.summaryPath,
      requestCount: summary.totalRequests,
      successCount: summary.successfulRequests,
      failureCount: summary.failedRequests,
      avgLatencyMs: summary.avgLatencyMs,
      p50LatencyMs: summary.p50LatencyMs,
      p95LatencyMs: summary.p95LatencyMs,
      p99LatencyMs: summary.p99LatencyMs,
      throughputRps: summary.throughputRps
    }
  });

  return {
    claimed: true,
    benchmarkRunId: run.id,
    status: 'SUCCESS',
    summary
  };
}

/**
 * Run a benchmark for a specific BenchmarkRun ID (must be in READY state).
 */
export async function runBenchmarkById(
  benchmarkRunId: string,
  scenarioName?: string
): Promise<BenchmarkProcessResult> {
  const run = await prisma.benchmarkRun.findUnique({ where: { id: benchmarkRunId } });
  if (!run) return { claimed: false, error: 'BenchmarkRun not found' };
  if (run.status !== 'READY') {
    return { claimed: false, error: `BenchmarkRun is in ${run.status} state, expected READY` };
  }

  // Atomically claim it
  const { count } = await prisma.benchmarkRun.updateMany({
    where: { id: benchmarkRunId, status: 'READY' },
    data: { status: 'BENCHMARKING', benchmarkStartedAt: new Date() }
  });
  if (count === 0) return { claimed: false, error: 'Race: another process claimed this run' };

  // Delegate to the common execution path — re-fetch and run
  const freshRun = await prisma.benchmarkRun.findUniqueOrThrow({ where: { id: benchmarkRunId } });
  const scenario = getScenario(scenarioName);
  const logical = logicalPaths(benchmarkRunId);

  if (!freshRun.runtimeHost || !freshRun.runtimePort) {
    await prisma.benchmarkRun.update({
      where: { id: benchmarkRunId },
      data: { status: 'FAILED', benchmarkErrorMessage: 'No runtime target', benchmarkCompletedAt: new Date() }
    });
    return { claimed: true, benchmarkRunId, status: 'FAILED', error: 'No runtime target' };
  }

  const baseUrl = `http://${freshRun.runtimeHost}:${freshRun.runtimePort}`;
  const healthy = await healthProbe(baseUrl);
  if (!healthy) {
    await prisma.benchmarkRun.update({
      where: { id: benchmarkRunId },
      data: { status: 'FAILED', benchmarkErrorMessage: 'Target not reachable', benchmarkCompletedAt: new Date() }
    });
    return { claimed: true, benchmarkRunId, status: 'FAILED', error: 'Target not reachable' };
  }

  initArtifactDirs(benchmarkRunId);
  await prisma.benchmarkRun.update({ where: { id: benchmarkRunId }, data: { scenarioName: scenario.name } });

  const benchmarkStartedAt = new Date().toISOString();
  const engineResult = await runBenchmark(benchmarkRunId, baseUrl, scenario, rawEventsPath(benchmarkRunId), replayEventsPath(benchmarkRunId));
  const benchmarkCompletedAt = new Date().toISOString();

  const summary = computeSummary(benchmarkRunId, engineResult.events, scenario, benchmarkStartedAt, benchmarkCompletedAt);
  fs.writeFileSync(summaryPath(benchmarkRunId), JSON.stringify(summary, null, 2), 'utf8');

  await prisma.benchmarkRun.update({
    where: { id: benchmarkRunId },
    data: {
      status: 'SUCCESS', benchmarkCompletedAt: new Date(),
      telemetryPath: logical.telemetryPath, summaryPath: logical.summaryPath,
      requestCount: summary.totalRequests, successCount: summary.successfulRequests,
      failureCount: summary.failedRequests, avgLatencyMs: summary.avgLatencyMs,
      p50LatencyMs: summary.p50LatencyMs, p95LatencyMs: summary.p95LatencyMs,
      p99LatencyMs: summary.p99LatencyMs, throughputRps: summary.throughputRps
    }
  });

  return { claimed: true, benchmarkRunId, status: 'SUCCESS', summary };
}
