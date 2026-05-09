/**
 * Deterministic request-stream replay engine (v1).
 *
 * Replays a previously recorded benchmark request stream against a target
 * runtime. Preserves:
 *   - operation sequence (deterministic ordering)
 *   - approximate relative timing via scheduledOffsetMs
 *   - original payloads
 *
 * Does NOT guarantee:
 *   - exact nanosecond-level timing reproduction
 *   - byte-perfect network behavior (TCP state, keepalive, etc.)
 *   - identical server-side ordering under concurrent delivery
 *
 * Concurrency emerges naturally from overlapping scheduledOffsetMs values
 * across different workers — the scheduler fires them at their scheduled
 * offsets and they execute concurrently.
 *
 * Future evolution:
 *   - v2: Kafka/Redpanda event log for distributed replay coordination
 *   - v3: multi-node synchronized replay with vector clocks
 */
import http from 'http';
import fs from 'fs';
import { ReplayEvent, ReplayOptions, ReplayResult, ReplayResponseEvent, ReplayOperationStats } from './replay-types';
import { loadReplayEvents } from './replay-writer';
import { percentile, average, round2 } from './stats';

/**
 * Execute a replay of previously recorded benchmark events.
 *
 * @param benchmarkRunId  the original run being replayed
 * @param events          pre-loaded and sorted replay events
 * @param options         replay configuration
 * @param responsesFilePath  optional path to write replay-responses.jsonl
 * @returns replay result with aggregate metrics
 */
export async function executeReplay(
  benchmarkRunId: string,
  events: ReplayEvent[],
  options: ReplayOptions,
  responsesFilePath?: string
): Promise<ReplayResult> {
  const includeWarmup = options.includeWarmup ?? true;
  const speedMultiplier = options.speedMultiplier ?? 1.0;

  // Filter events based on warmup inclusion
  const eventsToReplay = includeWarmup
    ? events
    : events.filter(e => e.phase === 'main');

  const skippedEvents = events.length - eventsToReplay.length;

  if (eventsToReplay.length === 0) {
    return emptyResult(benchmarkRunId, options, events.length, skippedEvents);
  }

  // Open response stream if requested
  let responsesStream: fs.WriteStream | null = null;
  if (responsesFilePath) {
    responsesStream = fs.createWriteStream(responsesFilePath, { flags: 'w', encoding: 'utf8' });
  }

  const responses: ReplayResponseEvent[] = [];
  const replayStartedAt = new Date();
  const replayStartMs = Date.now();

  // ── Schedule and execute events ─────────────────────────────────────
  // Group events into time-based batches using scheduledOffsetMs.
  // Events with the same (or very close) offset fire concurrently.

  const promises: Promise<void>[] = [];

  for (const event of eventsToReplay) {
    const adjustedOffsetMs = event.scheduledOffsetMs / speedMultiplier;
    const elapsedMs = Date.now() - replayStartMs;
    const delayMs = Math.max(0, adjustedOffsetMs - elapsedMs);

    const promise = (async () => {
      // Wait until the scheduled offset
      if (delayMs > 0) {
        await sleep(delayMs);
      }

      // Execute the request
      const startMs = Date.now();
      let statusCode = 0;
      let success = false;
      let errorType: string | null = null;

      try {
        const resp = await httpRequest(
          options.baseUrl + event.path,
          event.method,
          event.payload,
          options.requestTimeoutMs
        );
        statusCode = resp.statusCode;
        success = statusCode >= 200 && statusCode < 400;
        if (!success) errorType = 'http_error';
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
          errorType = 'timeout';
        } else {
          errorType = 'connection';
        }
      }

      const latencyMs = Date.now() - startMs;

      const responseEvent: ReplayResponseEvent = {
        sequence: event.sequence,
        operation: event.operation,
        method: event.method,
        path: event.path,
        statusCode,
        success,
        latencyMs,
        errorType,
        replayedAt: new Date().toISOString()
      };

      responses.push(responseEvent);

      // Stream to disk
      if (responsesStream) {
        responsesStream.write(JSON.stringify(responseEvent) + '\n');
      }
    })();

    promises.push(promise);
  }

  await Promise.all(promises);

  // Close response stream
  if (responsesStream) {
    await new Promise<void>((resolve) => responsesStream!.end(resolve));
  }

  const replayEndMs = Date.now();
  const completedAt = new Date();

  // ── Compute aggregate metrics ───────────────────────────────────────
  return computeReplayResult(
    benchmarkRunId,
    options,
    responses,
    replayStartedAt.toISOString(),
    completedAt.toISOString(),
    replayEndMs - replayStartMs,
    events.length,
    skippedEvents,
    includeWarmup,
    speedMultiplier
  );
}

