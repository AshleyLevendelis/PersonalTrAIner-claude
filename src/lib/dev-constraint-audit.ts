import { generateExercisePlan, generateMesocycle, getConstrainedPool, getFlaggedJoints, setRandomSource, resetRandomSource } from './exercise-plan'
import { seededRngFromKey } from './seeded-random'
import { EXERCISE_DATABASE, meetsCapabilityRequirement, isContraindicatedFor, contraindicatedJoints } from './exercise-db'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration,
  WorkoutDay, ConstraintTrace, PlanResult, TrainingExperience, RecoveryCapacity, FitnessGoal,
} from './types'
import { getSkillDemand, isSkillAppropriate } from './experience-config'
import { categorize, isImprovisedLoadImplement, IMPROVISED_IMPLEMENT_CEILING_KG, estimateEffectiveTotalKg, isExternallyLoaded, prescribeLoad, getEquipmentFloorKg, getLoadingCeilingKg, loadingMode, unverifiedRampStepKg } from './load-prescription'

// A genuine outer-bound safety backstop — not a conservatism patch (the
// capability-model round replaced the old CATEGORY_CAPS_KG, which existed to
// compensate for an inaccurate base estimate, with a real strength-standards
// table that no longer needs propping up). These numbers are generous enough
// that a correct estimate for ANY profile should never approach them; if one
// does, that's a formula regression, not a legitimately heavy lifter.
//
// RECALIBRATED across the real bodyweight/gender range (50-120kg, both
// sexes, all four experience tiers, every rep/RPE bracket a plan actually
// prescribes) rather than against the single 80kg male this grid used to
// run. Seven of these were breached by a legitimate estimate at the heavy
// end — every breach traced to the same 120kg advanced male at 3-5 reps,
// which is a real trainee, not a formula regression. Each raised ceiling
// sits ~25% above the highest legitimate observed value, preserving the
// "no correct estimate should ever approach this" intent while actually
// covering the population.
//
// DELIBERATELY NOT RAISED — isolation_shoulder (stays 25kg, still breached
// at 40kg by Cable Lateral Raises for a 120kg advanced male). A 40kg
// lateral raise is not a real prescription at any bodyweight; the shoulder
// isolation fraction (0.19 of bench, load-prescription.ts) is what's wrong,
// not this ceiling. Raising it here would silence a genuine defect, which
// is the one thing an outer-bound backstop must never do. The audit keeps
// failing on it on purpose.
const SAFETY_CEILING_KG: Partial<Record<string, number>> = {
  squat: 260, deadlift: 325, bench: 220, overhead: 140, row: 200,
  pulldown: 180, leg_press: 400, goblet_squat: 60, hinge_accessory: 180,
  isolation_bicep: 70, isolation_tricep: 80, isolation_chest: 95,
  isolation_shoulder: 25, shrug: 140, isolation_quad: 115,
  isolation_hamstring: 115, isolation_calf: 140, carry: 130,
  // Previously had no ceiling at all — a category with no entry here is
  // silently exempt from the whole check, which is how these two went
  // unbounded. Observed peaks 48kg / 42kg respectively.
  overhead_carry: 70, single_leg_dumbbell: 60,
}
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

