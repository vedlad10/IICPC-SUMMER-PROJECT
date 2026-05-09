/**
 * Telemetry storage module.
 *
 * Handles ingestion and retrieval of raw benchmark events.
 * Uses filesystem JSONL for high-volume event storage and
 * reads benchmark-summary.json written by load-generator-controller.
 *
 * Layout (mirrors load-generator-controller's artifact paths):
 *   telemetry-store/
 *     {benchmarkRunId}/
 *       events.jsonl          ← raw events ingested via API
 *
 * The load-generator-controller writes its own copy to:
 *   benchmark-artifacts/{benchmarkRunId}/raw/events.jsonl
 *   benchmark-artifacts/{benchmarkRunId}/summary/benchmark-summary.json
 *
 * This module can read from either location.
 */
import path from 'path';
import fs from 'fs';

const TELEMETRY_ROOT = path.resolve(__dirname, '..', 'telemetry-store');

// Also read load-generator-controller's artifacts
const LOAD_GEN_ARTIFACTS = path.resolve(
  __dirname, '..', '..', 'load-generator-controller', 'benchmark-artifacts'
);

export function telemetryDir(benchmarkRunId: string): string {
  return path.join(TELEMETRY_ROOT, benchmarkRunId);
}

export function telemetryEventsPath(benchmarkRunId: string): string {
  return path.join(telemetryDir(benchmarkRunId), 'events.jsonl');
}

/** Initialize storage dir for a benchmarkRunId */
export function initTelemetryDir(benchmarkRunId: string): void {
  fs.mkdirSync(telemetryDir(benchmarkRunId), { recursive: true });
}

/** Append events as JSONL to the telemetry store */
export function appendEvents(benchmarkRunId: string, events: unknown[]): void {
  initTelemetryDir(benchmarkRunId);
  const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(telemetryEventsPath(benchmarkRunId), lines, 'utf8');
}

/** Read event count from telemetry store */
export function getEventCount(benchmarkRunId: string): number {
  const filePath = telemetryEventsPath(benchmarkRunId);
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return 0;
  return content.split('\n').length;
}

/**
 * Resolve the benchmark summary for a given run.
 * Checks load-generator-controller's artifact path first, then local store.
 */
export function getSummary(benchmarkRunId: string): unknown | null {
  const loadGenPath = path.join(LOAD_GEN_ARTIFACTS, benchmarkRunId, 'summary', 'benchmark-summary.json');
  if (fs.existsSync(loadGenPath)) {
    return JSON.parse(fs.readFileSync(loadGenPath, 'utf8'));
  }
  return null;
}
