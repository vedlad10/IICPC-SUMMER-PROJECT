/**
 * Correctness check tests using fixture data.
 *
 * Tests all check modules with synthetic events covering:
 *   - healthy run (all pass)
 *   - run with warnings (some connection errors, health failures)
 *   - run with failures (broken invariants, high error rates)
 *   - edge cases (zero events, missing fields)
 */
import assert from 'assert';
import { TelemetryEvent, BenchmarkSummaryData, CheckResult } from '../types';
import { checkResponseCodes, checkSuccessConsistency, checkConnectionErrors } from '../checks/responseValidator';
import { checkSummaryInvariants } from '../checks/invariantChecker';
import { checkHealthStability, checkCreateOrderResponses, checkCancelOrderResponses, checkOperationDistribution } from '../checks/orderWorkflowChecker';
import { checkOrderbookEndpoint, checkOrderbookLatency } from '../checks/orderbookSanityChecker';
import { checkEventQuality } from '../checks/replayChecker';
import { buildReport } from '../reportBuilder';

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    benchmarkRunId: 'test-run',
    workerId: 0,
    sequenceNumber: 0,
    phase: 'main',
    operation: 'create_order',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:00:00.010Z',
    latencyMs: 10,
    statusCode: 201,
    success: true,
    errorType: null,
    ...overrides
  };
}

function makeSummary(overrides: Partial<BenchmarkSummaryData> = {}): BenchmarkSummaryData {
  return {
    benchmarkRunId: 'test-run',
    scenarioName: 'smoke',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:00:10Z',
    durationMs: 10000,
    totalRequests: 100,
    successfulRequests: 95,
    failedRequests: 5,
    errorRate: 0.05,
    avgLatencyMs: 10,
    p50LatencyMs: 8,
    p95LatencyMs: 20,
    p99LatencyMs: 50,
    throughputRps: 10,
    perOperation: [],
    warmupRequests: 20,
    scenario: {
      name: 'smoke',
      durationSeconds: 10,
      warmupSeconds: 2,
      concurrency: 2,
      seed: 42,
      requestTimeoutMs: 5000,
      thinkTimeMs: 100,
      operations: [
        { operation: 'create_order', weight: 50, method: 'POST', path: '/orders' },
        { operation: 'cancel_order', weight: 15, method: 'POST', path: '/cancel' },
        { operation: 'get_orderbook', weight: 30, method: 'GET', path: '/orderbook' },
        { operation: 'health', weight: 5, method: 'GET', path: '/health' }
      ]
    },
    ...overrides
  };
}

// ── Response validator tests ─────────────────────────────────────────────

console.log('═══ Response Validator Tests ═══\n');

// Test: all correct status codes
{
  const events = [
    makeEvent({ operation: 'create_order', statusCode: 201 }),
    makeEvent({ operation: 'cancel_order', statusCode: 200 }),
    makeEvent({ operation: 'get_orderbook', statusCode: 200 }),
    makeEvent({ operation: 'health', statusCode: 200 })
  ];
  const results = checkResponseCodes(events);
  assert.strictEqual(results[0].status, 'pass');
  console.log('✅ PASS: Correct status codes → pass');
}

// Test: unexpected status code → warn
{
  const events = [
    makeEvent({ operation: 'create_order', statusCode: 204 }), // 204 not in [200, 201]
    ...Array.from({ length: 20 }, () => makeEvent({ operation: 'create_order', statusCode: 201 }))
  ];
  const results = checkResponseCodes(events);
  assert.strictEqual(results[0].status, 'warn');
  console.log('✅ PASS: Unexpected status code → warn');
}

// Test: success consistency
{
  const events = [makeEvent({ statusCode: 200, success: true })];
  const results = checkSuccessConsistency(events);
  assert.strictEqual(results[0].status, 'pass');
  console.log('✅ PASS: Success field consistent → pass');
}

// Test: success inconsistency → fail
{
  const events = [makeEvent({ statusCode: 500, success: true })]; // inconsistent
  const results = checkSuccessConsistency(events);
  assert.strictEqual(results[0].status, 'fail');
  console.log('✅ PASS: Success field inconsistent → fail');
}

// Test: no connection errors
{
  const events = [makeEvent()];
  const results = checkConnectionErrors(events);
  assert.strictEqual(results[0].status, 'pass');
  console.log('✅ PASS: No connection errors → pass');
}

// ── Invariant checker tests ──────────────────────────────────────────────

console.log('\n═══ Invariant Checker Tests ═══\n');

// Test: consistent summary
{
  const summary = makeSummary({ totalRequests: 100, successfulRequests: 95, failedRequests: 5 });
  const events = Array.from({ length: 100 }, (_, i) => makeEvent({ sequenceNumber: i }));
  const results = checkSummaryInvariants(summary, events);
  const countCheck = results.find(r => r.checkName === 'summary_count_consistency');
  assert.strictEqual(countCheck?.status, 'pass');
  console.log('✅ PASS: Summary counts consistent → pass');
}

// Test: broken count
{
  const summary = makeSummary({ totalRequests: 100, successfulRequests: 80, failedRequests: 10 }); // 80+10 != 100
  const results = checkSummaryInvariants(summary, []);
  const countCheck = results.find(r => r.checkName === 'summary_count_consistency');
  assert.strictEqual(countCheck?.status, 'fail');
  console.log('✅ PASS: Broken count consistency → fail');
}

