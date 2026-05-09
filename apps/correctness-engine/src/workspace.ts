/**
 * Path resolver for correctness artifacts.
 * Also resolves load-generator-controller's benchmark artifacts for reading.
 */
import path from 'path';
import fs from 'fs';

const CORRECTNESS_ARTIFACTS_ROOT = path.resolve(__dirname, '..', 'correctness-artifacts');

// Read benchmark artifacts from load-generator-controller
const BENCHMARK_ARTIFACTS_ROOT = path.resolve(
  __dirname, '..', '..', 'load-generator-controller', 'benchmark-artifacts'
);

// ── Correctness output paths ─────────────────────────────────────────────

export function correctnessRoot(benchmarkRunId: string): string {
  return path.join(CORRECTNESS_ARTIFACTS_ROOT, benchmarkRunId);
}

export function correctnessReportPath(benchmarkRunId: string): string {
  return path.join(correctnessRoot(benchmarkRunId), 'correctness-report.json');
}

export function initCorrectnessDir(benchmarkRunId: string): void {
  fs.mkdirSync(correctnessRoot(benchmarkRunId), { recursive: true });
}

export function logicalCorrectnessPath(benchmarkRunId: string): string {
  return path.join(benchmarkRunId, 'correctness-report.json');
}

// ── Benchmark input paths (read from load-generator-controller) ──────────

export function benchmarkEventsPath(benchmarkRunId: string): string {
  return path.join(BENCHMARK_ARTIFACTS_ROOT, benchmarkRunId, 'raw', 'events.jsonl');
}

export function benchmarkSummaryPath(benchmarkRunId: string): string {
  return path.join(BENCHMARK_ARTIFACTS_ROOT, benchmarkRunId, 'summary', 'benchmark-summary.json');
}
