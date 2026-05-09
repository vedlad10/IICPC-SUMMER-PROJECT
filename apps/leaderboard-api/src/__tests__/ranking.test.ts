/**
 * Unit tests for ranking comparator and pipeline status mapper.
 */
import assert from 'assert';
import { computePipelineStatus, rankingComparator, PipelineStatus } from '../logic';

console.log('═══ Pipeline Status Tests ═══\n');

// No jobs or runs → SUBMITTED
{
  const status = computePipelineStatus([], []);
  assert.strictEqual(status, 'SUBMITTED');
  console.log('✅ PASS: No jobs → SUBMITTED');
}

// Build in progress → BUILDING
{
  const status = computePipelineStatus([{ status: 'IN_PROGRESS' }], []);
  assert.strictEqual(status, 'BUILDING');
  console.log('✅ PASS: Build in progress → BUILDING');
}

// Build failed → BUILD_FAILED
{
  const status = computePipelineStatus([{ status: 'FAILED' }], []);
  assert.strictEqual(status, 'BUILD_FAILED');
  console.log('✅ PASS: Build failed → BUILD_FAILED');
}

// Build succeeded → BUILD_SUCCEEDED
{
  const status = computePipelineStatus([{ status: 'SUCCESS' }], []);
  assert.strictEqual(status, 'BUILD_SUCCEEDED');
  console.log('✅ PASS: Build succeeded → BUILD_SUCCEEDED');
}

// Run READY → READY_FOR_BENCHMARK
{
  const status = computePipelineStatus(
    [{ status: 'SUCCESS' }],
    [{ status: 'READY', correctnessStatus: null, rankingEligible: false, scoreValue: null }]
  );
  assert.strictEqual(status, 'READY_FOR_BENCHMARK');
  console.log('✅ PASS: Sandbox ready → READY_FOR_BENCHMARK');
}

// Run BENCHMARKING → BENCHMARKING
{
  const status = computePipelineStatus(
    [{ status: 'SUCCESS' }],
    [{ status: 'BENCHMARKING', correctnessStatus: null, rankingEligible: false, scoreValue: null }]
  );
  assert.strictEqual(status, 'BENCHMARKING');
  console.log('✅ PASS: Run benchmarking → BENCHMARKING');
}

// Run SUCCESS → BENCHMARK_SUCCEEDED
{
  const status = computePipelineStatus(
    [{ status: 'SUCCESS' }],
    [{ status: 'SUCCESS', correctnessStatus: null, rankingEligible: false, scoreValue: null }]
  );
  assert.strictEqual(status, 'BENCHMARK_SUCCEEDED');
  console.log('✅ PASS: Benchmark done → BENCHMARK_SUCCEEDED');
}

// Run SUCCESS + correctness → CORRECTNESS_EVALUATED
{
  const status = computePipelineStatus(
    [{ status: 'SUCCESS' }],
    [{ status: 'SUCCESS', correctnessStatus: 'PASS', rankingEligible: false, scoreValue: null }]
  );
  assert.strictEqual(status, 'CORRECTNESS_EVALUATED');
  console.log('✅ PASS: Correctness done → CORRECTNESS_EVALUATED');
}

// Run EVALUATED + not eligible → SCORED
{
  const status = computePipelineStatus(
    [{ status: 'SUCCESS' }],
    [{ status: 'EVALUATED', correctnessStatus: 'FAIL', rankingEligible: false, scoreValue: 0 }]
  );
  assert.strictEqual(status, 'SCORED');
  console.log('✅ PASS: Evaluated, not eligible → SCORED');
}

// Run EVALUATED + eligible → RANKED
{
  const status = computePipelineStatus(
    [{ status: 'SUCCESS' }],
    [{ status: 'EVALUATED', correctnessStatus: 'PASS', rankingEligible: true, scoreValue: 85 }]
  );
  assert.strictEqual(status, 'RANKED');
  console.log('✅ PASS: Evaluated + eligible → RANKED');
}

console.log('\n═══ Ranking Comparator Tests ═══\n');

