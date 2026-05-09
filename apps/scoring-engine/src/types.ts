/**
 * Types for the scoring engine.
 */

/** Full score report persisted as artifact */
export interface ScoreReport {
  benchmarkRunId: string;
  submissionId: string;
  correctnessClassification: string;
  metrics: {
    p50LatencyMs: number;
    throughputRps: number;
    errorRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    totalRequests: number;
  };
  formula: {
    latencyScore: number;
    throughputScore: number;
    errorRateScore: number;
    correctnessMultiplier: number;
    weights: { latency: number; throughput: number; errorRate: number };
    rawScore: number;
    finalScore: number;
  };
  penalties: string[];
  rankingEligible: boolean;
  generatedAt: string;
}
