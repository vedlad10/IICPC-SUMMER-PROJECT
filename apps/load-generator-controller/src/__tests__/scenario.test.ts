/**
 * Unit tests for scenario selection, deterministic RNG, and flash_crash.
 * Run with: npx ts-node src/__tests__/scenario.test.ts
 */
import assert from 'assert';
import { createRng, weightedPick } from '../rng';
import {
  getScenario,
  listScenarios,
  SMOKE_SCENARIO,
  THROUGHPUT_SCENARIO,
  FLASH_CRASH_SCENARIO,
  buildFlashCrashScenario
} from '../scenarios';
import {
  generateOrderPayload,
  generateCancelPayload,
  generateFlashCrashSellPayload
} from '../payloads';
import { computeSummary } from '../summary';
import { BenchmarkEvent, BenchmarkScenario } from '../types';

// ── RNG determinism ─────────────────────────────────────────────────────

const rng1 = createRng(42);
const seq1 = Array.from({ length: 10 }, () => rng1());

const rng2 = createRng(42);
const seq2 = Array.from({ length: 10 }, () => rng2());

assert.deepStrictEqual(seq1, seq2, 'Same seed must produce same sequence');
console.log('✅ PASS: RNG is deterministic');

// Different seeds produce different sequences
const rng3 = createRng(99);
const seq3 = Array.from({ length: 10 }, () => rng3());
assert.notDeepStrictEqual(seq1, seq3, 'Different seeds must produce different sequences');
console.log('✅ PASS: Different seeds diverge');

// ── Weighted pick ───────────────────────────────────────────────────────

const weights = [50, 30, 15, 5]; // create_order, get_orderbook, cancel, health
const picks = new Map<number, number>();
const pickRng = createRng(42);
const N = 10_000;

for (let i = 0; i < N; i++) {
  const idx = weightedPick(weights, pickRng);
  picks.set(idx, (picks.get(idx) ?? 0) + 1);
}

// Verify distribution is approximately correct (within 5% tolerance)
const total = 100;
for (let i = 0; i < weights.length; i++) {
  const expected = weights[i] / total;
  const actual = (picks.get(i) ?? 0) / N;
  const diff = Math.abs(expected - actual);
  assert.ok(diff < 0.05, `Weight ${i}: expected ~${expected}, got ${actual}, diff=${diff}`);
}
console.log('✅ PASS: Weighted pick follows expected distribution');

// ── Scenario registry ───────────────────────────────────────────────────

const scenarios = listScenarios();
assert.ok(scenarios.includes('smoke'), 'smoke scenario must exist');
assert.ok(scenarios.includes('throughput'), 'throughput scenario must exist');
assert.ok(scenarios.includes('flash_crash'), 'flash_crash scenario must exist');
console.log(`✅ PASS: Scenarios available: ${scenarios.join(', ')}`);

const smoke = getScenario('smoke');
assert.strictEqual(smoke.name, 'smoke');
assert.strictEqual(smoke.seed, 42);
assert.strictEqual(smoke.concurrency, 2);
console.log('✅ PASS: smoke scenario properties correct');

const throughput = getScenario('throughput');
assert.strictEqual(throughput.concurrency, 10);
assert.strictEqual(throughput.durationSeconds, 30);
console.log('✅ PASS: throughput scenario properties correct');

const defaultScenario = getScenario('nonexistent');
assert.strictEqual(defaultScenario.name, 'smoke', 'Unknown scenario should default to smoke');
console.log('✅ PASS: Unknown scenario defaults to smoke');

// ── Payload determinism ─────────────────────────────────────────────────

const payloadRng1 = createRng(42);
const payload1 = generateOrderPayload(payloadRng1, 1);

const payloadRng2 = createRng(42);
const payload2 = generateOrderPayload(payloadRng2, 1);

assert.deepStrictEqual(payload1, payload2, 'Same seed must produce same payload');
assert.ok(payload1.side === 'buy' || payload1.side === 'sell');
assert.ok(payload1.price > 0);
assert.ok(payload1.quantity > 0);
assert.ok(payload1.symbol.length > 0);
console.log('✅ PASS: Order payload is deterministic and well-formed');

const cancelRng = createRng(42);
const cancel = generateCancelPayload(cancelRng, 5);
assert.ok(cancel.orderId.startsWith('order-'));
console.log('✅ PASS: Cancel payload well-formed');

