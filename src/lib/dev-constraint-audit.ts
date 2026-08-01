import { generateExercisePlan, generateMesocycle, getConstrainedPool } from './exercise-plan'
import { EXERCISE_DATABASE } from './exercise-db'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration,
  WorkoutDay, ConstraintTrace, PlanResult, TrainingExperience, RecoveryCapacity,
} from './types'
import { getSkillDemand, isSkillAppropriate } from './experience-config'
import { categorize, CATEGORY_CAPS_KG } from './load-prescription'
import { getReplacementCandidates, swapExerciseInMesocycle, banExerciseFromMesocycle, containsExerciseName } from './mesocycle-edit'
import { estimateDaySeconds, DURATION_BUDGET_SECONDS } from './session-duration'

// All combinations to test — exported so other harnesses (e.g.
// scripts/run-quality-score.ts) reuse the exact same dimensions rather than
// maintaining a second, driftable copy.
export const ALL_EQUIPMENT: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
export const ALL_INJURIES = ['lower_back', 'knees', 'shoulders', 'neck', 'wrists']
export const ALL_DURATIONS: SessionDuration[] = ['30-45', '45-60', '60-90', '90+']
export const ALL_STYLES: TrainingStyle[] = ['functional', 'bodybuilding', 'combat', 'hybrid']
export const ALL_EXPERIENCE: TrainingExperience[] = ['beginner', 'novice', 'intermediate', 'advanced']

/** Empty + each single injury + a few realistic multi-injury combos — same set the constraint audit grid uses. */
export function getInjuryCombinations(): string[][] {
  return [
    [],
    ...ALL_INJURIES.map(i => [i]),
    ['lower_back', 'knees'],
    ['shoulders', 'wrists'],
    ['knees', 'shoulders', 'lower_back'],
  ]
}

// Injury -> joints that should NOT appear in final exercises
const INJURED_JOINTS_MAP: Record<string, string[]> = {
  lower_back: ['lower_back_axial'],
  knees: ['knee'],
  shoulders: ['shoulder'],
  neck: ['neck'],
  wrists: ['wrist'],
}

// Equipment access -> what IS allowed (null = everything)
const EQUIPMENT_SETS: Record<EquipmentAccess, Set<string> | null> = {
  full_gym: null,
  home_gym: new Set([
    'barbell', 'dumbbells', 'dumbbell', 'bench', 'incline bench', 'pull-up bar',
    'dip bars', 'kettlebell', 'resistance band', 'plyo box', 'ab wheel',
    'bodyweight', 'EZ bar', 'squat rack', 'trap bar', 'medicine ball', 'jump rope',
  ]),
  minimalist: new Set([
    'kettlebell', 'resistance band', 'bodyweight', 'dumbbells', 'dumbbell',
    'pull-up bar', 'jump rope', 'medicine ball', 'plyo box', 'ab wheel',
  ]),
  bodyweight: new Set(['bodyweight', 'pull-up bar']),
}

// Style-required patterns
const STYLE_REQUIRED_PATTERNS: Record<TrainingStyle, string[]> = {
  combat: ['core', 'carry'],
  functional: [],
  bodybuilding: [],
  hybrid: [],
}

export interface AuditFailure {
  check:
    | 'equipment' | 'injury' | 'duration' | 'style_pattern' | 'skill' | 'empty_session' | 'load_cap'
    | 'superset_pairing' | 'load_progression' | 'set_progression' | 'goal_structure' | 'recovery_volume'
    | 'swap_constraint' | 'swap_load' | 'ban_purge' | 'prescription_unit'
  combination: string
  details: string
  exercise?: string
}

export interface AuditTestCase {
  equipment: EquipmentAccess
  injuries: string[]
  duration: SessionDuration
  style: TrainingStyle
  experience: TrainingExperience
  passed: boolean
  failures: AuditFailure[]
  planDays: number
  totalExercises: number
  estimatedDurationSec: number
}

export interface AuditReport {
  totalCombinations: number
  passed: number
  failed: number
  results: AuditTestCase[]
  runTimeMs: number
}

