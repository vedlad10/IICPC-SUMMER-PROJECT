/**
 * Structured log accumulator for a single BuildJob run.
 *
 * Collects LogEntry objects in memory during processing,
 * then flushes the full array to disk as a JSON file.
 */
import fs from 'fs';
import { LogEntry } from './types';
import { logFilePath } from './workspace';

export class BuildLogger {
  private entries: LogEntry[] = [];
  private buildJobId: string;

  constructor(buildJobId: string) {
    this.buildJobId = buildJobId;
  }

  log(step: string, level: LogEntry['level'], msg: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      step,
      level,
      msg,
      ...(data ? { data } : {})
    };
    this.entries.push(entry);
    // Mirror to process stdout so docker/pino picks it up
    const prefix = `[build-runner][${step}][${level.toUpperCase()}]`;
    console.log(`${prefix} ${msg}`, data ?? '');
  }

  info(step: string, msg: string, data?: Record<string, unknown>): void {
    this.log(step, 'info', msg, data);
  }

  warn(step: string, msg: string, data?: Record<string, unknown>): void {
    this.log(step, 'warn', msg, data);
  }

  error(step: string, msg: string, data?: Record<string, unknown>): void {
    this.log(step, 'error', msg, data);
  }

  /** Flush all accumulated log entries to disk */
  flush(): void {
    const filePath = logFilePath(this.buildJobId);
    fs.writeFileSync(filePath, JSON.stringify(this.entries, null, 2), 'utf8');
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }
}