// Test: percentile ordering
{
  const summary = makeSummary({ p50LatencyMs: 50, p95LatencyMs: 30, p99LatencyMs: 100 }); // p50 > p95
  const results = checkSummaryInvariants(summary, []);
  const pctCheck = results.find(r => r.checkName === 'summary_percentile_ordering');
  assert.strictEqual(pctCheck?.status, 'fail');
  console.log('✅ PASS: Broken percentile order → fail');
}

// ── Order workflow tests ─────────────────────────────────────────────────

console.log('\n═══ Order Workflow Tests ═══\n');

// Test: healthy health endpoint
{
  const events = Array.from({ length: 10 }, () =>
    makeEvent({ operation: 'health', statusCode: 200 })
  );
  const results = checkHealthStability(events);
  assert.strictEqual(results[0].status, 'pass');
  console.log('✅ PASS: Stable health endpoint → pass');
}

// Test: unstable health → fail
{
  const events = [
    ...Array.from({ length: 3 }, () => makeEvent({ operation: 'health', statusCode: 200, success: true })),
    ...Array.from({ length: 7 }, () => makeEvent({ operation: 'health', statusCode: 500, success: false }))
  ];
  const results = checkHealthStability(events);
  assert.strictEqual(results[0].status, 'fail');
  console.log('✅ PASS: Unstable health (70% fail) → fail');
}

// ── Orderbook tests ──────────────────────────────────────────────────────

console.log('\n═══ Orderbook Tests ═══\n');

{
  const events = Array.from({ length: 20 }, () =>
    makeEvent({ operation: 'get_orderbook', statusCode: 200, latencyMs: 5 })
  );
  const r1 = checkOrderbookEndpoint(events);
  assert.strictEqual(r1[0].status, 'pass');
  const r2 = checkOrderbookLatency(events);
  assert.strictEqual(r2[0].status, 'pass');
  console.log('✅ PASS: Healthy orderbook → pass');
}

// ── Replay / quality tests ───────────────────────────────────────────────

console.log('\n═══ Telemetry Quality Tests ═══\n');

// Test: negative latency → fail
{
  const events = [makeEvent({ latencyMs: -5 })];
  const results = checkEventQuality(events);
  const negCheck = results.find(r => r.checkName === 'no_negative_latencies');
  assert.strictEqual(negCheck?.status, 'fail');
  console.log('✅ PASS: Negative latency → fail');
}

// Test: zero events → fail
{
  const results = checkEventQuality([]);
  const minCheck = results.find(r => r.checkName === 'minimum_events');
  assert.strictEqual(minCheck?.status, 'fail');
  console.log('✅ PASS: Zero events → fail');
}

// ── Full report classification tests ─────────────────────────────────────

console.log('\n═══ Report Classification Tests ═══\n');

// All-pass scenario
{
  const events = [
    ...Array.from({ length: 50 }, (_, i) => makeEvent({ sequenceNumber: i, operation: 'create_order', statusCode: 201, latencyMs: 5 })),
    ...Array.from({ length: 30 }, (_, i) => makeEvent({ sequenceNumber: 50 + i, operation: 'get_orderbook', statusCode: 200, latencyMs: 3 })),
    ...Array.from({ length: 15 }, (_, i) => makeEvent({ sequenceNumber: 80 + i, operation: 'cancel_order', statusCode: 200, latencyMs: 4 })),
    ...Array.from({ length: 5 }, (_, i) => makeEvent({ sequenceNumber: 95 + i, operation: 'health', statusCode: 200, latencyMs: 2 }))
  ];
  const summary = makeSummary({
    totalRequests: 100, successfulRequests: 100, failedRequests: 0,
    errorRate: 0, p50LatencyMs: 5, p95LatencyMs: 8, p99LatencyMs: 10,
    warmupRequests: 0 // no warmup events in this fixture
  });
  const report = buildReport('test-all-pass', events, summary);
  assert.strictEqual(report.classification, 'PASS');
  assert.strictEqual(report.summary.failures, 0);
  assert.strictEqual(report.summary.warnings, 0);
  console.log(`✅ PASS: Clean run → PASS (${report.summary.totalChecks} checks, 0 failures, 0 warnings)`);
}

// Warnings scenario (some connection errors)
{
  const events = [
    ...Array.from({ length: 97 }, (_, i) => makeEvent({ sequenceNumber: i, statusCode: 201, latencyMs: 5 })),
    ...Array.from({ length: 3 }, (_, i) => makeEvent({
      sequenceNumber: 97 + i, statusCode: 0, success: false, errorType: 'connection', latencyMs: 5000
    }))
  ];
  const summary = makeSummary({
    totalRequests: 100, successfulRequests: 97, failedRequests: 3,
    errorRate: 0.03
  });
  const report = buildReport('test-warnings', events, summary);
  assert.strictEqual(report.classification, 'PASS_WITH_WARNINGS');
  assert.ok(report.summary.warnings > 0);
  assert.strictEqual(report.summary.failures, 0);
  console.log(`✅ PASS: Connection errors → PASS_WITH_WARNINGS (${report.summary.warnings} warnings)`);
}

// Failure scenario (broken invariants)
{
  const events = [makeEvent({ latencyMs: -1 })]; // negative latency
  const summary = makeSummary({
    totalRequests: 50, successfulRequests: 30, failedRequests: 10, // 30+10 != 50
    p50LatencyMs: 100, p95LatencyMs: 50, p99LatencyMs: 200 // p95 < p50
  });
  const report = buildReport('test-fail', events, summary);
  assert.strictEqual(report.classification, 'FAIL');
  assert.ok(report.summary.failures > 0);
  console.log(`✅ PASS: Broken invariants → FAIL (${report.summary.failures} failures)`);
}

console.log('\n✅ All correctness check tests passed');