function buildTestProfile(
  equipment: EquipmentAccess,
  injuries: string[],
  duration: SessionDuration,
  style: TrainingStyle,
  experience: TrainingExperience
): UserProfile {
  return {
    id: 'audit-test',
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: 'hypertrophy',
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: equipment,
    injuries,
    training_style: style,
    training_experience: experience,
    session_duration_preference: duration,
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate',
    created_at: new Date().toISOString(),
  } as UserProfile
}

/** A main compound lift — anything a superset should never pair together (see CHECK 8 and isSupersetEligible in exercise-plan.ts, which this mirrors). */
function isMainCompound(name: string): boolean {
  const entry = EXERCISE_DATABASE.find(e => e.name === name)
  if (!entry) return false
  if (entry.movement_pattern === 'core' || entry.movement_pattern === 'carry') return false
  return entry.mechanics_tier === 'tier1_compound' || entry.mechanics_tier === 'tier2_compound'
}

// Delegates to the same honest formula the engine itself trims against
// (session-duration.ts) — a second, independently-drifting copy here is
// exactly how this audit could pass while real sessions ran long.
const estimateSessionSeconds = estimateDaySeconds

/** 'reps' -> a bare count/range; 'time'/'intervals' -> a duration ending in 's'; 'distance_load' -> a distance ending in 'm'. Catches an exercise whose reps format doesn't match its own prescription_type — e.g. an isometric hold prescribed in meters. */
function repsMatchesPrescriptionType(reps: string, type: string | undefined): boolean {
  switch (type) {
    case 'reps': return /^\d+(\s*-\s*\d+)?$/.test(reps)
    case 'time':
    case 'intervals': return /^\d+(\s*-\s*\d+)?\s*s$/.test(reps)
    case 'distance_load': return /^\d+(\s*-\s*\d+)?\s*m$/.test(reps)
    default: return true
  }
}