// Equipment access -> what IS allowed (null = everything)
const EQUIPMENT_SETS: Record<EquipmentAccess, Set<string> | null> = {
  full_gym: null,
  home_gym: new Set([
    'barbell', 'dumbbells', 'dumbbell', 'bench', 'incline bench', 'pull-up bar',
    'dip bars', 'kettlebell', 'resistance band', 'plyo box', 'ab wheel',
    'bodyweight', 'EZ bar', 'squat rack', 'trap bar', 'medicine ball', 'jump rope',
    'weighted backpack',
  ]),
  minimalist: new Set([
    'kettlebell', 'resistance band', 'bodyweight', 'dumbbells', 'dumbbell',
    'pull-up bar', 'jump rope', 'medicine ball', 'plyo box', 'ab wheel',
    'weighted backpack',
  ]),
  bodyweight: new Set(['bodyweight', 'pull-up bar', 'weighted backpack']),
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
    | 'swap_constraint' | 'swap_load' | 'ban_purge' | 'prescription_unit' | 'capability_gate'
    | 'improvised_carry_cap' | 'pattern_coverage' | 'rotation_relative_load' | 'phase_sequence'
    | 'ramp_up_missing' | 'calibration_load_ceiling' | 'block_transition_jump' | 'loading_ceiling'
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

// Every load calculation in load-prescription.ts scales off profile.weight_kg
// and profile.gender (separate male/female strength-standards tables) — the
// base grid ran exactly one hardcoded body (80kg male) through every other
// combo, so a load defect visible only at a different bodyweight or for a
// female profile was structurally invisible here, the same coverage gap the
// mesocycle-safety sweep closed for itself (see WEIGHT_GENDER_OPTIONS' other
// call site in runMesocycleBehaviorChecks). Single source of truth so both
// grids stay in sync rather than drifting two independently-picked lists.
export const WEIGHT_GENDER_OPTIONS: { weightKg: number; gender: 'male' | 'female' }[] = [
  { weightKg: 50, gender: 'female' },
  { weightKg: 62, gender: 'female' },
  { weightKg: 70, gender: 'male' },
  { weightKg: 80, gender: 'male' },
  { weightKg: 100, gender: 'male' },
  { weightKg: 120, gender: 'male' },
]

function buildTestProfile(
  equipment: EquipmentAccess,
  injuries: string[],
  duration: SessionDuration,
  style: TrainingStyle,
  experience: TrainingExperience,
  weightKg: number = 80,
  gender: 'male' | 'female' = 'male',
): UserProfile {
  return {
    id: 'audit-test',
    age: 30,
    gender,
    height_cm: 178,
    weight_kg: weightKg,
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
  experience: TrainingExperience,
  weightKg: number = 80,
  gender: 'male' | 'female' = 'male',
): AuditTestCase {
  const profile = buildTestProfile(equipment, injuries, duration, style, experience, weightKg, gender)
  const comboLabel = `${equipment} / ${injuries.length > 0 ? injuries.join('+') : 'none'} / ${duration} / ${style} / ${experience} / ${weightKg}kg ${gender}`
  const failures: AuditFailure[] = []

  let result: PlanResult
  try {
    // Seeded the same way run-quality-score.ts's harness seeds
    // generateMesocycle — same key -> same shuffle() outcome -> same plan,
    // every run. Without this, the audit's own ✗-count could drift between
    // runs purely from which candidate exercise a tie-break shuffle put
    // first, with nothing in the codebase actually changing.
    setRandomSource(seededRngFromKey(comboLabel))
    result = generateExercisePlan(profile)
    resetRandomSource()
  } catch (err) {
    resetRandomSource()
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

  // CHECK 2: nothing CONTRAINDICATED for a flagged joint reaches the plan.
  //
  // Deliberately not "nothing that loads a flagged joint": that was the old
  // rule, and it's the same conflation the three-state tags exist to undo
  // (see exercise-db.ts). Under it this check would fail every rotator-cuff
  // rehab movement prescribed FOR a shoulder injury, and every
  // shoulder-friendly press — both of which are the correct output, not a
  // violation. The real invariant is contraindication, which
  // isContraindicatedFor answers (and which never returns true for an
  // INDICATED movement).
  const flaggedJoints = getFlaggedJoints(injuries)
  if (flaggedJoints.size > 0) {
    for (const ex of allExercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (!entry) continue
      if (isContraindicatedFor(entry, flaggedJoints)) {
        const offending = contraindicatedJoints(entry).filter(j => flaggedJoints.has(j))
        failures.push({
          check: 'injury',
          combination: comboLabel,
          details: `Exercise is contraindicated for joint(s) [${offending.join(', ')}], flagged by injury [${injuries.join(', ')}]`,
          exercise: ex.name,
        })
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

  // CHECK 6b: capability_requirement gate — a beginner/novice must never
  // receive a gated skill movement (pull-ups, archer/deficit push-ups,
  // pistols, Nordic curls, hanging leg raises, ab wheel, plyometric
  // primers) in ANY slot, including primers. Distinct from CHECK 6 above:
  // SKILL_DEMAND's 3-level ceiling alone lets a novice (ceiling 'high')
  // through on several of these.
  for (const ex of allExercises) {
    const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
    if (!entry || !meetsCapabilityRequirement(entry, experience)) {
      failures.push({
        check: 'capability_gate',
        combination: comboLabel,
        details: `"${ex.name}" requires ${entry?.capability_requirement?.minExperience}+ experience but this profile is "${experience}"`,
        exercise: ex.name,
      })
    }
  }

  // CHECK 7: No suggested load exceeds its category's absolute first-block
  // safety ceiling (see SAFETY_CEILING_KG above) — a formula regression
  // backstop, not a conservatism cap.
  for (const ex of allExercises) {
    if (ex.suggested_load_kg == null) continue
    const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
    if (!entry) continue
    const category = categorize(entry)
    if (!category) continue
    const cap = SAFETY_CEILING_KG[category]
    if (cap != null && ex.suggested_load_kg > cap) {
      failures.push({
        check: 'load_cap',
        combination: comboLabel,
        details: `Suggested load ${ex.suggested_load_kg}kg exceeds the ${cap}kg outer-bound safety ceiling for category "${category}"`,
        exercise: ex.name,
      })
    }
  }

  // CHECK 7z: SAFETY NET, must never actually fire — no suggested load
  // exceeds its implement's realistic physical ceiling
  // (LOADING_CEILING_KG_PER_HAND_OR_TOTAL). prescribeLoad already clamps and
  // warns when this happens; this check exists to FAIL THE AUDIT if it ever
  // does, on the theory that a ceiling silently doing its job is a passing
  // grid hiding a real defect, not a passing grid. See the "88kg Kettlebell
  // Swings" incident (applyReplacement's missing primer guard) for exactly
  // the kind of upstream bug this is meant to surface rather than absorb.
  for (const ex of allExercises) {
    if (ex.suggested_load_kg == null) continue
    const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
    if (!entry) continue
    const category = categorize(entry)
    const ceiling = getLoadingCeilingKg(entry, category)
    if (ex.suggested_load_kg > ceiling) {
      failures.push({
        check: 'loading_ceiling',
        combination: comboLabel,
        details: `"${ex.name}" suggested load ${ex.suggested_load_kg}kg exceeds the ${ceiling}kg realistic implement ceiling — prescribeLoad's clamp caught this, which means something upstream computed a wrong number`,
        exercise: ex.name,
      })
    }
  }

  // CHECK 7a: GUARDRAIL (C0 calibration round, Fix 2) — every tier1_compound
  // in every generated session has its own ramp block. This is what actually
  // failed before Fix 2: a day with two main lifts (e.g. Squats then
  // Deadlifts) ramped only whichever came first in exercise order, sending
  // the second in cold. A hard failing check, not a soft quality-score
  // deduction — a heavy lift with no warm-up lead-in is a safety property,
  // not a style preference.
  for (const day of plan) {
    const rampedNames = new Set((day.warmup?.ramp_ups ?? []).map(r => r.exercise))
    for (const ex of day.exercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (entry?.mechanics_tier !== 'tier1_compound') continue
      if (!isExternallyLoaded(entry)) continue // bodyweight tier1 (e.g. Pull-Ups) has nothing to ramp
      if (!rampedNames.has(ex.name)) {
        failures.push({
          check: 'ramp_up_missing',
          combination: comboLabel,
          details: `"${ex.name}" is a tier1_compound on ${day.day} with no ramp-up block in warmup.ramp_ups`,
          exercise: ex.name,
        })
        continue
      }
      // Ramp-visibility fix: this guardrail used to stop at "present
      // somewhere in warmup.ramp_ups" — which is exactly how the real bug
      // shipped invisibly. buildWarmup's ramp is day-level and string-keyed
      // by name only; the exercise row that actually shows the working
      // weight had no code path back to it at all, so a user could see
      // "S1: 90kg" with zero ramp in sight while this check stayed green.
      // Assert the SAME data also reached the Exercise object the UI
      // actually renders per-row (exercise-plan.ts's day-build loop) — a
      // day-level-only ramp is now a hard failure here, not just a UI gap.
      if (!ex.ramp_up || ex.ramp_up.exercise !== ex.name) {
        failures.push({
          check: 'ramp_up_missing',
          combination: comboLabel,
          details: `"${ex.name}" is a tier1_compound on ${day.day} with a ramp-up block in warmup.ramp_ups but NOT attached to its own Exercise.ramp_up — invisible on the exercise row`,
          exercise: ex.name,
        })
      }
    }
  }

  // CHECK 7b: SAFETY — no improvised-implement (backpack) prescription
  // ever exceeds its tier's absolute ceiling (IMPROVISED_IMPLEMENT_CEILING_KG),
  // on ANY exercise using that equipment (originally carry-only; a
  // follow-up review round found Backpack Row uncapped at 45-65kg — see
  // isImprovisedLoadImplement's doc comment). This must be impossible to
  // regress: a review caught a bodyweight-only novice handed a 35-40kg
  // backpack carry in their first calibration week with no safety framing
  // at all, flagged as the one genuinely dangerous finding across every
  // review round. This checks the base (unperiodized) plan only — see
  // runMesocycleBehaviorChecks for the same check run across every week of
  // a full periodized mesocycle, which the base-plan snapshot can't catch
  // (a ramp/rotation could theoretically push a capped exercise back over
  // in a later week).
  for (const ex of allExercises) {
    if (ex.suggested_load_kg == null) continue
    const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
    if (!entry || !isImprovisedLoadImplement(entry)) continue
    const ceiling = IMPROVISED_IMPLEMENT_CEILING_KG[experience]
    if (ex.suggested_load_kg > ceiling) {
      failures.push({
        check: 'improvised_carry_cap',
        combination: comboLabel,
        details: `"${ex.name}" suggested load ${ex.suggested_load_kg}kg exceeds the ${ceiling}kg improvised-implement safety ceiling for "${experience}"`,
        exercise: ex.name,
      })
    }
  }

  // CHECK 7c: weekly pattern-coverage guarantees (Final Generator round,
  // Fix 1) — squat, hinge, horizontal/vertical push, horizontal/vertical
  // pull each appear at least once across the week's plan, UNLESS the
  // constrained pool for this combo genuinely has none of that pattern
  // (equipment/injury exclusion — nothing to guarantee in that case). Plus
  // legs (squat or hinge, non-isolation role) on >=2 days for 4+ day
  // splits. Mirrors classifyForCoverage/enforceWeeklyPatternBalance in
  // exercise-plan.ts; duplicated here rather than exported since this file
  // already keeps its own copies of similar engine internals (see
  // EQUIPMENT_SETS above) for audit independence.
  {
    type CoveragePattern = 'squat' | 'hinge' | 'horizontal_push' | 'vertical_push' | 'horizontal_pull' | 'vertical_pull'
    const classifyForCoverage = (pattern: string): CoveragePattern | null => {
      switch (pattern) {
        case 'horizontal_push': return 'horizontal_push'
        case 'vertical_push': return 'vertical_push'
        case 'horizontal_pull': return 'horizontal_pull'
        case 'vertical_pull': return 'vertical_pull'
        case 'knee_dominant': case 'single_leg': return 'squat'
        case 'hip_hinge': return 'hinge'
        default: return null
      }
    }
    const pool = getConstrainedPool(profile, [])
    const present = new Set<CoveragePattern>()
    for (const ex of allExercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      const cov = entry ? classifyForCoverage(entry.movement_pattern) : null
      if (cov) present.add(cov)
    }
    const patterns: CoveragePattern[] = ['squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull']
    for (const p of patterns) {
      if (present.has(p)) continue
      const poolHasIt = pool.some(e => classifyForCoverage(e.movement_pattern) === p)
      if (!poolHasIt) continue
      failures.push({
        check: 'pattern_coverage',
        combination: comboLabel,
        details: `weekly plan has zero '${p}' pattern exercises despite the constrained pool having ${pool.filter(e => classifyForCoverage(e.movement_pattern) === p).length} eligible candidate(s)`,
      })
    }

    if (plan.length >= 4) {
      const legDayCount = plan.filter(day =>
        day.exercises.some(ex => {
          const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
          if (!entry) return false
          const cov = classifyForCoverage(entry.movement_pattern)
          return (cov === 'squat' || cov === 'hinge') && entry.mechanics_tier !== 'tier3_isolation'
        })
      ).length
      const poolHasLeg = pool.some(e => {
        const cov = classifyForCoverage(e.movement_pattern)
        return cov === 'squat' || cov === 'hinge'
      })
      if (legDayCount < 2 && poolHasLeg) {
        failures.push({
          check: 'pattern_coverage',
          combination: comboLabel,
          details: `legs trained on only ${legDayCount} of ${plan.length} days (need >=2 on a 4+ day split) despite squat/hinge candidates existing in the constrained pool`,
        })
      }
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

    setRandomSource(seededRngFromKey(comboLabel))
    const meso = generateMesocycle(profile)
    resetRandomSource()
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

      // CHECK: rotation relative-load guard (Final Generator round, Fix 3)
      // — whenever an exercise's NAME changed between week 1 and week 3
      // (block-boundary or within-block accessory rotation), and both the
      // old and new exercise are externally loaded, the new one's effective
      // total load must stay within the +-40% band preservesRelativeLoad
      // enforces at generation time. This is a backstop, not the primary
      // enforcement (rotateVariation/getSmartReplacements already filter
      // candidates by it) — it exists to catch a regression in that
      // enforcement, the same role CHECK 7's load_cap plays for the
      // strength-standards formula.
      const w1Exercises = weekDays[0]?.exercises ?? []
      const w3Exercises = weekDays[2]?.exercises ?? []
      for (let i = 0; i < Math.min(w1Exercises.length, w3Exercises.length); i++) {
        const oldName = w1Exercises[i].name
        const newName = w3Exercises[i].name
        if (oldName === newName) continue
        const oldEntry = EXERCISE_DATABASE.find(e => e.name === oldName)
        const newEntry = EXERCISE_DATABASE.find(e => e.name === newName)
        if (!oldEntry || !newEntry) continue
        if (!isExternallyLoaded(oldEntry) || !isExternallyLoaded(newEntry)) continue
        const oldKg = estimateEffectiveTotalKg(oldEntry, profile)
        const newKg = estimateEffectiveTotalKg(newEntry, profile)
        if (oldKg == null || oldKg <= 0 || newKg == null) continue
        const ratio = newKg / oldKg
        if (ratio < 0.6 || ratio > 1.4) {
          failures.push({
            check: 'rotation_relative_load',
            combination: comboLabel,
            details: `${day.day} rotated "${oldName}" (~${oldKg.toFixed(1)}kg) -> "${newName}" (~${newKg.toFixed(1)}kg), a ${(ratio * 100).toFixed(0)}% relative load — outside the 60-140% band`,
            exercise: newName,
          })
        }
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
    setRandomSource(seededRngFromKey(comboLabel + '|hypertrophy'))
    const hypertrophyDays = generateExercisePlan(baseMesocycleProfile({ fitness_goal: 'hypertrophy' })).plan
    resetRandomSource()
    setRandomSource(seededRngFromKey(comboLabel + '|fat_loss'))
    const fatLossDays = generateExercisePlan(baseMesocycleProfile({ fitness_goal: 'fat_loss' })).plan
    resetRandomSource()
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
      setRandomSource(seededRngFromKey(comboLabel + '|' + capacity))
      const meso = generateMesocycle(baseMesocycleProfile({ recovery_capacity: capacity }))
      resetRandomSource()
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
    setRandomSource(seededRngFromKey(comboLabel))
    const meso = generateMesocycle(profile)
    resetRandomSource()
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
    // Stays seeded through the swap/ban calls below too, not just
    // generateMesocycle — getReplacementCandidates/rotation logic can also
    // draw on the shared random source.
    setRandomSource(seededRngFromKey(comboLabel))
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

    resetRandomSource()
    cases.push({
      equipment: 'full_gym', injuries: ['shoulders'], duration: '60-90', style: 'hybrid', experience: 'intermediate',
      passed: failures.length === 0, failures,
      planDays: 0, totalExercises: 0, estimatedDurationSec: 0,
    })
  }

  // CHECK: improvised-implement cap + rotation category-standard guard
  // across a FULL periodized mesocycle (Pre-ship safety patch). CHECK 7b
  // only snapshots the base (unperiodized) plan; this walks every week of
  // every block for a spread of equipment x experience profiles, checking
  // (a) no improvised-implement (backpack) prescription ever exceeds its
  // tier ceiling in ANY week, and (b) whenever an exercise's name changes
  // between consecutive non-deload weeks (rotation), its load doesn't
  // exceed a fresh, this-week estimate for that exercise by more than 25%
  // — the exact regression a review caught: a carried-forward baseline
  // from a since-capped Backpack Row propagating into an unrelated
  // Dumbbell Rows slot as "~56kg per hand."
  {
    const equipmentOptions: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
    // Every load calculation in load-prescription.ts scales off profile.weight_kg
    // (bodyweight-relative standards tables) and profile.gender (separate
    // male/female standards) — this sweep previously ran exactly one
    // hardcoded body (80kg male) through every equipment x experience
    // combo, so any load defect that only shows up at a different bodyweight
    // or for a female profile was structurally invisible to this audit. This
    // is exactly how the categorize() substring-ordering bug (Bulgarian
    // Split Squats/Romanian Deadlifts falling through to the full squat/
    // deadlift standard instead of their scaled-down derived category) went
    // undetected: it manifests for ANY bodyweight, but the audit never
    // varied bodyweight or gender to find it. Shared with the base grid's
    // own weight/gender sweep (WEIGHT_GENDER_OPTIONS) rather than a second,
    // independently-driftable list.
    const weightGenderOptions = WEIGHT_GENDER_OPTIONS
    for (const equipment of equipmentOptions) {
      for (const experience of ALL_EXPERIENCE) {
        for (const { weightKg, gender } of weightGenderOptions) {
          const comboLabel = `[mesocycle safety] equipment=${equipment} experience=${experience} weight=${weightKg} gender=${gender}`
          const failures: AuditFailure[] = []
          const profile = baseMesocycleProfile({ equipment_access: equipment, training_experience: experience, weight_kg: weightKg, gender })
          setRandomSource(seededRngFromKey(comboLabel))
          const meso = generateMesocycle(profile)
          resetRandomSource()

        const ceiling = IMPROVISED_IMPLEMENT_CEILING_KG[experience]
        for (const week of meso) {
          for (const day of week.days) {
            for (const ex of day.exercises) {
              if (ex.suggested_load_kg == null) continue
              const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
              if (!entry) continue
              if (isImprovisedLoadImplement(entry) && ex.suggested_load_kg > ceiling) {
                failures.push({
                  check: 'improvised_carry_cap',
                  combination: comboLabel,
                  details: `week ${week.week_number} ${day.day} "${ex.name}" ${ex.suggested_load_kg}kg exceeds the ${ceiling}kg improvised-implement ceiling for "${experience}"`,
                  exercise: ex.name,
                })
              }
              // SAFETY NET (see CHECK 7z above for the base-plan version) —
              // the same implement-ceiling check, but across every week of a
              // full periodized mesocycle, since a within-block ramp or a
              // block-boundary rotation could theoretically push a
              // clean-at-week-1 exercise over the ceiling in a later week.
              const loadingCategory = categorize(entry)
              const loadingCeiling = getLoadingCeilingKg(entry, loadingCategory)
              if (ex.suggested_load_kg > loadingCeiling) {
                failures.push({
                  check: 'loading_ceiling',
                  combination: comboLabel,
                  details: `week ${week.week_number} ${day.day} "${ex.name}" ${ex.suggested_load_kg}kg exceeds the ${loadingCeiling}kg realistic implement ceiling`,
                  exercise: ex.name,
                })
              }
            }
          }
        }

        for (let block = 1; block <= 4; block++) {
          const blockWeeks = meso.filter(w => w.block_number === block).sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))
          for (let i = 1; i < blockWeeks.length; i++) {
            const prevWeek = blockWeeks[i - 1]
            const week = blockWeeks[i]
            if (prevWeek.is_deload || week.is_deload) continue
            for (const day of week.days) {
              const prevDay = prevWeek.days.find(d => d.day === day.day)
              if (!prevDay) continue
              for (let exIdx = 0; exIdx < day.exercises.length; exIdx++) {
                const ex = day.exercises[exIdx]
                const prevEx = prevDay.exercises[exIdx]
                if (!prevEx || prevEx.name === ex.name) continue
                if (ex.suggested_load_kg == null || ex.intensity == null) continue
                const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
                if (!entry || !isExternallyLoaded(entry)) continue
                const fresh = prescribeLoad(entry, profile, {
                  targetRpeLabel: ex.intensity, repRangeLabel: ex.reps, sets: ex.sets,
                })
                if (fresh.starting_weight_kg == null || fresh.starting_weight_kg <= 0) continue
                // Both suggested_load_kg and fresh.starting_weight_kg are in
                // the same units (per-hand for a dumbbell pair, total
                // otherwise — prescribeLoad's own convention), so they
                // compare directly without needing to know loadingMode here.
                const ratio = ex.suggested_load_kg / fresh.starting_weight_kg
                if (ratio > 1.25) {
                  failures.push({
                    check: 'rotation_relative_load',
                    combination: comboLabel,
                    details: `week ${week.week_number} ${day.day} rotated "${prevEx.name}" -> "${ex.name}" at ${ex.suggested_load_kg}kg, ${(ratio * 100).toFixed(0)}% of a fresh ${fresh.starting_weight_kg}kg estimate for that exercise — exceeds the 125% category-standard band`,
                    exercise: ex.name,
                  })
                }
              }
            }
          }
        }

          cases.push({
            equipment, injuries: [], duration: '45-60', style: 'hybrid', experience,
            passed: failures.length === 0, failures,
            planDays: 0, totalExercises: 0, estimatedDurationSec: 0,
          })
        }
      }
    }
  }

  // CHECK: macrocycle phase-sequence sanity (Final Generator round, Fix 4)
  // — across every goal x experience x equipment combination: (a)
  // "Anatomical Adaptation" appears only as block 1, never reintroduced
  // later; (b) no two CONSECUTIVE blocks share the same phase label. A
  // review round repeatedly flagged "Block 3 repeats Anatomical Adaptation
  // after a completed hypertrophy block... throws away a full mesocycle."
  {
    const goals: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
    for (const goal of goals) {
      for (const experience of ALL_EXPERIENCE) {
        for (const equipment of ['full_gym', 'bodyweight'] as EquipmentAccess[]) {
          const comboLabel = `[phase sequence] goal=${goal} experience=${experience} equipment=${equipment}`
          const failures: AuditFailure[] = []
          const profile = baseMesocycleProfile({ fitness_goal: goal, training_experience: experience, equipment_access: equipment })
          setRandomSource(seededRngFromKey(comboLabel))
          const meso = generateMesocycle(profile)
          resetRandomSource()
          const blockLabels: string[] = []
          for (let block = 1; block <= 4; block++) {
            const week = meso.find(w => w.block_number === block)
            if (week?.phase_label) blockLabels.push(week.phase_label)
          }
          const aaIndices = blockLabels.map((l, i) => (l === 'Anatomical Adaptation' ? i : -1)).filter(i => i >= 0)
          if (aaIndices.length > 1 || (aaIndices.length === 1 && aaIndices[0] !== 0)) {
            failures.push({
              check: 'phase_sequence',
              combination: comboLabel,
              details: `"Anatomical Adaptation" appears at block position(s) ${aaIndices.map(i => i + 1).join(', ')} — must appear only as block 1: [${blockLabels.join(' -> ')}]`,
            })
          }
          for (let i = 1; i < blockLabels.length; i++) {
            if (blockLabels[i] === blockLabels[i - 1]) {
              failures.push({
                check: 'phase_sequence',
                combination: comboLabel,
                details: `blocks ${i} and ${i + 1} are both "${blockLabels[i]}" — consecutive identical phases: [${blockLabels.join(' -> ')}]`,
              })
            }
          }
          cases.push({
            equipment, injuries: [], duration: '45-60', style: 'hybrid', experience,
            passed: failures.length === 0, failures,
            planDays: 0, totalExercises: 0, estimatedDurationSec: 0,
          })
        }
      }
    }
  }

  // GUARDRAIL (C0 calibration round, Fix 1): calibration-week working-set
  // load for an UNVERIFIED profile (no known working weights — the exact
  // "I don't know my numbers" case that produced a 130kg first-ever deadlift
  // under the old flat 0.85x multiplier) must never exceed 60% of what the
  // standards table estimates for that same exercise at that same week's
  // reps/RPE without calibration dampening. A hard failing check, not a soft
  // quality-score deduction — this is what should have caught the original
  // defect and didn't, because the quality gate's calibration check only
  // ever compared week 1 against week 3 (relative), never against an
  // absolute bound. Run across every experience tier since the risk is
  // largest exactly where the standards table is most aggressive (advanced).
  for (const experience of ALL_EXPERIENCE) {
    const comboLabel = `[calibration load ceiling] experience=${experience}`
    const failures: AuditFailure[] = []
    const profile = baseMesocycleProfile({ training_experience: experience })
    setRandomSource(seededRngFromKey(comboLabel))
    const meso = generateMesocycle(profile)
    resetRandomSource()
    const week1 = meso.find(w => w.week_number === 1)

    if (!week1?.isCalibrationWeek) {
      failures.push({
        check: 'calibration_load_ceiling',
        combination: comboLabel,
        details: `week 1 is not flagged isCalibrationWeek for an unverified profile (training_experience=${experience}, no known working weights) — the calibration path this guardrail checks did not run at all`,
      })
    } else {
      for (const day of week1.days) {
        for (const ex of day.exercises) {
          if (ex.suggested_load_kg == null) continue
          const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
          if (!entry) continue
          const category = categorize(entry)
          if (!category) continue
          // Improvised-implement loads (weighted backpack carries/rows) are
          // governed by their own absolute IMPROVISED_IMPLEMENT_CEILING_KG
          // clamp, applied unconditionally at the end of prescribeLoad — so
          // the "undamped" reference estimate below is capped by the SAME
          // constant as the calibration-week estimate, making a 60% ratio
          // structurally unsatisfiable regardless of how conservative
          // calibration dampening is. That absolute ceiling is the real
          // safety mechanism for this equipment class; this check doesn't
          // apply to it.
          if (isImprovisedLoadImplement(entry)) continue

          // Same exercise, same week's own reps/RPE, WITHOUT calibration
          // dampening — the reference the 60% ceiling is measured against.
          const fullEstimate = prescribeLoad(entry, profile, {
            targetRpeLabel: ex.intensity,
            sets: ex.sets,
            repRangeLabel: ex.reps,
          })
          if (fullEstimate.starting_weight_kg == null || fullEstimate.starting_weight_kg <= 0) continue

          const ceiling = fullEstimate.starting_weight_kg * 0.6
          // Equipment rounding (plate/dumbbell/stack increments) is a
          // physical constraint, not a conservatism failure — a 60% ceiling
          // of 7.2kg is unachievable when dumbbells step in 2kg increments.
          // Exempt overshoot no larger than half the exercise's own rounding
          // increment (the maximum error `roundToPlate` can introduce), and
          // separately exempt anything already sitting at the equipment
          // floor (can't go lower regardless of the math).
          const floor = getEquipmentFloorKg(entry)
          const roundingTolerance = loadingMode(entry) === 'barbell' || loadingMode(entry) === 'stack' ? 1.25 : 1
          if (ex.suggested_load_kg > ceiling + roundingTolerance && ex.suggested_load_kg > floor) {
            failures.push({
              check: 'calibration_load_ceiling',
              combination: comboLabel,
              details: `"${ex.name}" calibration-week load ${ex.suggested_load_kg}kg exceeds 60% of the undamped standards estimate (${fullEstimate.starting_weight_kg}kg) — ceiling is ${ceiling.toFixed(1)}kg (equipment floor is ${floor}kg)`,
              exercise: ex.name,
            })
          }
        }
      }
    }

    cases.push({
      equipment: profile.equipment_access, injuries: [], duration: profile.session_duration_preference,
      style: profile.training_style, experience,
      passed: failures.length === 0, failures,
      planDays: week1?.days.length ?? 0, totalExercises: week1?.days.flatMap(d => d.exercises).length ?? 0, estimatedDurationSec: 0,
    })
  }

  // GUARDRAIL (calibration round, Fix: block-transition jump): the
  // calibration_load_ceiling check above only inspects week 1 — it couldn't
  // catch the follow-on defect where an unverified lift's load snapped
  // straight to the full undamped standards estimate at the START of block
  // 2 (a real reproduction: squats 55kg in block 1 week 1 -> 135kg in block
  // 2 week 1). The fix makes every loading week for a still-unverified lift
  // step by at most one unverifiedRampStepKg increment from its last
  // LOADING week (deload weeks are never the reference) — this check
  // verifies that holds at every block transition, not just the first.
  // Matched by (day index, exercise slot index), not by name: a block
  // transition is exactly where rotateVariation is most likely to swap the
  // exercise name (Deadlifts -> Trap Bar Deadlift), so name-matching would
  // blind the check to the case it exists to catch.
  for (const experience of ALL_EXPERIENCE) {
    const comboLabel = `[block transition jump] experience=${experience}`
    const failures: AuditFailure[] = []
    const profile = baseMesocycleProfile({ training_experience: experience })
    setRandomSource(seededRngFromKey(comboLabel))
    const meso = generateMesocycle(profile)
    resetRandomSource()
    const sortedWeeks = [...meso].sort((a, b) => a.week_number - b.week_number)

    const dayCount = sortedWeeks[0]?.days.length ?? 0
    for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
      const exCount = sortedWeeks[0]?.days[dayIdx]?.exercises.length ?? 0
      for (let exIdx = 0; exIdx < exCount; exIdx++) {
        let lastLoadingWeekKg: number | null = null
        let lastLoadingWeekNum: number | null = null
        let currentBlockNum: number | null = null
        let blockFirstLoadingKg: number | null = null
        // Only exercises that actually ramp load WITHIN a block are subject
        // to the step cap at the NEXT block's boundary — a 'reps'/'maintain'
        // accessory that intentionally holds flat within its block (Shrugs
        // held at 8kg all of block 1) is allowed to re-baseline from a fresh
        // estimate at the next block's week 1, same as it always has; the
        // fix is scoped to rampLoad exercises only (see load-prescription.ts
        // and exercise-plan.ts), and this proxy — did the load rise at all
        // during the prior block — approximates that without needing to
        // replicate the goal-policy progressionEmphasis logic here.
        let blockRamped = false
        for (const week of sortedWeeks) {
          const ex = week.days[dayIdx]?.exercises[exIdx]
          if (!ex) continue
          const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
          if (!entry || !isExternallyLoaded(entry) || isImprovisedLoadImplement(entry)) continue
          if (ex.suggested_load_kg == null) continue
          if (week.is_deload) continue

          const blockNum = week.block_number ?? null
          if (blockNum !== currentBlockNum) {
            if (lastLoadingWeekKg != null && blockRamped) {
              const step = unverifiedRampStepKg(entry)
              const floor = getEquipmentFloorKg(entry)
              const roundingTolerance = loadingMode(entry) === 'barbell' || loadingMode(entry) === 'stack' ? 1.25 : 1
              const ceiling = lastLoadingWeekKg + step + roundingTolerance
              if (ex.suggested_load_kg > ceiling && ex.suggested_load_kg > floor) {
                failures.push({
                  check: 'block_transition_jump',
                  combination: comboLabel,
                  details: `"${ex.name}" week ${week.week_number} load ${ex.suggested_load_kg}kg jumps more than one step (${step}kg) from week ${lastLoadingWeekNum}'s ${lastLoadingWeekKg}kg — ceiling is ${ceiling.toFixed(1)}kg`,
                  exercise: ex.name,
                })
              }
            }
            currentBlockNum = blockNum
            blockFirstLoadingKg = ex.suggested_load_kg
            blockRamped = false
          } else if (blockFirstLoadingKg != null && ex.suggested_load_kg > blockFirstLoadingKg) {
            blockRamped = true
          }

          lastLoadingWeekKg = ex.suggested_load_kg
          lastLoadingWeekNum = week.week_number
        }
      }
    }

    cases.push({
      equipment: profile.equipment_access, injuries: [], duration: profile.session_duration_preference,
      style: profile.training_style, experience,
      passed: failures.length === 0, failures,
      planDays: sortedWeeks[0]?.days.length ?? 0, totalExercises: sortedWeeks[0]?.days.flatMap(d => d.exercises).length ?? 0, estimatedDurationSec: 0,
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
    ALL_STYLES.length * ALL_EXPERIENCE.length * WEIGHT_GENDER_OPTIONS.length
  const results: AuditTestCase[] = []
  let done = 0

  for (const equipment of ALL_EQUIPMENT) {
    for (const injuries of injuryCombinations) {
      for (const duration of ALL_DURATIONS) {
        for (const style of ALL_STYLES) {
          for (const experience of ALL_EXPERIENCE) {
            for (const { weightKg, gender } of WEIGHT_GENDER_OPTIONS) {
              const testCase = runSingleAudit(equipment, injuries, duration, style, experience, weightKg, gender)
              results.push(testCase)
              done++
              onProgress?.(done, totalCombinations)
            }
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
