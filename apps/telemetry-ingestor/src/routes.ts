/**
 * Telemetry-ingestor Fastify routes.
 *
 * POST /telemetry/ingest           — ingest a batch of benchmark events
 * GET  /telemetry/:id/summary      — return stored benchmark summary
 * GET  /telemetry/:id/event-count  — return count of stored events
 * GET  /health                     — liveness check
 */
import { FastifyInstance } from 'fastify';
import { appendEvents, getEventCount, getSummary } from './storage';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    service: 'telemetry-ingestor',
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  // ── Ingest batch ───────────────────────────────────────────────────────
  app.post('/telemetry/ingest', async (req, reply) => {
    const body = req.body as { benchmarkRunId?: string; events?: unknown[] };

    if (!body.benchmarkRunId || !Array.isArray(body.events) || body.events.length === 0) {
      return reply.status(400).send({ error: 'Missing benchmarkRunId or events array' });
    }

    appendEvents(body.benchmarkRunId, body.events);

    return reply.status(200).send({
      ingested: body.events.length,
      benchmarkRunId: body.benchmarkRunId,
      totalStored: getEventCount(body.benchmarkRunId)
    });
  });

  // ── Get summary ────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/telemetry/:id/summary', async (req, reply) => {
    const summary = getSummary(req.params.id);
    if (!summary) {
      return reply.status(404).send({ error: 'No summary available for this benchmark run' });
    }
    return reply.status(200).send(summary);
  });

  // ── Get event count ────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/telemetry/:id/event-count', async (req, reply) => {
    const count = getEventCount(req.params.id);
    return reply.status(200).send({ benchmarkRunId: req.params.id, eventCount: count });
  });
}