function runSingleAudit(
  equipment: EquipmentAccess,
  injuries: string[],
  duration: SessionDuration,
  style: TrainingStyle,
  experience: TrainingExperience
): AuditTestCase {
  const profile = buildTestProfile(equipment, injuries, duration, style, experience)
  const comboLabel = `${equipment} / ${injuries.length > 0 ? injuries.join('+') : 'none'} / ${duration} / ${style} / ${experience}`
  const failures: AuditFailure[] = []

  let result: PlanResult
  try {
    result = generateExercisePlan(profile)
  } catch (err) {
    return {
      equipment, injuries, duration, style, experience,
      passed: false,
      failures: [{ check: 'equipment', combination: comboLabel, details: `Plan generation threw: ${err}` }],
      planDays: 0, totalExercises: 0, estimatedDurationSec: 0,
    }
  }

  const { plan, constraint_trace } = result
  const allExercises = plan.flatMap(d => d.exercises)

  // CHECK 1: No excluded equipment in output
  const allowedSet = EQUIPMENT_SETS[equipment]
  if (allowedSet) {
    for (const ex of allExercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (!entry) continue
      for (const eq of entry.equipment) {
        if (!allowedSet.has(eq)) {
          failures.push({
            check: 'equipment',
            combination: comboLabel,
            details: `Exercise requires "${eq}" but user only has ${equipment}`,
            exercise: ex.name,
          })
        }
      }
    }
  }

  // CHECK 2: No flagged joint's movement pattern in output
  const flaggedJoints = new Set<string>()
  for (const injury of injuries) {
    const joints = INJURED_JOINTS_MAP[injury]
    if (joints) joints.forEach(j => flaggedJoints.add(j))
  }
  if (flaggedJoints.size > 0) {
    for (const ex of allExercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (!entry) continue
      for (const joint of entry.loads_joints) {
        if (flaggedJoints.has(joint)) {
          failures.push({
            check: 'injury',
            combination: comboLabel,
            details: `Exercise loads joint "${joint}" which is flagged by injury [${injuries.join(', ')}]`,
            exercise: ex.name,
          })
        }
      }
    }
  }

  // CHECK 3: Session duration within tolerance of time cap (15% over allowed)
  const budget = DURATION_BUDGET_SECONDS[duration]
  const tolerance = 1.15
  for (const day of plan) {
    const estSec = estimateSessionSeconds(day)
    if (estSec > budget * tolerance) {
      failures.push({
        check: 'duration',
        combination: comboLabel,
        details: `${day.day} (${day.focus}) estimated at ${Math.round(estSec / 60)}min, budget is ${Math.round(budget / 60)}min (+15% = ${Math.round(budget * tolerance / 60)}min)`,
      })
    }
  }

  // CHECK 4: Style-required patterns present (at least once across the week)
  // NOTE: Some patterns may be relaxed for certain equipment/injury scenarios
  let requiredPatterns = STYLE_REQUIRED_PATTERNS[style]
  
  // Relax 'carry' requirement for bodyweight + limited equipment scenarios
  if (equipment === 'bodyweight' && requiredPatterns.includes('carry')) {
    requiredPatterns = requiredPatterns.filter(p => p !== 'carry')
  }
  if (injuries.includes('wrists') && (equipment === 'minimalist' || equipment === 'bodyweight') && requiredPatterns.includes('carry')) {
    requiredPatterns = requiredPatterns.filter(p => p !== 'carry')
  }
  
  if (requiredPatterns.length > 0) {
    const presentPatterns = new Set<string>()
    for (const ex of allExercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (entry) presentPatterns.add(entry.movement_pattern)
    }
    for (const pattern of requiredPatterns) {
      if (!presentPatterns.has(pattern)) {
        failures.push({
          check: 'style_pattern',
          combination: comboLabel,
          details: `Style "${style}" requires pattern "${pattern}" but it's not present in any session`,
        })
      }
    }
  }

  // CHECK 5: Every scheduled day must contain actual work.
  // This check exists because the audit previously reported 100% pass while
  // silently emitting sessions with zero exercises — a plan that passes every
  // constraint by virtue of being empty is not a plan. 'Active Recovery +
  // Cardio' is the one deliberate exception: assignConditioningNotes() (Part
  // 4 goal policies) pushes these as exercise-less rest-day placeholders
  // carrying only a conditioning note, for every goal now rather than just
  // fat_loss/conditioning — that's a real, intentional zero-exercise day,
  // not a broken one.
  for (const day of plan) {
    if (day.focus === 'Active Recovery + Cardio') continue
    if (day.exercises.length === 0) {
      failures.push({
        check: 'empty_session',
        combination: comboLabel,
        details: `${day.day} (${day.focus}) contains no exercises`,
      })
    }
  }

  // CHECK 6: No exercise exceeds the trainee's skill ceiling.
  // Exempt when the skill filter had to relax to keep the pool non-empty —
  // that relaxation is deliberate and is recorded in the trace.
  const skillRelaxed = result.constraint_trace.skill_filtered.some(
    e => e.exercise === '(all)'
  )
  if (!skillRelaxed) {
    for (const ex of allExercises) {
      if (!isSkillAppropriate(ex.name, experience)) {
        failures.push({
          check: 'skill',
          combination: comboLabel,
          details: `"${ex.name}" has ${getSkillDemand(ex.name)} skill demand, too advanced for "${experience}"`,
          exercise: ex.name,
        })
      }
    }
  }

  // CHECK 7: No suggested load exceeds its category's absolute first-block
  // safety cap. `generateExercisePlan` always produces a first, unverified
  // prescription, so every non-null suggested_load_kg here should have been
  // capped by prescribeLoad — this check catches a regression in that path.
  for (const ex of allExercises) {
    if (ex.suggested_load_kg == null) continue
    const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
    if (!entry) continue
    const category = categorize(entry)
    if (!category) continue
    const cap = CATEGORY_CAPS_KG[category]
    if (cap != null && ex.suggested_load_kg > cap) {
      failures.push({
        check: 'load_cap',
        combination: comboLabel,
        details: `Suggested load ${ex.suggested_load_kg}kg exceeds the ${cap}kg first-prescription safety cap for category "${category}"`,
        exercise: ex.name,
      })
    }
  }

  // CHECK 8: No superset pairs two main compound lifts (Part 3). Groups
  // exercises by their superset_label letter (A1/A2, B1/B2, ...) and flags
  // any pair where both sides are tier1/tier2 compound, non-core/carry work.
  for (const day of plan) {
    const labeled = day.exercises.filter(e => e.superset_label)
    const groups = new Map<string, typeof labeled>()
    for (const ex of labeled) {
      const letter = ex.superset_label![0]
      if (!groups.has(letter)) groups.set(letter, [])
      groups.get(letter)!.push(ex)
    }
    for (const pairExercises of groups.values()) {
      if (pairExercises.length !== 2) continue
      if (pairExercises.every(e => isMainCompound(e.name))) {
        failures.push({
          check: 'superset_pairing',
          combination: comboLabel,
          details: `${day.day}: two main compounds superset together — ${pairExercises.map(e => e.name).join(' + ')}`,
        })
      }
    }
  }

  // CHECK 9: every exercise's reps format matches its own prescription_type.
  for (const ex of allExercises) {
    const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
    if (!entry) continue
    if (!repsMatchesPrescriptionType(ex.reps, entry.prescription_type)) {
      failures.push({
        check: 'prescription_unit',
        combination: comboLabel,
        details: `"${ex.name}" is prescription_type '${entry.prescription_type}' but reps is "${ex.reps}"`,
        exercise: ex.name,
      })
    }
  }

  const maxDuration = plan.reduce((max, day) => Math.max(max, estimateSessionSeconds(day)), 0)

  return {
    equipment, injuries, duration, style, experience,
    passed: failures.length === 0,
    failures,
    planDays: plan.length,
    totalExercises: allExercises.length,
    estimatedDurationSec: maxDuration,
  }
}

