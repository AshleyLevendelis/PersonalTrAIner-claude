// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §3.1 — "the model segments, code owns every
// number." The model's log_workout tool call supplies raw text SPANS
// (exercise_phrase, sets_phrase) — this module is the only place any of
// those spans becomes a number. Pure, sync, no I/O — same shape as
// imperative-classifier.ts.
// ---------------------------------------------------------------------------

import { getExerciseEntry, searchExerciseCatalog, slugifyExerciseName, type ExerciseEntry } from './exercise-db'
import { isExternallyLoaded } from './load-prescription'

export interface ParsedSet {
  setNumber: number
  reps: number
  repsRangeLabel?: string
  weightKg: number
  /**
   * Weight ADDED to bodyweight, for the four lifts you can hang a belt from
   * (accepts_added_load). Kept apart from weightKg for the same reason
   * ExerciseSetLog does: that field means the weight of the thing you
   * lifted, and a chin-up does not weigh 15kg.
   */
  addedLoadKg?: number | null
  isBodyweight: boolean
  rpe?: number
}

export type ExerciseResolution =
  | { resolution: 'resolved'; exerciseId: string; exerciseName: string }
  | { resolution: 'ambiguous'; candidates: ExerciseEntry[] }
  | { resolution: 'unknown'; exerciseId: string; exerciseName: string }

export interface SetsAmbiguity {
  field: 'sets_x_reps' | 'weight' | 'exercise_name'
  message: string
}

export interface ParsedSetGroup {
  matchedRawPhrase: string
  resolution: ExerciseResolution['resolution']
  exerciseId?: string
  exerciseName?: string
  ambiguousCandidates?: ExerciseEntry[]
  sets: ParsedSet[]
  routesToCardio?: boolean
  cardioMinutes?: number
  /** BLOCKING — drives the CLARIFICATION card. Nothing writes until resolved. */
  ambiguity?: SetsAmbiguity
  /**
   * NON-blocking (§3.1: "the card shows the interpretation with a one-tap
   * flip") — this group already parsed and is safe to write with the
   * default A-is-sets reading; the receipt just offers a flip afterward.
   * Distinct from `ambiguity`, which blocks the write entirely.
   */
  flipCandidate?: { sets: number; repsPerSet: number[] }
}

export interface WorkoutEntryInput {
  rawText: string
  exercisePhrase: string
  setsPhrase: string
}

export interface ParseWorkoutInput {
  entries: WorkoutEntryInput[]
  /** Today's plan exercise names — given priority in resolution order (§3.2). */
  todaysPlanExerciseNames: string[]
}

export interface ParseWorkoutResult {
  groups: ParsedSetGroup[]
  needsClarification: boolean
}

// ---------------------------------------------------------------------------
// Sets x reps grammar (§3.1)
// ---------------------------------------------------------------------------

export interface SetsPhraseParse {
  sets: number
  repsPerSet: number[]
  repsRangeLabel?: string
  weightKg: number | null
  isBodyweight: boolean
  rpe?: number
  /** True when A<=10, B<=10, A!=B — the card renders the default with a one-tap flip, not a blocking clarification. */
  ambiguous: boolean
  flipCandidate?: { sets: number; repsPerSet: number[] }
}

const RPE_RE = /rpe\s*(\d+(?:\.\d+)?)/i
const BODYWEIGHT_RE = /@\s*bodyweight|@\s*bw\b|\bbodyweight\b/i
const WEIGHT_RE = /@\s*(\d+(?:\.\d+)?)\s*kg?/i
const RANGE_RE = /(\d+)\s*-\s*(\d+)/
const AXB_RE = /(\d+)\s*[x×]\s*(\d+)/i
const PER_SET_RE = /for\s+([\d,\s]+)/i
const SETS_OF_RE = /(\d+)\s*sets?\s*of\s*(\d+)/i

/**
 * `A×B`: if exactly one of A,B is <=10 and the other >12, the smaller is
 * sets. Otherwise A is sets by default (the overwhelming gym convention);
 * if both A,B<=10 and unequal, flags ambiguous with a flip candidate.
 */
function resolveSetsXReps(a: number, b: number): { sets: number; reps: number; ambiguous: boolean; flipCandidate?: { sets: number; repsPerSet: number[] } } {
  const aSmall = a <= 10, bSmall = b <= 10
  const aBig = a > 12, bBig = b > 12
  if (aSmall && bBig) return { sets: a, reps: b, ambiguous: false }
  if (bSmall && aBig) return { sets: b, reps: a, ambiguous: false }
  // Default: A is sets.
  const ambiguous = aSmall && bSmall && a !== b
  return {
    sets: a,
    reps: b,
    ambiguous,
    flipCandidate: ambiguous ? { sets: b, repsPerSet: Array(b).fill(a) } : undefined,
  }
}

