/**
 * Summary invariant checks.
 *
 * Validates that the benchmark summary data is internally consistent:
 *   - totalRequests == successfulRequests + failedRequests
 *   - errorRate == failedRequests / totalRequests
 *   - p50 <= p95 <= p99
 *   - throughput > 0 if totalRequests > 0
 *   - warmup + main == total events
 *   - duration is positive and reasonable
 */
import { BenchmarkSummaryData, TelemetryEvent, CheckResult } from '../types';

export function checkSummaryInvariants(
  summary: BenchmarkSummaryData,
  events: TelemetryEvent[]
): CheckResult[] {
  const results: CheckResult[] = [];

  // ── Count consistency ──────────────────────────────────────────────────
  const expectedTotal = summary.successfulRequests + summary.failedRequests;
  if (summary.totalRequests !== expectedTotal) {
    results.push({
      checkName: 'summary_count_consistency',
      module: 'invariant',
      status: 'fail',
      message: `totalRequests (${summary.totalRequests}) != success (${summary.successfulRequests}) + failed (${summary.failedRequests}) = ${expectedTotal}`
    });
  } else {
    results.push({
      checkName: 'summary_count_consistency',
      module: 'invariant',
      status: 'pass',
      message: 'totalRequests == successfulRequests + failedRequests'
    });
  }

  // ── Error rate consistency ─────────────────────────────────────────────
  if (summary.totalRequests > 0) {
    const expectedRate = Math.round((summary.failedRequests / summary.totalRequests) * 100) / 100;
    if (Math.abs(summary.errorRate - expectedRate) > 0.01) {
      results.push({
        checkName: 'summary_error_rate',
        module: 'invariant',
        status: 'warn',
        message: `errorRate (${summary.errorRate}) doesn't match computed value (${expectedRate})`
      });
    } else {
      results.push({
        checkName: 'summary_error_rate',
        module: 'invariant',
        status: 'pass',
        message: 'errorRate is consistent with request counts'
      });
    }
  }

  // ── Percentile ordering ────────────────────────────────────────────────
  if (summary.p50LatencyMs <= summary.p95LatencyMs && summary.p95LatencyMs <= summary.p99LatencyMs) {
    results.push({
      checkName: 'summary_percentile_ordering',
      module: 'invariant',
      status: 'pass',
      message: 'p50 <= p95 <= p99 ordering is valid'
    });
  } else {
    results.push({
      checkName: 'summary_percentile_ordering',
      module: 'invariant',
      status: 'fail',
      message: `Percentile ordering violated: p50=${summary.p50LatencyMs}, p95=${summary.p95LatencyMs}, p99=${summary.p99LatencyMs}`
    });
  }

  // ── Throughput sanity ──────────────────────────────────────────────────
  if (summary.totalRequests > 0 && summary.throughputRps <= 0) {
    results.push({
      checkName: 'summary_throughput_positive',
      module: 'invariant',
      status: 'fail',
      message: `Throughput is ${summary.throughputRps} but totalRequests is ${summary.totalRequests}`
    });
  } else {
    results.push({
      checkName: 'summary_throughput_positive',
      module: 'invariant',
      status: 'pass',
      message: `Throughput ${summary.throughputRps} rps is positive`
    });
  }

  // ── Duration sanity ────────────────────────────────────────────────────
  if (summary.durationMs <= 0) {
    results.push({
      checkName: 'summary_duration_positive',
      module: 'invariant',
      status: 'fail',
      message: `Duration is ${summary.durationMs}ms — must be positive`
    });
  } else {
    results.push({
      checkName: 'summary_duration_positive',
      module: 'invariant',
      status: 'pass',
      message: `Duration ${summary.durationMs}ms is valid`
    });
  }

  // ── Event count vs summary ─────────────────────────────────────────────
  const mainEvents = events.filter(e => e.phase === 'main');
  const warmupEvents = events.filter(e => e.phase === 'warmup');

  if (mainEvents.length !== summary.totalRequests) {
    results.push({
      checkName: 'summary_event_count_match',
      module: 'invariant',
      status: 'warn',
      message: `Main events count (${mainEvents.length}) != summary totalRequests (${summary.totalRequests})`
    });
  } else {
    results.push({
      checkName: 'summary_event_count_match',
      module: 'invariant',
      status: 'pass',
      message: `Main event count matches summary totalRequests (${mainEvents.length})`
    });
  }

  if (warmupEvents.length !== summary.warmupRequests) {
    results.push({
      checkName: 'summary_warmup_count_match',
      module: 'invariant',
      status: 'warn',
      message: `Warmup events (${warmupEvents.length}) != summary warmupRequests (${summary.warmupRequests})`
    });
  } else {
    results.push({
      checkName: 'summary_warmup_count_match',
      module: 'invariant',
      status: 'pass',
      message: `Warmup event count matches (${warmupEvents.length})`
    });
  }

  return results;
}
