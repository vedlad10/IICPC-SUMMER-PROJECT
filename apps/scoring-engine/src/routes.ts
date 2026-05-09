import { FastifyInstance } from 'fastify';
import fs from 'fs';
import { prisma } from '@benchmark/db';
import { processNextScore, computeScoreForRun } from './processor';
import { scoreReportPath } from './workspace';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    service: 'scoring-engine',
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  app.post('/scores/process-next', async (_req, reply) => {
    const result = await processNextScore();
    if (!result.processed) {
      return reply.status(200).send({ processed: false, message: 'No eligible runs to score' });
    }
    return reply.status(200).send(result);
  });

  app.post<{ Params: { benchmarkRunId: string } }>(
    '/scores/:benchmarkRunId/compute',
    async (req, reply) => {
      const result = await computeScoreForRun(req.params.benchmarkRunId);
      if (!result.processed) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.status(200).send(result);
    }
  );

  app.get<{ Params: { benchmarkRunId: string } }>(
    '/scores/:benchmarkRunId',
    async (req, reply) => {
      const score = await prisma.score.findUnique({
        where: { benchmarkRunId: req.params.benchmarkRunId }
      });

      if (!score) return reply.status(404).send({ error: 'Score not found' });

      let report = null;
      try {
        const sp = scoreReportPath(req.params.benchmarkRunId);
        if (fs.existsSync(sp)) report = JSON.parse(fs.readFileSync(sp, 'utf8'));
      } catch { /* ignore */ }

      return reply.status(200).send({ ...score, report });
    }
  );
}
