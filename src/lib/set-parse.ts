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
  /**
   * THE USER'S OWN MESSAGE, verbatim. The exercise name must be traceable to
   * it or nothing is written — see isNamedByTheUser.
   *
   * OPTIONAL, AND ONLY BECAUSE OF WHO CALLS THIS. Every app caller is the chat
   * client, and every one of them passes it; the gates that exercise the
   * grammar itself have no user turn to trace to and omit it, which skips the
   * check rather than failing it. If a second app-side caller ever appears,
   * this stops being optional.
   */
  userSaid?: string
  /**
   * The model's claim that this turn FIXES what was just logged rather than
   * adding to it — the same flag that drives `replaceExisting`.
   */
  correctsPrevious?: boolean
  /**
   * What the APP ITSELF has on today's log. Not the model's copy: these names
   * were written by this app, from rows it holds. See the correction branch in
   * parseWorkoutEntries for the one thing they are used for.
   */
  loggedExerciseNames?: string[]
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
const RANGE_RE = /(\d+)\s*-\s*(\d+)/
const AXB_RE = /(\d+)\s*[x×]\s*(\d+)/i
const PER_SET_RE = /for\s+([\d,\s]+)/i
const SETS_OF_RE = /(\d+)\s*sets?\s*of\s*(\d+)/i

