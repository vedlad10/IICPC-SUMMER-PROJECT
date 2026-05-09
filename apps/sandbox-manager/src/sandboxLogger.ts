/**
 * Structured log accumulator for sandbox lifecycle events.
 * Same pattern as build-runner's BuildLogger.
 */
import fs from 'fs';
import { SandboxLogEntry } from './types';

export class SandboxLogger {
  private entries: SandboxLogEntry[] = [];
  private benchmarkRunId: string;

  constructor(benchmarkRunId: string) {
    this.benchmarkRunId = benchmarkRunId;
  }

  log(step: string, level: SandboxLogEntry['level'], msg: string, data?: Record<string, unknown>): void {
    const entry: SandboxLogEntry = {
      ts: new Date().toISOString(),
      step,
      level,
      msg,
      ...(data ? { data } : {})
    };
    this.entries.push(entry);
    const prefix = `[sandbox-manager][${step}][${level.toUpperCase()}]`;
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

  /** Flush accumulated entries to a specific file path */
  flush(filePath: string): void {
    fs.writeFileSync(filePath, JSON.stringify(this.entries, null, 2), 'utf8');
  }

  getEntries(): SandboxLogEntry[] {
    return [...this.entries];
  }
}
