/**
 * Response validator checks.
 *
 * Validates that HTTP responses follow expected patterns:
 *   - create_order should return 201
 *   - cancel_order, get_orderbook, health should return 200
 *   - no events should have statusCode 0 (connection failures counted separately)
 *   - success field should be consistent with statusCode
 */
import { TelemetryEvent, CheckResult } from '../types';

const EXPECTED_STATUS: Record<string, number[]> = {
  create_order:  [200, 201],
  cancel_order:  [200],
  get_orderbook: [200],
  health:        [200]
};

export function checkResponseCodes(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const mainEvents = events.filter(e => e.phase === 'main');

  let unexpectedCount = 0;
  const sampleBad: TelemetryEvent[] = [];

  for (const e of mainEvents) {
    if (!e.success) continue; // failures already tracked; we check "successful" responses

    const expected = EXPECTED_STATUS[e.operation];
    if (!expected) continue;

    if (!expected.includes(e.statusCode)) {
      unexpectedCount++;
      if (sampleBad.length < 5) sampleBad.push(e);
    }
  }

  if (unexpectedCount === 0) {
    results.push({
      checkName: 'response_status_codes',
      module: 'response',
      status: 'pass',
      message: 'All successful responses returned expected HTTP status codes'
    });
  } else {
    const severity = unexpectedCount > mainEvents.length * 0.1 ? 'fail' : 'warn';
    results.push({
      checkName: 'response_status_codes',
      module: 'response',
      status: severity,
      message: `${unexpectedCount}/${mainEvents.length} successful responses had unexpected HTTP codes`,
      evidence: sampleBad.map(e => ({
        seq: e.sequenceNumber,
        op: e.operation,
        code: e.statusCode,
        expected: EXPECTED_STATUS[e.operation]
      }))
    });
  }

  return results;
}

export function checkSuccessConsistency(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const mainEvents = events.filter(e => e.phase === 'main');

  let inconsistent = 0;
  for (const e of mainEvents) {
    const codeOk = e.statusCode >= 200 && e.statusCode < 400;
    if (e.success !== codeOk) {
      inconsistent++;
    }
  }

  if (inconsistent === 0) {
    results.push({
      checkName: 'success_field_consistency',
      module: 'response',
      status: 'pass',
      message: 'success field is consistent with statusCode for all main events'
    });
  } else {
    results.push({
      checkName: 'success_field_consistency',
      module: 'response',
      status: 'fail',
      message: `${inconsistent}/${mainEvents.length} events have inconsistent success vs statusCode`,
    });
  }

  return results;
}

export function checkConnectionErrors(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const mainEvents = events.filter(e => e.phase === 'main');
  const connErrors = mainEvents.filter(e => e.errorType === 'connection');
  const timeouts = mainEvents.filter(e => e.errorType === 'timeout');

  if (connErrors.length === 0 && timeouts.length === 0) {
    results.push({
      checkName: 'connection_errors',
      module: 'response',
      status: 'pass',
      message: 'No connection errors or timeouts during benchmark'
    });
  } else {
    const total = connErrors.length + timeouts.length;
    const ratio = total / mainEvents.length;
    const severity = ratio > 0.05 ? 'fail' : 'warn';
    results.push({
      checkName: 'connection_errors',
      module: 'response',
      status: severity,
      message: `${connErrors.length} connection errors, ${timeouts.length} timeouts out of ${mainEvents.length} requests (${(ratio * 100).toFixed(1)}%)`,
    });
  }

  return results;
}
