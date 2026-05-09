/**
 * Benchmark traffic engine.
 *
 * Launches concurrent async workers that send HTTP requests
 * to the sandboxed contestant service.
 *
 * Design:
 *   - Each worker runs in a loop until the phase duration elapses
 *   - Operations are selected via weighted random from the scenario mix
 *   - Payloads are generated deterministically from seed + sequence number
 *   - Events are batched and flushed to disk as JSONL to cap memory growth
 *   - AbortController enforces per-request timeout
 *   - warmup phase events are tagged but excluded from scored metrics
 *
 * Phase-window support (v2):
 *   - Scenarios with `phaseWindows` switch operation mixes based on elapsed
 *     main-phase time. Each window defines its own ops + optional thinkTimeMs.
 *   - Scenarios WITHOUT phaseWindows work exactly as before (single ops array).
 *   - During burst windows of flash_crash scenarios, create_order uses
 *     generateFlashCrashSellPayload instead of the normal payload generator.
 *
 * Replay artifact writing:
 *   - When a replayEventsFilePath is provided, the engine writes a parallel
 *     replay-events.jsonl capturing the full request stream for later replay.
 *   - This is opt-in and backward compatible — existing callers pass undefined.
 */
import http from 'http';
import { BenchmarkScenario, BenchmarkEvent, ScenarioPhaseWindow } from './types';
import { createRng, weightedPick } from './rng';
import { generateOrderPayload, generateCancelPayload, generateFlashCrashSellPayload } from './payloads';
import { ReplayEvent } from './replay-types';
import { createReplayWriter, ReplayWriter } from './replay-writer';
import fs from 'fs';

const FLUSH_BATCH_SIZE = 200; // flush to disk every N events per worker

export interface EngineResult {
  events: BenchmarkEvent[];
  warmupCount: number;
  mainCount: number;
  replayEventsWritten: number;
}

// ── Phase-window resolution ─────────────────────────────────────────────

/**
 * Given elapsed seconds into the main phase, determine which phase window
 * is active. Returns undefined if no phaseWindows are defined (legacy mode).
 *
 * Windows are sorted by offsetSeconds; the last window whose offset
 * has been reached is the active one.
 */
function resolveActiveWindow(
  phaseWindows: ScenarioPhaseWindow[] | undefined,
  elapsedMainSeconds: number
): ScenarioPhaseWindow | undefined {
  if (!phaseWindows || phaseWindows.length === 0) return undefined;

  let active: ScenarioPhaseWindow | undefined;
  for (const w of phaseWindows) {
    if (elapsedMainSeconds >= w.offsetSeconds) {
      active = w;
    }
  }
  return active;
}

/**
 * Check if we are currently in a "burst" window.
 * Convention: any phase window named 'burst' is a burst.
 */
function isBurstWindow(window: ScenarioPhaseWindow | undefined): boolean {
  return window?.name === 'burst';
}

/**
 * Execute the full benchmark scenario against the target.
 *
 * @param benchmarkRunId     for event tagging
 * @param baseUrl            e.g. "http://127.0.0.1:55803"
 * @param scenario           scenario definition
 * @param eventsFilePath     path to JSONL file for streaming writes
 * @param replayEventsFilePath  optional path for replay artifact writing
 */
