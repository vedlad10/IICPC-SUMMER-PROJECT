/**
 * Pipeline Orchestrator — fully automated submission → leaderboard flow.
 *
 * Chains: submit → build → sandbox → benchmark → correctness → scoring
 * Writes step events to an in-memory store (keyed by submissionId).
 * Frontend polls GET /orchestrator/status/:submissionId to drive the "thinking" UI.
 */

// ── Service URLs ──────────────────────────────────────────────────────────
const SUBMISSION_API = 'http://127.0.0.1:3001';
const BUILD_RUNNER   = 'http://127.0.0.1:3002';
const SANDBOX_MGR    = 'http://127.0.0.1:3003';
const LOAD_GEN       = 'http://127.0.0.1:3004';
const CORRECTNESS    = 'http://127.0.0.1:3006';
const SCORING        = 'http://127.0.0.1:3007';

// ── Step types ────────────────────────────────────────────────────────────
export type StepName =
  | 'SUBMISSION_RECEIVED'
  | 'BUILDING_IMAGE'
  | 'STARTING_SANDBOX'
  | 'RUNNING_BENCHMARK'
  | 'EVALUATING_CORRECTNESS'
  | 'COMPUTING_SCORE'
  | 'LEADERBOARD_UPDATED'
  | 'COMPLETE';

export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface PipelineStep {
  name: StepName;
  status: StepStatus;
  message: string;
  startedAt: string | null;
  completedAt: string | null;
  data: Record<string, unknown>;
}

export interface PipelineState {
  submissionId: string;
  benchmarkRunId: string | null;
  scenario: string;
  userEmail: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  steps: PipelineStep[];
  createdAt: string;
  explanation: string | null;
}

// ── In-memory store ───────────────────────────────────────────────────────
const pipelines = new Map<string, PipelineState>();

export function getPipelineState(submissionId: string): PipelineState | undefined {
  return pipelines.get(submissionId);
}

