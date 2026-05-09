/**
 * Job claiming — atomically transitions one QUEUED BuildJob to IN_PROGRESS.
 *
 * Uses Prisma's updateMany + findFirst pattern to approximate an atomic claim.
 * This avoids double-claiming without requiring a queue system (acceptable for Phase 3).
 *
 * TODO(Phase 4): replace with a proper queue (BullMQ/Redis) for concurrent runners.
 */
import { prisma } from '@benchmark/db';
import type { BuildJob, Submission } from '@benchmark/db';

export interface ClaimedJob {
  buildJob: BuildJob;
  submission: Submission;
}

/**
 * Attempt to claim one queued BuildJob.
 * Returns null if no queued jobs are available.
 * Marks the claimed job as IN_PROGRESS with startedAt timestamp.
 */
export async function claimNextJob(): Promise<ClaimedJob | null> {
  // Step 1: Find the oldest queued job
  const candidate = await prisma.buildJob.findFirst({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    include: { submission: true }
  });

  if (!candidate) return null;

  // Step 2: Atomically claim it (updateMany returns count; 0 means someone else got it)
  const { count } = await prisma.buildJob.updateMany({
    where: { id: candidate.id, status: 'QUEUED' },
    data: { status: 'IN_PROGRESS', startedAt: new Date() }
  });

  if (count === 0) {
    // Race condition: another runner claimed it first. Try again recursively.
    return claimNextJob();
  }

  // Re-fetch with fresh data after claim
  const buildJob = await prisma.buildJob.findUniqueOrThrow({
    where: { id: candidate.id }
  });

  return { buildJob, submission: candidate.submission };
}
