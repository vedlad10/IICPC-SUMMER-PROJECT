/**
 * Atomic BenchmarkRun claiming.
 *
 * Only claims runs that:
 *   1. Are in QUEUED status
 *   2. Belong to a submission that has at least one SUCCESS BuildJob
 *
 * Uses the same updateMany count-check pattern as build-runner's claim.ts.
 * TODO(Phase N): Replace with BullMQ/Redis for concurrent sandbox runners.
 */
import { prisma } from '@benchmark/db';
import type { BenchmarkRun, Submission, BuildJob } from '@benchmark/db';

export interface ClaimedRun {
  benchmarkRun: BenchmarkRun;
  submission: Submission;
  buildJob: BuildJob;  // the successful BuildJob
}

/**
 * Attempt to claim one eligible queued BenchmarkRun.
 * Returns null if no eligible runs are available.
 */
export async function claimNextRun(): Promise<ClaimedRun | null> {
  // Step 1: Find oldest queued BenchmarkRun whose submission has a successful build
  const candidate = await prisma.benchmarkRun.findFirst({
    where: {
      status: 'QUEUED',
      submission: {
        buildJobs: {
          some: { status: 'SUCCESS' }
        }
      }
    },
    orderBy: { createdAt: 'asc' },
    include: {
      submission: {
        include: {
          buildJobs: {
            where: { status: 'SUCCESS' },
            orderBy: { completedAt: 'desc' },
            take: 1
          }
        }
      }
    }
  });

  if (!candidate) return null;

  const successfulBuild = candidate.submission.buildJobs[0];
  if (!successfulBuild) return null; // defensive

  // Step 2: Atomically claim it
  const { count } = await prisma.benchmarkRun.updateMany({
    where: { id: candidate.id, status: 'QUEUED' },
    data: { status: 'IN_PROGRESS', startedAt: new Date() }
  });

  if (count === 0) {
    // Race: another runner grabbed it, retry
    return claimNextRun();
  }

  // Re-fetch with fresh status
  const benchmarkRun = await prisma.benchmarkRun.findUniqueOrThrow({
    where: { id: candidate.id }
  });

  return {
    benchmarkRun,
    submission: candidate.submission,
    buildJob: successfulBuild
  };
}
