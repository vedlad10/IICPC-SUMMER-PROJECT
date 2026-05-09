/**
 * Build command executor.
 *
 * Runs the manifest's `build` command in the extracted workspace with:
 * - configurable timeout (default 120s)
 * - captured stdout + stderr
 * - exit code recording
 * - never runs the `run` command
 *
 * SAFETY: The build command comes from the contestant's benchmark.manifest.json.
 * In this phase it runs on the host (no sandbox). Phase 4 will wrap this in
 * an isolated container via gVisor / Docker.
 */
import { spawn } from 'child_process';
import { BuildLogger } from './buildLogger';

const DEFAULT_TIMEOUT_MS = 120_000; // 120 seconds

export interface ExecutionResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Execute a shell command string in cwd with a timeout.
 * Returns structured result including captured streams and exit code.
 */
export async function runCommand(
  command: string,
  cwd: string,
  logger: BuildLogger,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ExecutionResult> {
  const startTs = Date.now();

  logger.info('build', `Executing build command`, { command, cwd, timeoutMs });

  return new Promise((resolve) => {
    // Use shell: true so manifest build commands like "npm install && npm run build" work.
    // Phase 4 will replace this with container-spawned execution.
    const child = spawn(command, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        // Strip any caller-injected vars that could affect host system state
        HOME: cwd,
        TMPDIR: cwd
      }
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
      logger.warn('build', `Build command timed out after ${timeoutMs}ms, sending SIGKILL`);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdoutChunks.push(text);
      logger.info('build:stdout', text.trimEnd());
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderrChunks.push(text);
      logger.warn('build:stderr', text.trimEnd());
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTs;
      resolve({
        exitCode: code,
        timedOut: killed,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        durationMs
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      logger.error('build', `Failed to spawn build command: ${err.message}`);
      resolve({
        exitCode: null,
        timedOut: false,
        stdout: '',
        stderr: err.message,
        durationMs: Date.now() - startTs
      });
    });
  });
}
