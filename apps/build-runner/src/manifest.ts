/**
 * Manifest validation for the contestant submission contract.
 *
 * benchmark.manifest.json must be present at the root of the extracted workspace.
 * Validation is explicit and typed — no schema library, no magic.
 */
import fs from 'fs';
import path from 'path';
import { ALLOWED_LANGUAGES, Language, SubmissionManifest } from './types';

export interface ManifestValidationResult {
  ok: boolean;
  manifest: SubmissionManifest | null;
  error: string | null;
}

const MANIFEST_FILENAME = 'benchmark.manifest.json';

/**
 * Reads and validates benchmark.manifest.json from the given workspace src directory.
 * Returns a typed SubmissionManifest on success or a human-readable error string on failure.
 */
export function validateManifest(srcDir: string): ManifestValidationResult {
  const manifestPath = path.join(srcDir, MANIFEST_FILENAME);

  // ── 1. File presence ────────────────────────────────────────────────────
  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      manifest: null,
      error: `Missing required file: ${MANIFEST_FILENAME}`
    };
  }

  // ── 2. JSON parse ────────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return {
      ok: false,
      manifest: null,
      error: `${MANIFEST_FILENAME} contains invalid JSON`
    };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      manifest: null,
      error: `${MANIFEST_FILENAME} must be a JSON object`
    };
  }

  const obj = raw as Record<string, unknown>;

  // ── 3. Required string fields ────────────────────────────────────────────
  const requiredStrings: Array<keyof SubmissionManifest> = [
    'name', 'version', 'language', 'entrypoint', 'run'
  ];

  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).trim() === '') {
      return {
        ok: false,
        manifest: null,
        error: `Missing or empty required string field: "${field}"`
      };
    }
  }

  // ── 4. Language allowlist ────────────────────────────────────────────────
  const language = (obj.language as string).trim().toLowerCase();
  if (!(ALLOWED_LANGUAGES as readonly string[]).includes(language)) {
    return {
      ok: false,
      manifest: null,
      error: `Unsupported language "${language}". Allowed: ${ALLOWED_LANGUAGES.join(', ')}`
    };
  }

  // ── 5. Port (numeric, plausible range) ──────────────────────────────────
  const port = Number(obj.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      manifest: null,
      error: `"port" must be an integer between 1 and 65535, got: ${String(obj.port)}`
    };
  }

  // ── 6. Build field (optional, must be string or null/absent) ────────────
  const build = obj.build;
  if (build !== undefined && build !== null && typeof build !== 'string') {
    return {
      ok: false,
      manifest: null,
      error: `"build" must be a string command or null`
    };
  }

  const manifest: SubmissionManifest = {
    name: (obj.name as string).trim(),
    version: (obj.version as string).trim(),
    language: language as Language,
    entrypoint: (obj.entrypoint as string).trim(),
    port,
    build: typeof build === 'string' && build.trim() !== '' ? build.trim() : null,
    run: (obj.run as string).trim()
  };

  return { ok: true, manifest, error: null };
}
