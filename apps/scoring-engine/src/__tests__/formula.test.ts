/**
 * Scoring formula unit tests.
 *
 * Tests component scores, edge cases, and full formula.
 */
import assert from 'assert';
import {
  computeLatencyScore,
  computeThroughputScore,
  computeErrorRateScore,
  correctnessMultiplier,
  computeScore
} from '../formula';

console.log('═══ Scoring Formula Tests ═══\n');

// ── Latency score ────────────────────────────────────────────────────────

assert.strictEqual(computeLatencyScore(5), 100, 'p50=5ms → 100');
assert.strictEqual(computeLatencyScore(500), 0, 'p50=500ms → 0');
assert.strictEqual(computeLatencyScore(0), 100, 'p50=0ms → 100');
assert.strictEqual(computeLatencyScore(1000), 0, 'p50=1000ms → 0 (capped)');

const lat252 = computeLatencyScore(252.5);
assert.ok(Math.abs(lat252 - 50) < 1, `p50=252.5ms → ~50, got ${lat252}`);
console.log('✅ PASS: Latency score boundaries and interpolation');

// ── Throughput score ─────────────────────────────────────────────────────

assert.strictEqual(computeThroughputScore(100), 100, 'rps=100 → 100');
assert.strictEqual(computeThroughputScore(1), 0, 'rps=1 → 0');
assert.strictEqual(computeThroughputScore(0), 0, 'rps=0 → 0');
assert.strictEqual(computeThroughputScore(200), 100, 'rps=200 → 100 (capped)');

const tp10 = computeThroughputScore(10);
assert.ok(tp10 > 0 && tp10 < 100, `rps=10 → should be between 0 and 100, got ${tp10}`);
console.log(`✅ PASS: Throughput score boundaries and log scaling (rps=10 → ${tp10})`);

// ── Error rate score ─────────────────────────────────────────────────────

assert.strictEqual(computeErrorRateScore(0), 100, 'err=0% → 100');
assert.strictEqual(computeErrorRateScore(0.20), 0, 'err=20% → 0');
assert.strictEqual(computeErrorRateScore(0.10), 50, 'err=10% → 50');
assert.strictEqual(computeErrorRateScore(0.30), 0, 'err=30% → 0 (capped)');
console.log('✅ PASS: Error rate score boundaries');

// ── Correctness multiplier ───────────────────────────────────────────────

assert.strictEqual(correctnessMultiplier('PASS'), 1.0);
assert.strictEqual(correctnessMultiplier('PASS_WITH_WARNINGS'), 0.7);
assert.strictEqual(correctnessMultiplier('FAIL'), 0.0);
assert.strictEqual(correctnessMultiplier('UNKNOWN'), 0.0);
console.log('✅ PASS: Correctness multiplier values');

// ── Full formula: perfect run ────────────────────────────────────────────

{
  const result = computeScore({
    p50LatencyMs: 5,     // → 100
    throughputRps: 100,  // → 100
    errorRate: 0,        // → 100
    correctnessClassification: 'PASS'
  });
  assert.strictEqual(result.latencyScore, 100);
  assert.strictEqual(result.throughputScore, 100);
  assert.strictEqual(result.errorRateScore, 100);
  assert.strictEqual(result.correctnessMultiplier, 1.0);
  assert.strictEqual(result.rawScore, 100);
  assert.strictEqual(result.finalScore, 100);
  console.log('✅ PASS: Perfect run → 100');
}

// ── Full formula: FAIL correctness → 0 ──────────────────────────────────

{
  const result = computeScore({
    p50LatencyMs: 5,
    throughputRps: 100,
    errorRate: 0,
    correctnessClassification: 'FAIL'
  });
  assert.strictEqual(result.rawScore, 100); // raw is still 100
  assert.strictEqual(result.finalScore, 0); // but multiplied by 0
  console.log('✅ PASS: FAIL correctness → 0 final score');
}

// ── Full formula: warnings → 70% ────────────────────────────────────────

{
  const result = computeScore({
    p50LatencyMs: 5,
    throughputRps: 100,
    errorRate: 0,
    correctnessClassification: 'PASS_WITH_WARNINGS'
  });
  assert.strictEqual(result.finalScore, 70); // 100 * 0.7
  console.log('✅ PASS: PASS_WITH_WARNINGS → 70% of raw');
}

// ── Full formula: moderate performance ───────────────────────────────────

{
  const result = computeScore({
    p50LatencyMs: 50,   // → ~90.9
    throughputRps: 30,  // → ~73.9 (log scale)
    errorRate: 0.05,    // → 75
    correctnessClassification: 'PASS'
  });

  assert.ok(result.finalScore > 0 && result.finalScore < 100, `Moderate score should be 0-100, got ${result.finalScore}`);
  console.log(`✅ PASS: Moderate run → ${result.finalScore} (lat=${result.latencyScore}, tp=${result.throughputScore}, err=${result.errorRateScore})`);
}

// ── Edge: zero throughput ────────────────────────────────────────────────

{
  const result = computeScore({
    p50LatencyMs: 500,
    throughputRps: 0,
    errorRate: 0.20,
    correctnessClassification: 'PASS'
  });
  assert.strictEqual(result.finalScore, 0);
  console.log('✅ PASS: Zero everything → 0');
}

// ── Determinism ──────────────────────────────────────────────────────────

{
  const inputs = { p50LatencyMs: 25, throughputRps: 42, errorRate: 0.03, correctnessClassification: 'PASS' as const };
  const r1 = computeScore(inputs);
  const r2 = computeScore(inputs);
  assert.deepStrictEqual(r1, r2);
  console.log('✅ PASS: Formula is deterministic');
}

console.log('\n✅ All scoring formula tests passed');
