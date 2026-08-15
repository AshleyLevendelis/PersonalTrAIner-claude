import type { UserProfile, MesocycleWeek, WorkoutDay, Exercise } from './types'
import { EXERCISE_DATABASE, getMovementFamily, getVolumeRole, type ExerciseEntry } from './exercise-db'
import { getConstrainedPool, generateMesocycle, primerPatternsForTrack, getAffinityPrimerPool, CARDIO_RESERVED_SHARE } from './exercise-plan'
import { getGoalPolicy, resolveConditioningFrequency, RECOVERY_SET_MULTIPLIER } from './goal-policies'
import { EXPERIENCE_RPE_CEILING } from './periodization'
import { setRandomSource, resetRandomSource } from './exercise-plan'
import { seededRngFromKey } from './seeded-random'
import { DURATION_BUDGET_SECONDS, estimateDaySeconds, estimateSlotsSeconds, parseRestSeconds } from './session-duration'
import { getEquipmentFloorKg, labelModeForEntry } from './load-prescription'

// ---------------------------------------------------------------------------
// PLAN QUALITY SCORING
// ---------------------------------------------------------------------------
// Six dimensions, 2 points each, 12 total. Each dimension starts at 2 and
// loses a fixed 0.4 per DISTINCT rule violated (not per occurrence) — a day
// with three separate structural problems and a day with one of the same
// problem repeated three times both cost the dimension the same 0.4, but
// every individual occurrence is still recorded in `deductions` for the
// itemized report. This keeps one badly-behaved day from single-handedly
// zeroing a whole dimension while still surfacing everything that's wrong.
//
// Scale note: this was five dimensions / 10 total before primerFit was
// added. Any report or baseline number from before primerFit existed is out
// of 10, not 12 — not directly comparable to a fresh run without rescaling
// (multiply by 10/12) or excluding primerFit's points from the sum.

export interface Deduction {
  rule: string
  detail: string
  weekNumber?: number
  day?: string
  expected?: string
  actual?: string
}

export interface DimensionResult {
  label: string
  points: number
  deductions: Deduction[]
}

export type DimensionKey = 'timeFit' | 'structure' | 'progression' | 'selection' | 'goalAlignment' | 'primerFit'

export const DIMENSION_KEYS: DimensionKey[] = ['timeFit', 'structure', 'progression', 'selection', 'goalAlignment', 'primerFit']

export interface PlanScoreResult {
  overall: number
  dimensions: Record<DimensionKey, DimensionResult>
}

const RULE_PENALTY = 0.4
const DIMENSION_MAX = 2

/** Caps total deduction at DIMENSION_MAX and floors at 0 — one point lost per distinct violated rule type, not per occurrence. */
function scoreFromViolatedRules(violatedRuleCount: number): number {
  return Math.max(0, DIMENSION_MAX - RULE_PENALTY * violatedRuleCount)
}

function dbEntry(name: string): ExerciseEntry | undefined {
  return EXERCISE_DATABASE.find(e => e.name.toLowerCase() === name.toLowerCase())
}

function isMainCompound(ex: Exercise): boolean {
  const entry = dbEntry(ex.name)
  if (!entry) return false
  if (entry.movement_pattern === 'core' || entry.movement_pattern === 'carry') return false
  return entry.mechanics_tier === 'tier1_compound' || entry.mechanics_tier === 'tier2_compound'
}

// ---------------------------------------------------------------------------
// 1. Time fit
// ---------------------------------------------------------------------------

/**
 * Overrun and underrun are not the same failure. Running long eats into
 * whatever the trainee had scheduled after the session — a real cost, and
 * worth staying strict about (±10%/±20%). Running short costs nothing but an
 * unmet expectation; the exercise selection simply didn't need the full
 * window that day. Underrun gets a genuinely gentler curve, not just the
 * same thresholds relabeled.
 */
function scoreTimeRatio(seconds: number, budget: number, exemptUnderrun: boolean): number {
  const diff = seconds - budget
  if (diff >= 0) {
    const ratio = diff / budget
    return ratio <= 0.10 ? 2 : ratio <= 0.20 ? 1 : 0
  }
  // LOAD-BEARING COUPLING with exercise-plan.ts's computeDurationTopUp — do
  // not change one side without the other. `exemptUnderrun` is passed in as
  // exactly `profile.recovery_capacity === 'low'`, which is only a safe
  // signal because computeDurationTopUp returns ZERO top-up sets for that
  // exact case (see its own matching comment). That makes a low-recovery
  // under-budget day categorically different from every other under-budget
  // day: it is NEVER "the engine couldn't fill it," always "the user
  // recovers slowly and this is the correct amount of work" — the same
  // reasoning already applied to deload weeks below. If computeDurationTopUp
  // ever starts giving low recovery ANY top-up again (even partial), this
  // exemption must be revisited too, or the scorer will silently stop
  // catching genuine under-fill for that profile. Overrun is untouched —
  // running long is a real cost regardless of recovery tier.
  if (exemptUnderrun) return 2
  const ratio = -diff / budget
  return ratio <= 0.20 ? 2 : ratio <= 0.35 ? 1 : 0
}

/**
 * A day can be honestly within its overall time budget while its cardio
 * component ALONE is still an oversized reservation — the exact blind spot
 * that let 176-190%-of-budget cardio blocks score a passing timeFit before
 * this check existed: downstream trimming (stageTimeCap,
 * trimWeekRestForBudget) had already forced the DAY TOTAL back under
 * budget by degrading what shipped (extra sets piled on, interval rest cut
 * toward a floor), and scoreTimeRatio only ever sees that already-corrected
 * total. This is deliberately a SEPARATE check from the day-total ratio
 * above, not folded into it, so a correction elsewhere in the day can't
 * mask an oversized cardio reservation specifically.
 *
 * Bands are wider than scoreTimeRatio's own — comfortably within the
 * reservation's own target (CARDIO_RESERVED_SHARE, exercise-plan.ts, 28%)
 * is a full pass; up to ~1.8x the target costs a point, since the
 * reservation's own approved "always take the first candidate, even over
 * budget" floor rule can legitimately land a single expensive steady-state
 * pick there (measured live: Elliptical alone landed at 41% of a 75min
 * budget, which is correct, not a bug) — genuinely runaway, well past what
 * even the floor rule explains, is 0.
 */
export function scoreCardioShare(cardioSeconds: number, budget: number): number {
  if (cardioSeconds <= 0) return 2
  const ratio = cardioSeconds / budget
  return ratio <= 0.35 ? 2 : ratio <= 0.50 ? 1 : 0
}

/** Sum of estimateSlotsSeconds over just this day's cardio-tier exercises — the same real numbers (sets/reps/rest as actually assigned) the day-total estimate already uses, isolated to the one category scoreCardioShare needs to judge. */
export function cardioOnlySeconds(day: WorkoutDay): number {
  const cardioSlots = day.exercises
    .map(ex => ({ ex, entry: dbEntry(ex.name) }))
    .filter((s): s is { ex: Exercise; entry: ExerciseEntry } => !!s.entry && s.entry.mechanics_tier === 'cardio')
  if (cardioSlots.length === 0) return 0
  return estimateSlotsSeconds(cardioSlots.map(({ ex, entry }) => ({
    entry, sets: ex.sets, reps: ex.reps, restSeconds: parseRestSeconds(ex.rest),
  })))
}

