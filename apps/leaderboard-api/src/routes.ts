/**
 * Leaderboard API routes — the clean read-model layer for the frontend.
 * Also hosts the Pipeline Orchestrator endpoints.
 */
import { FastifyInstance } from 'fastify';
import { prisma } from '@benchmark/db';
import { computePipelineStatus, rankingComparator } from './logic';
import { runPipeline, getPipelineState, getAllPipelines } from './orchestrator';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ── Health ─────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    service: 'leaderboard-api',
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  // ── Overview ───────────────────────────────────────────────────────────
  app.get('/overview', async () => {
    const [
      totalSubmissions,
      buildsSucceeded,
      buildsFailed,
      benchmarkedRuns,
      evaluatedRuns,
      totalUsers,
      rankedEntries
    ] = await Promise.all([
      prisma.submission.count(),
      prisma.buildJob.count({ where: { status: 'SUCCESS' } }),
      prisma.buildJob.count({ where: { status: 'FAILED' } }),
      prisma.benchmarkRun.count({ where: { status: { in: ['SUCCESS', 'EVALUATED'] } } }),
      prisma.benchmarkRun.count({ where: { status: 'EVALUATED' } }),
      prisma.user.count(),
      prisma.leaderboardEntry.count()
    ]);

    const topEntry = await prisma.leaderboardEntry.findFirst({
      orderBy: { score: 'desc' }
    });

    return {
      totalSubmissions,
      totalUsers,
      buildsSucceeded,
      buildsFailed,
      benchmarkedRuns,
      evaluatedRuns,
      rankedEntries,
      topScore: topEntry?.score ?? null
    };
  });

  // ── Leaderboard ────────────────────────────────────────────────────────
  app.get('/leaderboard', async () => {
    // Get all ranked benchmark runs with their best scores
    const entries = await prisma.leaderboardEntry.findMany({
      orderBy: { score: 'desc' }
    });

    // Enrich with details for tie-breaking and display
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const submission = await prisma.submission.findUnique({
          where: { id: entry.submissionId },
          include: { user: { select: { email: true, name: true } } }
        });

        // Find the best evaluated benchmark run for this submission
        const bestRun = await prisma.benchmarkRun.findFirst({
          where: {
            submissionId: entry.submissionId,
            status: 'EVALUATED',
            rankingEligible: true
          },
          orderBy: { scoreValue: 'desc' },
          include: { score: true }
        });

        return {
          submissionId: entry.submissionId,
          userId: entry.userId,
          userEmail: submission?.user?.email ?? 'unknown',
          userName: submission?.user?.name ?? null,
          score: entry.score,
          correctnessStatus: bestRun?.correctnessStatus ?? null,
          throughputRps: bestRun?.throughputRps ?? null,
          p95LatencyMs: bestRun?.p95LatencyMs ?? null,
          errorRate: bestRun && bestRun.requestCount
            ? Math.round(((bestRun.failureCount ?? 0) / bestRun.requestCount) * 10000) / 10000
            : null,
          evaluatedAt: bestRun?.evaluatedAt?.toISOString() ?? null,
          scoreBreakdown: bestRun?.score ? {
            latencyScore: bestRun.score.latencyScore,
            throughputScore: bestRun.score.throughputScore,
            errorRateScore: bestRun.score.errorRateScore,
            correctnessMultiplier: bestRun.score.correctnessMultiplier,
            rawScore: bestRun.score.rawScore
          } : null,
          failureCount: bestRun?.failureCount ?? null,
          requestCount: bestRun?.requestCount ?? null
        };
      })
    );

    // Sort with deterministic tie-breaking
    enriched.sort(rankingComparator);

    // Assign ranks
    return enriched.map((entry, idx) => ({
      rank: idx + 1,
      ...entry
    }));
  });

  // ── Leaderboard detail ─────────────────────────────────────────────────
  app.get<{ Params: { submissionId: string } }>(
    '/leaderboard/:submissionId',
    async (req, reply) => {
      const entry = await prisma.leaderboardEntry.findUnique({
        where: { submissionId: req.params.submissionId }
      });
      if (!entry) return reply.status(404).send({ error: 'No leaderboard entry' });

      const submission = await prisma.submission.findUnique({
        where: { id: req.params.submissionId },
        include: { user: { select: { email: true, name: true } } }
      });

      const runs = await prisma.benchmarkRun.findMany({
        where: { submissionId: req.params.submissionId, status: 'EVALUATED' },
        include: { score: true },
        orderBy: { scoreValue: 'desc' }
      });

      return {
        ...entry,
        userEmail: submission?.user?.email,
        userName: submission?.user?.name,
        runs: runs.map(r => ({
          id: r.id,
          scoreValue: r.scoreValue,
          correctnessStatus: r.correctnessStatus,
          throughputRps: r.throughputRps,
          p95LatencyMs: r.p95LatencyMs,
          avgLatencyMs: r.avgLatencyMs,
          requestCount: r.requestCount,
          failureCount: r.failureCount,
          evaluatedAt: r.evaluatedAt?.toISOString(),
          score: r.score
        }))
      };
    }
  );

  // ── Submissions list ───────────────────────────────────────────────────
  app.get('/submissions', async () => {
    const submissions = await prisma.submission.findMany({
      include: {
        user: { select: { email: true, name: true } },
        buildJobs: { select: { id: true, status: true } },
        benchmarkRuns: {
          select: {
            id: true, status: true, correctnessStatus: true,
            rankingEligible: true, scoreValue: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return submissions.map(s => ({
      id: s.id,
      userId: s.userId,
      userEmail: s.user.email,
      userName: s.user.name,
      status: s.status,
      originalFilename: s.originalFilename,
      createdAt: s.createdAt.toISOString(),
      pipelineStatus: computePipelineStatus(s.buildJobs, s.benchmarkRuns),
      latestScore: s.benchmarkRuns.find(r => r.scoreValue != null)?.scoreValue ?? null,
      buildCount: s.buildJobs.length,
      runCount: s.benchmarkRuns.length
    }));
  });

  // ── Submission detail ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/submissions/:id', async (req, reply) => {
    const sub = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { email: true, name: true } },
        buildJobs: { orderBy: { createdAt: 'desc' } },
        benchmarkRuns: {
          include: { score: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!sub) return reply.status(404).send({ error: 'Submission not found' });

    const pipelineStatus = computePipelineStatus(sub.buildJobs, sub.benchmarkRuns);

    return {
      id: sub.id,
      userId: sub.userId,
      userEmail: sub.user.email,
      userName: sub.user.name,
      status: sub.status,
      originalFilename: sub.originalFilename,
      storedPath: sub.storedPath,
      mimeType: sub.mimeType,
      sizeBytes: sub.sizeBytes?.toString() ?? null,
      uploadedAt: sub.uploadedAt?.toISOString(),
      createdAt: sub.createdAt.toISOString(),
      pipelineStatus,
      buildJobs: sub.buildJobs.map(b => ({
        id: b.id,
        status: b.status,
        startedAt: b.startedAt?.toISOString(),
        completedAt: b.completedAt?.toISOString(),
        buildExitCode: b.buildExitCode,
        errorMessage: b.errorMessage,
        logPath: b.logPath
      })),
      benchmarkRuns: sub.benchmarkRuns.map(r => ({
        id: r.id,
        status: r.status,
        scenarioName: r.scenarioName,
        requestCount: r.requestCount,
        successCount: r.successCount,
        failureCount: r.failureCount,
        avgLatencyMs: r.avgLatencyMs,
        p50LatencyMs: r.p50LatencyMs,
        p95LatencyMs: r.p95LatencyMs,
        p99LatencyMs: r.p99LatencyMs,
        throughputRps: r.throughputRps,
        correctnessStatus: r.correctnessStatus,
        correctnessWarnings: r.correctnessWarnings,
        correctnessFailures: r.correctnessFailures,
        scoreValue: r.scoreValue,
        rankingEligible: r.rankingEligible,
        evaluatedAt: r.evaluatedAt?.toISOString(),
        benchmarkStartedAt: r.benchmarkStartedAt?.toISOString(),
        benchmarkCompletedAt: r.benchmarkCompletedAt?.toISOString(),
        score: r.score ? {
          latencyScore: r.score.latencyScore,
          throughputScore: r.score.throughputScore,
          errorRateScore: r.score.errorRateScore,
          correctnessMultiplier: r.score.correctnessMultiplier,
          rawScore: r.score.rawScore,
          totalScore: r.score.totalScore
        } : null
      }))
    };
  });

  // ── Runs list ──────────────────────────────────────────────────────────
  app.get<{ Querystring: { status?: string } }>('/runs', async (req) => {
    const where = req.query.status ? { status: req.query.status as any } : {};

    const runs = await prisma.benchmarkRun.findMany({
      where,
      include: {
        submission: { select: { id: true, userId: true, user: { select: { email: true } } } },
        score: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return runs.map(r => ({
      id: r.id,
      submissionId: r.submissionId,
      userEmail: r.submission.user.email,
      status: r.status,
      scenarioName: r.scenarioName,
      requestCount: r.requestCount,
      throughputRps: r.throughputRps,
      p95LatencyMs: r.p95LatencyMs,
      correctnessStatus: r.correctnessStatus,
      scoreValue: r.scoreValue,
      rankingEligible: r.rankingEligible,
      benchmarkStartedAt: r.benchmarkStartedAt?.toISOString(),
      evaluatedAt: r.evaluatedAt?.toISOString(),
      createdAt: r.createdAt.toISOString()
    }));
  });

  // ── Run detail ─────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const run = await prisma.benchmarkRun.findUnique({
      where: { id: req.params.id },
      include: {
        submission: { select: { id: true, userId: true, user: { select: { email: true, name: true } } } },
        score: true
      }
    });

    if (!run) return reply.status(404).send({ error: 'Run not found' });

    return {
      id: run.id,
      submissionId: run.submissionId,
      userEmail: run.submission.user.email,
      status: run.status,
      // Sandbox
      containerId: run.containerId,
      runtimeHost: run.runtimeHost,
      runtimePort: run.runtimePort,
      readinessAt: run.readinessAt?.toISOString(),
      // Benchmark
      scenarioName: run.scenarioName,
      benchmarkStartedAt: run.benchmarkStartedAt?.toISOString(),
      benchmarkCompletedAt: run.benchmarkCompletedAt?.toISOString(),
      requestCount: run.requestCount,
      successCount: run.successCount,
      failureCount: run.failureCount,
      avgLatencyMs: run.avgLatencyMs,
      p50LatencyMs: run.p50LatencyMs,
      p95LatencyMs: run.p95LatencyMs,
      p99LatencyMs: run.p99LatencyMs,
      throughputRps: run.throughputRps,
      errorRate: run.requestCount
        ? Math.round(((run.failureCount ?? 0) / run.requestCount) * 10000) / 10000
        : null,
      // Correctness
      correctnessStatus: run.correctnessStatus,
      correctnessWarnings: run.correctnessWarnings,
      correctnessFailures: run.correctnessFailures,
      correctnessReportPath: run.correctnessReportPath,
      // Scoring
      scoreValue: run.scoreValue,
      rankingEligible: run.rankingEligible,
      evaluatedAt: run.evaluatedAt?.toISOString(),
      scoreReportPath: run.scoreReportPath,
      score: run.score ? {
        latencyScore: run.score.latencyScore,
        throughputScore: run.score.throughputScore,
        errorRateScore: run.score.errorRateScore,
        correctnessMultiplier: run.score.correctnessMultiplier,
        rawScore: run.score.rawScore,
        totalScore: run.score.totalScore
      } : null,
      // Paths
      telemetryPath: run.telemetryPath,
      summaryPath: run.summaryPath,
      errorMessage: run.errorMessage,
      benchmarkErrorMessage: run.benchmarkErrorMessage,
      createdAt: run.createdAt.toISOString()
    };
  });

  // ── Orchestrator: kick off automated pipeline ────────────────────────
  app.post<{
    Body: {
      submissionId: string;
      benchmarkRunId: string;
      buildJobId: string;
      userEmail: string;
      scenario?: string;
    }
  }>('/orchestrator/run', async (req, reply) => {
    const { submissionId, benchmarkRunId, buildJobId, userEmail, scenario } = req.body;
    if (!submissionId || !benchmarkRunId || !buildJobId) {
      return reply.status(400).send({ error: 'Missing submissionId, benchmarkRunId, or buildJobId' });
    }
    // Fire and forget — pipeline runs in the background
    runPipeline(submissionId, benchmarkRunId, buildJobId, userEmail, scenario || 'smoke');
    return reply.status(202).send({
      submissionId,
      status: 'PIPELINE_STARTED',
      message: 'Pipeline started. Poll /orchestrator/status/:submissionId for updates.'
    });
  });

  // ── Orchestrator: poll status ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/orchestrator/status/:id', async (req, reply) => {
    const state = getPipelineState(req.params.id);
    if (!state) return reply.status(404).send({ error: 'Pipeline not found' });
    return reply.status(200).send(state);
  });

  // ── Orchestrator: list all pipelines ───────────────────────────────────
  app.get('/orchestrator/pipelines', async () => {
    return getAllPipelines();
  });
}
