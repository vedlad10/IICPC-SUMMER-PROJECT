/**
 * Replay artifact writer.
 *
 * Captures the generated request stream during benchmark execution
 * into a replayable JSONL artifact. This runs alongside the existing
 * telemetry event writer without interfering with it.
 *
 * Each ReplayEvent captures:
 *   - the exact operation, method, path, and payload
 *   - the relative timing (scheduledOffsetMs from benchmark start)
 *   - the worker and phase context
 *
 * This is the write side of replay-v1. The read side is in replay.ts.
 */
import fs from 'fs';
import { ReplayEvent } from './replay-types';

const FLUSH_BATCH_SIZE = 200;

/**
 * Creates a replay stream writer that collects ReplayEvents
 * and flushes them to disk in batches.
 *
 * Usage:
 *   const writer = createReplayWriter('/path/to/replay-events.jsonl');
 *   writer.write(event);        // buffer + periodic flush
 *   await writer.close();       // final flush + close stream
 *   writer.count();             // number of events written
 */
export interface ReplayWriter {
  write(event: ReplayEvent): void;
  close(): Promise<void>;
  count(): number;
}

export function createReplayWriter(filePath: string): ReplayWriter {
  const stream = fs.createWriteStream(filePath, { flags: 'w', encoding: 'utf8' });
  const batch: string[] = [];
  let eventCount = 0;

  function flush(): void {
    if (batch.length > 0) {
      stream.write(batch.join('\n') + '\n');
      batch.length = 0;
    }
  }

  return {
    write(event: ReplayEvent): void {
      batch.push(JSON.stringify(event));
      eventCount++;
      if (batch.length >= FLUSH_BATCH_SIZE) {
        flush();
      }
    },

    async close(): Promise<void> {
      flush();
      await new Promise<void>((resolve) => stream.end(resolve));
    },

    count(): number {
      return eventCount;
    }
  };
}

/**
 * Load replay events from a JSONL file.
 *
 * Returns events sorted by scheduledOffsetMs for deterministic ordering.
 */
export function loadReplayEvents(filePath: string): ReplayEvent[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Replay events file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (content.length === 0) {
    return [];
  }

  const events = content
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as ReplayEvent);

  // Sort by scheduledOffsetMs for deterministic replay ordering
  events.sort((a, b) => a.scheduledOffsetMs - b.scheduledOffsetMs || a.sequence - b.sequence);

  return events;
}