export async function runBenchmark(
  benchmarkRunId: string,
  baseUrl: string,
  scenario: BenchmarkScenario,
  eventsFilePath: string,
  replayEventsFilePath?: string
): Promise<EngineResult> {
  const allEvents: BenchmarkEvent[] = [];
  const benchmarkStartTime = Date.now();
  const warmupEndTime = benchmarkStartTime + scenario.warmupSeconds * 1000;
  const mainEndTime = warmupEndTime + scenario.durationSeconds * 1000;

  // Pre-compute default weights (used when no phaseWindows or during warmup)
  const defaultWeights = scenario.operations.map(o => o.weight);

  // Open file for streaming writes
  const fileStream = fs.createWriteStream(eventsFilePath, { flags: 'w', encoding: 'utf8' });

  // Open replay writer if requested
  let replayWriter: ReplayWriter | null = null;
  if (replayEventsFilePath) {
    replayWriter = createReplayWriter(replayEventsFilePath);
  }

  let globalSeq = 0;
  let warmupCount = 0;
  let mainCount = 0;

  const workerPromises: Promise<void>[] = [];

  for (let wid = 0; wid < scenario.concurrency; wid++) {
    // Each worker gets its own RNG seeded from the global seed + worker id
    const workerRng = createRng(scenario.seed + wid * 7919);
    const batch: string[] = [];

    const workerFn = async () => {
      while (Date.now() < mainEndTime) {
        const now = Date.now();
        const phase: 'warmup' | 'main' = now < warmupEndTime ? 'warmup' : 'main';
        const seq = globalSeq++;

        // ── Resolve active operation mix ──────────────────────────────
        let activeOps = scenario.operations;
        let activeWeights = defaultWeights;
        let activeThinkTime = scenario.thinkTimeMs;
        let currentWindow: ScenarioPhaseWindow | undefined;

        if (phase === 'main' && scenario.phaseWindows) {
          const elapsedMainMs = now - warmupEndTime;
          const elapsedMainSec = elapsedMainMs / 1000;
          currentWindow = resolveActiveWindow(scenario.phaseWindows, elapsedMainSec);

          if (currentWindow) {
            activeOps = currentWindow.operations;
            activeWeights = currentWindow.operations.map(o => o.weight);
            if (currentWindow.thinkTimeMs !== undefined) {
              activeThinkTime = currentWindow.thinkTimeMs;
            }
          }
        }

        // Select operation from the active mix
        const opIdx = weightedPick(activeWeights, workerRng);
        const op = activeOps[opIdx];

        // ── Generate payload ──────────────────────────────────────────
        let body: string | null = null;
        if (op.operation === 'create_order') {
          // During burst windows, use flash-crash sell payloads
          if (isBurstWindow(currentWindow)) {
            body = JSON.stringify(generateFlashCrashSellPayload(workerRng, seq));
          } else {
            body = JSON.stringify(generateOrderPayload(workerRng, seq));
          }
        } else if (op.operation === 'cancel_order') {
          body = JSON.stringify(generateCancelPayload(workerRng, seq));
        }

        // ── Write replay event (before execution, captures intent) ────
        if (replayWriter) {
          const replayEvent: ReplayEvent = {
            sequence: seq,
            scheduledOffsetMs: now - benchmarkStartTime,
            workerId: wid,
            phase,
            operation: op.operation,
            method: op.method,
            path: op.path,
            payload: body,
            phaseWindow: currentWindow?.name
          };
          replayWriter.write(replayEvent);
        }

        // ── Execute request ───────────────────────────────────────────
        const startedAt = new Date();
        const startMs = Date.now();

        let statusCode = 0;
        let success = false;
        let errorType: string | null = null;

        try {
          const resp = await httpRequest(
            baseUrl + op.path,
            op.method,
            body,
            scenario.requestTimeoutMs
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
        const completedAt = new Date();

        const event: BenchmarkEvent = {
          benchmarkRunId,
          workerId: wid,
          sequenceNumber: seq,
          phase,
          operation: op.operation,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs,
          statusCode,
          success,
          errorType
        };

        allEvents.push(event);
        if (phase === 'warmup') warmupCount++;
        else mainCount++;

        // Batch flush to disk
        batch.push(JSON.stringify(event));
        if (batch.length >= FLUSH_BATCH_SIZE) {
          fileStream.write(batch.join('\n') + '\n');
          batch.length = 0;
        }

        // Think time (uses phase-window override if applicable)
        if (activeThinkTime > 0) {
          await sleep(activeThinkTime);
        }
      }

      // Flush remaining batch
      if (batch.length > 0) {
        fileStream.write(batch.join('\n') + '\n');
      }
    };

    workerPromises.push(workerFn());
  }

  await Promise.all(workerPromises);

  // Close file stream
  await new Promise<void>((resolve) => fileStream.end(resolve));

  // Close replay writer
  if (replayWriter) {
    await replayWriter.close();
  }

  return {
    events: allEvents,
    warmupCount,
    mainCount,
    replayEventsWritten: replayWriter?.count() ?? 0
  };
}

// ── HTTP request helper ───────────────────────────────────────────────────

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