// ---------------------------------------------------------------------------
// HOW A WEIGHT IS WRITTEN — and it is not only "@60kg".
//
// This was one regex: /@\s*(\d+(?:\.\d+)?)\s*kg?/i. It needs a literal `@`
// AND a literal `k` (the `?` is on the g, not the k), so of twenty phrasings a
// person actually types, THREE parsed. "3x8 60kg", "3x8 at 60kg", "3 sets of 8
// at 60", "5x5 100kg", even "3x8 @ 60" — all of them came back with no weight.
//
// And a missing weight on a loaded lift is not a shrug: it is a BLOCKING
// clarification, "What weight did you use for X?" — asked into a card with no
// answer buttons. So the trainee types "60kg", which goes back through the
// model as a fresh turn and lands in this same function, which again finds no
// weight, and asks again. That is Ashley's endless correction loop (8 Sep
// 2026): the question could not be answered by anything she could type.
//
// Three rules, most confident first. Metric only, as the app is throughout.
// ---------------------------------------------------------------------------
const WEIGHT_UNIT = String.raw`(?:kgs?|kilos?|kilograms?)`
/** "60kg", "60 kg", "100kilos" — the unit is the anchor, so no preposition is needed. */
const WEIGHT_UNIT_RE = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${WEIGHT_UNIT}\b`, 'i')
/** "@60", "@ 60kg", "at 60", "with 60kg" — the preposition is the anchor, so the unit is optional. */
const WEIGHT_PREPOSITION_RE = new RegExp(String.raw`(?:@|\bat\b|\bwith\b)\s*(\d+(?:\.\d+)?)\s*${WEIGHT_UNIT}?`, 'i')
/** Every number in a phrase, with where it sits — for the last-resort rule below. */
const ANY_NUMBER_RE = /\d+(?:\.\d+)?/g

/** True when [start,end) overlaps any of the spans already claimed by reps or RPE. */
function overlaps(start: number, end: number, spans: [number, number][]): boolean {
  return spans.some(([s, e]) => start < e && end > s)
}

/**
 * The weight in a sets phrase, or null when there genuinely isn't one.
 *
 * `claimed` is the spans the reps expression and the RPE already own. Nothing
 * inside them can be the weight — without that, "3 sets of 8 at 8 reps" would
 * read a rep count as a load, and a load is the number that decides what
 * somebody puts on a bar next week.
 */
function findWeightKg(phrase: string, claimed: [number, number][]): number | null {
  const unit = WEIGHT_UNIT_RE.exec(phrase)
  if (unit && !overlaps(unit.index, unit.index + unit[0].length, claimed)) return parseFloat(unit[1])

  const prep = WEIGHT_PREPOSITION_RE.exec(phrase)
  if (prep) {
    const numberStart = prep.index + prep[0].indexOf(prep[1])
    if (!overlaps(numberStart, numberStart + prep[1].length, claimed)) return parseFloat(prep[1])
  }

  // Last resort: exactly one number is left over once the reps and the RPE
  // have taken theirs. "bench 100 for 5,5,4" is this case — the shape this
  // file's own PER_SET comment has always used as its example — and so is the
  // bare "60" somebody types when asked what weight they used. EXACTLY one:
  // two leftover numbers means we cannot tell which is the load, and guessing
  // at a load is worse than asking.
  const leftovers: number[] = []
  for (const m of phrase.matchAll(ANY_NUMBER_RE)) {
    if (m.index == null) continue
    if (overlaps(m.index, m.index + m[0].length, claimed)) continue
    leftovers.push(parseFloat(m[0]))
  }
  return leftovers.length === 1 ? leftovers[0] : null
}

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

  // THE REPS ARE READ FIRST, and that ordering is the point: whichever
  // characters the reps expression owns are off-limits to the weight. The
  // weight used to be read first, from a regex so narrow it could not collide
  // with anything; now that it reads "60" out of "at 60", it has to be told
  // which numbers are already spoken for.
  const claimed: [number, number][] = []
  if (rpeMatch) claimed.push([rpeMatch.index, rpeMatch.index + rpeMatch[0].length])
  const weightFrom = (): number | null => (isBodyweight ? 0 : findWeightKg(phrase, claimed))

  // Explicit per-set reps: "bench 100 for 5,5,4" — one entry per set, no ambiguity.
  const perSetMatch = PER_SET_RE.exec(phrase)
  if (perSetMatch) {
    const repsPerSet = perSetMatch[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n))
    if (repsPerSet.length > 0) {
      claimed.push([perSetMatch.index, perSetMatch.index + perSetMatch[0].length])
      return { sets: repsPerSet.length, repsPerSet, weightKg: weightFrom(), isBodyweight, rpe, ambiguous: false }
    }
  }

  // "3 sets of 8-10 at 60" / "3 sets of 8"
  const setsOfMatch = SETS_OF_RE.exec(phrase)
  const rangeMatch = RANGE_RE.exec(phrase)
  if (setsOfMatch) {
    const sets = parseInt(setsOfMatch[1], 10)
    const reps = rangeMatch ? Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2) : parseInt(setsOfMatch[2], 10)
    claimed.push([setsOfMatch.index, setsOfMatch.index + setsOfMatch[0].length])
    if (rangeMatch) claimed.push([rangeMatch.index, rangeMatch.index + rangeMatch[0].length])
    return {
      sets,
      repsPerSet: Array(sets).fill(reps),
      repsRangeLabel: rangeMatch ? `${rangeMatch[1]}-${rangeMatch[2]}` : undefined,
      weightKg: weightFrom(), isBodyweight, rpe, ambiguous: false,
    }
  }

  // "3x failure" — sets known, reps unknowable; caller surfaces as ambiguity via 0 reps sentinel? No —
  // "failure" has no numeric rep count at all; treat as an exercise-level weight/reps ambiguity upstream.
  const axbMatch = AXB_RE.exec(phrase)
  if (axbMatch) {
    const a = parseInt(axbMatch[1], 10)
    const b = parseInt(axbMatch[2], 10)
    const { sets, reps, ambiguous, flipCandidate } = resolveSetsXReps(a, b)
    claimed.push([axbMatch.index, axbMatch.index + axbMatch[0].length])
    if (rangeMatch) claimed.push([rangeMatch.index, rangeMatch.index + rangeMatch[0].length])
    return {
      sets,
      repsPerSet: Array(sets).fill(reps),
      repsRangeLabel: rangeMatch ? `${rangeMatch[1]}-${rangeMatch[2]}` : undefined,
      weightKg: weightFrom(), isBodyweight, rpe, ambiguous, flipCandidate,
    }
  }

  // Nothing recognized — one set, reps unknown (caller treats as ambiguity).
  return { sets: 1, repsPerSet: [], weightKg: weightFrom(), isBodyweight, rpe, ambiguous: false }
}

// ---------------------------------------------------------------------------
// Exercise resolution (§3.2)
// ---------------------------------------------------------------------------

const CARDIO_RE = /(\d+)\s*(?:min|mins|minutes)\b.*\b(bike|run|jog|row|swim|elliptical|cycling|cardio|walk)/i

export function resolveExerciseName(phrase: string, todaysPlanExerciseNames: string[]): ExerciseResolution {
  const trimmed = phrase.trim()
  // AN EMPTY PHRASE MATCHES NOTHING, and saying so here is not belt-and-braces.
  // The in-plan filter below is `n.includes(lower) || lower.includes(n)`, and
  // `'anything'.includes('')` is true — so a blank phrase silently matched
  // EVERY exercise in today's plan, and on a one-exercise day resolved to it.
  if (!trimmed) return { resolution: 'unknown', exerciseId: '', exerciseName: '' }

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
// DID THE USER ACTUALLY NAME THIS EXERCISE?
//
// Ashley, 14 Sep 2026, training: 'Sending "I did 1x10 @60kg" in chat
// auto-logged the set under Trap Bar Deadlift without asking or confirming
// which exercise was actually performed.'
//
// She never typed those words. The model filled them in from the conversation
// — which the tool declaration forbids in as many words ("Never invent one —
// if this entry's raw_text names no exercise, don't include it as an entry;
// ask which exercise instead") and which it did anyway. That is the lesson,
// not the incident: A PROMPT RULE IS NOT AN ENFORCEMENT. Everything the app
// guarantees about its own writes has to be checkable in code, because the
// model is the one thing in the system that cannot be gated.
//
// `raw_text` is no anchor either — it is also the model's copy. The only text
// this app knows the user wrote is the message they sent, so that is what the
// name is traced to.
//
// DELIBERATELY GENEROUS, because the cost of the two errors is not
// symmetrical. Asking someone who did name their lift costs one tap; logging
// a lift they never did puts a number in permanent history that every future
// weight is calculated from. So one content word is enough — "bench" carries
// "Barbell Bench Press", "flyes" carries "DB flyes" — and a word is matched as
// a substring so plurals and possessives do not trip it.
// ---------------------------------------------------------------------------

/** Letters and digits only, lowercased — so "DB flyes," and "db flyes" agree. */
function normalizeForTracing(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function isNamedByTheUser(phrase: string, userSaid: string): boolean {
  const said = normalizeForTracing(userSaid)
  if (!said) return false
  const words = normalizeForTracing(phrase).split(' ').filter(w => w.length >= 3)
  // A phrase of nothing but short tokens ("db", "ohp") is checked whole rather
  // than dropped — returning true for "no long words" would be a hole exactly
  // the shape of an abbreviation the model likes to expand.
  if (words.length === 0) {
    const whole = normalizeForTracing(phrase)
    return whole.length > 0 && said.includes(whole)
  }
  return words.some(w => said.includes(w))
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

    // BEFORE RESOLUTION, because a name the user never said resolves perfectly
    // — that is precisely what made it invisible. Today's session is offered as
    // taps, and the card keeps its type-it box for work that was not on the
    // plan at all.
    //
    // A CORRECTION IS THE ONE CASE WHERE NAMING NOTHING IS NORMAL. "actually it
    // was 60kg" names no lift, and it does not have to: it points at the thing
    // the app itself has just written down. So a correction resolves its target
    // from THIS APP'S OWN LOG, never from the model's phrase — which keeps the
    // 14 Sep rule exactly as it was, because the model's name is still not
    // trusted for anything.
    //
    // AND IT CANNOT PUT A LIFT IN HISTORY THAT NOBODY DID, which is the harm
    // the rule exists to prevent: the only name this branch can produce is one
    // already on today's log, so the worst it can do is change a number on a
    // set that is already there — under a "Corrected" receipt naming the lift,
    // with Undo one tap away. Adding is still blocked; only altering is
    // allowed, and only when there is exactly one thing it could mean.
    //
    // MEASURED, 15 Sep 2026: without this, the 14 Sep guard silently closed the
    // correction loop the 8 Sep work opened. "actually it was 60kg" asked
    // "Which exercise was that?" and offered seven exercises off today's plan —
    // none of them the one just logged, because it was off-plan work.
    let tracedPhrase = entry.exercisePhrase
    if (input.userSaid !== undefined && !isNamedByTheUser(tracedPhrase, input.userSaid)) {
      const logged = input.loggedExerciseNames ?? []
      const correcting = input.correctsPrevious === true && logged.length > 0
      if (correcting && logged.length === 1) {
        tracedPhrase = logged[0]
      } else {
        return {
          matchedRawPhrase: entry.rawText,
          resolution: 'unknown',
          sets: [],
          // A CORRECTION CAN ONLY MEAN SOMETHING ALREADY LOGGED. Offering
          // today's plan instead is how the card came to list seven exercises
          // that were not candidates and omit the one that was.
          ambiguousCandidates: (correcting ? logged : input.todaysPlanExerciseNames)
            .map(n => getExerciseEntry(n))
            .filter((e): e is ExerciseEntry => !!e),
          ambiguity: { field: 'exercise_name', message: 'Which exercise was that?' },
        }
      }
    }

    const nameRes = resolveExerciseName(tracedPhrase, input.todaysPlanExerciseNames)
    if (nameRes.resolution === 'ambiguous') {
      return {
        matchedRawPhrase: tracedPhrase,
        resolution: 'ambiguous',
        ambiguousCandidates: nameRes.candidates,
        sets: [],
        ambiguity: { field: 'exercise_name', message: `Which "${tracedPhrase}" did you mean?` },
      }
    }

    // A NAMELESS EXERCISE IS NOT LOGGABLE. resolveExerciseName answers a blank
    // phrase with resolution 'unknown' and an empty name, which the custom-
    // exercise path would happily write as `custom:` with no name on it —
    // three sets against nothing. It was masked before 8 Sep 2026 only because
    // the weight almost never parsed, so the write was blocked by accident;
    // with the weight grammar fixed, "3x8 60kg" arriving without an exercise
    // (which is exactly what a one-line answer to a clarification looks like)
    // would have gone straight in. Asked instead, and the two questions below
    // no longer have to render "How many sets and reps for ?".
    if (!nameRes.exerciseName?.trim()) {
      return {
        matchedRawPhrase: entry.rawText,
        resolution: 'unknown',
        sets: [],
        // Same taps as the untraceable branch above. This question used to
        // render with no options at all — "a question with no way to answer
        // it is the loop", as the card's own note puts it.
        ambiguousCandidates: input.todaysPlanExerciseNames
          .map(n => getExerciseEntry(n))
          .filter((e): e is ExerciseEntry => !!e),
        ambiguity: { field: 'exercise_name', message: 'Which exercise was that?' },
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