// ══════════════════════════════════════════════════════════════════════════
//  FLASH_CRASH scenario tests
// ══════════════════════════════════════════════════════════════════════════

console.log('\n═══ Flash Crash Scenario Tests ═══\n');

// ── 1. flash_crash is registered and retrievable ────────────────────────

const flashCrash = getScenario('flash_crash');
assert.strictEqual(flashCrash.name, 'flash_crash');
console.log('✅ PASS: flash_crash scenario is registered and retrievable');

// ── 2. Duration, warmup, and timing properties ─────────────────────────

assert.ok(
  flashCrash.durationSeconds >= 15 && flashCrash.durationSeconds <= 25,
  `flash_crash duration should be 15–25s, got ${flashCrash.durationSeconds}`
);
assert.ok(
  flashCrash.warmupSeconds >= 3 && flashCrash.warmupSeconds <= 5,
  `flash_crash warmup should be 3–5s, got ${flashCrash.warmupSeconds}`
);
console.log(`✅ PASS: flash_crash timing: ${flashCrash.warmupSeconds}s warmup + ${flashCrash.durationSeconds}s main`);

// ── 3. Phase windows exist ──────────────────────────────────────────────

assert.ok(flashCrash.phaseWindows, 'flash_crash must have phaseWindows');
assert.ok(flashCrash.phaseWindows!.length >= 3, 'flash_crash needs at least 3 phase windows');

const phases = flashCrash.phaseWindows!;
const steadyPhase = phases.find(p => p.name === 'steady');
const burstPhase = phases.find(p => p.name === 'burst');
const cooldownPhase = phases.find(p => p.name === 'cooldown');

assert.ok(steadyPhase, 'steady phase must exist');
assert.ok(burstPhase, 'burst phase must exist');
assert.ok(cooldownPhase, 'cooldown phase must exist');
console.log('✅ PASS: flash_crash has steady, burst, and cooldown phases');

// ── 4. Burst window timing ─────────────────────────────────────────────

assert.ok(burstPhase!.offsetSeconds > 0, 'burst should not start at 0');
const burstDuration = cooldownPhase!.offsetSeconds - burstPhase!.offsetSeconds;
assert.ok(
  burstDuration >= 5 && burstDuration <= 10,
  `burst window should be 5–10s, got ${burstDuration}s`
);
console.log(`✅ PASS: burst window is ${burstDuration}s (offset ${burstPhase!.offsetSeconds}s–${cooldownPhase!.offsetSeconds}s)`);

// ── 5. Burst operation mix: create_order dominates ──────────────────────

const burstOps = burstPhase!.operations;
const burstTotalWeight = burstOps.reduce((s, o) => s + o.weight, 0);
const createOrderWeight = burstOps.find(o => o.operation === 'create_order')?.weight ?? 0;
const createOrderRatio = createOrderWeight / burstTotalWeight;

assert.ok(
  createOrderRatio >= 0.70,
  `burst create_order ratio should be ≥ 70%, got ${(createOrderRatio * 100).toFixed(1)}%`
);
console.log(`✅ PASS: burst create_order ratio = ${(createOrderRatio * 100).toFixed(1)}% (≥70%)`);

// Verify burst distribution statistically
const burstWeights = burstOps.map(o => o.weight);
const burstPicks = new Map<number, number>();
const burstRng = createRng(42);
const BURST_N = 10_000;

for (let i = 0; i < BURST_N; i++) {
  const idx = weightedPick(burstWeights, burstRng);
  burstPicks.set(idx, (burstPicks.get(idx) ?? 0) + 1);
}

const createOrderIdx = burstOps.findIndex(o => o.operation === 'create_order');
const createOrderPicks = (burstPicks.get(createOrderIdx) ?? 0) / BURST_N;
assert.ok(
  createOrderPicks >= 0.65,
  `Statistical: create_order picked ${(createOrderPicks * 100).toFixed(1)}% (expected ≥65%)`
);
console.log(`✅ PASS: burst weighted pick create_order = ${(createOrderPicks * 100).toFixed(1)}%`);

// ── 6. Burst thinkTimeMs is much lower than default ─────────────────────

assert.ok(
  burstPhase!.thinkTimeMs !== undefined && burstPhase!.thinkTimeMs < flashCrash.thinkTimeMs,
  `burst thinkTimeMs should be lower than default (${flashCrash.thinkTimeMs}ms)`
);
console.log(`✅ PASS: burst thinkTimeMs = ${burstPhase!.thinkTimeMs}ms (default = ${flashCrash.thinkTimeMs}ms)`);

