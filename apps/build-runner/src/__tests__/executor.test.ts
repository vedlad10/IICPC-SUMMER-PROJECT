/**
 * Integration test for the build command executor.
 * Tests timeout, exit codes, and stdout capture with safe shell commands.
 * Run with: npx ts-node src/__tests__/executor.test.ts
 */
import assert from 'assert';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { runCommand } from '../executor';
import { BuildLogger } from '../buildLogger';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-exec-test-'));

function makeLogger(): BuildLogger {
  // Use a dummy buildJobId for the logger (no file flush in these tests)
  const logger = new BuildLogger('test-job-id');
  return logger;
}

(async () => {
  // ── Test: successful command ─────────────────────────────────────────────
  {
    const result = await runCommand('echo hello_world', tmpDir, makeLogger());
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('hello_world'));
    assert.strictEqual(result.timedOut, false);
    console.log('✅ PASS: successful echo command');
  }

  // ── Test: failing command ────────────────────────────────────────────────
  {
    const result = await runCommand('exit 42', tmpDir, makeLogger());
    assert.strictEqual(result.exitCode, 42);
    assert.strictEqual(result.timedOut, false);
    console.log('✅ PASS: failing command captures exit code 42');
  }

  // ── Test: timeout ────────────────────────────────────────────────────────
  {
    // Use a very short timeout (500ms) with a long-running command
    const isWindows = os.platform() === 'win32';
    const cmd = isWindows ? 'ping -n 10 127.0.0.1' : 'sleep 10';
    const result = await runCommand(cmd, tmpDir, makeLogger(), 500);
    assert.strictEqual(result.timedOut, true);
    console.log('✅ PASS: command timeout triggers correctly');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\n✅ All executor tests passed');
})().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
