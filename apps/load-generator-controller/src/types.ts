/**
 * Types for the load-generator-controller and telemetry pipeline.
 */

/** A single captured benchmark event */
export interface BenchmarkEvent {
  benchmarkRunId: string;
  workerId: number;
  sequenceNumber: number;
  phase: 'warmup' | 'main';
  operation: string;            // 'create_order' | 'cancel_order' | 'get_orderbook' | 'health'
  startedAt: string;            // ISO timestamp
  completedAt: string;          // ISO timestamp
  latencyMs: number;
  statusCode: number;
  success: boolean;
  errorType: string | null;     // 'timeout' | 'connection' | 'http_error' | null
}

/** Weighted operation in a scenario */
export interface OperationMix {
  operation: string;
  weight: number;               // relative weight, e.g. 60/20/15/5
  method: 'GET' | 'POST';
  path: string;
}

/**
 * A time-windowed phase within a scenario.
 *
 * Allows the engine to switch between different operation mixes
 * at specific time offsets. Used by adversarial scenarios like flash_crash
 * to create burst windows with different traffic patterns.
 *
 * - offsetSeconds: seconds from the start of the *main* phase (post-warmup)
 * - operations: the operation mix to use during this window
 * - thinkTimeMs: optional override for think time during this window
 *
 * Windows are evaluated in order; the last window whose offsetSeconds
 * has elapsed is the active one.
 */
export interface ScenarioPhaseWindow {
  name: string;                  // e.g. 'steady', 'burst', 'cooldown'
  offsetSeconds: number;         // seconds from main phase start
  operations: OperationMix[];
  thinkTimeMs?: number;          // override scenario.thinkTimeMs during this window
}

/** A benchmark scenario definition */
export interface BenchmarkScenario {
  name: string;
  durationSeconds: number;
  warmupSeconds: number;
  concurrency: number;
  seed: number;
  requestTimeoutMs: number;
  thinkTimeMs: number;          // pause between requests per worker
  operations: OperationMix[];

  /**
   * Optional phase windows for time-varying traffic patterns.
   *
   * When set, the engine switches operation mix based on elapsed main-phase
   * time. When absent, the single `operations` array is used throughout.
   * Existing scenarios (smoke, throughput) do NOT set this field.
   */
  phaseWindows?: ScenarioPhaseWindow[];
}

/** Per-operation stats breakdown */
export interface OperationStats {
  operation: string;
  count: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

/** Full benchmark summary */
export interface BenchmarkSummary {
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
  perOperation: OperationStats[];
  warmupRequests: number;       // excluded from primary metrics above
  scenario: BenchmarkScenario;

  /** Present on flash_crash and other multi-phase scenarios */
  hasFlashCrashBurst?: boolean;
  /** Duration of the burst window in seconds (if applicable) */
  burstWindowSeconds?: number;
}