function scoreTimeFit(profile: UserProfile, mesocycle: MesocycleWeek[]): DimensionResult {
  const budget = DURATION_BUDGET_SECONDS[profile.session_duration_preference || '45-60']
  // See scoreTimeRatio's own comment — this is only valid while
  // computeDurationTopUp (exercise-plan.ts) returns zero top-up for low
  // recovery_capacity. The two must move together.
  const exemptUnderrun = profile.recovery_capacity === 'low'
  let worstScore = 2
  let worst: { week: number; day: string; seconds: number; ratio: number; isOver: boolean } | null = null
  let worstCardioScore = 2
  let worstCardio: { week: number; day: string; cardioSeconds: number; ratio: number } | null = null

  for (const week of mesocycle) {
    // Deload weeks are DESIGNED to be lighter and shorter — half the sets,
    // by policy (see generateMesocycle's isDeload branch) — same reason the
    // progression check below expects deload load to drop, not hold. Scoring
    // a deliberately short recovery week as a time-fit failure would be
    // penalizing the program for doing exactly what it's supposed to.
    if (week.is_deload) continue
    for (const day of week.days) {
      if (day.exercises.length === 0) continue
      const seconds = estimateDaySeconds(day)
      const dayScore = scoreTimeRatio(seconds, budget, exemptUnderrun)
      if (dayScore < worstScore) {
        const diff = seconds - budget
        worstScore = dayScore
        worst = { week: week.week_number, day: day.day, seconds, ratio: Math.abs(diff) / budget, isOver: diff >= 0 }
      }

      const cardioSeconds = cardioOnlySeconds(day)
      const cardioScore = scoreCardioShare(cardioSeconds, budget)
      if (cardioScore < worstCardioScore) {
        worstCardioScore = cardioScore
        worstCardio = { week: week.week_number, day: day.day, cardioSeconds, ratio: cardioSeconds / budget }
      }
    }
  }

  const deductions: Deduction[] = []
  if (worstScore < 2 && worst) {
    deductions.push({
      rule: 'time_fit',
      detail: `Worst day (week ${worst.week} ${worst.day}) is ${(worst.ratio * 100).toFixed(0)}% ${worst.isOver ? 'over' : 'under'} budget`,
      weekNumber: worst.week,
      day: worst.day,
      expected: `${Math.round(budget / 60)}min`,
      actual: `${Math.round(worst.seconds / 60)}min`,
    })
  }
  if (worstCardioScore < 2 && worstCardio) {
    deductions.push({
      rule: 'conditioning_share_over_budget',
      detail: `Worst day (week ${worstCardio.week} ${worstCardio.day}) has cardio-only work at ${(worstCardio.ratio * 100).toFixed(0)}% of the session budget — an oversized conditioning reservation, even though the day's own total may already be within budget`,
      weekNumber: worstCardio.week,
      day: worstCardio.day,
      expected: `<=${Math.round(budget * CARDIO_RESERVED_SHARE / 60)}min cardio (${Math.round(CARDIO_RESERVED_SHARE * 100)}% target)`,
      actual: `${Math.round(worstCardio.cardioSeconds / 60)}min cardio`,
    })
  }
  const combinedScore = Math.min(worstScore, worstCardioScore)
  return { label: 'Time fit', points: combinedScore, deductions }
}

// ---------------------------------------------------------------------------
// 2. Structure
// ---------------------------------------------------------------------------

function scoreStructure(mesocycle: MesocycleWeek[]): DimensionResult {
  const week1 = mesocycle.find(w => w.week_number === 1)
  const deductions: Deduction[] = []
  const violatedRules = new Set<string>()

  for (const day of week1?.days ?? []) {
    if (day.exercises.length === 0) continue

    day.exercises.forEach((ex, i) => {
      const entry = dbEntry(ex.name)
      if (entry?.mechanics_tier === 'primer' && i !== 0) {
        violatedRules.add('primer_not_first')
        deductions.push({
          rule: 'primer_not_first', day: day.day, weekNumber: 1,
          detail: `Primer "${ex.name}" is not the first exercise`,
          expected: 'primer first', actual: `position ${i + 1}`,
        })
      }
    })

    const mainIdx = day.exercises.findIndex(ex => ex.tier === 'tier_1_primary')
    if (mainIdx > 0) {
      for (let i = 0; i < mainIdx; i++) {
        const entry = dbEntry(day.exercises[i].name)
        if (!entry) continue
        const isCoreOrFinisher = entry.movement_pattern === 'core' || entry.movement_pattern === 'carry' || day.exercises[i].tier === 'tier_4_finisher'
        if (isCoreOrFinisher) {
          violatedRules.add('core_before_main')
          deductions.push({
            rule: 'core_before_main', day: day.day, weekNumber: 1,
            detail: `"${day.exercises[i].name}" (core/finisher) appears before the main lift "${day.exercises[mainIdx].name}"`,
          })
        }
      }
    }

    if (!day.warmup || day.warmup.total_seconds === 0) {
      violatedRules.add('missing_warmup')
      deductions.push({ rule: 'missing_warmup', day: day.day, weekNumber: 1, detail: `No warm-up block for ${day.day}` })
    }

    const supersetGroups = new Map<string, Exercise[]>()
    for (const ex of day.exercises) {
      if (!ex.superset_label) continue
      const letter = ex.superset_label[0]
      if (!supersetGroups.has(letter)) supersetGroups.set(letter, [])
      supersetGroups.get(letter)!.push(ex)
    }
    for (const pair of supersetGroups.values()) {
      if (pair.length === 2 && pair.every(isMainCompound)) {
        violatedRules.add('superset_main_compounds')
        deductions.push({
          rule: 'superset_main_compounds', day: day.day, weekNumber: 1,
          detail: `Two main compounds supersetted: ${pair.map(e => e.name).join(' + ')}`,
        })
      }
    }

    const main = day.exercises[mainIdx]
    if (main && (main.rest === 'alternate' || parseInt(main.rest, 10) < 60)) {
      violatedRules.add('main_lift_short_rest')
      deductions.push({
        rule: 'main_lift_short_rest', day: day.day, weekNumber: 1,
        detail: `Main lift "${main.name}" rest is "${main.rest}", not a full rest period`,
      })
    }

    // Set-count hierarchy: main >= any accessory/isolation that day. The
    // LLM review's single most consistent finding — main lifts at 2 sets
    // next to 7-set accessories. Mirrors the engine's own invariant
    // (enforceSetHierarchy in exercise-plan.ts) as a regression guard.
    const roles = day.exercises.map(ex => {
      const entry = dbEntry(ex.name)
      return entry ? getVolumeRole(entry) : null
    })
    const mainSetsThisDay = day.exercises.filter((_, i) => roles[i] === 'main').map(ex => ex.sets)
    if (mainSetsThisDay.length > 0) {
      const mainCeiling = Math.max(...mainSetsThisDay)
      day.exercises.forEach((ex, i) => {
        if (roles[i] && roles[i] !== 'main' && ex.sets > mainCeiling) {
          violatedRules.add('set_hierarchy_inverted')
          deductions.push({
            rule: 'set_hierarchy_inverted', day: day.day, weekNumber: 1,
            detail: `"${ex.name}" (${roles[i]}, ${ex.sets} sets) exceeds this day's main lift (${mainCeiling} sets)`,
          })
        }
      })
    }

    // Prescription unit: reps format must match the exercise's own
    // prescription_type — an isometric hold prescribed in meters, or a
    // conditioning modality prescribed as a rep count, is a unit error,
    // not a coaching decision.
    for (const ex of day.exercises) {
      const entry = dbEntry(ex.name)
      if (!entry) continue
      const matches =
        entry.prescription_type === 'reps' ? /^\d+(\s*-\s*\d+)?$/.test(ex.reps) :
        entry.prescription_type === 'time' || entry.prescription_type === 'intervals' || entry.prescription_type === 'steady_state' ? /^\d+(\s*-\s*\d+)?\s*s$/.test(ex.reps) :
        entry.prescription_type === 'distance_load' ? /^\d+(\s*-\s*\d+)?\s*m$/.test(ex.reps) :
        true
      if (!matches) {
        violatedRules.add('prescription_unit_mismatch')
        deductions.push({
          rule: 'prescription_unit_mismatch', day: day.day, weekNumber: 1,
          detail: `"${ex.name}" is prescription_type '${entry.prescription_type}' but reps is "${ex.reps}"`,
        })
      }
    }

    // Day label must match its content — no "Squat & Carry" without a
    // squat, no "Push & Press" without an overhead press.
    const dayPatterns = new Set(day.exercises.map(ex => dbEntry(ex.name)?.movement_pattern).filter(Boolean))
    if (day.focus === 'Squat & Carry' && !dayPatterns.has('knee_dominant') && !dayPatterns.has('single_leg')) {
      violatedRules.add('day_label_mismatch')
      deductions.push({ rule: 'day_label_mismatch', day: day.day, weekNumber: 1, detail: `"${day.day}" is labeled Squat & Carry but contains no squat-pattern exercise` })
    }
    if (day.focus === 'Push & Press' && !dayPatterns.has('vertical_push')) {
      violatedRules.add('day_label_mismatch')
      deductions.push({ rule: 'day_label_mismatch', day: day.day, weekNumber: 1, detail: `"${day.day}" is labeled Push & Press but contains no overhead-press pattern` })
    }

    // Superset partners must be physically ADJACENT in the rendered order
    // — a tagged A1/A2 pair with other exercises between them is not
    // executable as written.
    for (const [letter, pair] of supersetGroups) {
      if (pair.length !== 2) continue
      const i1 = day.exercises.indexOf(pair[0])
      const i2 = day.exercises.indexOf(pair[1])
      if (Math.abs(i1 - i2) !== 1) {
        violatedRules.add('superset_not_adjacent')
        deductions.push({
          rule: 'superset_not_adjacent', day: day.day, weekNumber: 1,
          detail: `Superset ${letter} (${pair.map(e => e.name).join(' + ')}) is not adjacent in the rendered order`,
        })
      }
    }
  }

  return { label: 'Structure', points: scoreFromViolatedRules(violatedRules.size), deductions }
}

