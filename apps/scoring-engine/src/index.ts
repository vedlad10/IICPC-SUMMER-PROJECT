import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import axios from 'axios';
import Redis from 'ioredis';
import { prisma } from '@benchmark/db';

const QUESTDB_URL = process.env.QUESTDB_URL || 'http://localhost:9003';
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const fastify = Fastify({ logger: true });
fastify.register(cors, { origin: true });

fastify.get('/health', async () => ({ status: 'ok' }));

fastify.post<{ Body: { runId: string; submissionId: string; durationSeconds: number } }>(
  '/score-run',
  async (request, reply) => {
    const { runId, submissionId, durationSeconds } = request.body;

    try {
      // 1. Query metrics from QuestDB
      const query = `
        SELECT 
          count() as total_orders,
          count() FILTER (WHERE status = 'FILL') as success_count,
          count() FILTER (WHERE status = 'REJECTED') as error_count,
          percentile(latency_ns, 0.95) as p95_ns,
          percentile(latency_ns, 0.99) as p99_ns
        FROM trades
        WHERE run_id = '${runId}'
      `;
      
      const questRes = await axios.get(`${QUESTDB_URL}/exec?query=${encodeURIComponent(query)}`);
      
      if (!questRes.data.dataset || questRes.data.dataset.length === 0) {
        return reply.status(404).send({ error: 'No telemetry found for runId' });
      }

      const row = questRes.data.dataset[0];
      const metrics = {
        totalOrders: Number(row[0]),
        successCount: Number(row[1]),
        errorCount: Number(row[2]),
        p95Ms: row[3] / 1_000_000,
        p99Ms: row[4] / 1_000_000
      };

      // 2. Compute score
      const throughput = metrics.totalOrders / durationSeconds;
      const correctnessMultiplier = 1.0; // Phase 6 will implement real audit
      const scoreValue = (throughput * correctnessMultiplier) / (metrics.p99Ms || 1);

      // 3. Write to Postgres (Prisma)
      const score = await prisma.score.upsert({
        where: { benchmarkRunId: runId },
        update: {
          totalScore: scoreValue,
          rawScore: scoreValue,
          latencyScore: 0, // placeholders
          throughputScore: 0,
          errorRateScore: 0,
          correctnessMultiplier,
          latency: metrics.p95Ms,
          throughput,
          correctness: correctnessMultiplier
        },
        create: {
          benchmarkRunId: runId,
          totalScore: scoreValue,
          rawScore: scoreValue,
          latencyScore: 0,
          throughputScore: 0,
          errorRateScore: 0,
          correctnessMultiplier,
          latency: metrics.p95Ms,
          throughput,
          correctness: correctnessMultiplier
        }
      });

      // Update BenchmarkRun status
      await prisma.benchmarkRun.update({
        where: { id: runId },
        data: {
          status: 'EVALUATED',
          scoreValue,
          p95LatencyMs: metrics.p95Ms,
          p99LatencyMs: metrics.p99Ms,
          throughputRps: throughput,
          evaluatedAt: new Date()
        }
      });

      // 4. Update Redis Leaderboard
      await redis.zadd('leaderboard:overall', scoreValue.toString(), submissionId);

      return {
        status: 'success',
        score: scoreValue,
        metrics
      };
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  }
);

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3007;
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
