/**
 * Typed API client for leaderboard-api.
 * All requests go through /api proxy → leaderboard-api on :3008.
 */

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────

export interface OverviewData {
  totalSubmissions: number;
  totalUsers: number;
  buildsSucceeded: number;
  buildsFailed: number;
  benchmarkedRuns: number;
  evaluatedRuns: number;
  rankedEntries: number;
  topScore: number | null;
}

export interface LeaderboardRow {
  rank: number;
  submissionId: string;
  engineName: string;
  developer: string;
  score: number;
  p99Ms: number;
  throughput: number;
  lastEvaluated: string | null;
}

export interface SubmissionRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  status: string;
  originalFilename: string | null;
  createdAt: string;
  pipelineStatus: string;
  latestScore: number | null;
  buildCount: number;
  runCount: number;
}

export interface SubmissionDetail {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  status: string;
  originalFilename: string | null;
  storedPath: string | null;
  mimeType: string | null;
  sizeBytes: string | null;
  uploadedAt: string | null;
  createdAt: string;
  pipelineStatus: string;
  buildJobs: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    buildExitCode: number | null;
    errorMessage: string | null;
    logPath: string | null;
  }>;
  benchmarkRuns: Array<RunSummary>;
}

export interface RunSummary {
  id: string;
  status: string;
  scenarioName: string | null;
  requestCount: number | null;
  successCount: number | null;
  failureCount: number | null;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  throughputRps: number | null;
  correctnessStatus: string | null;
  correctnessWarnings: number | null;
  correctnessFailures: number | null;
  scoreValue: number | null;
  rankingEligible: boolean;
  evaluatedAt: string | null;
  benchmarkStartedAt: string | null;
  benchmarkCompletedAt: string | null;
  score: ScoreBreakdown | null;
}

export interface ScoreBreakdown {
  latencyScore: number;
  throughputScore: number;
  errorRateScore: number;
  correctnessMultiplier: number;
  rawScore: number;
  totalScore: number;
}

export interface RunDetail extends RunSummary {
  submissionId: string;
  userEmail: string;
  containerId: string | null;
  runtimeHost: string | null;
  runtimePort: number | null;
  readinessAt: string | null;
  errorRate: number | null;
  correctnessReportPath: string | null;
  scoreReportPath: string | null;
  telemetryPath: string | null;
  summaryPath: string | null;
  errorMessage: string | null;
  benchmarkErrorMessage: string | null;
  createdAt: string;
}

// ── Pipeline Orchestrator types ──────────────────────────────────────────

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

// ── API calls ────────────────────────────────────────────────────────────

export const api = {
  getOverview: () => get<OverviewData>('/overview'),
  getLeaderboard: () => get<LeaderboardRow[]>('/leaderboard/top'),
  getRunScore: (id: string) => get<any>(`/runs/${id}/score`),
  getSubmissions: () => get<SubmissionRow[]>('/submissions'),
  getSubmission: (id: string) => get<SubmissionDetail>(`/submissions/${id}`),
  getRuns: (status?: string) => get<RunSummary[]>(status ? `/runs?status=${status}` : '/runs'),
  getRun: (id: string) => get<RunDetail>(`/runs/${id}`),
  getPipelineStatus: (submissionId: string) => get<PipelineState>(`/orchestrator/status/${submissionId}`),
  getPipelines: () => get<PipelineState[]>('/orchestrator/pipelines'),

  /** Upload file to submission-api, then trigger orchestrator pipeline */
  async uploadAndRun(file: File, userEmail: string, scenario: string = 'smoke'): Promise<{ submissionId: string }> {
    // 1. Upload to submission-api via proxy
    const form = new FormData();
    form.append('file', file);
    form.append('userEmail', userEmail);
    const uploadRes = await fetch('/submit-proxy', { method: 'POST', body: form });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
    const uploadData = await uploadRes.json() as any;

    const submissionId = uploadData.submissionId;
    const benchmarkRunId = uploadData.benchmarkRun?.id;
    const buildJobId = uploadData.buildJob?.id;

    // 2. Kick off orchestrator pipeline
    const orchRes = await fetch(`${BASE}/orchestrator/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, benchmarkRunId, buildJobId, userEmail, scenario })
    });
    if (!orchRes.ok) throw new Error(`Orchestrator failed: ${orchRes.status}`);

    return { submissionId };
  }
};
