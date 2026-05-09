/**
 * Summary computation from raw benchmark events.
 *
 * Filters out warmup events, then computes aggregate statistics
 * and per-operation breakdowns.
 */
import { BenchmarkEvent, BenchmarkScenario, BenchmarkSummary, OperationStats } from './types';
import { percentile, average, round2 } from './stats';

/**
 * Compute a full BenchmarkSummary from collected events.
 * Warmup events are excluded from scored metrics.
 */
export function computeSummary(
  benchmarkRunId: string,
  events: BenchmarkEvent[],
  scenario: BenchmarkScenario,
  startedAt: string,
  completedAt: string
): BenchmarkSummary {
  const mainEvents = events.filter(e => e.phase === 'main');
  const warmupEvents = events.filter(e => e.phase === 'warmup');

  const latencies = mainEvents.map(e => e.latencyMs).sort((a, b) => a - b);
  const successfulMain = mainEvents.filter(e => e.success);
  const failedMain = mainEvents.filter(e => !e.success);

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(completedAt).getTime();
  const durationMs = endMs - startMs;
  const durationSec = durationMs / 1000;

  // Per-operation breakdown
  const opMap = new Map<string, BenchmarkEvent[]>();
  for (const e of mainEvents) {
    const arr = opMap.get(e.operation) ?? [];
    arr.push(e);
    opMap.set(e.operation, arr);
  }

  const perOperation: OperationStats[] = [];
  for (const [operation, opEvents] of opMap) {
    const opLatencies = opEvents.map(e => e.latencyMs).sort((a, b) => a - b);
    const opSuccess = opEvents.filter(e => e.success);
    const opFailed = opEvents.filter(e => !e.success);
    perOperation.push({
      operation,
      count: opEvents.length,
      successCount: opSuccess.length,
      failureCount: opFailed.length,
      avgLatencyMs: round2(average(opLatencies)),
      p50LatencyMs: round2(percentile(opLatencies, 50)),
      p95LatencyMs: round2(percentile(opLatencies, 95)),
      p99LatencyMs: round2(percentile(opLatencies, 99))
    });
  }

  // ── Flash-crash burst metadata ──────────────────────────────────────
  // Detect if this scenario has a burst window, and expose it in the summary.
  let hasFlashCrashBurst: boolean | undefined;
  let burstWindowSeconds: number | undefined;

  if (scenario.phaseWindows) {
    const burstWindow = scenario.phaseWindows.find(w => w.name === 'burst');
    if (burstWindow) {
      hasFlashCrashBurst = true;
      // Find the window after burst to compute burst duration
      const windowsAfterBurst = scenario.phaseWindows
        .filter(w => w.offsetSeconds > burstWindow.offsetSeconds)
        .sort((a, b) => a.offsetSeconds - b.offsetSeconds);

      if (windowsAfterBurst.length > 0) {
        burstWindowSeconds = windowsAfterBurst[0].offsetSeconds - burstWindow.offsetSeconds;
      } else {
        // Burst runs until end of scenario
        burstWindowSeconds = scenario.durationSeconds - burstWindow.offsetSeconds;
      }
    }
  }

  const summary: BenchmarkSummary = {
    benchmarkRunId,
    scenarioName: scenario.name,
    startedAt,
    completedAt,
    durationMs,
    totalRequests: mainEvents.length,
    successfulRequests: successfulMain.length,
    failedRequests: failedMain.length,
    errorRate: mainEvents.length > 0 ? round2(failedMain.length / mainEvents.length) : 0,
    avgLatencyMs: round2(average(latencies)),
    p50LatencyMs: round2(percentile(latencies, 50)),
    p95LatencyMs: round2(percentile(latencies, 95)),
    p99LatencyMs: round2(percentile(latencies, 99)),
    throughputRps: durationSec > 0 ? round2(mainEvents.length / durationSec) : 0,
    perOperation,
    warmupRequests: warmupEvents.length,
    scenario
  };

  // Conditionally add burst metadata
  if (hasFlashCrashBurst !== undefined) {
    summary.hasFlashCrashBurst = hasFlashCrashBurst;
    summary.burstWindowSeconds = burstWindowSeconds;
  }

  return summary;
}
