/**
 * Scoring formula.
 *
 * Transparent, deterministic, auditable scoring system.
 *
 * FORMULA:
 *   rawScore = (latencyScore * 0.35) + (throughputScore * 0.40) + (errorRateScore * 0.25)
 *   finalScore = rawScore * correctnessMultiplier
 *
 * COMPONENT SCORES (0–100 scale):
 *
 *   latencyScore:
 *     Based on p50 latency. Lower is better.
 *     100 if p50 <= 5ms, 0 if p50 >= 500ms, linear interpolation between.
 *
 *   throughputScore:
 *     Based on requests/sec. Higher is better.
 *     100 if rps >= 100, 0 if rps <= 1, logarithmic scaling.
 *
 *   errorRateScore:
 *     100 if errorRate == 0, decreasing linearly.
 *     0 if errorRate >= 0.20 (20%).
 *
 * CORRECTNESS MULTIPLIER:
 *   PASS              => 1.0
 *   PASS_WITH_WARNINGS => 0.7
 *   FAIL              => 0.0
 *
 * FINAL RANGE: 0–100
 */

export interface ScoringInputs {
  p50LatencyMs: number;
  throughputRps: number;
  errorRate: number;
  correctnessClassification: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL';
}

export interface ScoringBreakdown {
  latencyScore: number;        // 0–100
  throughputScore: number;     // 0–100
  errorRateScore: number;      // 0–100
  correctnessMultiplier: number; // 0.0, 0.7, or 1.0
  rawScore: number;            // weighted sum before multiplier
  finalScore: number;          // rawScore * multiplier
  weights: { latency: number; throughput: number; errorRate: number };
}

// ── Component scoring functions ──────────────────────────────────────────

const LATENCY_BEST = 5;     // ms — 100 score
const LATENCY_WORST = 500;  // ms — 0 score

export function computeLatencyScore(p50Ms: number): number {
  if (p50Ms <= LATENCY_BEST) return 100;
  if (p50Ms >= LATENCY_WORST) return 0;
  return round2(100 * (1 - (p50Ms - LATENCY_BEST) / (LATENCY_WORST - LATENCY_BEST)));
}

const THROUGHPUT_BEST = 100;  // rps — 100 score
const THROUGHPUT_WORST = 1;   // rps — 0 score

export function computeThroughputScore(rps: number): number {
  if (rps <= THROUGHPUT_WORST) return 0;
  if (rps >= THROUGHPUT_BEST) return 100;
  // Logarithmic scaling: score = 100 * log(rps/worst) / log(best/worst)
  const score = 100 * Math.log(rps / THROUGHPUT_WORST) / Math.log(THROUGHPUT_BEST / THROUGHPUT_WORST);
  return round2(Math.max(0, Math.min(100, score)));
}

const ERROR_RATE_THRESHOLD = 0.20; // 20% => 0 score

export function computeErrorRateScore(errorRate: number): number {
  if (errorRate <= 0) return 100;
  if (errorRate >= ERROR_RATE_THRESHOLD) return 0;
  return round2(100 * (1 - errorRate / ERROR_RATE_THRESHOLD));
}

export function correctnessMultiplier(classification: string): number {
  switch (classification) {
    case 'PASS': return 1.0;
    case 'PASS_WITH_WARNINGS': return 0.7;
    case 'FAIL': return 0.0;
    default: return 0.0;
  }
}

// ── Main scoring function ────────────────────────────────────────────────

const WEIGHTS = { latency: 0.35, throughput: 0.40, errorRate: 0.25 };

export function computeScore(inputs: ScoringInputs): ScoringBreakdown {
  const latScore = computeLatencyScore(inputs.p50LatencyMs);
  const tpScore = computeThroughputScore(inputs.throughputRps);
  const erScore = computeErrorRateScore(inputs.errorRate);
  const cMult = correctnessMultiplier(inputs.correctnessClassification);

  const rawScore = round2(
    latScore * WEIGHTS.latency +
    tpScore * WEIGHTS.throughput +
    erScore * WEIGHTS.errorRate
  );

  const finalScore = round2(rawScore * cMult);

  return {
    latencyScore: latScore,
    throughputScore: tpScore,
    errorRateScore: erScore,
    correctnessMultiplier: cMult,
    rawScore,
    finalScore,
    weights: WEIGHTS
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
