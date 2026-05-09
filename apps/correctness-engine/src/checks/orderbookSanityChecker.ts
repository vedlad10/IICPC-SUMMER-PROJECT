/**
 * Orderbook sanity checks.
 *
 * Validates orderbook-related behavior at the telemetry level:
 *   - get_orderbook should not return server errors
 *   - latency should be reasonable (not excessively slow)
 *   - get_orderbook should be responsive under load
 *
 * HONESTY NOTE: We cannot validate bid/ask sorting, negative prices,
 * or spread rules from the current telemetry — response bodies are not
 * captured. These checks are deferred to a future phase with response
 * body capture. What we CAN validate: the endpoint existed, responded
 * with 2xx, and didn't have excessive latency.
 */
import { TelemetryEvent, CheckResult } from '../types';

export function checkOrderbookEndpoint(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const obEvents = events.filter(e => e.phase === 'main' && e.operation === 'get_orderbook');

  if (obEvents.length === 0) {
    results.push({
      checkName: 'orderbook_endpoint_available',
      module: 'orderbook',
      status: 'warn',
      message: 'No get_orderbook events to validate'
    });
    return results;
  }

  const serverErrors = obEvents.filter(e => e.statusCode >= 500);
  const rate = serverErrors.length / obEvents.length;

  if (rate === 0) {
    results.push({
      checkName: 'orderbook_endpoint_available',
      module: 'orderbook',
      status: 'pass',
      message: `All ${obEvents.length} orderbook requests returned successfully`
    });
  } else {
    results.push({
      checkName: 'orderbook_endpoint_available',
      module: 'orderbook',
      status: rate < 0.05 ? 'warn' : 'fail',
      message: `${serverErrors.length}/${obEvents.length} orderbook requests returned 5xx`
    });
  }

  return results;
}

export function checkOrderbookLatency(events: TelemetryEvent[]): CheckResult[] {
  const results: CheckResult[] = [];
  const obEvents = events.filter(e => e.phase === 'main' && e.operation === 'get_orderbook' && e.success);

  if (obEvents.length === 0) return results;

  const latencies = obEvents.map(e => e.latencyMs).sort((a, b) => a - b);
  const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? latencies[latencies.length - 1];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  // Sanity: p99 under 5 seconds, avg under 1 second
  if (p99 > 5000) {
    results.push({
      checkName: 'orderbook_latency_sanity',
      module: 'orderbook',
      status: 'fail',
      message: `Orderbook p99 latency is ${p99}ms — exceeds 5000ms threshold`
    });
  } else if (avg > 1000) {
    results.push({
      checkName: 'orderbook_latency_sanity',
      module: 'orderbook',
      status: 'warn',
      message: `Orderbook avg latency is ${avg.toFixed(1)}ms — high for read endpoint`
    });
  } else {
    results.push({
      checkName: 'orderbook_latency_sanity',
      module: 'orderbook',
      status: 'pass',
      message: `Orderbook latency is acceptable (avg=${avg.toFixed(1)}ms, p99=${p99}ms)`
    });
  }

  return results;
}
