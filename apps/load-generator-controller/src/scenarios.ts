/**
 * Benchmark scenario definitions.
 *
 * Each scenario describes a deterministic, repeatable benchmark profile.
 * The same seed + scenario always produces the same traffic pattern.
 */
import { BenchmarkScenario, OperationMix, ScenarioPhaseWindow } from './types';

// ── Default operations (order-book HTTP contract) ─────────────────────────

const ORDER_BOOK_OPS: OperationMix[] = [
  { operation: 'create_order',  weight: 50, method: 'POST', path: '/orders' },
  { operation: 'cancel_order',  weight: 15, method: 'POST', path: '/cancel' },
  { operation: 'get_orderbook', weight: 30, method: 'GET',  path: '/orderbook' },
  { operation: 'health',        weight: 5,  method: 'GET',  path: '/health' }
];

// ── Scenario: smoke ───────────────────────────────────────────────────────

export const SMOKE_SCENARIO: BenchmarkScenario = {
  name: 'smoke',
  durationSeconds: 10,
  warmupSeconds: 2,
  concurrency: 2,
  seed: 42,
  requestTimeoutMs: 5_000,
  thinkTimeMs: 100,
  operations: ORDER_BOOK_OPS
};

// ── Scenario: throughput ──────────────────────────────────────────────────

export const THROUGHPUT_SCENARIO: BenchmarkScenario = {
  name: 'throughput',
  durationSeconds: 30,
  warmupSeconds: 5,
  concurrency: 10,
  seed: 42,
  requestTimeoutMs: 5_000,
  thinkTimeMs: 10,
  operations: ORDER_BOOK_OPS
};

// ── Scenario: flash_crash ─────────────────────────────────────────────────
//
// Simulates a latency/volume shock to stress-test order-book engines.
//
// Timeline (20s total + 4s warmup = ~24s wall clock):
//   warmup:   0s–4s   normal traffic at low concurrency (phase="warmup")
//   steady:   0s–4s   main-phase normal traffic (phase="main")
//   burst:    4s–12s  intense sell-heavy traffic (phase="main")
//   cooldown: 12s–20s return to normal traffic (phase="main")
//
// The burst window:
//   - create_order dominates at 75% weight
//   - Engine uses generateFlashCrashSellPayload for create_order ops
//   - thinkTimeMs drops to 2ms (much higher effective RPS)
//   - cancel_order at 10% and get_orderbook at 15%
//

/** Steady-state operation mix (used during warmup, pre-burst, and cooldown) */
const FLASH_CRASH_STEADY_OPS: OperationMix[] = [
  { operation: 'create_order',  weight: 45, method: 'POST', path: '/orders' },
  { operation: 'cancel_order',  weight: 20, method: 'POST', path: '/cancel' },
  { operation: 'get_orderbook', weight: 30, method: 'GET',  path: '/orderbook' },
  { operation: 'health',        weight: 5,  method: 'GET',  path: '/health' }
];

/** Burst-phase operation mix: sell-heavy, high-volume */
const FLASH_CRASH_BURST_OPS: OperationMix[] = [
  { operation: 'create_order',  weight: 75, method: 'POST', path: '/orders' },
  { operation: 'cancel_order',  weight: 10, method: 'POST', path: '/cancel' },
  { operation: 'get_orderbook', weight: 15, method: 'GET',  path: '/orderbook' }
  // No health checks during burst — maximize pressure
];

const FLASH_CRASH_PHASES: ScenarioPhaseWindow[] = [
  {
    name: 'steady',
    offsetSeconds: 0,
    operations: FLASH_CRASH_STEADY_OPS,
    thinkTimeMs: 30           // moderate pace during pre-burst
  },
  {
    name: 'burst',
    offsetSeconds: 4,         // burst starts 4s into main phase
    operations: FLASH_CRASH_BURST_OPS,
    thinkTimeMs: 2            // very fast — stress test
  },
  {
    name: 'cooldown',
    offsetSeconds: 12,        // burst ends at 12s, cooldown begins
    operations: FLASH_CRASH_STEADY_OPS,
    thinkTimeMs: 30           // back to moderate pace
  }
];

export function buildFlashCrashScenario(seedOverride?: number): BenchmarkScenario {
  return {
    name: 'flash_crash',
    durationSeconds: 20,        // main-phase duration (excludes warmup)
    warmupSeconds: 4,           // warmup before main phase
    concurrency: 8,             // high concurrency to amplify burst
    seed: seedOverride ?? 0xDEAD,
    requestTimeoutMs: 5_000,
    thinkTimeMs: 30,            // default think time (overridden per phase)
    operations: FLASH_CRASH_STEADY_OPS,  // fallback for non-phase-aware code
    phaseWindows: FLASH_CRASH_PHASES
  };
}

export const FLASH_CRASH_SCENARIO = buildFlashCrashScenario();

// ── Scenario registry ─────────────────────────────────────────────────────

const SCENARIOS: Record<string, BenchmarkScenario> = {
  smoke: SMOKE_SCENARIO,
  throughput: THROUGHPUT_SCENARIO,
  flash_crash: FLASH_CRASH_SCENARIO
};

export function getScenario(name?: string): BenchmarkScenario {
  if (name && SCENARIOS[name]) return SCENARIOS[name];
  return SMOKE_SCENARIO; // default
}

export function listScenarios(): string[] {
  return Object.keys(SCENARIOS);
}
