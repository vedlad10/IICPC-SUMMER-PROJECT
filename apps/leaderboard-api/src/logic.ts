/**
 * Pipeline status mapper.
 *
 * Maps raw DB state into a single user-facing pipeline status string.
 *
 * Mapping logic (evaluated in order):
 *   1. If any BenchmarkRun has status EVALUATED  → SCORED (or RANKED if rankingEligible)
 *   2. If any BenchmarkRun has correctnessStatus → CORRECTNESS_EVALUATED
 *   3. If any BenchmarkRun has status SUCCESS    → BENCHMARK_SUCCEEDED
 *   4. If any BenchmarkRun has status BENCHMARKING → BENCHMARKING
 *   5. If any BenchmarkRun has status READY      → READY_FOR_BENCHMARK
 *   6. If any BenchmarkRun has status FAILED     → depends on which phase failed
 *   7. If any BuildJob has status SUCCESS        → BUILD_SUCCEEDED
 *   8. If any BuildJob has status FAILED         → BUILD_FAILED
 *   9. If any BuildJob has status IN_PROGRESS    → BUILDING
 *  10. Otherwise                                 → SUBMITTED
 */

export type PipelineStatus =
  | 'SUBMITTED'
  | 'BUILDING'
  | 'BUILD_FAILED'
  | 'BUILD_SUCCEEDED'
  | 'SANDBOX_STARTING'
  | 'SANDBOX_FAILED'
  | 'READY_FOR_BENCHMARK'
  | 'BENCHMARKING'
  | 'BENCHMARK_FAILED'
  | 'BENCHMARK_SUCCEEDED'
  | 'CORRECTNESS_EVALUATED'
  | 'SCORED'
  | 'RANKED';

interface BuildJobState {
  status: string;
}

interface BenchmarkRunState {
  status: string;
  correctnessStatus: string | null;
  rankingEligible: boolean;
  scoreValue: number | null;
}

export function computePipelineStatus(
  buildJobs: BuildJobState[],
  benchmarkRuns: BenchmarkRunState[]
): PipelineStatus {
  // Check benchmark runs first (later phases take priority)
  for (const run of benchmarkRuns) {
    if (run.status === 'EVALUATED') {
      return run.rankingEligible ? 'RANKED' : 'SCORED';
    }
  }

  for (const run of benchmarkRuns) {
    if (run.correctnessStatus && run.status === 'SUCCESS') {
      return 'CORRECTNESS_EVALUATED';
    }
  }

  for (const run of benchmarkRuns) {
    if (run.status === 'SUCCESS' && !run.correctnessStatus) {
      return 'BENCHMARK_SUCCEEDED';
    }
  }

  for (const run of benchmarkRuns) {
    if (run.status === 'BENCHMARKING') return 'BENCHMARKING';
  }

  for (const run of benchmarkRuns) {
    if (run.status === 'READY') return 'READY_FOR_BENCHMARK';
  }

  // Benchmark failures
  for (const run of benchmarkRuns) {
    if (run.status === 'FAILED') return 'BENCHMARK_FAILED';
  }

  // Sandbox in progress
  for (const run of benchmarkRuns) {
    if (run.status === 'IN_PROGRESS' || run.status === 'QUEUED') return 'SANDBOX_STARTING';
  }

  // Build jobs
  for (const job of buildJobs) {
    if (job.status === 'SUCCESS') return 'BUILD_SUCCEEDED';
  }
  for (const job of buildJobs) {
    if (job.status === 'FAILED') return 'BUILD_FAILED';
  }
  for (const job of buildJobs) {
    if (job.status === 'IN_PROGRESS') return 'BUILDING';
  }

  return 'SUBMITTED';
}

/**
 * Ranking sort comparator.
 *
 * Tie-breaking order:
 *   1. Higher final score
 *   2. Better correctness classification (PASS > PASS_WITH_WARNINGS > FAIL)
 *   3. Lower error rate (lower failureCount/requestCount)
 *   4. Lower p95 latency
 *   5. Earlier evaluation timestamp
 */
interface RankableEntry {
  score: number;
  correctnessStatus: string | null;
  failureCount: number | null;
  requestCount: number | null;
  p95LatencyMs: number | null;
  evaluatedAt: Date | string | null;
}

const CORRECTNESS_ORDER: Record<string, number> = {
  PASS: 0,
  PASS_WITH_WARNINGS: 1,
  FAIL: 2
};

export function rankingComparator(a: RankableEntry, b: RankableEntry): number {
  // 1. Higher score first
  if (a.score !== b.score) return b.score - a.score;

  // 2. Better correctness
  const aCorr = CORRECTNESS_ORDER[a.correctnessStatus ?? 'FAIL'] ?? 3;
  const bCorr = CORRECTNESS_ORDER[b.correctnessStatus ?? 'FAIL'] ?? 3;
  if (aCorr !== bCorr) return aCorr - bCorr;

  // 3. Lower error rate
  const aErrRate = (a.requestCount ?? 1) > 0 ? (a.failureCount ?? 0) / (a.requestCount ?? 1) : 1;
  const bErrRate = (b.requestCount ?? 1) > 0 ? (b.failureCount ?? 0) / (b.requestCount ?? 1) : 1;
  if (Math.abs(aErrRate - bErrRate) > 0.001) return aErrRate - bErrRate;

  // 4. Lower p95 latency
  const aLat = a.p95LatencyMs ?? Infinity;
  const bLat = b.p95LatencyMs ?? Infinity;
  if (aLat !== bLat) return aLat - bLat;

  // 5. Earlier evaluation time
  const aTime = a.evaluatedAt ? new Date(a.evaluatedAt).getTime() : Infinity;
  const bTime = b.evaluatedAt ? new Date(b.evaluatedAt).getTime() : Infinity;
  return aTime - bTime;
}