// ---------------------------------------------------------------------------
// 3. Progression
// ---------------------------------------------------------------------------

function parseRpeHigh(label: string | undefined): number | null {
  if (!label) return null
  const match = label.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?/)
  if (!match) return null
  return match[2] ? parseFloat(match[2]) : parseFloat(match[1])
}

/** Top of a rep range like '9-11' or a bare '9' — null for time/distance prescriptions ('30-45s', '40m'). */
function parseRepsHigh(reps: string): number | null {
  const range = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) return parseInt(range[2], 10)
  const single = reps.match(/^(\d+)$/)
  return single ? parseInt(single[1], 10) : null
}

/**
 * Whether each day's chosen primer actually suits that day's track, and
 * whether a primer is present at all. Existing outside this file entirely
 * until now — every earlier measurement in this investigation (primer-loss
 * counts, pool sizes) came from instrumenting the harness by hand, because
 * the scorer had no way to see it.
 *
 * `primer_pattern_mismatch` can ONLY fire via selectExercisesForTrack's
 * graceful fallback: when the affinity-filtered pool is non-empty, the
 * selected primer is drawn exclusively from it, so it always fits by
 * construction — a mismatch is therefore proof the affinity pool was empty
 * for this profile/track and the any-primer fallback ran (nothing
 * downstream ever swaps a primer afterward — every trim/balance/top-up pass
 * explicitly excludes mechanics_tier === 'primer'). The detail text says so
 * directly so a future reader doesn't go hunting for a selection bug when
 * what's actually being reported is a catalogue coverage gap.
 *
 * LOAD-BEARING COUPLING — do not change one side without the other: the
 * injury-exemption below recomputes the affinity pool a SECOND time,
 * against an injury-free clone of the same profile, via
 * getAffinityPrimerPool (exercise-plan.ts) — the SAME function
 * selectExercisesForTrack itself calls, not a hand-copied filter. That
 * function's predicate is what "would this profile have had a matching
 * primer" actually means here; if it ever changes (a new eligibility
 * condition, a different affinity rule), this exemption changes meaning
 * with it automatically, which is the point — a hand-duplicated filter
 * would instead silently drift and start exempting (or failing to exempt)
 * the wrong days.
 */
function scorePrimerFit(profile: UserProfile, mesocycle: MesocycleWeek[]): DimensionResult {
  const week1 = mesocycle.find(w => w.week_number === 1)
  const deductions: Deduction[] = []
  const violatedRules = new Set<string>()

  for (const day of week1?.days ?? []) {
    if (day.exercises.length === 0) continue
    const trackPatterns = primerPatternsForTrack(day.focus)
    if (trackPatterns.length === 0) continue // not a track this map knows (rest/off day) — nothing to check

    const primerEx = day.exercises.find(ex => ex.tier === 'tier_0_primer')
    if (!primerEx) {
      violatedRules.add('primer_absent')
      deductions.push({
        rule: 'primer_absent', day: day.day, weekNumber: 1,
        detail: `${day.day} (${day.focus}) has no primer exercise, though this track has a primer pool.`,
      })
      continue
    }

    const entry = dbEntry(primerEx.name)
    const affinity = entry?.primer_pattern_affinity ?? []
    const fits = affinity.some(p => trackPatterns.includes(p))
    if (!fits) {
      // Recovery constraint outranks time budget established the pattern
      // for this: a deliberate, correct outcome shouldn't score as a
      // failure. Here, the deliberate outcome is injury filtering doing
      // its job — if the SAME profile minus its own reported injuries
      // would have had a matching primer, this mismatch is injury-driven,
      // not a catalogue gap, and the fallback IS the correct, safe output.
      // Only exempt when there's an injury to blame it on; a profile with
      // no injuries at all can't have this excuse, so an empty
      // affinity pool for one of those is still a genuine gap.
      const injuryFree = { ...profile, injuries: [] }
      const noInjuryPool = getConstrainedPool(injuryFree, [])
      const noInjuryAffinityPrimers = getAffinityPrimerPool(noInjuryPool, trackPatterns)
      const isInjuryDriven = (profile.injuries?.length ?? 0) > 0 && noInjuryAffinityPrimers.length > 0

      if (isInjuryDriven) continue

      violatedRules.add('primer_pattern_mismatch')
      deductions.push({
        rule: 'primer_pattern_mismatch', day: day.day, weekNumber: 1,
        detail: `"${primerEx.name}" (affinity: ${affinity.join('/') || 'none'}) doesn't fit ${day.day}'s ${day.focus} patterns (${trackPatterns.join('/')}). Cause: the affinity-preferred primer pool was empty for this profile, so selection fell back to any eligible primer — this is a catalogue coverage gap for this profile/track combination, not a selection bug.`,
      })
    }
  }

  return { label: 'Primer fit', points: scoreFromViolatedRules(violatedRules.size), deductions }
}

