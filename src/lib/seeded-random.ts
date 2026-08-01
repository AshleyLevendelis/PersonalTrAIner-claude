// ---------------------------------------------------------------------------
// Seeded RNG for deterministic test runs
// ---------------------------------------------------------------------------
// The exercise-selection pipeline (exercise-plan.ts's shuffle()) uses
// Math.random() in production, which is exactly right for a real user — a
// fresh plan shouldn't be byte-identical to the last one. But it makes
// automated scoring/audit runs non-reproducible: the same profile can score
// differently from one run to the next purely from which candidate exercise
// shuffle() happened to put first. Test harnesses seed the RNG from a stable
// per-profile key via setRandomSource() before generating, so a given
// combination always produces the same plan and the same score.

/** Mulberry32 — small, fast, good-enough-for-tests PRNG. Same seed -> same sequence, always. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function (): number {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic 32-bit hash of a string (e.g. a combination's descriptive key) — used as the mulberry32 seed. */
export function hashStringToSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(hash, 31) + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

/** Convenience: build a seeded RNG function directly from a string key. */
export function seededRngFromKey(key: string): () => number {
  return mulberry32(hashStringToSeed(key))
}