// ---------------------------------------------------------------------------
// Mesocycle behavior checks (b/c/d/e) — a sampled pass, not a cross-product
// ---------------------------------------------------------------------------
// generateMesocycle() produces 16 weeks per profile, an order of magnitude
// more expensive than the base plan the equipment x injury x duration x
// style audit above already runs 2304 times. Crossing recovery_capacity and
// conditioning_preference into that same grid would mean tens of thousands
// of 16-week generations. These checks instead run a small, deliberately
// chosen set of profiles built to isolate exactly the behavior in question —
// same approach the spec asked for ("sampling ... rather than full
// cross-product").

function baseMesocycleProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    // Deliberately no `id` — recomputeLoad()'s logged-history lookup
    // (progression-engine.ts -> supabase.ts) only runs when profile.id is
    // set, and this audit has no live database to query against. Omitting
    // it keeps these checks exercising the constraint-pool/estimate path,
    // which is what's actually being verified here.
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: 'hypertrophy',
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: 'full_gym',
    injuries: [],
    training_style: 'hybrid',
    training_experience: 'intermediate',
    session_duration_preference: '60-90',
    workout_split_preference: 'upper_lower',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: true },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: false },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate',
    created_at: new Date().toISOString(),
    ...overrides,
  } as UserProfile
}

function countMainCompoundSlots(days: WorkoutDay[]): number {
  let count = 0
  for (const day of days) {
    for (const ex of day.exercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name.toLowerCase() === ex.name.toLowerCase())
      if (entry?.mechanics_tier === 'tier1_compound' && entry.movement_pattern !== 'core' && entry.movement_pattern !== 'carry') {
        count++
      }
    }
  }
  return count
}

function sumWeeklySets(days: WorkoutDay[]): number {
  return days.reduce((sum, day) => sum + day.exercises.reduce((s, ex) => s + ex.sets, 0), 0)
}

