/**
 * Order workflow consistency checks.
 *
 * Validates order lifecycle behavior based on telemetry evidence:
 *   - create_order responses should return 2xx for valid payloads
 *   - cancel_order should not report server errors for valid requests
 *   - health endpoint should maintain stable 200 responses
 *   - operation distribution should roughly match scenario weights
 *
 * HONESTY NOTE: Current telemetry captures HTTP status codes and latency
 * but NOT response bodies. We cannot validate whether specific order IDs
 * are tracked, whether canceled orders actually disappear from the book,
 * or whether duplicate IDs are rejected — because we don't have the
 * response payloads. These deeper checks are deferred to a future phase
 * where response body capture is added to telemetry events.
 */
import { TelemetryEvent, BenchmarkSummaryData, CheckResult } from '../types';

export function checkHealthStability(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const healthEvents = events.filter(e => e.phase === 'main' && e.operation === 'health');

  if (healthEvents.length === 0) {
    results.push({
      checkName: 'health_endpoint_stability',
      module: 'order_workflow',
      status: 'warn',
      message: 'No health endpoint events in main phase to validate'
    });
    return results;
  }

  const failedHealth = healthEvents.filter(e => !e.success);
  const ratio = failedHealth.length / healthEvents.length;

  if (ratio === 0) {
    results.push({
      checkName: 'health_endpoint_stability',
      module: 'order_workflow',
      status: 'pass',
      message: `All ${healthEvents.length} health checks passed`
    });
  } else if (ratio < 0.05) {
    results.push({
      checkName: 'health_endpoint_stability',
      module: 'order_workflow',
      status: 'warn',
      message: `${failedHealth.length}/${healthEvents.length} health checks failed (${(ratio * 100).toFixed(1)}%)`,
      evidence: failedHealth.slice(0, 3).map(e => ({ seq: e.sequenceNumber, code: e.statusCode }))
    });
  } else {
    results.push({
      checkName: 'health_endpoint_stability',
      module: 'order_workflow',
      status: 'fail',
      message: `${failedHealth.length}/${healthEvents.length} health checks failed (${(ratio * 100).toFixed(1)}%) — service was unstable`
    });
  }

  return results;
}

export function checkCreateOrderResponses(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const createEvents = events.filter(e => e.phase === 'main' && e.operation === 'create_order');

  if (createEvents.length === 0) {
    results.push({
      checkName: 'create_order_success_rate',
      module: 'order_workflow',
      status: 'warn',
      message: 'No create_order events to validate'
    });
    return results;
  }

  const serverErrors = createEvents.filter(e => e.statusCode >= 500);
  const serverErrorRate = serverErrors.length / createEvents.length;

  if (serverErrorRate === 0) {
    results.push({
      checkName: 'create_order_success_rate',
      module: 'order_workflow',
      status: 'pass',
      message: `All ${createEvents.length} create_order requests had no server errors`
    });
  } else if (serverErrorRate < 0.05) {
    results.push({
      checkName: 'create_order_success_rate',
      module: 'order_workflow',
      status: 'warn',
      message: `${serverErrors.length}/${createEvents.length} create_order requests returned 5xx (${(serverErrorRate * 100).toFixed(1)}%)`,
      evidence: serverErrors.slice(0, 3).map(e => ({ seq: e.sequenceNumber, code: e.statusCode }))
    });
  } else {
    results.push({
      checkName: 'create_order_success_rate',
      module: 'order_workflow',
      status: 'fail',
      message: `${serverErrors.length}/${createEvents.length} create_order returned 5xx (${(serverErrorRate * 100).toFixed(1)}%)`
    });
  }

  return results;
}

export function checkCancelOrderResponses(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const cancelEvents = events.filter(e => e.phase === 'main' && e.operation === 'cancel_order');

  if (cancelEvents.length === 0) {
    results.push({
      checkName: 'cancel_order_success_rate',
      module: 'order_workflow',
      status: 'warn',
      message: 'No cancel_order events to validate'
    });
    return results;
  }

  const serverErrors = cancelEvents.filter(e => e.statusCode >= 500);
  const rate = serverErrors.length / cancelEvents.length;

  if (rate === 0) {
    results.push({
      checkName: 'cancel_order_success_rate',
      module: 'order_workflow',
      status: 'pass',
      message: `All ${cancelEvents.length} cancel_order requests had no server errors`
    });
  } else {
    results.push({
      checkName: 'cancel_order_success_rate',
      module: 'order_workflow',
      status: rate < 0.05 ? 'warn' : 'fail',
      message: `${serverErrors.length}/${cancelEvents.length} cancel_order returned 5xx`
    });
  }

  return results;
}

export function checkOperationDistribution(
  events: TelemetryEvent[],
  summary: BenchmarkSummaryData
): CheckResult[] {
  const results: CheckResult[] = [];
  const mainEvents = events.filter(e => e.phase === 'main');

  if (mainEvents.length < 10) {
    results.push({
      checkName: 'operation_distribution',
      module: 'order_workflow',
      status: 'warn',
      message: 'Too few main events to validate operation distribution'
    });
    return results;
  }

  // Count actual operations
  const counts = new Map<string, number>();
  for (const e of mainEvents) {
    counts.set(e.operation, (counts.get(e.operation) ?? 0) + 1);
  }

  // Compare against scenario weights
  const totalWeight = summary.scenario.operations.reduce((a, o) => a + o.weight, 0);
  let withinTolerance = true;

  for (const op of summary.scenario.operations) {
    const expected = op.weight / totalWeight;
    const actual = (counts.get(op.operation) ?? 0) / mainEvents.length;
    const diff = Math.abs(expected - actual);

    if (diff > 0.15) {  // 15% tolerance for small sample sizes
      withinTolerance = false;
    }
  }

  results.push({
    checkName: 'operation_distribution',
    module: 'order_workflow',
    status: withinTolerance ? 'pass' : 'warn',
    message: withinTolerance
      ? 'Operation distribution matches scenario weights within tolerance'
      : 'Operation distribution deviates significantly from scenario weights',
    evidence: Object.fromEntries(counts)
  });

  return results;
}