function scoreProgression(profile: UserProfile, mesocycle: MesocycleWeek[]): DimensionResult {
  const block1 = mesocycle.filter(w => w.block_number === 1).sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))
  const [w1, w2, w3, w4] = block1
  const deductions: Deduction[] = []
  const violatedRules = new Set<string>()
  const experience = profile.training_experience || 'novice'
  const ceiling = EXPERIENCE_RPE_CEILING[experience]
  // Every day's tier_1_primary (its flagship compound) now ramps load
  // regardless of the goal's progressionEmphasis — see exercise-plan.ts's
  // isMainCompound override. 'reps'/'maintain' policies (conditioning,
  // functional) still hold ACCESSORY weight flat and ramp reps instead, but
  // this check only ever looks at the tier_1_primary slot, which always
  // expects a real climb now.
  const expectsLoadRamp = true

  if (w1 && w2 && w3 && w4) {
    for (const day of w1.days) {
      const idx = day.exercises.findIndex(ex => ex.tier === 'tier_1_primary')
      if (idx === -1) continue
      const e1 = day.exercises[idx]
      const e2 = w2.days.find(d => d.day === day.day)?.exercises[idx]
      const e3 = w3.days.find(d => d.day === day.day)?.exercises[idx]
      const e4 = w4.days.find(d => d.day === day.day)?.exercises[idx]
      if (!e2 || !e3 || !e4) continue

      if (e1.suggested_load_kg != null && e2.suggested_load_kg != null && e3.suggested_load_kg != null) {
        const [l1, l2, l3] = [e1.suggested_load_kg, e2.suggested_load_kg, e3.suggested_load_kg]

        // The equipment floor this main lift is loaded on — an empty bar,
        // the lightest dumbbell pair, a stack's bottom pin. Below this,
        // there is nowhere lower for a load number to go, so neither
        // "deload isn't light enough" nor "calibration isn't conservative
        // enough" are meaningful complaints on their own.
        const mainEntry = dbEntry(e4.name)
        const floor = mainEntry ? getEquipmentFloorKg(mainEntry) : 0

        // Same reasoning applies to "not progressing": since the C0
        // calibration-conservatism fix, an unverified beginner/novice lift
        // whose true standards estimate sits near the equipment floor can
        // have its week 1/2/3 estimates (0.55/0.65/0.75 of standard) all
        // round down to that same floor — e.g. an empty 20kg barbell row
        // for three straight weeks. That's the engine correctly refusing to
        // invent a heavier number than the lift needs, not stalled
        // progression; only flag flat/decreasing load when there was
        // somewhere for it to actually go.
        const pinnedAtFloor = l1 <= floor && l2 <= floor && l3 <= floor
        if (expectsLoadRamp && !pinnedAtFloor && !(l1 <= l2 && l2 <= l3 && l3 > l1)) {
          violatedRules.add('load_not_progressing')
          deductions.push({
            rule: 'load_not_progressing', day: day.day, weekNumber: 1,
            detail: `${e1.name} load across loading weeks: ${l1} -> ${l2} -> ${l3}`,
            expected: 'non-decreasing with a real increase', actual: `${l1}->${l2}->${l3}`,
          })
        }

        if (e4.suggested_load_kg != null && e4.suggested_load_kg > l3 * 0.8) {
          // Exempt only when the load genuinely can't drop further (at the
          // floor) AND the engine still reduced something — the bar-floor
          // deload path (generateMesocycle) cuts sets first, then reps once
          // sets themselves are already at their 2-set floor (a low-volume
          // novice/beginner block can hit that floor well before deload
          // week even arrives). A plan that left load at the floor AND left
          // both sets and reps untouched is still a real deload failure.
          const atFloor = e4.suggested_load_kg <= floor
          const repsHigh3 = parseRepsHigh(e3.reps)
          const repsHigh4 = parseRepsHigh(e4.reps)
          const repsReduced = repsHigh3 != null && repsHigh4 != null && repsHigh4 < repsHigh3
          const volumeReduced = e4.sets < e3.sets || repsReduced
          if (!(atFloor && volumeReduced)) {
            violatedRules.add('deload_too_heavy')
            deductions.push({
              rule: 'deload_too_heavy', day: day.day, weekNumber: 4,
              detail: `${e4.name} deload (${e4.suggested_load_kg}kg) exceeds 80% of week 3 (${l3}kg)`,
              expected: `<= ${(l3 * 0.8).toFixed(1)}kg`, actual: `${e4.suggested_load_kg}kg`,
            })
          }
        }
        // Threshold recalibrated for the C0 calibration-conservatism round
        // (load-prescription.ts): a flat 0.85x MULTIPLIER on the standards
        // estimate produced near-max first-session loads for self-reported
        // "advanced" trainees with no verified numbers (up to 130kg on a
        // first-ever deadlift) — it's now tiered by training_experience
        // (0.55 beginner/novice, 0.50 intermediate, 0.45 advanced) when the
        // load is unverified, and unchanged (~0.85-0.9) when it's anchored
        // to a known working weight. Weeks 2-3 of block 1, when still
        // unverified, no longer carry the calibrated baseline forward with
        // small fixed-kg increments — they step up from a FRESH standards
        // estimate at 65%/75%, so l1/l3 lands well under this 0.97 ceiling
        // (roughly 0.45-0.55 divided by 0.75) for any unverified profile.
        // Known-weight-anchored lifts keep the old baseline-plus-increment
        // path, so l1/l3 for those can still sit close to 1.0 on a heavy
        // lift — which is exactly why this check only fires when the ratio
        // is suspiciously close to 1 (>0.97), not merely high.
        if (expectsLoadRamp && w1.isCalibrationWeek && l3 > floor && l1 > l3 * 0.97) {
          violatedRules.add('calibration_not_conservative')
          deductions.push({
            rule: 'calibration_not_conservative', day: day.day, weekNumber: 1,
            detail: `Calibration week load (${l1}kg) is not conservative relative to week 3 (${l3}kg)`,
          })
        }
      }

      if (!(e2.sets <= e1.sets && e3.sets <= e2.sets)) {
        violatedRules.add('sets_not_flat')
        deductions.push({
          rule: 'sets_not_flat', day: day.day, weekNumber: 1,
          detail: `${e1.name} sets across loading weeks: ${e1.sets} -> ${e2.sets} -> ${e3.sets}`,
        })
      }

      for (const [wk, ex] of [[1, e1], [2, e2], [3, e3]] as const) {
        const rpeHigh = parseRpeHigh(ex.intensity)
        if (rpeHigh != null && rpeHigh > ceiling) {
          violatedRules.add('rpe_over_ceiling')
          deductions.push({
            rule: 'rpe_over_ceiling', day: day.day, weekNumber: wk,
            detail: `${ex.name} intensity "${ex.intensity}" exceeds the ${experience} ceiling of RPE ${ceiling}`,
          })
        }
      }
    }
  }

  // Frozen week, checked across EVERY block and EVERY consecutive non-deload
  // week pair (w1->w2, w2->w3) for EVERY exercise, not just block 1's main
  // lift at the w1-vs-w3 distance — "no two consecutive non-deload weeks
  // identical in both load and reps for any exercise" is the capability
  // round's own literal rubric requirement. Skipped when the exercise NAME
  // changed between the two weeks (an accessory rotation mid-block is a
  // deliberate variety mechanism, not a frozen-week failure — there's no
  // meaningful "same load, same reps" comparison across two different
  // exercises).
  for (let block = 1; block <= 4; block++) {
    const blockWeeks = mesocycle
      .filter(w => w.block_number === block)
      .sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))
    const pairs: [MesocycleWeek | undefined, MesocycleWeek | undefined][] = [
      [blockWeeks[0], blockWeeks[1]], [blockWeeks[1], blockWeeks[2]],
    ]
    for (const [wa, wb] of pairs) {
      if (!wa || !wb || wa.is_deload || wb.is_deload) continue
      for (const dayA of wa.days) {
        const dayB = wb.days.find(d => d.day === dayA.day)
        if (!dayB) continue
        dayA.exercises.forEach((exA, i) => {
          const exB = dayB.exercises[i]
          if (!exB || exB.name !== exA.name) return
          // Primers are fixed by design (2 sets, reps '5', no load) — a
          // warm-up movement isn't a progression target, so it never
          // ramping isn't a "nothing is progressing" failure. Steady-state
          // cardio (Elliptical) is the same shape for the same reason: one
          // continuous block has nothing to ramp week-to-week within a
          // block — its progression lever, if any, is a longer-term
          // question (see stepIntervalSeconds' doc comment for why this is
          // deliberately out of scope), not a per-week one this rule can
          // meaningfully judge.
          if (exA.tier === 'tier_0_primer' || exA.prescription_type === 'steady_state') return
          const loadFrozen = exA.suggested_load_kg == null
            ? exB.suggested_load_kg == null
            : exA.suggested_load_kg === exB.suggested_load_kg
          if (loadFrozen && exA.reps === exB.reps) {
            violatedRules.add('frozen_week')
            deductions.push({
              rule: 'frozen_week', day: dayA.day, weekNumber: wa.week_number,
              detail: `${exA.name}: load and reps both unchanged from week ${wa.week_number} to week ${wb.week_number} (${exA.reps} @ ${exA.suggested_load_kg ?? 'bodyweight'}) — only the RPE label differs`,
            })
          }
        })
      }
    }
  }

  // Every week must carry a progression note explaining what's different —
  // trivially true by construction now (buildProgressionNote in
  // exercise-plan.ts runs unconditionally), kept here as a regression guard.
  for (const week of mesocycle) {
    if (!week.coach_note || week.coach_note.trim().length === 0) {
      violatedRules.add('missing_progression_note')
      deductions.push({
        rule: 'missing_progression_note', weekNumber: week.week_number,
        detail: `Week ${week.week_number} has no coach note explaining what's progressing`,
      })
    }
  }

  return { label: 'Progression', points: scoreFromViolatedRules(violatedRules.size), deductions }
}