export function parseSetsPhrase(phrase: string): SetsPhraseParse {
  const rpeMatch = RPE_RE.exec(phrase)
  const rpe = rpeMatch ? parseFloat(rpeMatch[1]) : undefined

  const isBodyweight = BODYWEIGHT_RE.test(phrase)
  const weightMatch = WEIGHT_RE.exec(phrase)
  const weightKg = isBodyweight ? 0 : (weightMatch ? parseFloat(weightMatch[1]) : null)

  // Explicit per-set reps: "bench 100 for 5,5,4" — one entry per set, no ambiguity.
  const perSetMatch = PER_SET_RE.exec(phrase)
  if (perSetMatch) {
    const repsPerSet = perSetMatch[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n))
    if (repsPerSet.length > 0) {
      return { sets: repsPerSet.length, repsPerSet, weightKg, isBodyweight, rpe, ambiguous: false }
    }
  }

  // "3 sets of 8-10 at 60" / "3 sets of 8"
  const setsOfMatch = SETS_OF_RE.exec(phrase)
  const rangeMatch = RANGE_RE.exec(phrase)
  if (setsOfMatch) {
    const sets = parseInt(setsOfMatch[1], 10)
    const reps = rangeMatch ? Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2) : parseInt(setsOfMatch[2], 10)
    return {
      sets,
      repsPerSet: Array(sets).fill(reps),
      repsRangeLabel: rangeMatch ? `${rangeMatch[1]}-${rangeMatch[2]}` : undefined,
      weightKg, isBodyweight, rpe, ambiguous: false,
    }
  }

  // "3x failure" — sets known, reps unknowable; caller surfaces as ambiguity via 0 reps sentinel? No —
  // "failure" has no numeric rep count at all; treat as an exercise-level weight/reps ambiguity upstream.
  const axbMatch = AXB_RE.exec(phrase)
  if (axbMatch) {
    const a = parseInt(axbMatch[1], 10)
    const b = parseInt(axbMatch[2], 10)
    const { sets, reps, ambiguous, flipCandidate } = resolveSetsXReps(a, b)
    return {
      sets,
      repsPerSet: Array(sets).fill(reps),
      repsRangeLabel: rangeMatch ? `${rangeMatch[1]}-${rangeMatch[2]}` : undefined,
      weightKg, isBodyweight, rpe, ambiguous, flipCandidate,
    }
  }

  // Nothing recognized — one set, reps unknown (caller treats as ambiguity).
  return { sets: 1, repsPerSet: [], weightKg, isBodyweight, rpe, ambiguous: false }
}

// ---------------------------------------------------------------------------
// Exercise resolution (§3.2)
// ---------------------------------------------------------------------------

const CARDIO_RE = /(\d+)\s*(?:min|mins|minutes)\b.*\b(bike|run|jog|row|swim|elliptical|cycling|cardio|walk)/i

