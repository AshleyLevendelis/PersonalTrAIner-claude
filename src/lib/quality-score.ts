import type { UserProfile, MesocycleWeek, WorkoutDay, Exercise } from './types'
import { EXERCISE_DATABASE, getMovementFamily, type ExerciseEntry } from './exercise-db'
import { getConstrainedPool, generateMesocycle } from './exercise-plan'
import { getGoalPolicy, resolveConditioningFrequency, RECOVERY_SET_MULTIPLIER } from './goal-policies'
import { EXPERIENCE_RPE_CEILING } from './periodization'
import { setRandomSource, resetRandomSource } from './exercise-plan'
import { seededRngFromKey } from './seeded-random'
import { DURATION_BUDGET_SECONDS, estimateDaySeconds } from './session-duration'
import { getEquipmentFloorKg, loadingMode } from './load-prescription'

// ---------------------------------------------------------------------------
// PLAN QUALITY SCORING
// ---------------------------------------------------------------------------
// Five dimensions, 2 points each, 10 total. Each dimension starts at 2 and
// loses a fixed 0.4 per DISTINCT rule violated (not per occurrence) — a day
// with three separate structural problems and a day with one of the same
// problem repeated three times both cost the dimension the same 0.4, but
// every individual occurrence is still recorded in `deductions` for the
// itemized report. This keeps one badly-behaved day from single-handedly
// zeroing a whole dimension while still surfacing everything that's wrong.

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

export type DimensionKey = 'timeFit' | 'structure' | 'progression' | 'selection' | 'goalAlignment'

export const DIMENSION_KEYS: DimensionKey[] = ['timeFit', 'structure', 'progression', 'selection', 'goalAlignment']

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
function scoreTimeRatio(seconds: number, budget: number): number {
  const diff = seconds - budget
  if (diff >= 0) {
    const ratio = diff / budget
    return ratio <= 0.10 ? 2 : ratio <= 0.20 ? 1 : 0
  }
  const ratio = -diff / budget
  return ratio <= 0.20 ? 2 : ratio <= 0.35 ? 1 : 0
}

function scoreTimeFit(profile: UserProfile, mesocycle: MesocycleWeek[]): DimensionResult {
  const budget = DURATION_BUDGET_SECONDS[profile.session_duration_preference || '45-60']
  let worstScore = 2
  let worst: { week: number; day: string; seconds: number; ratio: number; isOver: boolean } | null = null

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
      const dayScore = scoreTimeRatio(seconds, budget)
      if (dayScore < worstScore) {
        const diff = seconds - budget
        worstScore = dayScore
        worst = { week: week.week_number, day: day.day, seconds, ratio: Math.abs(diff) / budget, isOver: diff >= 0 }
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
  return { label: 'Time fit', points: worstScore, deductions }
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

function scoreProgression(profile: UserProfile, mesocycle: MesocycleWeek[]): DimensionResult {
  const block1 = mesocycle.filter(w => w.block_number === 1).sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))
  const [w1, w2, w3, w4] = block1
  const deductions: Deduction[] = []
  const violatedRules = new Set<string>()
  const experience = profile.training_experience || 'novice'
  const ceiling = EXPERIENCE_RPE_CEILING[experience]
  // 'reps'/'maintain' goal policies (conditioning, functional — see
  // goal-policies.ts) deliberately hold the main lift's WEIGHT flat within a
  // block and ramp reps or nothing instead; only 'load' emphasis (hypertrophy,
  // fat_loss) is expected to show a real weight increase week to week.
  const expectsLoadRamp = getGoalPolicy(profile.fitness_goal).progressionEmphasis === 'load'

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
        if (expectsLoadRamp && !(l1 <= l2 && l2 <= l3 && l3 > l1)) {
          violatedRules.add('load_not_progressing')
          deductions.push({
            rule: 'load_not_progressing', day: day.day, weekNumber: 1,
            detail: `${e1.name} load across loading weeks: ${l1} -> ${l2} -> ${l3}`,
            expected: 'non-decreasing with a real increase', actual: `${l1}->${l2}->${l3}`,
          })
        }

        // The equipment floor this main lift is loaded on — an empty bar,
        // the lightest dumbbell pair, a stack's bottom pin. Below this,
        // there is nowhere lower for a load number to go, so neither
        // "deload isn't light enough" nor "calibration isn't conservative
        // enough" are meaningful complaints on their own.
        const mainEntry = dbEntry(e4.name)
        const floor = mainEntry ? getEquipmentFloorKg(mainEntry) : 0

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
        // For 'maintain'/'reps' policies (functional, conditioning), week 3
        // is never re-estimated — it's forced to week 1's own baseline
        // unchanged (see generateMesocycle: forceStartingWeightKg = baselineKg
        // when !rampLoad), because load isn't the progression lever for these
        // goals. l1 === l3 there is the system working as designed, not a
        // calibration that failed to stay conservative — comparing against
        // week 3 only means something when the goal actually expects week 3
        // to have climbed away from it.
        if (expectsLoadRamp && w1.isCalibrationWeek && l3 > floor && l1 > l3 * 0.55) {
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

  const style = profile.training_style || 'hybrid'
  const goal = profile.fitness_goal
  // Bodybuilding/hypertrophy programming routinely pairs a compound (Barbell
  // Bench Press) with an accessory on a different implement (Dumbbell Bench
  // Press) for extra stimulus at a different angle/stability demand — that's
  // normal programming, not the same movement written down twice. Two
  // entries on the SAME implement (or this pairing under any other
  // style/goal) still reads as a duplicate.
  const crossImplementExemptionApplies = style === 'bodybuilding' || goal === 'hypertrophy'

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
      const isMainPlusAccessoryPair =
        exs.length === 2 &&
        entries.filter(e => e.mechanics_tier === 'tier1_compound').length === 1 &&
        entries.filter(e => e.mechanics_tier !== 'tier1_compound').length === 1
      const differentImplements = exs.length === 2 && loadingMode(entries[0]) !== loadingMode(entries[1])
      const exempt = crossImplementExemptionApplies && isMainPlusAccessoryPair && differentImplements
      if (exempt) continue

      violatedRules.add('duplicate_movement_family')
      deductions.push({
        rule: 'duplicate_movement_family', day: day.day, weekNumber: 1,
        detail: `Movement family "${family}" appears twice: ${exs.map(e => e.name).join(', ')}`,
      })
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
  if (poolHasSquat && !hasSquat) {
    violatedRules.add('missing_squat_pattern')
    deductions.push({ rule: 'missing_squat_pattern', weekNumber: 1, detail: 'No squat-pattern exercise anywhere in the week despite equipment allowing one' })
  }
  if (poolHasHinge && !hasHinge) {
    violatedRules.add('missing_hinge_pattern')
    deductions.push({ rule: 'missing_hinge_pattern', weekNumber: 1, detail: 'No hinge-pattern exercise anywhere in the week despite equipment allowing one' })
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
  }
  const overall = DIMENSION_KEYS.reduce((sum, key) => sum + dimensions[key].points, 0)
  return { overall: Math.round(overall * 10) / 10, dimensions }
}
