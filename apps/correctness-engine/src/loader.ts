/**
 * Input loader for correctness evaluation.
 *
 * Loads raw telemetry events and benchmark summary from the
 * load-generator-controller's artifact directory.
 */
import fs from 'fs';
import { TelemetryEvent, BenchmarkSummaryData } from './types';
import { benchmarkEventsPath, benchmarkSummaryPath } from './workspace';

export interface LoadedInputs {
  events: TelemetryEvent[];
  summary: BenchmarkSummaryData;
}

/**
 * Load all correctness inputs for a benchmark run.
 * Throws if files are missing or malformed.
 */
export function loadInputs(benchmarkRunId: string): LoadedInputs {
  // ── Load events ────────────────────────────────────────────────────────
  const eventsFile = benchmarkEventsPath(benchmarkRunId);
  if (!fs.existsSync(eventsFile)) {
    throw new Error(`Events file not found: ${eventsFile}`);
  }

  const rawLines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');
  const events: TelemetryEvent[] = [];
  for (const line of rawLines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip malformed lines, flag later in checks
    }
  }

  // ── Load summary ───────────────────────────────────────────────────────
  const summaryFile = benchmarkSummaryPath(benchmarkRunId);
  if (!fs.existsSync(summaryFile)) {
    throw new Error(`Summary file not found: ${summaryFile}`);
  }

  const summary: BenchmarkSummaryData = JSON.parse(
    fs.readFileSync(summaryFile, 'utf8')
  );

  return { events, summary };
}