async function runMesocycleBehaviorChecks(): Promise<AuditTestCase[]> {
  const cases: AuditTestCase[] = []

  // CHECK (b) + (c): within block 1, main-lift load is non-decreasing across
  // the three loading weeks and drops on deload; sets never increase
  // week-over-week within the block. Run against a couple of goals since
  // 'load' vs 'reps'/'maintain' progressionEmphasis changes what "the load"
  // even means — hypertrophy and fat_loss are both 'load' emphasis (Part 4).
  for (const goal of ['hypertrophy', 'fat_loss'] as const) {
    const profile = baseMesocycleProfile({ fitness_goal: goal })
    const comboLabel = `[mesocycle progression] goal=${goal}`
    const failures: AuditFailure[] = []

    const meso = generateMesocycle(profile)
    const block1 = meso.filter(w => w.block_number === 1).sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))

    for (const day of profile.training_days.filter(d => d.available)) {
      const weekDays = block1.map(w => w.days.find(d => d.day === day.day))
      const mainLifts = weekDays.map(d => d?.exercises.find(e => e.tier === 'tier_1_primary'))
      if (mainLifts.some(e => !e)) continue

      const loads = mainLifts.map(e => e!.suggested_load_kg)
      const sets = mainLifts.map(e => e!.sets)

      if (loads.every(l => l != null)) {
        const [w1, w2, w3, w4] = loads as number[]
        if (!(w1 <= w2 && w2 <= w3)) {
          failures.push({
            check: 'load_progression',
            combination: comboLabel,
            details: `${day.day} main lift load not non-decreasing across loading weeks: ${w1} -> ${w2} -> ${w3}`,
            exercise: mainLifts[0]!.name,
          })
        }
        if (!(w4 < w3)) {
          failures.push({
            check: 'load_progression',
            combination: comboLabel,
            details: `${day.day} main lift deload (${w4}) did not drop below week 3 (${w3})`,
            exercise: mainLifts[0]!.name,
          })
        }
      }

      const [s1, s2, s3] = sets
      if (!(s2 <= s1 && s3 <= s2)) {
        failures.push({
          check: 'set_progression',
          combination: comboLabel,
          details: `${day.day} main lift sets increased within block 1: ${s1} -> ${s2} -> ${s3}`,
          exercise: mainLifts[0]!.name,
        })
      }
    }

    const allExercises = block1.flatMap(w => w.days.flatMap(d => d.exercises))
    cases.push({
      equipment: profile.equipment_access, injuries: profile.injuries, duration: profile.session_duration_preference,
      style: profile.training_style, experience: profile.training_experience,
      passed: failures.length === 0, failures,
      planDays: block1[0]?.days.length ?? 0, totalExercises: allExercises.length, estimatedDurationSec: 0,
    })
  }

  // CHECK (d): fat_loss keeps the same main-compound structure as
  // hypertrophy — same number of tier1_compound slots across the week, i.e.
  // it's still a lifting program, not converted to circuits/isolation-only
  // work to hit its lower set-volume target.
  {
    const comboLabel = '[mesocycle goal structure] fat_loss vs hypertrophy'
    const failures: AuditFailure[] = []
    const hypertrophyDays = generateExercisePlan(baseMesocycleProfile({ fitness_goal: 'hypertrophy' })).plan
    const fatLossDays = generateExercisePlan(baseMesocycleProfile({ fitness_goal: 'fat_loss' })).plan
    const hypertrophyMainSlots = countMainCompoundSlots(hypertrophyDays)
    const fatLossMainSlots = countMainCompoundSlots(fatLossDays)
    if (fatLossMainSlots < hypertrophyMainSlots) {
      failures.push({
        check: 'goal_structure',
        combination: comboLabel,
        details: `fat_loss has fewer main-compound slots (${fatLossMainSlots}) than hypertrophy (${hypertrophyMainSlots}) — looks converted away from lifting rather than just lower volume`,
      })
    }
    cases.push({
      equipment: 'full_gym', injuries: [], duration: '60-90', style: 'hybrid', experience: 'intermediate',
      passed: failures.length === 0, failures,
      planDays: fatLossDays.length, totalExercises: fatLossDays.flatMap(d => d.exercises).length, estimatedDurationSec: 0,
    })
  }

  // CHECK (e): low recovery_capacity produces lower weekly set volume than
  // high, all else equal.
  {
    const comboLabel = '[mesocycle recovery volume] low vs high recovery_capacity'
    const failures: AuditFailure[] = []
    const weeklySets: Record<RecoveryCapacity, number> = { low: 0, moderate: 0, high: 0 }
    for (const capacity of ['low', 'high'] as RecoveryCapacity[]) {
      const meso = generateMesocycle(baseMesocycleProfile({ recovery_capacity: capacity }))
      const week1 = meso.find(w => w.week_number === 1)!
      weeklySets[capacity] = sumWeeklySets(week1.days)
    }
    if (!(weeklySets.low < weeklySets.high)) {
      failures.push({
        check: 'recovery_volume',
        combination: comboLabel,
        details: `low recovery_capacity weekly sets (${weeklySets.low}) not lower than high (${weeklySets.high})`,
      })
    }
    cases.push({
      equipment: 'full_gym', injuries: [], duration: '60-90', style: 'hybrid', experience: 'intermediate',
      passed: failures.length === 0, failures,
      planDays: 0, totalExercises: 0, estimatedDurationSec: 0,
    })
  }

  // CHECK (f): prescription units survive rotation across the FULL 16-week
  // mesocycle, not just the base week-1 plan. Block-level and weekly
  // accessory rotation can land on an exercise with a different
  // prescription_type than the one it replaced (Farmer Squat Hold, a
  // time-based hold, shares a substitution_group/tier with Farmer's Walk, a
  // distance-based walk) — this is where that regression would actually show
  // up, since the single-plan checks above never rotate.
  for (const goal of ['hypertrophy', 'conditioning'] as const) {
    const profile = baseMesocycleProfile({ fitness_goal: goal, equipment_access: 'full_gym' })
    const comboLabel = `[mesocycle prescription units] goal=${goal}`
    const failures: AuditFailure[] = []
    const meso = generateMesocycle(profile)
    let totalExercises = 0
    for (const week of meso) {
      for (const day of week.days) {
        for (const ex of day.exercises) {
          totalExercises++
          const entry = EXERCISE_DATABASE.find(e => e.name.toLowerCase() === ex.name.toLowerCase())
          if (!entry) continue
          if (!repsMatchesPrescriptionType(ex.reps, entry.prescription_type)) {
            failures.push({
              check: 'prescription_unit',
              combination: `${comboLabel} wk${week.week_number} ${day.day}`,
              details: `"${ex.name}" is prescription_type '${entry.prescription_type}' but reps is "${ex.reps}"`,
              exercise: ex.name,
            })
          }
        }
      }
    }
    cases.push({
      equipment: profile.equipment_access, injuries: [], duration: profile.session_duration_preference,
      style: profile.training_style, experience: profile.training_experience,
      passed: failures.length === 0, failures,
      planDays: 0, totalExercises, estimatedDurationSec: 0,
    })
  }

  // CHECK (Part 7): swapped-in exercises pass every constraint stage, their
  // load is independently derived (never the outgoing exercise's kg), and a
  // banned exercise is gone from EVERY week of the persisted mesocycle.
  {
    const comboLabel = '[mesocycle swap/ban] constraint compliance + load independence + ban purge'
    const failures: AuditFailure[] = []
    const profile = baseMesocycleProfile({ injuries: ['shoulders'] })
    const mesocycle = generateMesocycle(profile)
    const week1 = mesocycle.find(w => w.week_number === 1)!
    const dayWithMain = week1.days.find(d => d.exercises.some(e => e.tier === 'tier_1_primary'))

    if (dayWithMain) {
      const dayName = dayWithMain.day
      const exIndex = dayWithMain.exercises.findIndex(e => e.tier === 'tier_1_primary')
      const outgoing = dayWithMain.exercises[exIndex]

      const candidates = getReplacementCandidates(outgoing.name, profile, [])
      const poolNames = new Set(getConstrainedPool(profile, []).map(e => e.name))
      for (const c of candidates) {
        if (!poolNames.has(c.exercise.name)) {
          failures.push({
            check: 'swap_constraint', combination: comboLabel,
            details: `candidate "${c.exercise.name}" is not in the constraint-filtered pool (equipment/injury/style/skill)`,
            exercise: c.exercise.name,
          })
        }
      }

      if (candidates.length > 0) {
        const replacement = candidates[0].exercise
        const swapped = await swapExerciseInMesocycle({
          mesocycle, profile, currentWeekNumber: 1, dayName, exIndex, newExercise: replacement, scope: 'today',
        })
        const swappedEx = swapped.find(w => w.week_number === 1)!.days.find(d => d.day === dayName)!.exercises[exIndex]
        if (swappedEx.name !== replacement.name) {
          failures.push({ check: 'swap_constraint', combination: comboLabel, details: 'swap did not change the exercise name' })
        }
        // Independence is only provable, not merely "different," when the
        // two exercises use different loading modes/standards — same
        // category (e.g. two barbell squats) can legitimately land on the
        // same kg by coincidence. Barbell -> non-barbell candidates are
        // common in this constraint pool and make a carry-over bug obvious.
        if (swappedEx.suggested_load_kg === outgoing.suggested_load_kg) {
          failures.push({
            check: 'swap_load', combination: comboLabel,
            details: `swapped-in load (${swappedEx.suggested_load_kg}kg) exactly equals the outgoing exercise's load — looks carried over rather than independently derived`,
            exercise: swappedEx.name,
          })
        }
      }
    }

    // Ban purge: pick any exercise present in the mesocycle and confirm it's
    // gone from every week afterward.
    const anyExercise = mesocycle.flatMap(w => w.days.flatMap(d => d.exercises))[0]
    if (anyExercise) {
      const afterBan = await banExerciseFromMesocycle({
        mesocycle, profile, bannedName: anyExercise.name, exclusions: [anyExercise.name],
      })
      if (containsExerciseName(afterBan, anyExercise.name)) {
        failures.push({
          check: 'ban_purge', combination: comboLabel,
          details: `"${anyExercise.name}" still appears somewhere in the mesocycle after being banned`,
          exercise: anyExercise.name,
        })
      }
    }

    cases.push({
      equipment: 'full_gym', injuries: ['shoulders'], duration: '60-90', style: 'hybrid', experience: 'intermediate',
      passed: failures.length === 0, failures,
      planDays: 0, totalExercises: 0, estimatedDurationSec: 0,
    })
  }

  return cases
}