// Higher score wins
{
  const a = { score: 90, correctnessStatus: 'PASS', failureCount: 0, requestCount: 100, p95LatencyMs: 10, evaluatedAt: '2026-01-01T00:00:00Z' };
  const b = { score: 80, correctnessStatus: 'PASS', failureCount: 0, requestCount: 100, p95LatencyMs: 10, evaluatedAt: '2026-01-01T00:00:00Z' };
  assert.ok(rankingComparator(a, b) < 0, 'a (90) should rank above b (80)');
  console.log('✅ PASS: Higher score ranks first');
}

// Same score, better correctness wins
{
  const a = { score: 70, correctnessStatus: 'PASS', failureCount: 0, requestCount: 100, p95LatencyMs: 10, evaluatedAt: '2026-01-01T00:00:00Z' };
  const b = { score: 70, correctnessStatus: 'PASS_WITH_WARNINGS', failureCount: 0, requestCount: 100, p95LatencyMs: 10, evaluatedAt: '2026-01-01T00:00:00Z' };
  assert.ok(rankingComparator(a, b) < 0, 'PASS should rank above PASS_WITH_WARNINGS');
  console.log('✅ PASS: Better correctness wins tie');
}

// Same score + correctness, lower error rate wins
{
  const a = { score: 70, correctnessStatus: 'PASS', failureCount: 2, requestCount: 100, p95LatencyMs: 10, evaluatedAt: '2026-01-01T00:00:00Z' };
  const b = { score: 70, correctnessStatus: 'PASS', failureCount: 5, requestCount: 100, p95LatencyMs: 10, evaluatedAt: '2026-01-01T00:00:00Z' };
  assert.ok(rankingComparator(a, b) < 0, 'Lower error rate should rank above');
  console.log('✅ PASS: Lower error rate wins tie');
}

// Same everything except latency
{
  const a = { score: 70, correctnessStatus: 'PASS', failureCount: 0, requestCount: 100, p95LatencyMs: 5, evaluatedAt: '2026-01-01T00:00:00Z' };
  const b = { score: 70, correctnessStatus: 'PASS', failureCount: 0, requestCount: 100, p95LatencyMs: 15, evaluatedAt: '2026-01-01T00:00:00Z' };
  assert.ok(rankingComparator(a, b) < 0, 'Lower latency should rank above');
  console.log('✅ PASS: Lower latency wins tie');
}

// Same everything except time
{
  const a = { score: 70, correctnessStatus: 'PASS', failureCount: 0, requestCount: 100, p95LatencyMs: 10, evaluatedAt: '2026-01-01T00:00:00Z' };
  const b = { score: 70, correctnessStatus: 'PASS', failureCount: 0, requestCount: 100, p95LatencyMs: 10, evaluatedAt: '2026-01-02T00:00:00Z' };
  assert.ok(rankingComparator(a, b) < 0, 'Earlier submission should rank above');
  console.log('✅ PASS: Earlier time wins tie');
}

// Determinism
{
  const entries = [
    { score: 60, correctnessStatus: 'PASS_WITH_WARNINGS', failureCount: 3, requestCount: 100, p95LatencyMs: 20, evaluatedAt: '2026-01-03T00:00:00Z' },
    { score: 90, correctnessStatus: 'PASS', failureCount: 0, requestCount: 100, p95LatencyMs: 5, evaluatedAt: '2026-01-01T00:00:00Z' },
    { score: 90, correctnessStatus: 'PASS', failureCount: 1, requestCount: 100, p95LatencyMs: 5, evaluatedAt: '2026-01-02T00:00:00Z' },
    { score: 0, correctnessStatus: 'FAIL', failureCount: 50, requestCount: 100, p95LatencyMs: 500, evaluatedAt: '2026-01-04T00:00:00Z' },
  ];
  const sorted1 = [...entries].sort(rankingComparator);
  const sorted2 = [...entries].sort(rankingComparator);
  assert.deepStrictEqual(sorted1, sorted2, 'Sorting must be deterministic');
  assert.strictEqual(sorted1[0].score, 90);
  assert.strictEqual(sorted1[0].failureCount, 0); // lower error rate wins tie
  console.log('✅ PASS: Ranking is deterministic');
}

console.log('\n✅ All ranking and pipeline status tests passed');
