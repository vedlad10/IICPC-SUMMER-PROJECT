/**
 * Report builder: runs all check modules and classifies the result.
 *
 * Classification rules:
 *   - Any 'fail' check => FAIL
 *   - Any 'warn' check but no 'fail' => PASS_WITH_WARNINGS
 *   - All 'pass' => PASS
 */
import { TelemetryEvent, BenchmarkSummaryData, CheckResult, CorrectnessReport, CorrectnessClassification } from './types';

// Check modules
import { checkResponseCodes, checkSuccessConsistency, checkConnectionErrors } from './checks/responseValidator';
import { checkSummaryInvariants } from './checks/invariantChecker';
import { checkHealthStability, checkCreateOrderResponses, checkCancelOrderResponses, checkOperationDistribution } from './checks/orderWorkflowChecker';
import { checkOrderbookEndpoint, checkOrderbookLatency } from './checks/orderbookSanityChecker';
import { checkEventQuality } from './checks/replayChecker';

/**
 * Run all correctness checks and build a structured report.
 */
export function buildReport(
  benchmarkRunId: string,
  events: TelemetryEvent[],
  summary: BenchmarkSummaryData
): CorrectnessReport {
  const allChecks: CheckResult[] = [];

  // ── Response validation ────────────────────────────────────────────────
  allChecks.push(...checkResponseCodes(events));
  allChecks.push(...checkSuccessConsistency(events));
  allChecks.push(...checkConnectionErrors(events));

  // ── Summary invariants ─────────────────────────────────────────────────
  allChecks.push(...checkSummaryInvariants(summary, events));

  // ── Order workflow ─────────────────────────────────────────────────────
  allChecks.push(...checkHealthStability(events));
  allChecks.push(...checkCreateOrderResponses(events));
  allChecks.push(...checkCancelOrderResponses(events));
  allChecks.push(...checkOperationDistribution(events, summary));

  // ── Orderbook sanity ───────────────────────────────────────────────────
  allChecks.push(...checkOrderbookEndpoint(events));
  allChecks.push(...checkOrderbookLatency(events));

  // ── Telemetry quality ──────────────────────────────────────────────────
  allChecks.push(...checkEventQuality(events));

  // ── Classify ───────────────────────────────────────────────────────────
  const warnings = allChecks.filter(c => c.status === 'warn');
  const failures = allChecks.filter(c => c.status === 'fail');

  let classification: CorrectnessClassification;
  if (failures.length > 0) {
    classification = 'FAIL';
  } else if (warnings.length > 0) {
    classification = 'PASS_WITH_WARNINGS';
  } else {
    classification = 'PASS';
  }

  return {
    benchmarkRunId,
    classification,
    checksRun: allChecks,
    warnings,
    failures,
    summary: {
      totalChecks: allChecks.length,
      passed: allChecks.filter(c => c.status === 'pass').length,
      warnings: warnings.length,
      failures: failures.length
    },
    generatedAt: new Date().toISOString()
  };
}