export function resolveExerciseName(phrase: string, todaysPlanExerciseNames: string[]): ExerciseResolution {
  const trimmed = phrase.trim()

  // Exact catalog match.
  const exact = getExerciseEntry(trimmed)
  if (exact) return { resolution: 'resolved', exerciseId: exact.id, exerciseName: exact.name }

  // Priority: substring match within today's plan.
  const lower = trimmed.toLowerCase()
  const inPlan = todaysPlanExerciseNames.filter(n => n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase()))
  if (inPlan.length === 1) {
    const entry = getExerciseEntry(inPlan[0])
    if (entry) return { resolution: 'resolved', exerciseId: entry.id, exerciseName: entry.name }
  }

  // Global fuzzy search (prefix/substring).
  const results = searchExerciseCatalog(trimmed, 6)
  if (results.length === 1) return { resolution: 'resolved', exerciseId: results[0].id, exerciseName: results[0].name }
  if (results.length > 1) {
    // A single dominant prefix match still counts as resolved (e.g. "bench"
    // uniquely prefixing "Bench Press" among several substring hits);
    // otherwise genuinely ambiguous (e.g. "flyes" — Cable Flyes vs Rear
    // Delt Flyes, neither a prefix of the other's full name).
    const startsWithQuery = results.filter(r => r.name.toLowerCase().startsWith(lower))
    if (startsWithQuery.length === 1) return { resolution: 'resolved', exerciseId: startsWithQuery[0].id, exerciseName: startsWithQuery[0].name }
    return { resolution: 'ambiguous', candidates: results.slice(0, 4) }
  }

  // Nothing found — custom slug, still loggable per §3.2 (counts toward
  // volume/history, excluded from progression).
  return { resolution: 'unknown', exerciseId: `custom:${slugifyExerciseName(trimmed)}`, exerciseName: trimmed }
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export function parseWorkoutEntries(input: ParseWorkoutInput): ParseWorkoutResult {
  const groups: ParsedSetGroup[] = input.entries.map(entry => {
    const cardioMatch = CARDIO_RE.exec(entry.rawText)
    if (cardioMatch) {
      return {
        matchedRawPhrase: entry.rawText,
        resolution: 'unknown',
        sets: [],
        routesToCardio: true,
        cardioMinutes: parseInt(cardioMatch[1], 10),
      }
    }

    const nameRes = resolveExerciseName(entry.exercisePhrase, input.todaysPlanExerciseNames)
    if (nameRes.resolution === 'ambiguous') {
      return {
        matchedRawPhrase: entry.exercisePhrase,
        resolution: 'ambiguous',
        ambiguousCandidates: nameRes.candidates,
        sets: [],
        ambiguity: { field: 'exercise_name', message: `Which "${entry.exercisePhrase}" did you mean?` },
      }
    }

    const entryEntry = getExerciseEntry(nameRes.exerciseName)
    const parsed = parseSetsPhrase(entry.setsPhrase)

    if (parsed.repsPerSet.length === 0) {
      return {
        matchedRawPhrase: entry.rawText,
        resolution: nameRes.resolution,
        exerciseId: nameRes.exerciseId,
        exerciseName: nameRes.exerciseName,
        sets: [],
        ambiguity: { field: 'sets_x_reps', message: `How many sets and reps for ${nameRes.exerciseName}?` },
      }
    }

    // Never fabricate a 0kg loaded row (the isMalformedZeroWeight
    // precedent) — a missing weight on an externally-loaded exercise is a
    // weight-field ambiguity, not a silent zero. A bodyweight-tagged
    // exercise or an explicit @bodyweight token is the only legitimate 0kg.
    const entryIsLoaded = entryEntry ? isExternallyLoaded(entryEntry) : true
    const isBodyweight = parsed.isBodyweight || (entryEntry != null && !entryIsLoaded)

    // A chin-up or a dip is bodyweight PLUS a belt, so the override above
    // used to throw the stated figure away: MEASURED, "3x5 @15kg",
    // "3x5 with 15kg", "3x5" and "3x5 @bodyweight" on Chin-Ups all produced
    // the identical row, weightKg 0. Silently, which is the worst version —
    // a LOADED lift whose weight won't parse asks "what weight did you
    // use?", these four just dropped it.
    //
    // Captured from parsed.weightKg BEFORE the bodyweight override, since
    // that override is what was discarding it.
    const addedLoadKg = entryEntry?.accepts_added_load && parsed.weightKg != null && parsed.weightKg > 0
      ? parsed.weightKg
      : null
    if (!isBodyweight && parsed.weightKg == null) {
      return {
        matchedRawPhrase: entry.rawText,
        resolution: nameRes.resolution,
        exerciseId: nameRes.exerciseId,
        exerciseName: nameRes.exerciseName,
        sets: [],
        ambiguity: { field: 'weight', message: `What weight did you use for ${nameRes.exerciseName}?` },
      }
    }

    const sets: ParsedSet[] = parsed.repsPerSet.map((reps, i) => ({
      setNumber: i + 1, // caller (C13) re-offsets via nextExtraSetNumber/computeSetRowNumbers
      reps,
      repsRangeLabel: parsed.repsRangeLabel,
      weightKg: isBodyweight ? 0 : (parsed.weightKg ?? 0),
      addedLoadKg,
      isBodyweight,
      rpe: parsed.rpe,
    }))

    return {
      matchedRawPhrase: entry.rawText,
      resolution: nameRes.resolution,
      exerciseId: nameRes.exerciseId,
      exerciseName: nameRes.exerciseName,
      sets,
      // Non-blocking: proceeds with the default (A-is-sets) reading; the
      // receipt renders the one-tap flip, per §3.1 — this must NOT set
      // `ambiguity` (that field blocks the write via needsClarification).
      flipCandidate: parsed.flipCandidate,
    }
  })

  // Only a BLOCKING ambiguity (unresolved exercise name, missing sets/reps,
  // missing weight on a loaded movement) gates the write — a sets×reps
  // flipCandidate is deliberately excluded here (see the field's own doc
  // comment): the group already parsed to a safe default and is fine to
  // log immediately, with the flip offered afterward.
  const needsClarification = groups.some(g => g.resolution === 'ambiguous' || !!g.ambiguity)
  return { groups, needsClarification }
}