export function getAllPipelines(): PipelineState[] {
  return Array.from(pipelines.values()).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ── Step templates ────────────────────────────────────────────────────────
const STEP_NAMES: StepName[] = [
  'SUBMISSION_RECEIVED',
  'BUILDING_IMAGE',
  'STARTING_SANDBOX',
  'RUNNING_BENCHMARK',
  'EVALUATING_CORRECTNESS',
  'COMPUTING_SCORE',
  'LEADERBOARD_UPDATED',
  'COMPLETE'
];

function makeSteps(): PipelineStep[] {
  return STEP_NAMES.map(name => ({
    name,
    status: 'PENDING',
    message: '',
    startedAt: null,
    completedAt: null,
    data: {}
  }));
}

function setStep(state: PipelineState, name: StepName, status: StepStatus, message: string, data: Record<string, unknown> = {}) {
  const step = state.steps.find(s => s.name === name);
  if (!step) return;
  step.status = status;
  step.message = message;
  step.data = { ...step.data, ...data };
  if (status === 'IN_PROGRESS' && !step.startedAt) step.startedAt = new Date().toISOString();
  if (status === 'DONE' || status === 'FAILED') step.completedAt = new Date().toISOString();
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function postJson(url: string): Promise<any> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  return r.json();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function buildExplanation(state: PipelineState): string {
  const steps = state.steps;
  const bench = steps.find(s => s.name === 'RUNNING_BENCHMARK');
  const corr = steps.find(s => s.name === 'EVALUATING_CORRECTNESS');
  const score = steps.find(s => s.name === 'COMPUTING_SCORE');

  const parts: string[] = [
    `We received your engine submission and built it into a Docker image.`,
  ];

  if (bench?.data?.totalRequests) {
    parts.push(
      `We ran a "${state.scenario}" benchmark: ${bench.data.totalRequests} requests at ${bench.data.throughputRps} rps, with a p95 latency of ${bench.data.p95LatencyMs} ms and ${bench.data.errorRate}% error rate.`
    );
  }

  if (corr?.data?.correctnessStatus) {
    parts.push(
      `Correctness evaluation: ${corr.data.correctnessStatus} (${corr.data.warnings ?? 0} warnings, ${corr.data.failures ?? 0} failures). ${corr.data.eligible ? 'Your run IS eligible for ranking.' : 'Your run is NOT eligible for ranking.'}`
    );
  }

  if (score?.data?.finalScore != null) {
    parts.push(
      `Final score: ${score.data.finalScore}/100. Breakdown: latency=${score.data.latencyScore}, throughput=${score.data.throughputScore}, errorRate=${score.data.errorRateScore}, multiplied by correctness factor ${score.data.correctnessMultiplier}.`
    );
  }

  return parts.join(' ');
}

// ── Main pipeline runner (runs async in background) ──────────────────────
export async function runPipeline(
  submissionId: string,
  benchmarkRunId: string,
  buildJobId: string,
  userEmail: string,
  scenario: string
): Promise<void> {
  const state: PipelineState = {
    submissionId,
    benchmarkRunId,
    scenario,
    userEmail,
    status: 'RUNNING',
    steps: makeSteps(),
    createdAt: new Date().toISOString(),
    explanation: null
  };
  pipelines.set(submissionId, state);

  // 1. SUBMISSION_RECEIVED
  setStep(state, 'SUBMISSION_RECEIVED', 'DONE', `Submission ${submissionId.slice(0, 8)}… created`, { submissionId, buildJobId, benchmarkRunId });

  try {
    // 2. BUILDING_IMAGE
    setStep(state, 'BUILDING_IMAGE', 'IN_PROGRESS', 'Building Docker image from your ZIP…');
    const buildResult = await postJson(`${BUILD_RUNNER}/jobs/process-next`);
    if (buildResult.status === 'FAILED') {
      setStep(state, 'BUILDING_IMAGE', 'FAILED', `Build failed: ${buildResult.error || 'unknown'}`);
      state.status = 'FAILED';
      state.explanation = `Build failed: ${buildResult.error}. Please check your Dockerfile and benchmark.manifest.json.`;
      return;
    }
    setStep(state, 'BUILDING_IMAGE', 'DONE', `Image built successfully`, { buildJobId: buildResult.buildJobId });

    // 3. STARTING_SANDBOX
    setStep(state, 'STARTING_SANDBOX', 'IN_PROGRESS', 'Spinning up isolated container…');
    const sandboxResult = await postJson(`${SANDBOX_MGR}/runs/process-next`);
    if (!sandboxResult.claimed) {
      setStep(state, 'STARTING_SANDBOX', 'FAILED', 'No eligible runs to sandbox');
      state.status = 'FAILED';
      state.explanation = 'Sandbox failed to start. The build may not have completed properly.';
      return;
    }
    const runtimePort = sandboxResult.runtimePort;
    const containerId = sandboxResult.containerId?.slice(0, 12) || 'unknown';
    setStep(state, 'STARTING_SANDBOX', 'DONE', `Container ${containerId}… started on port ${runtimePort}`, {
      runtimeHost: sandboxResult.runtimeHost,
      runtimePort,
      containerId: sandboxResult.containerId
    });

    // 4. RUNNING_BENCHMARK
    setStep(state, 'RUNNING_BENCHMARK', 'IN_PROGRESS', `Running "${scenario}" scenario…`);
    const benchResult = await postJson(`${LOAD_GEN}/benchmarks/process-next?scenario=${scenario}`);
    if (!benchResult.claimed) {
      setStep(state, 'RUNNING_BENCHMARK', 'FAILED', 'No READY benchmark runs available');
      state.status = 'FAILED';
      state.explanation = 'Benchmark could not start. The sandbox may have failed readiness checks.';
      return;
    }
    const s = benchResult.summary || {};
    setStep(state, 'RUNNING_BENCHMARK', 'DONE',
      `${s.totalRequests ?? '?'} requests · ${s.throughputRps?.toFixed(1) ?? '?'} rps · p95 ${s.p95LatencyMs?.toFixed(1) ?? '?'} ms · ${((s.errorRate ?? 0) * 100).toFixed(1)}% errors`,
      {
        totalRequests: s.totalRequests,
        throughputRps: s.throughputRps?.toFixed(1),
        p95LatencyMs: s.p95LatencyMs?.toFixed(1),
        errorRate: ((s.errorRate ?? 0) * 100).toFixed(1),
        avgLatencyMs: s.avgLatencyMs?.toFixed(1),
        scenarioName: s.scenarioName
      }
    );

    // Small delay before correctness
    await sleep(300);

    // 5. EVALUATING_CORRECTNESS
    setStep(state, 'EVALUATING_CORRECTNESS', 'IN_PROGRESS', 'Analyzing response correctness…');
    const corrResult = await postJson(`${CORRECTNESS}/correctness/process-next`);
    if (corrResult.processed) {
      setStep(state, 'EVALUATING_CORRECTNESS', 'DONE',
        `${corrResult.correctnessStatus} (${corrResult.warnings ?? 0} warnings, ${corrResult.failures ?? 0} failures)`,
        {
          correctnessStatus: corrResult.correctnessStatus,
          warnings: corrResult.warnings,
          failures: corrResult.failures,
          eligible: corrResult.rankingEligible
        }
      );
    } else {
      setStep(state, 'EVALUATING_CORRECTNESS', 'SKIPPED', corrResult.message || 'No eligible runs');
    }

    await sleep(300);

    // 6. COMPUTING_SCORE
    setStep(state, 'COMPUTING_SCORE', 'IN_PROGRESS', 'Computing final weighted score…');
    const scoreResult = await postJson(`${SCORING}/scores/process-next`);
    if (scoreResult.processed) {
      setStep(state, 'COMPUTING_SCORE', 'DONE',
        `Score: ${scoreResult.score?.toFixed(2) ?? '?'} / 100`,
        {
          finalScore: scoreResult.score?.toFixed(2),
          latencyScore: scoreResult.latencyScore?.toFixed(2),
          throughputScore: scoreResult.throughputScore?.toFixed(2),
          errorRateScore: scoreResult.errorRateScore?.toFixed(2),
          correctnessMultiplier: scoreResult.correctnessMultiplier
        }
      );
    } else {
      setStep(state, 'COMPUTING_SCORE', 'SKIPPED', scoreResult.message || 'No eligible runs');
    }

    // 7. LEADERBOARD_UPDATED
    setStep(state, 'LEADERBOARD_UPDATED', 'DONE', 'Leaderboard rankings refreshed');

    // 8. COMPLETE
    setStep(state, 'COMPLETE', 'DONE', 'Pipeline finished');
    state.status = 'COMPLETED';
    state.explanation = buildExplanation(state);

  } catch (err: any) {
    // Mark current in-progress step as failed
    const inProgress = state.steps.find(s => s.status === 'IN_PROGRESS');
    if (inProgress) {
      inProgress.status = 'FAILED';
      inProgress.message = `Error: ${err.message}`;
      inProgress.completedAt = new Date().toISOString();
    }
    state.status = 'FAILED';
    state.explanation = `Pipeline failed at step "${inProgress?.name}": ${err.message}`;
  }
}
