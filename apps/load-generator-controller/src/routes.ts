/**
 * Load-generator-controller Fastify routes.
 */
import { FastifyInstance } from 'fastify';
import { prisma } from '@benchmark/db';
import fs from 'fs';
import { processNextBenchmark, runBenchmarkById } from './processor';
import { summaryPath, replayEventsPath as replayEventsFilePath, replayResultPath, replayResponsesPath } from './workspace';
import { listScenarios } from './scenarios';
import { loadReplayEvents } from './replay-writer';
import { executeReplay } from './replay';
import { initTelemetry, runBenchmark } from './bot';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { host: string; port: number; runId: string; count?: number } }>(
    '/test-telemetry',
    async (req, reply) => {
      const { host, port, runId, count = 100 } = req.body;
      try {
        await initTelemetry();
        await runBenchmark({
          engineHost: host,
          enginePort: port,
          benchmarkRunId: runId,
          orderCount: count
        });
        return { status: 'success', message: 'Telemetry benchmark completed and published' };
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  app.get('/health', async () => ({
    service: 'load-generator-controller',
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  // ── Process next READY benchmark ───────────────────────────────────────
  app.post<{ Querystring: { scenario?: string } }>(
    '/benchmarks/process-next',
    async (req, reply) => {
      const result = await processNextBenchmark(req.query.scenario);

      if (!result.claimed) {
        return reply.status(200).send({ claimed: false, message: 'No READY benchmark runs available' });
      }

      return reply.status(200).send(result);
    }
  );

  // ── Run specific benchmark ─────────────────────────────────────────────
  app.post<{ Params: { id: string }; Querystring: { scenario?: string } }>(
    '/benchmarks/:id/run',
    async (req, reply) => {
      const result = await runBenchmarkById(req.params.id, req.query.scenario);
      if (!result.claimed) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.status(200).send(result);
    }
  );

  // ── Get benchmark status ───────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/benchmarks/:id', async (req, reply) => {
    const run = await prisma.benchmarkRun.findUnique({
      where: { id: req.params.id },
      include: { submission: { select: { id: true, status: true, userId: true } } }
    });

    if (!run) return reply.status(404).send({ error: 'BenchmarkRun not found' });

    // Attach inline summary if available
    let summary = null;
    try {
      const sp = summaryPath(req.params.id);
      if (fs.existsSync(sp)) {
        summary = JSON.parse(fs.readFileSync(sp, 'utf8'));
      }
    } catch { /* ignore */ }

    return reply.status(200).send({ ...run, summary });
  });

  // ── List scenarios ─────────────────────────────────────────────────────
  app.get('/scenarios', async () => ({
    scenarios: listScenarios()
  }));

  // ══════════════════════════════════════════════════════════════════════
  //  REPLAY ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * POST /benchmarks/:id/replay
   *
   * Replay a previously executed benchmark run's request stream.
   *
   * Request body (all optional):
   *   - host: string       — target hostname (default: from BenchmarkRun)
   *   - port: number       — target port (default: from BenchmarkRun)
   *   - protocol: string   — "http" or "https" (default: "http")
   *   - includeWarmup: boolean — whether to replay warmup events (default: true)
   *   - speedMultiplier: number — timing speed (1.0 = original, 2.0 = 2x fast)
   *
   * Behavior:
   *   - Loads replay-events.jsonl from the benchmark's artifact directory
   *   - Replays requests against the target with approximate timing
   *   - Writes replay-result.json and replay-responses.jsonl
   *   - Returns the replay result summary
   */
  app.post<{
    Params: { id: string };
    Body: {
      host?: string;
      port?: number;
      protocol?: string;
      includeWarmup?: boolean;
      speedMultiplier?: number;
    };
  }>('/benchmarks/:id/replay', async (req, reply) => {
    const benchmarkRunId = req.params.id;

    // ── 1. Validate benchmark run exists ──────────────────────────────
    const run = await prisma.benchmarkRun.findUnique({
      where: { id: benchmarkRunId }
    });

    if (!run) {
      return reply.status(404).send({ error: 'BenchmarkRun not found' });
    }

    // ── 2. Load replay events ────────────────────────────────────────
    const eventsPath = replayEventsFilePath(benchmarkRunId);
    let events;
    try {
      events = loadReplayEvents(eventsPath);
    } catch (err: any) {
      return reply.status(404).send({
        error: 'Replay events not found',
        detail: err.message,
        hint: 'This benchmark run may predate replay support, or the artifact was cleaned up.'
      });
    }

    if (events.length === 0) {
      return reply.status(400).send({
        error: 'Replay events file is empty',
        hint: 'The benchmark run produced no events to replay.'
      });
    }

    // ── 3. Resolve target ────────────────────────────────────────────
    const protocol = req.body?.protocol ?? 'http';
    let host = req.body?.host;
    let port = req.body?.port;

    if (!host || !port) {
      // Fall back to BenchmarkRun's runtimeHost/runtimePort
      if (!run.runtimeHost || !run.runtimePort) {
        return reply.status(400).send({
          error: 'No replay target specified',
          detail: 'Provide host/port in request body, or ensure the BenchmarkRun has runtimeHost/runtimePort',
          hint: 'The original sandbox may have been stopped.'
        });
      }
      host = host ?? run.runtimeHost;
      port = port ?? run.runtimePort;
    }

    const baseUrl = `${protocol}://${host}:${port}`;

    // ── 4. Execute replay ────────────────────────────────────────────
    console.log(`[replay] Starting replay of ${benchmarkRunId} → ${baseUrl} (${events.length} events)`);

    const result = await executeReplay(
      benchmarkRunId,
      events,
      {
        baseUrl,
        requestTimeoutMs: 5000,
        includeWarmup: req.body?.includeWarmup,
        speedMultiplier: req.body?.speedMultiplier
      },
      replayResponsesPath(benchmarkRunId)
    );

    // ── 5. Persist result ────────────────────────────────────────────
    fs.writeFileSync(replayResultPath(benchmarkRunId), JSON.stringify(result, null, 2), 'utf8');

    console.log(`[replay] Complete: ${result.totalRequests} requests, ` +
      `${result.successfulRequests} success, ${result.failedRequests} failed, ` +
      `${result.throughputRps} rps`);

    return reply.status(200).send(result);
  });

  /**
   * GET /benchmarks/:id/replay
   *
   * Returns the replay result for a previously executed replay.
   * Returns 404 if no replay has been run for this benchmark.
   */
  app.get<{ Params: { id: string } }>('/benchmarks/:id/replay', async (req, reply) => {
    const benchmarkRunId = req.params.id;

    // Check if result exists
    const resultPath = replayResultPath(benchmarkRunId);
    if (!fs.existsSync(resultPath)) {
      return reply.status(404).send({
        error: 'No replay result found',
        hint: 'POST /benchmarks/:id/replay to execute a replay first.'
      });
    }

    try {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      return reply.status(200).send(result);
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to read replay result' });
    }
  });
}
