import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import Redis from 'ioredis';
import { prisma } from '@benchmark/db';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const fastify = Fastify({ logger: true });

fastify.register(cors, { origin: true });

fastify.get('/health', async () => ({ status: 'ok' }));

/**
 * GET /overview
 * Returns aggregate metrics for the dashboard.
 */
fastify.get('/overview', async () => {
  const [totalSubmissions, totalUsers, benchmarkedRuns, evaluatedRuns] = await Promise.all([
    prisma.submission.count(),
    prisma.user.count(),
    prisma.benchmarkRun.count(),
    prisma.benchmarkRun.count({ where: { status: 'EVALUATED' } })
  ]);

  const topScore = await redis.zrevrange('leaderboard:overall', 0, 0, 'WITHSCORES');
  
  return {
    totalSubmissions,
    totalUsers,
    benchmarkedRuns,
    evaluatedRuns,
    topScore: topScore[1] ? parseFloat(topScore[1]) : 0,
    buildsSucceeded: totalSubmissions, // placeholder
    buildsFailed: 0,
    rankedEntries: totalSubmissions
  };
});

/**
 * GET /leaderboard/top
 * Returns the top-ranked submissions from Redis and joins with Postgres metadata.
 */
fastify.get('/leaderboard/top', async (request) => {
  const limit = parseInt((request.query as any).limit || '10', 10);
  
  // Get top N from Redis ZSET (descending order)
  const topData = await redis.zrevrange('leaderboard:overall', 0, limit - 1, 'WITHSCORES');
  
  const results = [];
  for (let i = 0; i < topData.length; i += 2) {
    const submissionId = topData[i];
    const score = parseFloat(topData[i + 1]);
    
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { 
        user: true, 
        benchmarkRuns: { 
          where: { status: 'EVALUATED' }, 
          orderBy: { createdAt: 'desc' }, 
          take: 1 
        } 
      }
    });
    
    if (submission) {
      const latestRun = submission.benchmarkRuns[0];
      results.push({
        rank: (i / 2) + 1,
        submissionId,
        engineName: submission.originalFilename || 'Anonymous',
        developer: submission.user.email.split('@')[0],
        score,
        p99Ms: latestRun?.p99LatencyMs ?? 0,
        throughput: latestRun?.throughputRps ?? 0,
        lastEvaluated: latestRun?.evaluatedAt
      });
    }
  }
  
  return results;
});

/**
 * GET /runs/:runId/score
 * Returns the detailed score breakdown for a specific run.
 */
fastify.get<{ Params: { runId: string } }>('/runs/:runId/score', async (request, reply) => {
  const { runId } = request.params;
  
  const score = await prisma.score.findUnique({
    where: { benchmarkRunId: runId },
    include: { benchmarkRun: true }
  });
  
  if (!score) {
    return reply.status(404).send({ error: 'Score not found for this run' });
  }
  
  return {
    scoreValue: score.totalScore,
    metrics: {
      p95Ms: score.latency,
      p99Ms: score.benchmarkRun.p99LatencyMs,
      throughput: score.throughput,
      correctness: score.correctness
    },
    run: score.benchmarkRun
  };
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3008;
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
