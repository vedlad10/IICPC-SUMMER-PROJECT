/**
 * Tests for deterministic replay (v1).
 *
 * Covers:
 *   1. Replay artifact writer — serialization + batch flushing
 *   2. Replay event loader — parsing + sorting
 *   3. Timing and ordering — scheduled offset preservation
 *   4. Integration — mock HTTP server + full replay execution
 *
 * Run with: npx ts-node src/__tests__/replay.test.ts
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { ReplayEvent } from '../replay-types';
import { createReplayWriter, loadReplayEvents } from '../replay-writer';
import { executeReplay } from '../replay';

const TEST_DIR = path.join(__dirname, '..', '..', '__test-replay-artifacts__');

function ensureTestDir() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ── Test fixtures ─────────────────────────────────────────────────────────

function makeSyntheticEvents(count: number): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      sequence: i,
      scheduledOffsetMs: i * 100,  // 100ms apart
      workerId: i % 3,
      phase: i < 2 ? 'warmup' : 'main',
      operation: i % 3 === 0 ? 'create_order' : i % 3 === 1 ? 'get_orderbook' : 'cancel_order',
      method: i % 3 === 0 || i % 3 === 2 ? 'POST' : 'GET',
      path: i % 3 === 0 ? '/orders' : i % 3 === 1 ? '/orderbook' : '/cancel',
      payload: i % 3 === 0 ? JSON.stringify({ side: 'buy', price: 100 + i, quantity: 10 }) : null,
      phaseWindow: undefined
    });
  }
  return events;
}

// ══════════════════════════════════════════════════════════════════════════

async function runAllTests() {

  // ══════════════════════════════════════════════════════════════════════
  //  1. Replay Writer Tests
  // ══════════════════════════════════════════════════════════════════════

  console.log('═══ Replay Writer Tests ═══\n');

  ensureTestDir();

  const writerPath = path.join(TEST_DIR, 'test-write.jsonl');
  const writer = createReplayWriter(writerPath);

  const testEvents = makeSyntheticEvents(5);
  for (const event of testEvents) {
    writer.write(event);
  }
  await writer.close();

  assert.strictEqual(writer.count(), 5, 'Writer should report 5 events');
  console.log('✅ PASS: Writer count is correct');

  assert.ok(fs.existsSync(writerPath), 'JSONL file should exist');
  const lines = fs.readFileSync(writerPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 5, 'File should have 5 lines');
  console.log('✅ PASS: JSONL file has correct number of lines');

  for (let i = 0; i < lines.length; i++) {
    const parsed = JSON.parse(lines[i]) as ReplayEvent;
    assert.strictEqual(parsed.sequence, testEvents[i].sequence, `Line ${i} sequence mismatch`);
    assert.strictEqual(parsed.operation, testEvents[i].operation, `Line ${i} operation mismatch`);
    assert.strictEqual(parsed.scheduledOffsetMs, testEvents[i].scheduledOffsetMs);
    assert.strictEqual(parsed.payload, testEvents[i].payload);
  }
  console.log('✅ PASS: Written events match original data');

  // ══════════════════════════════════════════════════════════════════════
  //  2. Replay Loader Tests
  // ══════════════════════════════════════════════════════════════════════

  console.log('\n═══ Replay Loader Tests ═══\n');

  const loaded = loadReplayEvents(writerPath);
  assert.strictEqual(loaded.length, 5, 'Loader should return 5 events');
  console.log('✅ PASS: Loader returns correct count');

  for (let i = 1; i < loaded.length; i++) {
    assert.ok(
      loaded[i].scheduledOffsetMs >= loaded[i - 1].scheduledOffsetMs,
      `Events should be sorted by scheduledOffsetMs`
    );
  }
  console.log('✅ PASS: Loaded events are sorted by scheduledOffsetMs');

  // Out-of-order events get sorted
  const unsortedPath = path.join(TEST_DIR, 'test-unsorted.jsonl');
  const unsortedWriter = createReplayWriter(unsortedPath);
  unsortedWriter.write({ ...testEvents[3], sequence: 3 });
  unsortedWriter.write({ ...testEvents[0], sequence: 0 });
  unsortedWriter.write({ ...testEvents[4], sequence: 4 });
  unsortedWriter.write({ ...testEvents[1], sequence: 1 });
  unsortedWriter.write({ ...testEvents[2], sequence: 2 });
  await unsortedWriter.close();

  const sortedLoaded = loadReplayEvents(unsortedPath);
  assert.deepStrictEqual(
    sortedLoaded.map(e => e.sequence),
    [0, 1, 2, 3, 4],
    'Out-of-order events should be sorted'
  );
  console.log('✅ PASS: Out-of-order events are sorted correctly');

  // Missing file throws
  let missingThrew = false;
  try {
    loadReplayEvents(path.join(TEST_DIR, 'nonexistent.jsonl'));
  } catch (err: any) {
    missingThrew = true;
    assert.ok(err.message.includes('not found'));
  }
  assert.ok(missingThrew, 'Missing file should throw');
  console.log('✅ PASS: Missing file throws descriptive error');

  // Empty file
  const emptyPath = path.join(TEST_DIR, 'test-empty.jsonl');
  fs.writeFileSync(emptyPath, '', 'utf8');
  const emptyEvents = loadReplayEvents(emptyPath);
  assert.strictEqual(emptyEvents.length, 0, 'Empty file should return empty array');
  console.log('✅ PASS: Empty file returns empty array');

  // ══════════════════════════════════════════════════════════════════════
  //  3. Timing / Ordering Tests
  // ══════════════════════════════════════════════════════════════════════

  console.log('\n═══ Timing & Ordering Tests ═══\n');

  const timingEvents: ReplayEvent[] = [
    { sequence: 0, scheduledOffsetMs: 0,   workerId: 0, phase: 'main', operation: 'health',        method: 'GET',  path: '/health',    payload: null },
    { sequence: 1, scheduledOffsetMs: 0,   workerId: 1, phase: 'main', operation: 'health',        method: 'GET',  path: '/health',    payload: null },
    { sequence: 2, scheduledOffsetMs: 50,  workerId: 0, phase: 'main', operation: 'create_order',  method: 'POST', path: '/orders',    payload: '{"side":"buy"}' },
    { sequence: 3, scheduledOffsetMs: 50,  workerId: 1, phase: 'main', operation: 'get_orderbook', method: 'GET',  path: '/orderbook', payload: null },
    { sequence: 4, scheduledOffsetMs: 100, workerId: 0, phase: 'main', operation: 'cancel_order',  method: 'POST', path: '/cancel',    payload: '{"orderId":"x"}' },
  ];

  const timingPath = path.join(TEST_DIR, 'test-timing.jsonl');
  const timingWriter = createReplayWriter(timingPath);
  for (const e of timingEvents) timingWriter.write(e);
  await timingWriter.close();

  const loadedTiming = loadReplayEvents(timingPath);
  assert.strictEqual(loadedTiming.length, 5);

  const at0 = loadedTiming.filter(e => e.scheduledOffsetMs === 0);
  const at50 = loadedTiming.filter(e => e.scheduledOffsetMs === 50);
  assert.strictEqual(at0.length, 2, 'Two events at offset 0');
  assert.strictEqual(at50.length, 2, 'Two events at offset 50');
  console.log('✅ PASS: Overlapping scheduled offsets preserved (natural concurrency)');

  const at0Workers = at0.map(e => e.workerId).sort();
  assert.deepStrictEqual(at0Workers, [0, 1], 'Events at offset 0 from different workers');
  console.log('✅ PASS: Concurrent events come from different workers');

  // ══════════════════════════════════════════════════════════════════════
  //  4. Integration Test — Mock server + full replay
  // ══════════════════════════════════════════════════════════════════════

  console.log('\n═══ Replay Integration Test ═══\n');

  const receivedRequests: { method: string; path: string; body: string }[] = [];

  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      receivedRequests.push({
        method: req.method ?? 'GET',
        path: req.url ?? '/',
        body
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockAddr = mockServer.address() as { port: number };
  const mockBaseUrl = `http://127.0.0.1:${mockAddr.port}`;

  console.log(`  Mock server listening on ${mockBaseUrl}`);

  // Create 8 replay events (2 warmup + 6 main)
  const integrationEvents: ReplayEvent[] = [
    { sequence: 0, scheduledOffsetMs: 0,   workerId: 0, phase: 'warmup', operation: 'health',        method: 'GET',  path: '/health',    payload: null },
    { sequence: 1, scheduledOffsetMs: 10,  workerId: 0, phase: 'warmup', operation: 'health',        method: 'GET',  path: '/health',    payload: null },
    { sequence: 2, scheduledOffsetMs: 20,  workerId: 0, phase: 'main',   operation: 'create_order',  method: 'POST', path: '/orders',    payload: '{"side":"buy","price":100}' },
    { sequence: 3, scheduledOffsetMs: 30,  workerId: 1, phase: 'main',   operation: 'get_orderbook', method: 'GET',  path: '/orderbook', payload: null },
    { sequence: 4, scheduledOffsetMs: 40,  workerId: 0, phase: 'main',   operation: 'cancel_order',  method: 'POST', path: '/cancel',    payload: '{"orderId":"ord-1"}' },
    { sequence: 5, scheduledOffsetMs: 50,  workerId: 1, phase: 'main',   operation: 'create_order',  method: 'POST', path: '/orders',    payload: '{"side":"sell","price":200}' },
    { sequence: 6, scheduledOffsetMs: 60,  workerId: 0, phase: 'main',   operation: 'get_orderbook', method: 'GET',  path: '/orderbook', payload: null },
    { sequence: 7, scheduledOffsetMs: 70,  workerId: 1, phase: 'main',   operation: 'health',        method: 'GET',  path: '/health',    payload: null },
  ];

  const integrationPath = path.join(TEST_DIR, 'integration-events.jsonl');
  const integrationWriter = createReplayWriter(integrationPath);
  for (const e of integrationEvents) integrationWriter.write(e);
  await integrationWriter.close();

  const loadedIntegration = loadReplayEvents(integrationPath);
  assert.strictEqual(loadedIntegration.length, 8);

  // Execute replay (all events including warmup, at 10x speed)
  const responsesPath = path.join(TEST_DIR, 'integration-responses.jsonl');
  const result = await executeReplay(
    'test-benchmark-run',
    loadedIntegration,
    {
      baseUrl: mockBaseUrl,
      requestTimeoutMs: 5000,
      includeWarmup: true,
      speedMultiplier: 10.0
    },
    responsesPath
  );

  // ── Verify result metrics ──────────────────────────────────────────
  assert.strictEqual(result.benchmarkRunId, 'test-benchmark-run');
  assert.strictEqual(result.replayVersion, 'v1');
  assert.strictEqual(result.totalRequests, 8, 'Should replay all 8 events');
  assert.strictEqual(result.successfulRequests, 8, 'All should succeed against mock');
  assert.strictEqual(result.failedRequests, 0);
  assert.strictEqual(result.errorRate, 0);
  assert.strictEqual(result.skippedEvents, 0, 'No events skipped');
  assert.strictEqual(result.totalReplayEvents, 8);
  assert.strictEqual(result.speedMultiplier, 10.0);
  assert.ok(result.replayDurationMs >= 0, 'Duration should be non-negative');
  assert.ok(result.avgLatencyMs >= 0, 'Avg latency should be non-negative');
  console.log('✅ PASS: Replay result metrics are correct');

  // ── Verify per-operation breakdown ─────────────────────────────────
  const ops = result.perOperation.map(o => o.operation).sort();
  assert.ok(ops.includes('create_order'));
  assert.ok(ops.includes('get_orderbook'));
  assert.ok(ops.includes('health'));
  assert.ok(ops.includes('cancel_order'));

  const createOp = result.perOperation.find(o => o.operation === 'create_order')!;
  assert.strictEqual(createOp.count, 2);
  assert.strictEqual(createOp.successCount, 2);
  console.log('✅ PASS: Per-operation breakdown is correct');

  // ── Verify mock received all requests ──────────────────────────────
  assert.strictEqual(receivedRequests.length, 8, 'Mock received 8 requests');
  console.log('✅ PASS: Mock server received all 8 requests');

  // Verify payloads delivered correctly
  const postRequests = receivedRequests.filter(r => r.method === 'POST');
  assert.ok(postRequests.length >= 3, 'At least 3 POST requests');
  const orderPost = postRequests.find(r => r.path === '/orders');
  assert.ok(orderPost);
  assert.ok(orderPost!.body.includes('"side"'), 'POST body contains side field');
  console.log('✅ PASS: Payloads delivered correctly');

  // ── Verify response artifact ───────────────────────────────────────
  assert.ok(fs.existsSync(responsesPath), 'Responses JSONL exists');
  const responseLines = fs.readFileSync(responsesPath, 'utf8').trim().split('\n');
  assert.strictEqual(responseLines.length, 8);
  const parsedResponse = JSON.parse(responseLines[0]);
  assert.ok('sequence' in parsedResponse);
  assert.ok('statusCode' in parsedResponse);
  assert.ok('latencyMs' in parsedResponse);
  console.log('✅ PASS: Replay response artifact written correctly');

  // ── Test warmup exclusion ──────────────────────────────────────────
  receivedRequests.length = 0;

  const resultNoWarmup = await executeReplay(
    'test-no-warmup',
    loadedIntegration,
    {
      baseUrl: mockBaseUrl,
      requestTimeoutMs: 5000,
      includeWarmup: false,
      speedMultiplier: 10.0
    }
  );

  assert.strictEqual(resultNoWarmup.totalRequests, 6, 'Only 6 main events');
  assert.strictEqual(resultNoWarmup.skippedEvents, 2, '2 warmup skipped');
  assert.strictEqual(resultNoWarmup.totalReplayEvents, 8);
  assert.strictEqual(receivedRequests.length, 6, 'Mock received 6');
  console.log('✅ PASS: Warmup exclusion works correctly');

  // ── Cleanup ────────────────────────────────────────────────────────
  mockServer.close();
  cleanupTestDir();

  console.log('\n✅ All replay tests passed');
}

runAllTests().catch(err => {
  console.error('❌ Test failure:', err);
  process.exit(1);
});