// ---------------------------------------------------------------------------
// 4. Selection
// ---------------------------------------------------------------------------

const PUSH_PATTERNS = new Set(['push'])
const PULL_PATTERNS = new Set(['pull'])

function scoreSelection(profile: UserProfile, mesocycle: MesocycleWeek[]): DimensionResult {
  const block1 = mesocycle.filter(w => w.block_number === 1).sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))
  const [w1, w2, w3] = block1
  const week1 = mesocycle.find(w => w.week_number === 1)
  const deductions: Deduction[] = []
  const violatedRules = new Set<string>()

  if (w1 && w2 && w3) {
    for (const day of w1.days) {
      const mainIdx = day.exercises.findIndex(ex => ex.tier === 'tier_1_primary')
      if (mainIdx === -1) continue
      const name1 = day.exercises[mainIdx].name
      const name2 = w2.days.find(d => d.day === day.day)?.exercises[mainIdx]?.name
      const name3 = w3.days.find(d => d.day === day.day)?.exercises[mainIdx]?.name
      if (name2 !== name1 || name3 !== name1) {
        violatedRules.add('main_lift_changed_within_block')
        deductions.push({
          rule: 'main_lift_changed_within_block', day: day.day, weekNumber: 1,
          detail: `Main lift changed within block 1: ${name1} / ${name2} / ${name3}`,
        })
      }
    }

    // Accessory rotation at the sub-cycle boundary — checked at the WEEK
    // level (any accessory anywhere changing counts) rather than per-day,
    // since a single day's constrained pool can legitimately have zero
    // alternatives even when the week as a whole has room to rotate.
    // Beginners/novices deliberately hold accessories for the whole block
    // (expConfig.repeat_movements_for_practice — they need repetition to
    // learn a movement, not week-3 variety), so this check only applies to
    // intermediate/advanced, whose accessories ARE supposed to sub-cycle.
    const experience = profile.training_experience || 'novice'
    let anyAccessoryRotated = experience === 'beginner' || experience === 'novice'
    let anyAccessoryHadAlternative = false
    const pool = getConstrainedPool(profile, [])
    for (const day of w2.days) {
      const dayW3 = w3.days.find(d => d.day === day.day)
      if (!dayW3) continue
      day.exercises.forEach((ex, i) => {
        if (ex.tier !== 'tier_2_secondary' && ex.tier !== 'tier_3_isolation') return
        const entry = dbEntry(ex.name)
        if (!entry || entry.movement_pattern === 'core' || entry.movement_pattern === 'carry') return
        const altCount = pool.filter(p =>
          p.substitution_group === entry.substitution_group &&
          p.movement_pattern === entry.movement_pattern &&
          p.mechanics_tier === entry.mechanics_tier
        ).length
        if (altCount > 1) anyAccessoryHadAlternative = true
        if (dayW3.exercises[i]?.name !== ex.name) anyAccessoryRotated = true
      })
    }
    if (anyAccessoryHadAlternative && !anyAccessoryRotated) {
      violatedRules.add('accessory_never_rotates')
      deductions.push({
        rule: 'accessory_never_rotates', weekNumber: 3,
        detail: 'No accessory changed variation at the week-3 sub-cycle boundary despite alternatives being available',
      })
    }
  }

  // Two same-family exercises are the SAME movement wearing a grip/stance
  // modifier (Lat Pulldown -> Close-Grip Lat Pulldown) only when they share
  // BOTH the movement plane (angle_vector) and the implement (overlapping
  // equipment tags) — that's the one case where pairing them in a session
  // is redundant, not variety. A different plane (Barbell Curls, vertical ->
  // Incline Dumbbell Curls, diagonal) or a different implement/resistance
  // profile (Cable Flyes' constant cable tension vs Pec Deck Machine's cam
  // curve; Deadlifts' straight bar vs Trap Bar Deadlift's altered leverage)
  // is normal programming variety even inside the same movement family and
  // the same substitution_group — sharing a plane or an implement alone
  // isn't enough on its own, both have to match. Equipment comparison uses
  // overlap rather than exact-array-equality or the coarser loadingMode()
  // bucket: 'cable machine' and 'machine' both collapse to loadingMode's
  // 'stack', which would wrongly treat Cable Flyes/Pec Deck as the same
  // implement; overlap correctly still treats a dual-tagged entry (Shrugs,
  // equipment ['barbell','dumbbells']) as the same implement as its
  // dumbbell-specific sibling (Dumbbell Shrugs) when it's actually done that
  // way, without conflating cable and machine resistance curves.
  const sameImplement = (a: ExerciseEntry, b: ExerciseEntry): boolean =>
    a.equipment.some(eq => b.equipment.includes(eq))
  const isGenuineDuplicate = (a: ExerciseEntry, b: ExerciseEntry): boolean =>
    a.angle_vector === b.angle_vector && sameImplement(a, b)

  for (const day of week1?.days ?? []) {
    const families = new Map<string, Exercise[]>()
    for (const ex of day.exercises) {
      const entry = dbEntry(ex.name)
      if (!entry) continue
      const family = getMovementFamily(entry)
      if (!families.has(family)) families.set(family, [])
      families.get(family)!.push(ex)
    }
    for (const [family, exs] of families) {
      if (exs.length <= 1) continue

      const entries = exs.map(e => dbEntry(e.name)!)
      for (let i = 0; i < exs.length; i++) {
        for (let j = i + 1; j < exs.length; j++) {
          if (!isGenuineDuplicate(entries[i], entries[j])) continue
          violatedRules.add('duplicate_movement_family')
          deductions.push({
            rule: 'duplicate_movement_family', day: day.day, weekNumber: 1,
            detail: `Movement family "${family}": "${exs[i].name}" and "${exs[j].name}" are the same movement (same plane, same implement) — not just variety`,
          })
        }
      }
    }
  }

  // Load coherence — regression guard mirroring enforceLoadCoherence's own
  // invariants (exercise-plan.ts), with deliberately looser thresholds than
  // the engine's own enforcement so plate-rounding at the boundary doesn't
  // flag a plan the engine already fixed.
  for (const day of week1?.days ?? []) {
    const mains = day.exercises.filter(ex => {
      const entry = dbEntry(ex.name)
      return entry && ex.suggested_load_kg != null && entry.mechanics_tier === 'tier1_compound' && !entry.unilateral
    })
    const flat = day.exercises.find(ex => {
      const entry = dbEntry(ex.name)
      return entry?.substitution_group === 'bench_press' && entry.angle_vector === 'horizontal' && ex.suggested_load_kg != null
    })
    for (const ex of day.exercises) {
      const entry = dbEntry(ex.name)
      if (!entry || ex.suggested_load_kg == null) continue

      if (entry.unilateral) {
        const pattern = entry.movement_pattern === 'horizontal_push' || entry.movement_pattern === 'vertical_push' ? 'push'
          : entry.movement_pattern === 'horizontal_pull' || entry.movement_pattern === 'vertical_pull' ? 'pull'
          : entry.movement_pattern === 'knee_dominant' || entry.movement_pattern === 'single_leg' ? 'squat'
          : entry.movement_pattern === 'hip_hinge' ? 'hinge' : null
        const main = pattern && mains.find(m => {
          const me = dbEntry(m.name)!.movement_pattern
          const mp = me === 'horizontal_push' || me === 'vertical_push' ? 'push'
            : me === 'horizontal_pull' || me === 'vertical_pull' ? 'pull'
            : me === 'knee_dominant' || me === 'single_leg' ? 'squat'
            : me === 'hip_hinge' ? 'hinge' : null
          return mp === pattern
        })
        if (main?.suggested_load_kg != null && ex.suggested_load_kg > main.suggested_load_kg * 0.8) {
          violatedRules.add('load_incoherent')
          deductions.push({
            rule: 'load_incoherent', day: day.day, weekNumber: 1,
            detail: `Unilateral "${ex.name}" (${ex.suggested_load_kg}kg) outweighs this day's bilateral main lift "${main.name}" (${main.suggested_load_kg}kg)`,
          })
        }
      }

      if (flat && entry.name !== flat.name && entry.substitution_group === 'bench_press' && entry.angle_vector === 'diagonal' && flat.suggested_load_kg != null) {
        if (ex.suggested_load_kg > flat.suggested_load_kg) {
          violatedRules.add('load_incoherent')
          deductions.push({
            rule: 'load_incoherent', day: day.day, weekNumber: 1,
            detail: `Incline press "${ex.name}" (${ex.suggested_load_kg}kg) exceeds flat press "${flat.name}" (${flat.suggested_load_kg}kg)`,
          })
        }
      }
    }

    const mainPress = mains.find(m => {
      const p = dbEntry(m.name)?.movement_pattern
      return p === 'horizontal_push' || p === 'vertical_push'
    })
    if (mainPress?.suggested_load_kg != null) {
      for (const ex of day.exercises) {
        const entry = dbEntry(ex.name)
        if (!entry || ex.suggested_load_kg == null) continue
        const isBoundedIsolation = entry.movement_pattern === 'isolation_bicep' || entry.movement_pattern === 'isolation_shoulder'
        if (isBoundedIsolation && ex.suggested_load_kg > mainPress.suggested_load_kg * 0.65) {
          violatedRules.add('load_incoherent')
          deductions.push({
            rule: 'load_incoherent', day: day.day, weekNumber: 1,
            detail: `"${ex.name}" (${ex.suggested_load_kg}kg) is not a sane fraction of this day's main press "${mainPress.name}" (${mainPress.suggested_load_kg}kg)`,
          })
        }
      }
    }
  }

  let pushSets = 0
  let pullSets = 0
  let hasSquat = false
  let hasHinge = false
  for (const day of week1?.days ?? []) {
    for (const ex of day.exercises) {
      if (ex.movement_pattern && PUSH_PATTERNS.has(ex.movement_pattern)) pushSets += ex.sets
      if (ex.movement_pattern && PULL_PATTERNS.has(ex.movement_pattern)) pullSets += ex.sets
      if (ex.movement_pattern === 'squat') hasSquat = true
      if (ex.movement_pattern === 'hinge') hasHinge = true
    }
  }
  if (pushSets > 0 && pullSets > 0) {
    const ratio = pushSets / pullSets
    if (ratio < 0.6 || ratio > 1.6) {
      violatedRules.add('push_pull_imbalance')
      deductions.push({
        rule: 'push_pull_imbalance', weekNumber: 1,
        detail: `Weekly push:pull set ratio is ${ratio.toFixed(2)} (push=${pushSets}, pull=${pullSets})`,
        expected: '0.6 - 1.6', actual: ratio.toFixed(2),
      })
    }
  }

  const pool = getConstrainedPool(profile, [])
  const poolHasSquat = pool.some(e => e.movement_pattern === 'knee_dominant' || e.movement_pattern === 'single_leg')
  const poolHasHinge = pool.some(e => e.movement_pattern === 'hip_hinge')
  const poolHasPush = pool.some(e => e.movement_pattern === 'horizontal_push' || e.movement_pattern === 'vertical_push')
  const poolHasPull = pool.some(e => e.movement_pattern === 'horizontal_pull' || e.movement_pattern === 'vertical_pull')
  if (poolHasSquat && !hasSquat) {
    violatedRules.add('missing_squat_pattern')
    deductions.push({ rule: 'missing_squat_pattern', weekNumber: 1, detail: 'No squat-pattern exercise anywhere in the week despite equipment allowing one' })
  }
  if (poolHasHinge && !hasHinge) {
    violatedRules.add('missing_hinge_pattern')
    deductions.push({ rule: 'missing_hinge_pattern', weekNumber: 1, detail: 'No hinge-pattern exercise anywhere in the week despite equipment allowing one' })
  }
  // The push:pull ratio check above only fires when BOTH sides are nonzero
  // — a week with zero pull work (pushSets>0, pullSets===0) would otherwise
  // pass silently instead of failing the ratio it can't even compute.
  if (poolHasPush && pushSets === 0) {
    violatedRules.add('missing_push_pattern')
    deductions.push({ rule: 'missing_push_pattern', weekNumber: 1, detail: 'No push-pattern exercise anywhere in the week despite equipment allowing one' })
  }
  if (poolHasPull && pullSets === 0) {
    violatedRules.add('missing_pull_pattern')
    deductions.push({ rule: 'missing_pull_pattern', weekNumber: 1, detail: 'No pull-pattern exercise anywhere in the week despite equipment allowing one' })
  }

  // Same-muscle-group accessories should stay in the same ballpark across
  // the week — a 26kg curl next to a 2kg shrug in the same week was a
  // direct review finding.
  //
  // suggested_load_kg is not one consistent unit across exercises: a
  // 'per_hand'/'single_side' entry (any 'dumbbells'-mode exercise, or a
  // single-implement one carried unilaterally — see labelModeForEntry,
  // load-prescription.ts) stores HALF of what a 'total' entry (barbell,
  // stack) would for equivalent effort, by design — that's the correct,
  // honest gym-floor convention ("12kg dumbbells" means 12kg per hand, not
  // 24kg total), not an inconsistency to fix at the load-prescription
  // layer. Comparing those raw numbers directly is comparing different
  // units: a genuinely coherent "20kg barbell curl / 10kg-per-hand
  // dumbbell curl" pair reads as a 2x spread before normalizing back to a
  // common basis. normalizedKg puts every entry on the SAME 'total' basis
  // before the spread check runs; the detail message still reports the
  // real, un-normalized numbers a user would actually see on their plan.
  // shoulder_isolation split (queue-clearing round): 'isolation_shoulder'
  // used to collapse into ONE coherence bucket regardless of which shoulder
  // exercise it was — but the only two movements that pattern actually
  // covers today are Lateral/Cable Lateral Raises (substitution_group
  // 'lateral_delt') and Shrugs/Dumbbell Shrugs ('shrug'), and a shrug is
  // structurally loaded 5-10x heavier than a lateral raise for the same
  // trainee — every week both appeared together was a guaranteed
  // load_incoherent false positive, not a real coherence problem. Keying on
  // substitution_group (already a finer distinction the data carries, just
  // discarded by movement_pattern alone) splits them into their own
  // buckets. Not extended to the other five isolation patterns here —
  // scoped to the one bucket that was actually measured and proposed.
  const coherenceGroups = new Map<string, { name: string; kg: number; normalizedKg: number }[]>()
  const coherenceGroupOf = (entry: ExerciseEntry): string | null => {
    const p = entry.movement_pattern
    if (p === 'isolation_bicep') return 'bicep'
    if (p === 'isolation_tricep') return 'tricep'
    if (p === 'isolation_shoulder') return entry.substitution_group === 'shrug' ? 'shrug' : 'lateral_delt'
    if (p === 'isolation_quad') return 'quad_isolation'
    if (p === 'isolation_hamstring') return 'hamstring_isolation'
    if (p === 'isolation_calf') return 'calf_isolation'
    return null
  }
  for (const day of week1?.days ?? []) {
    for (const ex of day.exercises) {
      const entry = dbEntry(ex.name)
      if (!entry || ex.suggested_load_kg == null) continue
      const group = coherenceGroupOf(entry)
      if (!group) continue
      if (!coherenceGroups.has(group)) coherenceGroups.set(group, [])
      const normalizedKg = labelModeForEntry(entry) !== 'total' ? ex.suggested_load_kg * 2 : ex.suggested_load_kg
      coherenceGroups.get(group)!.push({ name: ex.name, kg: ex.suggested_load_kg, normalizedKg })
    }
  }
  for (const [group, items] of coherenceGroups) {
    if (items.length < 2) continue
    const min = Math.min(...items.map(i => i.normalizedKg))
    const max = Math.max(...items.map(i => i.normalizedKg))
    if (min > 0 && max / min > 2.5) {
      violatedRules.add('load_incoherent')
      deductions.push({
        rule: 'load_incoherent', weekNumber: 1,
        detail: `"${group}" load spread this week is ${min}kg-${max}kg normalized (${items.map(i => `${i.name}=${i.kg}kg`).join(', ')})`,
      })
    }
  }

  return { label: 'Selection', points: scoreFromViolatedRules(violatedRules.size), deductions }
}

