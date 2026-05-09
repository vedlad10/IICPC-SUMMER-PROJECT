/**
 * Unit tests for manifest validation.
 * Uses Node's built-in assert — no test framework required.
 * Run with: npx ts-node src/__tests__/manifest.test.ts
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validateManifest } from '../manifest';

function withTmpDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeManifest(dir: string, content: unknown): void {
  fs.writeFileSync(
    path.join(dir, 'benchmark.manifest.json'),
    JSON.stringify(content),
    'utf8'
  );
}

// ── Test: happy path ────────────────────────────────────────────────────────
withTmpDir((dir) => {
  writeManifest(dir, {
    name: 'my-engine',
    version: '1.0.0',
    language: 'node',
    entrypoint: 'src/server.js',
    port: 8080,
    build: 'npm install',
    run: 'node src/server.js'
  });

  const result = validateManifest(dir);
  assert.strictEqual(result.ok, true, 'Happy path should pass');
  assert.strictEqual(result.manifest?.name, 'my-engine');
  assert.strictEqual(result.manifest?.port, 8080);
  assert.strictEqual(result.manifest?.build, 'npm install');
  assert.strictEqual(result.error, null);
  console.log('✅ PASS: happy path manifest');
});

// ── Test: missing file ──────────────────────────────────────────────────────
withTmpDir((dir) => {
  const result = validateManifest(dir);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error?.includes('Missing required file'));
  console.log('✅ PASS: missing manifest file');
});

// ── Test: invalid JSON ──────────────────────────────────────────────────────
withTmpDir((dir) => {
  fs.writeFileSync(path.join(dir, 'benchmark.manifest.json'), '{bad json}', 'utf8');
  const result = validateManifest(dir);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error?.includes('invalid JSON'));
  console.log('✅ PASS: invalid JSON');
});

// ── Test: unsupported language ──────────────────────────────────────────────
withTmpDir((dir) => {
  writeManifest(dir, {
    name: 'engine',
    version: '1.0.0',
    language: 'cobol',
    entrypoint: 'main.cob',
    port: 3000,
    build: null,
    run: './main'
  });
  const result = validateManifest(dir);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error?.includes('Unsupported language'));
  console.log('✅ PASS: unsupported language rejected');
});

// ── Test: port out of range ─────────────────────────────────────────────────
withTmpDir((dir) => {
  writeManifest(dir, {
    name: 'engine',
    version: '1.0.0',
    language: 'go',
    entrypoint: './server',
    port: 99999,
    build: null,
    run: './server'
  });
  const result = validateManifest(dir);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error?.includes('port'));
  console.log('✅ PASS: port out of range rejected');
});

// ── Test: missing required field ────────────────────────────────────────────
withTmpDir((dir) => {
  writeManifest(dir, {
    name: 'engine',
    version: '1.0.0',
    language: 'python',
    // entrypoint missing
    port: 8000,
    build: null,
    run: 'python main.py'
  });
  const result = validateManifest(dir);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error?.includes('entrypoint'));
  console.log('✅ PASS: missing entrypoint field rejected');
});

// ── Test: null build field allowed ─────────────────────────────────────────
withTmpDir((dir) => {
  writeManifest(dir, {
    name: 'engine',
    version: '1.0.0',
    language: 'rust',
    entrypoint: './target/release/engine',
    port: 4000,
    build: null,
    run: './target/release/engine'
  });
  const result = validateManifest(dir);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.manifest?.build, null);
  console.log('✅ PASS: null build field is allowed');
});

console.log('\n✅ All manifest tests passed');
