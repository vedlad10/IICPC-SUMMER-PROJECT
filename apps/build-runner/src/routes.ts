/**
 * Build runner Fastify routes.
 *
 * POST /jobs/process-next  — claim and process one queued BuildJob
 * GET  /jobs/:id           — fetch BuildJob status and metadata
 * GET  /jobs/:id/logs      — return the structured log file contents
 * GET  /health             — liveness check
 */
import { FastifyInstance } from 'fastify';
import { prisma } from '@benchmark/db';
import fs from 'fs';
import { processNextJob } from './processor';
import { logFilePath } from './workspace';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ── Health ─────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    service: 'build-runner',
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  // ── Process next job ───────────────────────────────────────────────────
  app.post('/jobs/process-next', async (_req, reply) => {
    const result = await processNextJob();

    if (!result.claimed) {
      return reply.status(200).send({ claimed: false, message: 'No queued jobs available' });
    }

    return reply.status(200).send({
      claimed: true,
      buildJobId: result.buildJobId,
      status: result.status,
      ...(result.error ? { error: result.error } : {})
    });
  });

  // ── Get job by ID ──────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = await prisma.buildJob.findUnique({
      where: { id: req.params.id },
      include: { submission: { select: { id: true, status: true, userId: true } } }
    });

    if (!job) {
      return reply.status(404).send({ error: `BuildJob ${req.params.id} not found` });
    }

    return reply.status(200).send(job);
  });

  // ── Get job logs ───────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/jobs/:id/logs', async (req, reply) => {
    const job = await prisma.buildJob.findUnique({ where: { id: req.params.id } });

    if (!job) {
      return reply.status(404).send({ error: `BuildJob ${req.params.id} not found` });
    }

    const logFile = logFilePath(req.params.id);
    if (!fs.existsSync(logFile)) {
      return reply.status(404).send({ error: 'Log file not yet available for this job' });
    }

    const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    return reply.status(200).send({ buildJobId: req.params.id, entries });
  });
}
