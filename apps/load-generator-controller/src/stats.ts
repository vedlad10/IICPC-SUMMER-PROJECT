/**
 * Statistics and percentile calculation utilities.
 *
 * All math operates on sorted arrays of latency values.
 * Warmup events are excluded before calling these functions.
 */

/** Compute the p-th percentile (0–100) from a sorted array of numbers */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];

  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const frac = idx - lower;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

/** Average of an array */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Round to 2 decimal places */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
