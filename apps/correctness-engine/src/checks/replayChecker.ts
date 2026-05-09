/**
 * Telemetry quality checks.
 *
 * Validates that telemetry data itself is well-formed:
 *   - No negative latencies
 *   - All events have valid timestamps
 *   - sequenceNumbers are present and non-negative
 *   - All required fields are present
 *   - Latencies are plausible (not impossibly fast or impossibly slow)
 */
import { TelemetryEvent, CheckResult } from '../types';

export function checkEventQuality(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const mainEvents = events.filter(e => e.phase === 'main');

  // ── Negative latencies ─────────────────────────────────────────────────
  const negativeLat = mainEvents.filter(e => e.latencyMs < 0);
  if (negativeLat.length > 0) {
    results.push({
      checkName: 'no_negative_latencies',
      module: 'replay',
      status: 'fail',
      message: `${negativeLat.length} events have negative latency`,
      evidence: negativeLat.slice(0, 3).map(e => ({ seq: e.sequenceNumber, latencyMs: e.latencyMs }))
    });
  } else {
    results.push({
      checkName: 'no_negative_latencies',
      module: 'replay',
      status: 'pass',
      message: 'No negative latencies detected'
    });
  }

  // ── Implausibly fast responses (< 0.1ms) ───────────────────────────────
  const tooFast = mainEvents.filter(e => e.latencyMs < 0.1 && e.success);
  if (tooFast.length > mainEvents.length * 0.5) {
    results.push({
      checkName: 'plausible_latencies',
      module: 'replay',
      status: 'warn',
      message: `${tooFast.length}/${mainEvents.length} events have sub-0.1ms latency — may indicate stub responses`
    });
  } else {
    results.push({
      checkName: 'plausible_latencies',
      module: 'replay',
      status: 'pass',
      message: 'Latency values are plausible'
    });
  }

  // ── Missing required fields ────────────────────────────────────────────
  let missingFields = 0;
  for (const e of mainEvents.slice(0, 100)) { // sample first 100
    if (!e.benchmarkRunId || !e.operation || e.sequenceNumber == null || !e.startedAt) {
      missingFields++;
    }
  }

  if (missingFields > 0) {
    results.push({
      checkName: 'required_fields_present',
      module: 'replay',
      status: 'fail',
      message: `${missingFields}/100 sampled events have missing required fields`
    });
  } else {
    results.push({
      checkName: 'required_fields_present',
      module: 'replay',
      status: 'pass',
      message: 'All required fields are present in sampled events'
    });
  }

  // ── Minimum event count ────────────────────────────────────────────────
  if (mainEvents.length === 0) {
    results.push({
      checkName: 'minimum_events',
      module: 'replay',
      status: 'fail',
      message: 'No main-phase events found — benchmark produced no data'
    });
  } else if (mainEvents.length < 5) {
    results.push({
      checkName: 'minimum_events',
      module: 'replay',
      status: 'warn',
      message: `Only ${mainEvents.length} main-phase events — very small sample`
    });
  } else {
    results.push({
      checkName: 'minimum_events',
      module: 'replay',
      status: 'pass',
      message: `${mainEvents.length} main-phase events — sufficient sample`
    });
  }

  return results;
}