export async function runFullConstraintAudit(
  onProgress?: (done: number, total: number) => void
): Promise<AuditReport> {
  const startTime = performance.now()

  const injuryCombinations = getInjuryCombinations()

  const totalCombinations =
    ALL_EQUIPMENT.length * injuryCombinations.length * ALL_DURATIONS.length *
    ALL_STYLES.length * ALL_EXPERIENCE.length
  const results: AuditTestCase[] = []
  let done = 0

  for (const equipment of ALL_EQUIPMENT) {
    for (const injuries of injuryCombinations) {
      for (const duration of ALL_DURATIONS) {
        for (const style of ALL_STYLES) {
          for (const experience of ALL_EXPERIENCE) {
            const testCase = runSingleAudit(equipment, injuries, duration, style, experience)
            results.push(testCase)
            done++
            onProgress?.(done, totalCombinations)
          }
        }
      }
    }
  }

  // Sampled mesocycle-behavior checks (b/c/d/e) — see runMesocycleBehaviorChecks
  // for why these run against a handful of targeted profiles instead of
  // being crossed into the grid above.
  const mesocycleCases = await runMesocycleBehaviorChecks()
  results.push(...mesocycleCases)

  const runTimeMs = performance.now() - startTime

  return {
    totalCombinations: totalCombinations + mesocycleCases.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results,
    runTimeMs,
  }
}
