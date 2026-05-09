/**
 * Docker sandbox integration test (requires Docker daemon).
 *
 * Creates a minimal workspace with a simple Node.js HTTP server,
 * launches it in a sandboxed container, verifies readiness,
 * then stops and cleans up.
 *
 * Run with: npx ts-node src/__tests__/docker.test.ts
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

import { SandboxLogger } from '../sandboxLogger';
import {
  launchSandbox,
  waitForReadiness,
  inspectContainer,
  stopAndRemoveContainer,
  getContainerLogs,
  DEFAULT_LIMITS
} from '../docker';
import { RuntimeManifest } from '../types';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-test-'));

function makeWorkspace(): string {
  const srcDir = path.join(TMP_DIR, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  // Write a minimal HTTP server that responds on PORT env
  fs.writeFileSync(
    path.join(srcDir, 'server.js'),
    `
const http = require('http');
const port = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(200);
    res.end('hello from sandbox');
  }
});
server.listen(port, '0.0.0.0', () => {
  console.log('Listening on port ' + port);
});
`.trim(),
    'utf8'
  );

  return srcDir;
}

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    }).on('error', reject);
  });
}

(async () => {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Phase 4 Docker Sandbox Integration Test');
  console.log('═══════════════════════════════════════════════════\n');

  const logger = new SandboxLogger('test-sandbox-run');
  const srcDir = makeWorkspace();

  const manifest: RuntimeManifest = {
    name: 'test-engine',
    language: 'node',
    entrypoint: 'server.js',
    port: 8080,
    run: 'node server.js'
  };

  // ── Launch ─────────────────────────────────────────────────────────────
  console.log('--- Step 1: Launch sandbox ---\n');

  const launch = await launchSandbox(
    'test-sandbox-run',
    srcDir,
    manifest,
    logger,
    { ...DEFAULT_LIMITS, readinessTimeoutMs: 30_000 }
  );

  console.log(`  Container ID: ${launch.containerId}`);
  console.log(`  Container name: ${launch.containerName}`);
  console.log(`  Host port: ${launch.hostPort}`);
  console.log(`  Internal port: ${launch.internalPort}`);

  assert.ok(launch.containerId.length > 0, 'Container ID must be non-empty');
  assert.strictEqual(launch.containerName, 'sandbox-test-sandbox-run');
  assert.ok(launch.hostPort > 0, 'Host port must be positive');
  console.log('\n✅ PASS: Container launched\n');

  // ── Inspect ────────────────────────────────────────────────────────────
  console.log('--- Step 2: Inspect container ---\n');

  const info = inspectContainer(launch.containerId, logger);
  assert.ok(info !== null, 'Inspect must return info');
  console.log(`  State: ${info!.state}`);
  console.log(`  PID: ${info!.pid}`);
  assert.strictEqual(info!.state, 'running', 'Container should be running');
  console.log('\n✅ PASS: Container is running\n');

  // ── Readiness ──────────────────────────────────────────────────────────
  console.log('--- Step 3: Readiness check ---\n');

  const ready = await waitForReadiness(launch.hostPort, 30_000, logger);
  assert.strictEqual(ready, true, 'Readiness check should pass');
  console.log('\n✅ PASS: Sandbox is ready\n');

  // ── HTTP probe ─────────────────────────────────────────────────────────
  console.log('--- Step 4: HTTP health probe ---\n');

  const healthResp = await httpGet(`http://127.0.0.1:${launch.hostPort}/health`);
  console.log(`  HTTP ${healthResp.status}: ${healthResp.body}`);
  assert.strictEqual(healthResp.status, 200);
  const parsed = JSON.parse(healthResp.body);
  assert.strictEqual(parsed.status, 'ok');
  console.log('\n✅ PASS: Health endpoint returns ok\n');

  // ── Container logs ─────────────────────────────────────────────────────
  console.log('--- Step 5: Fetch container logs ---\n');

  const logs = getContainerLogs(launch.containerId, logger);
  console.log(`  Container stdout: ${logs.substring(0, 200)}`);
  assert.ok(logs.includes('Listening on port'), 'Container logs should include startup message');
  console.log('\n✅ PASS: Container logs retrieved\n');

  // ── Stop + cleanup ─────────────────────────────────────────────────────
  console.log('--- Step 6: Stop and remove ---\n');

  stopAndRemoveContainer(launch.containerId, logger);

  const afterStop = inspectContainer(launch.containerId, logger);
  // Container should be gone or in non-running state
  const gone = afterStop === null || afterStop.state !== 'running';
  assert.ok(gone, 'Container should be removed after cleanup');
  console.log('\n✅ PASS: Container stopped and removed\n');

  // ── Security verification ──────────────────────────────────────────────
  console.log('--- Security boundaries summary ---');
  console.log(`  --read-only rootfs: ${DEFAULT_LIMITS.readOnlyRootfs}`);
  console.log(`  --tmpfs /tmp: ${DEFAULT_LIMITS.tmpfsSizeMb}MB`);
  console.log(`  --cpus: ${DEFAULT_LIMITS.cpus}`);
  console.log(`  --memory: ${DEFAULT_LIMITS.memoryMb}MB`);
  console.log(`  --pids-limit: ${DEFAULT_LIMITS.pidsLimit}`);
  console.log('  --cap-drop=ALL');
  console.log('  --security-opt=no-new-privileges:true');
  console.log('  --network=bridge (localhost-only port bind)');
  console.log('  Docker socket: NOT mounted');

  // ── Cleanup temp ──────────────────────────────────────────────────────
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  All Phase 4 Docker integration tests PASSED ✅');
  console.log('═══════════════════════════════════════════════════\n');

})().catch(async (err) => {
  console.error('\n❌ TEST FAILED:', err);
  // Best-effort cleanup
  try {
    const { execSync } = require('child_process');
    execSync('docker rm -f sandbox-test-sandbox-run', { encoding: 'utf8' });
  } catch { /* ignore */ }
  process.exit(1);
});
