import { FastifyInstance } from 'fastify';
import fs from 'fs';
import { prisma } from '@benchmark/db';
import { processNextCorrectness, evaluateRun } from './processor';
import { correctnessReportPath } from './workspace';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    service: 'correctness-engine',
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  app.post('/correctness/process-next', async (_req, reply) => {
    const result = await processNextCorrectness();
    if (!result.processed) {
      return reply.status(200).send({ processed: false, message: 'No eligible runs to evaluate' });
    }
    return reply.status(200).send(result);
  });

  app.post<{ Params: { benchmarkRunId: string } }>(
    '/correctness/:benchmarkRunId/evaluate',
    async (req, reply) => {
      const result = await evaluateRun(req.params.benchmarkRunId);
      if (!result.processed) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.status(200).send(result);
    }
  );

  app.get<{ Params: { benchmarkRunId: string } }>(
    '/correctness/:benchmarkRunId',
    async (req, reply) => {
      const run = await prisma.benchmarkRun.findUnique({
        where: { id: req.params.benchmarkRunId }
      });

      if (!run) return reply.status(404).send({ error: 'BenchmarkRun not found' });

      let report = null;
      try {
        const rp = correctnessReportPath(req.params.benchmarkRunId);
        if (fs.existsSync(rp)) report = JSON.parse(fs.readFileSync(rp, 'utf8'));
      } catch { /* ignore */ }

      return reply.status(200).send({
        benchmarkRunId: run.id,
        correctnessStatus: run.correctnessStatus,
        correctnessWarnings: run.correctnessWarnings,
        correctnessFailures: run.correctnessFailures,
        report
      });
    }
  );
}