// ── 7. Flash-crash sell payload generator ───────────────────────────────

const crashRng1 = createRng(42);
const crashPayload1 = generateFlashCrashSellPayload(crashRng1, 1);

const crashRng2 = createRng(42);
const crashPayload2 = generateFlashCrashSellPayload(crashRng2, 1);

assert.deepStrictEqual(crashPayload1, crashPayload2, 'Flash-crash sell payloads must be deterministic');
assert.strictEqual(crashPayload1.side, 'sell', 'Flash-crash orders must be sell-side');
assert.ok(crashPayload1.quantity >= 500 && crashPayload1.quantity <= 1000,
  `Flash-crash quantity should be 500–1000, got ${crashPayload1.quantity}`);
assert.strictEqual(crashPayload1.type, 'limit', 'Flash-crash orders should be limit type');
assert.ok(crashPayload1.clientOrderId.startsWith('crash-sell-'), 'Flash-crash orderId prefix');
console.log(`✅ PASS: Flash-crash sell payload: side=sell, qty=${crashPayload1.quantity}, type=limit`);

// ── 8. buildFlashCrashScenario seed override ────────────────────────────

const customSeed = buildFlashCrashScenario(12345);
assert.strictEqual(customSeed.name, 'flash_crash');
assert.strictEqual(customSeed.seed, 12345);
const defaultSeed = buildFlashCrashScenario();
assert.strictEqual(defaultSeed.seed, 0xDEAD);
console.log('✅ PASS: buildFlashCrashScenario supports seed override');

// ── 9. Summary detects burst metadata ───────────────────────────────────

function makeEvent(overrides: Partial<BenchmarkEvent>): BenchmarkEvent {
  return {
    benchmarkRunId: 'test-run',
    workerId: 0,
    sequenceNumber: 0,
    phase: 'main',
    operation: 'create_order',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:00:00.010Z',
    latencyMs: 10,
    statusCode: 200,
    success: true,
    errorType: null,
    ...overrides
  };
}

const flashCrashEvents: BenchmarkEvent[] = [
  makeEvent({ phase: 'warmup', latencyMs: 50 }),
  makeEvent({ phase: 'warmup', latencyMs: 60 }),
  makeEvent({ latencyMs: 5, operation: 'create_order' }),
  makeEvent({ latencyMs: 8, operation: 'create_order' }),
  makeEvent({ latencyMs: 15, operation: 'get_orderbook' }),
  makeEvent({ latencyMs: 20, operation: 'cancel_order' }),
];

const flashSummary = computeSummary(
  'test-run',
  flashCrashEvents,
  flashCrash,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:24Z'
);

assert.strictEqual(flashSummary.hasFlashCrashBurst, true, 'Summary should detect burst');
assert.strictEqual(flashSummary.burstWindowSeconds, burstDuration, 'Summary burst window duration');
assert.strictEqual(flashSummary.warmupRequests, 2);
assert.strictEqual(flashSummary.totalRequests, 4);
console.log(`✅ PASS: Summary hasFlashCrashBurst=true, burstWindowSeconds=${flashSummary.burstWindowSeconds}`);

// ── 10. Smoke/throughput scenarios do NOT have burst metadata ───────────

const smokeEvents = [
  makeEvent({ phase: 'warmup', latencyMs: 10 }),
  makeEvent({ latencyMs: 5 }),
];
const smokeSummary = computeSummary(
  'test-run', smokeEvents, smoke,
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z'
);
assert.strictEqual(smokeSummary.hasFlashCrashBurst, undefined, 'Smoke should not have burst metadata');
assert.strictEqual(smokeSummary.burstWindowSeconds, undefined);
console.log('✅ PASS: Smoke scenario summary has no burst metadata (backward compatible)');

// ── 11. Existing scenario behavior unchanged ────────────────────────────

assert.strictEqual(smoke.phaseWindows, undefined, 'Smoke must NOT have phaseWindows');
assert.strictEqual(throughput.phaseWindows, undefined, 'Throughput must NOT have phaseWindows');
console.log('✅ PASS: Existing scenarios have no phaseWindows (fully backward compatible)');

console.log('\n✅ All scenario, RNG, and flash_crash tests passed');
