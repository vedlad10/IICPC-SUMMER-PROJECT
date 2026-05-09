/**
 * Path resolver for benchmark artifacts.
 *
 * Layout:
 *   benchmark-artifacts/
 *     {benchmarkRunId}/
 *       raw/events.jsonl
 *       summary/benchmark-summary.json
 *       replay/replay-events.jsonl
 *       replay/replay-result.json
 *       replay/replay-responses.jsonl
 */
import path from 'path';
import fs from 'fs';

const ARTIFACTS_ROOT = path.resolve(__dirname, '..', 'benchmark-artifacts');

export function artifactRoot(benchmarkRunId: string): string {
  return path.join(ARTIFACTS_ROOT, benchmarkRunId);
}

export function rawEventsDir(benchmarkRunId: string): string {
  return path.join(artifactRoot(benchmarkRunId), 'raw');
}

export function rawEventsPath(benchmarkRunId: string): string {
  return path.join(rawEventsDir(benchmarkRunId), 'events.jsonl');
}

export function summaryDir(benchmarkRunId: string): string {
  return path.join(artifactRoot(benchmarkRunId), 'summary');
}

export function summaryPath(benchmarkRunId: string): string {
  return path.join(summaryDir(benchmarkRunId), 'benchmark-summary.json');
}

// ── Replay artifact paths ─────────────────────────────────────────────────

export function replayDir(benchmarkRunId: string): string {
  return path.join(artifactRoot(benchmarkRunId), 'replay');
}

export function replayEventsPath(benchmarkRunId: string): string {
  return path.join(replayDir(benchmarkRunId), 'replay-events.jsonl');
}

export function replayResultPath(benchmarkRunId: string): string {
  return path.join(replayDir(benchmarkRunId), 'replay-result.json');
}

export function replayResponsesPath(benchmarkRunId: string): string {
  return path.join(replayDir(benchmarkRunId), 'replay-responses.jsonl');
}

// ── Directory initialization ──────────────────────────────────────────────

export function initArtifactDirs(benchmarkRunId: string): void {
  fs.mkdirSync(rawEventsDir(benchmarkRunId), { recursive: true });
  fs.mkdirSync(summaryDir(benchmarkRunId), { recursive: true });
  fs.mkdirSync(replayDir(benchmarkRunId), { recursive: true });
}

export function logicalPaths(benchmarkRunId: string): {
  telemetryPath: string;
  summaryPath: string;
  replayEventsPath: string;
} {
  return {
    telemetryPath: path.join(benchmarkRunId, 'raw', 'events.jsonl'),
    summaryPath: path.join(benchmarkRunId, 'summary', 'benchmark-summary.json'),
    replayEventsPath: path.join(benchmarkRunId, 'replay', 'replay-events.jsonl')
  };
}