// ── Result computation ────────────────────────────────────────────────────

function computeReplayResult(
  benchmarkRunId: string,
  options: ReplayOptions,
  responses: ReplayResponseEvent[],
  replayedAt: string,
  completedAt: string,
  replayDurationMs: number,
  totalReplayEvents: number,
  skippedEvents: number,
  includeWarmup: boolean,
  speedMultiplier: number
): ReplayResult {
  const latencies = responses.map(r => r.latencyMs).sort((a, b) => a - b);
  const successCount = responses.filter(r => r.success).length;
  const failCount = responses.filter(r => !r.success).length;

  // Per-operation breakdown
  const opMap = new Map<string, ReplayResponseEvent[]>();
  for (const r of responses) {
    const arr = opMap.get(r.operation) ?? [];
    arr.push(r);
    opMap.set(r.operation, arr);
  }

  const perOperation: ReplayOperationStats[] = [];
  for (const [operation, opResponses] of opMap) {
    const opLatencies = opResponses.map(r => r.latencyMs).sort((a, b) => a - b);
    const opSuccess = opResponses.filter(r => r.success).length;
    const opFailed = opResponses.filter(r => !r.success).length;
    perOperation.push({
      operation,
      count: opResponses.length,
      successCount: opSuccess,
      failureCount: opFailed,
      avgLatencyMs: round2(average(opLatencies)),
      p50LatencyMs: round2(percentile(opLatencies, 50)),
      p95LatencyMs: round2(percentile(opLatencies, 95)),
      p99LatencyMs: round2(percentile(opLatencies, 99))
    });
  }

  const durationSec = replayDurationMs / 1000;

  return {
    benchmarkRunId,
    replayedAt,
    completedAt,
    targetBaseUrl: options.baseUrl,
    includeWarmup,
    speedMultiplier,
    totalRequests: responses.length,
    successfulRequests: successCount,
    failedRequests: failCount,
    errorRate: responses.length > 0 ? round2(failCount / responses.length) : 0,
    avgLatencyMs: round2(average(latencies)),
    p50LatencyMs: round2(percentile(latencies, 50)),
    p95LatencyMs: round2(percentile(latencies, 95)),
    p99LatencyMs: round2(percentile(latencies, 99)),
    replayDurationMs,
    throughputRps: durationSec > 0 ? round2(responses.length / durationSec) : 0,
    totalReplayEvents,
    skippedEvents,
    perOperation,
    replayVersion: 'v1'
  };
}

function emptyResult(
  benchmarkRunId: string,
  options: ReplayOptions,
  totalEvents: number,
  skipped: number
): ReplayResult {
  return {
    benchmarkRunId,
    replayedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    targetBaseUrl: options.baseUrl,
    includeWarmup: options.includeWarmup ?? true,
    speedMultiplier: options.speedMultiplier ?? 1.0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    errorRate: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    replayDurationMs: 0,
    throughputRps: 0,
    totalReplayEvents: totalEvents,
    skippedEvents: skipped,
    perOperation: [],
    replayVersion: 'v1'
  };
}

// ── HTTP helper (shared with engine but kept self-contained here) ─────────

interface HttpResponse {
  statusCode: number;
  body: string;
}

function httpRequest(
  url: string,
  method: string,
  body: string | null,
  timeoutMs: number
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const opts: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method,
      timeout: timeoutMs,
      headers: body
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        : {}
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });

    req.on('error', reject);

    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
