/**
 * Unit tests for percentile, average, and summary math.
 * Run with: npx ts-node src/__tests__/stats.test.ts
 */
import assert from 'assert';
import { percentile, average, round2 } from '../stats';
import { computeSummary } from '../summary';
import { BenchmarkEvent, BenchmarkScenario } from '../types';

// ── percentile tests ────────────────────────────────────────────────────

// Empty array
assert.strictEqual(percentile([], 50), 0);
console.log('✅ PASS: percentile of empty array = 0');

// Single element
assert.strictEqual(percentile([42], 50), 42);
console.log('✅ PASS: percentile of single element = element');

// p0 = first, p100 = last
assert.strictEqual(percentile([1, 2, 3, 4, 5], 0), 1);
assert.strictEqual(percentile([1, 2, 3, 4, 5], 100), 5);
console.log('✅ PASS: p0 = min, p100 = max');

// p50 of [1,2,3,4,5] = 3 (exact median)
assert.strictEqual(percentile([1, 2, 3, 4, 5], 50), 3);
console.log('✅ PASS: p50 of [1..5] = 3');

// p50 of [1,2,3,4] = 2.5 (interpolated)
assert.strictEqual(percentile([1, 2, 3, 4], 50), 2.5);
console.log('✅ PASS: p50 of [1..4] = 2.5');

// p95 of 100 elements [1..100]
const arr100 = Array.from({ length: 100 }, (_, i) => i + 1);
const p95 = percentile(arr100, 95);
assert.ok(p95 >= 95 && p95 <= 96, `p95 of [1..100] should be ~95.05, got ${p95}`);
console.log(`✅ PASS: p95 of [1..100] = ${p95}`);

// p99 of 100 elements
const p99 = percentile(arr100, 99);
assert.ok(p99 >= 99 && p99 <= 100, `p99 should be ~99.01, got ${p99}`);
console.log(`✅ PASS: p99 of [1..100] = ${p99}`);

// ── average tests ───────────────────────────────────────────────────────

assert.strictEqual(average([]), 0);
assert.strictEqual(average([10]), 10);
assert.strictEqual(average([1, 2, 3, 4, 5]), 3);
console.log('✅ PASS: average function');

// ── round2 tests ────────────────────────────────────────────────────────

assert.strictEqual(round2(3.14159), 3.14);
assert.strictEqual(round2(2.005), 2.01);  // JS rounding edge case handled by *100
console.log('✅ PASS: round2 function');

// ── computeSummary tests ────────────────────────────────────────────────

const scenario: BenchmarkScenario = {
  name: 'test',
  durationSeconds: 5,
  warmupSeconds: 1,
  concurrency: 2,
  seed: 42,
  requestTimeoutMs: 5000,
  thinkTimeMs: 0,
  operations: [
    { operation: 'create_order', weight: 50, method: 'POST', path: '/orders' },
    { operation: 'get_orderbook', weight: 50, method: 'GET', path: '/orderbook' }
  ]
};

function makeEvent(overrides: Partial<BenchmarkEvent>): BenchmarkEvent {
  return {
    benchmarkRunId: 'test-run',
    workerId: 0,
    sequenceNumber: 0,
    phase: 'main',
    operation: 'create_order',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:00:00.010Z',
    latencyMs: 10,
    statusCode: 200,
    success: true,
    errorType: null,
    ...overrides
  };
}

const events: BenchmarkEvent[] = [
  // 2 warmup events (should be excluded from scored metrics)
  makeEvent({ phase: 'warmup', latencyMs: 100, operation: 'create_order' }),
  makeEvent({ phase: 'warmup', latencyMs: 200, operation: 'get_orderbook' }),
  // 4 main events
  makeEvent({ latencyMs: 5,  operation: 'create_order', success: true }),
  makeEvent({ latencyMs: 10, operation: 'create_order', success: true }),
  makeEvent({ latencyMs: 15, operation: 'get_orderbook', success: true }),
  makeEvent({ latencyMs: 50, operation: 'get_orderbook', success: false, statusCode: 500, errorType: 'http_error' })
];

const summary = computeSummary(
  'test-run',
  events,
  scenario,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:05Z'
);

// Warmup excluded
assert.strictEqual(summary.warmupRequests, 2, 'Should have 2 warmup requests');
assert.strictEqual(summary.totalRequests, 4, 'Should have 4 main requests');
assert.strictEqual(summary.successfulRequests, 3);
assert.strictEqual(summary.failedRequests, 1);
assert.strictEqual(summary.errorRate, 0.25);
console.log('✅ PASS: warmup excluded, request counts correct');

// Latency math on main events: [5, 10, 15, 50]
assert.strictEqual(summary.avgLatencyMs, 20); // (5+10+15+50)/4
console.log(`✅ PASS: avgLatencyMs = ${summary.avgLatencyMs}`);

// p50 of [5,10,15,50] = interpolation at index 1.5 → (10+15)/2 = 12.5
assert.strictEqual(summary.p50LatencyMs, 12.5);
console.log(`✅ PASS: p50LatencyMs = ${summary.p50LatencyMs}`);

// Per-operation breakdown
const createOp = summary.perOperation.find(o => o.operation === 'create_order')!;
assert.strictEqual(createOp.count, 2);
assert.strictEqual(createOp.successCount, 2);
console.log('✅ PASS: per-operation breakdown correct');

// Throughput: 4 requests / 5 seconds = 0.8 rps
assert.strictEqual(summary.throughputRps, 0.8);
console.log(`✅ PASS: throughputRps = ${summary.throughputRps}`);

console.log('\n✅ All stats and summary tests passed');
