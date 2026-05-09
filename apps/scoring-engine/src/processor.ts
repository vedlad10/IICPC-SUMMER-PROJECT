/**
 * Scoring engine processor.
 *
 * Eligibility: BenchmarkRun must be in SUCCESS status with
 * a non-null correctnessStatus and no existing Score row.
 *
 * Flow:
 *   1. Find eligible run
 *   2. Read correctness classification + benchmark metrics from DB
 *   3. Compute score via formula
 *   4. Determine ranking eligibility
 *   5. Persist score-report.json
 *   6. Create/update Score row and BenchmarkRun fields
 *   7. Update LeaderboardEntry
 */
import fs from 'fs';
import { prisma } from '@benchmark/db';
import { computeScore } from './formula';
import { ScoreReport } from './types';
import { initScoringDir, scoreReportPath, logicalScoreReportPath } from './workspace';

export interface ScoringProcessResult {
  processed: boolean;
  benchmarkRunId?: string;
  finalScore?: number;
  error?: string;
  report?: ScoreReport;
}

export async function processNextScore(): Promise<ScoringProcessResult> {
  // Find runs that have correctness but no score yet
  const candidate = await prisma.benchmarkRun.findFirst({
    where: {
      status: 'SUCCESS',
      correctnessStatus: { not: null },
      scoreValue: null
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!candidate) return { processed: false };

  return computeScoreForRun(candidate.id);
}

export async function computeScoreForRun(benchmarkRunId: string): Promise<ScoringProcessResult> {
  const run = await prisma.benchmarkRun.findUnique({
    where: { id: benchmarkRunId },
    include: { submission: { select: { id: true, userId: true } } }
  });

  if (!run) return { processed: false, error: 'BenchmarkRun not found' };
  if (!run.correctnessStatus) {
    return { processed: false, error: 'No correctness evaluation found' };
  }
  if (run.scoreValue != null) {
    return { processed: false, error: `Already scored: ${run.scoreValue}` };
  }

  console.log(`[scoring] Computing score for ${benchmarkRunId}`);

  // ── Gather inputs ──────────────────────────────────────────────────────
  const p50 = run.p50LatencyMs ?? 500;
  const throughput = run.throughputRps ?? 0;
  const totalReqs = run.requestCount ?? 0;
  const failedReqs = run.failureCount ?? 0;
  const errorRate = totalReqs > 0 ? failedReqs / totalReqs : 0;

  const breakdown = computeScore({
    p50LatencyMs: p50,
    throughputRps: throughput,
    errorRate,
    correctnessClassification: run.correctnessStatus as any
  });

  // ── Determine penalties ────────────────────────────────────────────────
  const penalties: string[] = [];
  if (run.correctnessStatus === 'FAIL') {
    penalties.push('Correctness FAIL: score multiplied by 0.0');
  }
  if (run.correctnessStatus === 'PASS_WITH_WARNINGS') {
    penalties.push(`Correctness warnings (${run.correctnessWarnings}): score multiplied by 0.7`);
  }
  if (errorRate > 0.1) {
    penalties.push(`High error rate (${(errorRate * 100).toFixed(1)}%): reduced errorRateScore`);
  }

  // ── Ranking eligibility ────────────────────────────────────────────────
  const rankingEligible = run.correctnessStatus !== 'FAIL' && breakdown.finalScore > 0;

  // ── Build report ───────────────────────────────────────────────────────
  const report: ScoreReport = {
    benchmarkRunId,
    submissionId: run.submissionId,
    correctnessClassification: run.correctnessStatus,
    metrics: {
      p50LatencyMs: p50,
      throughputRps: throughput,
      errorRate: Math.round(errorRate * 10000) / 10000,
      avgLatencyMs: run.avgLatencyMs ?? 0,
      p95LatencyMs: run.p95LatencyMs ?? 0,
      p99LatencyMs: run.p99LatencyMs ?? 0,
      totalRequests: totalReqs
    },
    formula: {
      ...breakdown
    },
    penalties,
    rankingEligible,
    generatedAt: new Date().toISOString()
  };

  console.log(`[scoring] Score: ${breakdown.finalScore} (raw=${breakdown.rawScore}, ` +
    `multiplier=${breakdown.correctnessMultiplier})`);

  // ── Persist artifact ───────────────────────────────────────────────────
  initScoringDir(benchmarkRunId);
  fs.writeFileSync(scoreReportPath(benchmarkRunId), JSON.stringify(report, null, 2), 'utf8');

  // ── Update DB ──────────────────────────────────────────────────────────
  const now = new Date();

  // Create or update Score row
  await prisma.score.upsert({
    where: { benchmarkRunId },
    create: {
      benchmarkRunId,
      latencyScore: breakdown.latencyScore,
      throughputScore: breakdown.throughputScore,
      errorRateScore: breakdown.errorRateScore,
      correctnessMultiplier: breakdown.correctnessMultiplier,
      rawScore: breakdown.rawScore,
      totalScore: breakdown.finalScore,
      latency: p50,
      throughput,
      correctness: breakdown.correctnessMultiplier
    },
    update: {
      latencyScore: breakdown.latencyScore,
      throughputScore: breakdown.throughputScore,
      errorRateScore: breakdown.errorRateScore,
      correctnessMultiplier: breakdown.correctnessMultiplier,
      rawScore: breakdown.rawScore,
      totalScore: breakdown.finalScore,
      latency: p50,
      throughput,
      correctness: breakdown.correctnessMultiplier
    }
  });

  // Update BenchmarkRun
  await prisma.benchmarkRun.update({
    where: { id: benchmarkRunId },
    data: {
      status: 'EVALUATED',
      scoreValue: breakdown.finalScore,
      scoreReportPath: logicalScoreReportPath(benchmarkRunId),
      rankingEligible,
      evaluatedAt: now
    }
  });

  // Update LeaderboardEntry (best score per submission)
  const existingEntry = await prisma.leaderboardEntry.findUnique({
    where: { submissionId: run.submissionId }
  });

  if (rankingEligible) {
    if (!existingEntry || breakdown.finalScore > existingEntry.score) {
      await prisma.leaderboardEntry.upsert({
        where: { submissionId: run.submissionId },
        create: {
          submissionId: run.submissionId,
          userId: run.submission.userId,
          score: breakdown.finalScore
        },
        update: {
          score: breakdown.finalScore,
          userId: run.submission.userId
        }
      });
    }
  }

  return {
    processed: true,
    benchmarkRunId,
    finalScore: breakdown.finalScore,
    report
  };
}
