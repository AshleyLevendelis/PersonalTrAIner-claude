// ---------------------------------------------------------------------------
// What to hang on the sleeve — all the reasonable answers, not just the first
// one a greedy loop stumbled into.
//
// The old version walked the plates heaviest-first and never looked back, so
// 90kg on a 20kg bar was always "1x 20, 1x 10, 1x 5" and never "2x 10, ...".
// That is fine arithmetic and useless advice: the plate you own is the one
// that decides, and the calculator was picking for you. Ashley asked for
// options; this returns them, ranked, and lets the screen show more than one.
// ---------------------------------------------------------------------------

/** The kg denominations of a standard metric set, heaviest first. */
export const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const

/**
 * The heaviest target this will lay out, in kg.
 *
 * A number, because the search below is bounded only by the plate count and
 * the input above it is a bare `type="number"`. Type 9000000 into it — a slip
 * of the finger away from 90 — and an unbounded loader builds an array of
 * 180,000 plates, then React tries to render every one as a coloured div. The
 * tab locks up; on a phone it is killed. Nothing about that is the user's
 * mistake to pay for.
 *
 * 500 kg is deliberately past any real barbell: the heaviest raw squat ever
 * performed is around that, so this rejects typos without arguing with anyone
 * loading a real bar. Same reasoning, and the same shape, as
 * MAX_PLAUSIBLE_DAILY_STEPS.
 */
export const MAX_BARBELL_TARGET_KG = 500

/** Per side, at 1.25kg increments, 500kg of target cannot need more than this. Structural belt to the ceiling's braces. */
export const MAX_PLATES_PER_SIDE = 64

/**
 * How many distinct loadings the search will hold before it stops looking.
 *
 * The enumeration is exhaustive by construction and the answer count grows
 * fast with the target — 240kg a side has thousands of spellings, and we show
 * four. Descending order means the ones worth showing are found first, so
 * stopping early costs nothing a user would notice, and it keeps the work
 * bounded no matter what the ceiling above lets through.
 */
const MAX_ENUMERATED = 2000

/** Every plate is a whole multiple of the smallest one, so the search runs in integers and never meets a float. */
const UNIT_KG = 1.25
const PLATE_UNITS = STANDARD_PLATES.map(p => Math.round(p / UNIT_KG))

export type PlateCombination = {
  /** Heaviest first — the order they actually go on the sleeve. */
  plates: number[]
  /** kg on ONE side. Identical across every combination for a given target: they are spellings of the same number. */
  perSideKg: number
}

function distinctCount(plates: number[]): number {
  return new Set(plates).size
}

/**
 * Every way to load one side, ranked: fewest plates, then fewest different
 * plates, then heaviest-first as a stable tiebreak.
 *
 * "Fewest plates" is first because it is the one that matters at the rack —
 * fewer things to lift, fewer things to slide off. "Fewest different plates"
 * second because 4x 10 beats 2x 10 + 1x 15 + 1x 5 for anyone whose gym has a
 * deep stack of one size. Neither is a claim about the user's actual plates,
 * which the app does not know (see BACKLOG: a real plate inventory).
 *
 * Returns [] when the bar already meets or exceeds the target — the caller
 * says "bar only", which is a different sentence from "no answer".
 */
export function plateCombinations(targetKg: number, barKg: number, limit = 4): PlateCombination[] {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barKg)) return []
  if (targetKg > MAX_BARBELL_TARGET_KG || barKg > MAX_BARBELL_TARGET_KG) return []

  const remainder = targetKg - barKg
  if (remainder <= 0) return []

  // Floor, not round: loading OVER the asked-for weight is a different lift.
  // The epsilon is for the 0.5kg steps the inputs allow, where /2 lands on
  // things like 22.499999999999996.
  const units = Math.floor(remainder / 2 / UNIT_KG + 1e-9)
  if (units <= 0) return []
  const perSideKg = units * UNIT_KG

  // The greedy loading, used only for its SIZE: it fixes how much bigger an
  // alternative is allowed to be. Without a cap the search offers 18x 1.25kg
  // as a serious suggestion.
  let rem = units
  let greedyCount = 0
  const greedy: number[] = []
  for (let i = 0; i < PLATE_UNITS.length; i++) {
    while (rem >= PLATE_UNITS[i] && greedyCount < MAX_PLATES_PER_SIDE) {
      rem -= PLATE_UNITS[i]
      greedy.push(STANDARD_PLATES[i])
      greedyCount++
    }
  }
  // Only reachable if the plate ceiling bit before the weight was made up, in
  // which case there is exactly one answer and it is this one.
  if (rem > 0) return [{ plates: greedy, perSideKg: (units - rem) * UNIT_KG }]

  const maxPlates = Math.min(MAX_PLATES_PER_SIDE, greedyCount + 3)

  const found: number[][] = []
  const current: number[] = []
  const walk = (idx: number, left: number, used: number) => {
    if (found.length >= MAX_ENUMERATED) return
    if (left === 0) { found.push([...current]); return }
    if (idx >= PLATE_UNITS.length || used >= maxPlates) return
    // PLATE_UNITS is descending, so this denomination is the biggest still
    // available: if filling every remaining slot with it still falls short,
    // nothing below can reach either.
    if (left > PLATE_UNITS[idx] * (maxPlates - used)) return

    const most = Math.min(Math.floor(left / PLATE_UNITS[idx]), maxPlates - used)
    for (let count = most; count >= 0; count--) {
      for (let i = 0; i < count; i++) current.push(STANDARD_PLATES[idx])
      walk(idx + 1, left - count * PLATE_UNITS[idx], used + count)
      current.length -= count
      if (found.length >= MAX_ENUMERATED) return
    }
  }
  walk(0, units, 0)

  found.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length
    const da = distinctCount(a), db = distinctCount(b)
    if (da !== db) return da - db
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return b[i] - a[i]
    }
    return 0
  })

  return found.slice(0, limit).map(plates => ({ plates, perSideKg }))
}