// ---------------------------------------------------------------------------
// 5. Goal alignment
// ---------------------------------------------------------------------------

function countMainCompoundSlots(week: MesocycleWeek | undefined): number {
  if (!week) return 0
  let count = 0
  for (const day of week.days) {
    for (const ex of day.exercises) {
      if (ex.tier === 'tier_1_primary') count++
    }
  }
  return count
}

function sumWeeklySets(week: MesocycleWeek | undefined): number {
  if (!week) return 0
  return week.days.reduce((sum, day) => sum + day.exercises.reduce((s, ex) => s + ex.sets, 0), 0)
}

/**
 * Generates a comparison mesocycle for a profile variant (different goal or
 * recovery_capacity, everything else identical) — reseeded from its own
 * deterministic key so the comparison plan is itself reproducible, without
 * disturbing the caller's own seeded sequence (the plan being scored has
 * already finished generating by the time this runs).
 */
function generateComparisonMesocycle(profile: UserProfile, seedKey: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seedKey))
  const meso = generateMesocycle(profile)
  resetRandomSource()
  return meso
}

function scoreGoalAlignment(profile: UserProfile, mesocycle: MesocycleWeek[], comboKey: string): DimensionResult {
  const goal = profile.fitness_goal
  const policy = getGoalPolicy(goal)
  const deductions: Deduction[] = []
  type Check = { pass: boolean; detail?: Deduction }
  const checks: Check[] = []

  // Conditioning frequency vs conditioning_preference — always applicable.
  // Excludes duration-filler notes (applyDurationFiller in exercise-plan.ts,
  // is_filler: true): those exist to fill a day that ran short on time, not
  // to satisfy the goal's weekly conditioning-frequency target, and counting
  // them here would inflate the count for anyone whose conditioning
  // preference expected fewer (or zero) sessions.
  const week1 = mesocycle.find(w => w.week_number === 1)
  const actualConditioningDays = week1?.days.filter(d => d.conditioning_note && !d.recommendedCardio?.is_filler).length ?? 0
  const expectedFrequency = resolveConditioningFrequency(policy, profile.conditioning_preference)
  const conditioningOk = Math.abs(actualConditioningDays - expectedFrequency) <= 1
  checks.push({
    pass: conditioningOk,
    detail: conditioningOk ? undefined : {
      rule: 'conditioning_frequency_mismatch', weekNumber: 1,
      detail: `${actualConditioningDays} conditioning day(s) vs ~${expectedFrequency.toFixed(1)} expected for conditioning_preference="${profile.conditioning_preference}"`,
      expected: expectedFrequency.toFixed(1), actual: String(actualConditioningDays),
    },
  })

  // conditioning/fat_loss: conditioning is the goal (or a major lever) for
  // these two, so at least one conditioning entry must be a real
  // prescription — a duration attached — not a bare activity label like
  // "Zone 2 Aerobic Base" with nothing else. Every conditioning_note this
  // engine writes now includes one; this is a regression guard.
  if (goal === 'conditioning' || goal === 'fat_loss') {
    const conditioningEntries = week1?.days.filter(d => d.conditioning_note && !d.recommendedCardio?.is_filler) ?? []
    const anyStructured = conditioningEntries.some(d => /\d+\s*min/.test(d.conditioning_note ?? ''))
    checks.push({
      pass: conditioningEntries.length === 0 || anyStructured,
      detail: conditioningEntries.length === 0 || anyStructured ? undefined : {
        rule: 'conditioning_prescription_vague', weekNumber: 1,
        detail: `Conditioning entries exist but none specify a duration — "${conditioningEntries[0]?.conditioning_note}" is a label, not a prescription`,
      },
    })
  }

  // fat_loss: same main-compound structure and >=85% of hypertrophy's load.
  if (goal === 'fat_loss') {
    const hypertrophyProfile: UserProfile = { ...profile, fitness_goal: 'hypertrophy' }
    const hypertrophyMeso = generateComparisonMesocycle(hypertrophyProfile, `${comboKey}::hypertrophy-compare`)
    const hyWeek1 = hypertrophyMeso.find(w => w.week_number === 1)

    const fatLossMainSlots = countMainCompoundSlots(week1)
    const hyMainSlots = countMainCompoundSlots(hyWeek1)
    const structureOk = fatLossMainSlots >= hyMainSlots
    checks.push({
      pass: structureOk,
      detail: structureOk ? undefined : {
        rule: 'fat_loss_structure_reduced', weekNumber: 1,
        detail: `fat_loss has fewer main-compound slots (${fatLossMainSlots}) than hypertrophy (${hyMainSlots})`,
      },
    })

    const flMain = week1?.days.flatMap(d => d.exercises).find(e => e.tier === 'tier_1_primary' && e.suggested_load_kg != null)
    const hyMain = hyWeek1?.days.flatMap(d => d.exercises).find(e => e.tier === 'tier_1_primary' && e.suggested_load_kg != null)
    if (flMain && hyMain && hyMain.suggested_load_kg) {
      const loadOk = (flMain.suggested_load_kg ?? 0) >= 0.85 * hyMain.suggested_load_kg
      checks.push({
        pass: loadOk,
        detail: loadOk ? undefined : {
          rule: 'fat_loss_load_too_low', weekNumber: 1,
          detail: `fat_loss main lift load (${flMain.suggested_load_kg}kg) is below 85% of hypertrophy's (${hyMain.suggested_load_kg}kg)`,
          expected: `>= ${(hyMain.suggested_load_kg * 0.85).toFixed(1)}kg`, actual: `${flMain.suggested_load_kg}kg`,
        },
      })
    }
  }

  // conditioning goal: no power/max-strength phases.
  if (goal === 'conditioning') {
    const noHeavyPhases = mesocycle.every(w => w.phase_label !== 'Maximal Strength' && w.phase_label !== 'Power & Expression')
    checks.push({
      pass: noHeavyPhases,
      detail: noHeavyPhases ? undefined : {
        rule: 'conditioning_has_heavy_phase', weekNumber: 1,
        detail: `conditioning goal reached a max-strength/power phase: ${[...new Set(mesocycle.map(w => w.phase_label))].join(', ')}`,
      },
    })
  }

  // low recovery_capacity: >=15% fewer weekly sets than an otherwise
  // identical high-recovery profile.
  if (profile.recovery_capacity === 'low') {
    const highProfile: UserProfile = { ...profile, recovery_capacity: 'high' }
    const highMeso = generateComparisonMesocycle(highProfile, `${comboKey}::high-recovery-compare`)
    const lowSets = sumWeeklySets(week1)
    const highSets = sumWeeklySets(highMeso.find(w => w.week_number === 1))
    const expectedRatio = RECOVERY_SET_MULTIPLIER.low / RECOVERY_SET_MULTIPLIER.high
    const recoveryOk = highSets > 0 && lowSets <= highSets * (expectedRatio + 0.02)
    checks.push({
      pass: recoveryOk,
      detail: recoveryOk ? undefined : {
        rule: 'recovery_volume_not_reduced', weekNumber: 1,
        detail: `low recovery_capacity weekly sets (${lowSets}) not >=15% below high (${highSets})`,
      },
    })
  }

  for (const check of checks) {
    if (!check.pass && check.detail) deductions.push(check.detail)
  }
  const passedFraction = checks.length > 0 ? checks.filter(c => c.pass).length / checks.length : 1
  const points = Math.round(passedFraction * DIMENSION_MAX * 10) / 10

  return { label: 'Goal alignment', points, deductions }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function scorePlan(profile: UserProfile, mesocycle: MesocycleWeek[], comboKey: string): PlanScoreResult {
  const dimensions: Record<DimensionKey, DimensionResult> = {
    timeFit: scoreTimeFit(profile, mesocycle),
    structure: scoreStructure(mesocycle),
    progression: scoreProgression(profile, mesocycle),
    selection: scoreSelection(profile, mesocycle),
    goalAlignment: scoreGoalAlignment(profile, mesocycle, comboKey),
    primerFit: scorePrimerFit(profile, mesocycle),
  }
  const overall = DIMENSION_KEYS.reduce((sum, key) => sum + dimensions[key].points, 0)
  return { overall: Math.round(overall * 10) / 10, dimensions }
}
