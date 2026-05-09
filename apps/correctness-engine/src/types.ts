/**
 * Types for the correctness-engine.
 */

/** Classification of a correctness evaluation */
export type CorrectnessClassification = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL';

/** A single check result */
export interface CheckResult {
  checkName: string;
  module: string;         // 'response' | 'invariant' | 'order_workflow' | 'orderbook' | 'replay'
  status: 'pass' | 'warn' | 'fail';
  message: string;
  evidence?: unknown;     // sample offending data
}

/** Full correctness report */
export interface CorrectnessReport {
  benchmarkRunId: string;
  classification: CorrectnessClassification;
  checksRun: CheckResult[];
  warnings: CheckResult[];
  failures: CheckResult[];
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    failures: number;
  };
  generatedAt: string;
}

/** Telemetry event shape (mirrors load-generator-controller) */
export interface TelemetryEvent {
  benchmarkRunId: string;
  workerId: number;
  sequenceNumber: number;
  phase: 'warmup' | 'main';
  operation: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  statusCode: number;
  success: boolean;
  errorType: string | null;
}

/** Benchmark summary shape (mirrors load-generator-controller) */
export interface BenchmarkSummaryData {
  benchmarkRunId: string;
  scenarioName: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputRps: number;
  perOperation: Array<{
    operation: string;
    count: number;
    successCount: number;
    failureCount: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  }>;
  warmupRequests: number;
  scenario: {
    name: string;
    durationSeconds: number;
    warmupSeconds: number;
    concurrency: number;
    seed: number;
    requestTimeoutMs: number;
    thinkTimeMs: number;
    operations: Array<{
      operation: string;
      weight: number;
      method: string;
      path: string;
    }>;
  };
}
