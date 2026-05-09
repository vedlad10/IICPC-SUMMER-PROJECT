import path from 'path';
import fs from 'fs';

const SCORING_ARTIFACTS_ROOT = path.resolve(__dirname, '..', 'scoring-artifacts');

export function scoringRoot(benchmarkRunId: string): string {
  return path.join(SCORING_ARTIFACTS_ROOT, benchmarkRunId);
}

export function scoreReportPath(benchmarkRunId: string): string {
  return path.join(scoringRoot(benchmarkRunId), 'score-report.json');
}

export function initScoringDir(benchmarkRunId: string): void {
  fs.mkdirSync(scoringRoot(benchmarkRunId), { recursive: true });
}

export function logicalScoreReportPath(benchmarkRunId: string): string {
  return path.join(benchmarkRunId, 'score-report.json');
}
