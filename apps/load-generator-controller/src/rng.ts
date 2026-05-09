/**
 * Deterministic seeded PRNG.
 *
 * Uses a simple mulberry32 algorithm — fast, deterministic, no external deps.
 * Same seed always produces same sequence → benchmark replay is possible.
 */

export function createRng(seed: number): () => number {
  let state = seed | 0;
  return function mulberry32(): number {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick a weighted random operation index.
 * weights = [60, 20, 15, 5] → probabilities proportional to weights.
 */
export function weightedPick(weights: number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
