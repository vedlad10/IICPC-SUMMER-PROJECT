/**
 * Types for deterministic replay (v1).
 *
 * Replay is request-stream replay, NOT byte-perfect network packet replay.
 * The system persists enough information to reproduce the same benchmark
 * request sequence against a (possibly different) target instance.
 *
 * Future evolution path:
 *   - v2: Kafka/Redpanda-backed event log for distributed replay
 *   - v3: coordinated multi-node replay with clock synchronization
 */

/**
 * A single replayable request event.
 *
 * Persisted to replay-events.jsonl during benchmark execution.
 * Contains everything needed to re-send the exact same request
 * at approximately the same relative time.
 */
export interface ReplayEvent {
  /** Monotonic sequence across all workers */
  sequence: number;

  /** Milliseconds from the start of the benchmark (including warmup) */
  scheduledOffsetMs: number;

  /** Which worker originally generated this request */
  workerId: number;

  /** 'warmup' or 'main' — replay can optionally skip warmup */
  phase: 'warmup' | 'main';

  /** e.g. 'create_order', 'cancel_order', 'get_orderbook', 'health' */
  operation: string;

  /** HTTP method */
  method: 'GET' | 'POST';

  /** Request path (e.g. '/orders', '/cancel', '/orderbook', '/health') */
  path: string;

  /** JSON-serialized request body, or null for GET requests */
  payload: string | null;

  /** Which scenario phase window was active (if applicable) */
  phaseWindow?: string;
}

/**
 * Options for executing a replay.
 */
export interface ReplayOptions {
  /** Base URL to replay against (e.g. "http://127.0.0.1:55803") */
  baseUrl: string;

  /** Request timeout per individual request */
  requestTimeoutMs: number;

  /** Whether to include warmup events in the replay (default: true) */
  includeWarmup?: boolean;

  /** Speed multiplier: 1.0 = original timing, 2.0 = 2x faster, 0.5 = half speed */
  speedMultiplier?: number;
}

/**
 * A single response captured during replay execution.
 */
export interface ReplayResponseEvent {
  sequence: number;
  operation: string;
  method: string;
  path: string;
  statusCode: number;
  success: boolean;
  latencyMs: number;
  errorType: string | null;
  replayedAt: string;        // ISO timestamp
}

/**
 * Summary of a completed replay execution.
 */
export interface ReplayResult {
  /** The benchmark run that was replayed */
  benchmarkRunId: string;

  /** When the replay was executed */
  replayedAt: string;
  completedAt: string;

  /** Target that was replayed against */
  targetBaseUrl: string;

  /** Replay configuration */
  includeWarmup: boolean;
  speedMultiplier: number;

  /** Aggregate metrics */
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;

  /** Latency distribution (ms) */
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  /** Duration of the replay execution */
  replayDurationMs: number;

  /** Throughput during replay */
  throughputRps: number;

  /** How many events were in the replay stream */
  totalReplayEvents: number;

  /** How many were skipped (e.g. warmup if excluded) */
  skippedEvents: number;

  /** Per-operation breakdown */
  perOperation: ReplayOperationStats[];

  /**
   * Replay-v1 disclaimer.
   * This is deterministic request-stream replay, not byte-perfect network replay.
   * Timing is approximate — relative offsets are preserved but exact nanosecond
   * scheduling is not guaranteed.
   */
  replayVersion: 'v1';
}

export interface ReplayOperationStats {
  operation: string;
  count: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}
