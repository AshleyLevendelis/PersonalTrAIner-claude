import type {
  UserProfile, WorkoutDay, Exercise, FitnessGoal, SessionDuration,
  WorkoutSplit, RecommendedCardio, MesocycleWeek, ExerciseTier,
  FatigueCost, MesocycleMovementPattern, EquipmentAccess, TrainingStyle,
  ConstraintTrace, ConstraintTraceEntry, PlanResult, TrainingExperience,
} from './types'
import { EXERCISE_DATABASE, getMovementFamily, getVolumeRole, meetsCapabilityRequirement, getExerciseId, type ExerciseEntry, type MovementPattern, type AngleVector, type VolumeRole } from './exercise-db'
import {
  getExperienceConfig, getSkillDemand, isSkillAppropriate, applyRepFloor,
  type ExperienceConfig,
} from './experience-config'
import { buildWarmup, getWarmupReserveSeconds } from './warmup'
import { prescribeLoad, categorize, getLoadIncrementKg, isExternallyLoaded, getEquipmentFloorKg, loadingMode, roundToPlate, formatLoad, labelModeForEntry, hasKnownWorkingWeight, unverifiedRampStepKg, type KnownWorkingWeights } from './load-prescription'
import {
  getPhaseSequence, getPhaseConfig, rotateVariation, resolveTargetRpe,
  shiftReps, adjustRest, dedupeAdjacentPhases, type PhaseConfig, type TrainingPhase,
} from './periodization'
import { getGoalPolicy, restrictPhaseSequence, resolveConditioningFrequency, RECOVERY_SET_MULTIPLIER, type GoalPolicy } from './goal-policies'
import { getDurationBudgetSeconds, estimateDaySeconds, estimateSlotsSeconds } from './session-duration'

// ---------------------------------------------------------------------------
// Track definitions (unchanged — used for day-level focus selection)
// ---------------------------------------------------------------------------

type TrackFocus =
  | 'Push & Press'
  | 'Pull & Hinge'
  | 'Squat & Carry'
  | 'Upper Pull & Core'
  | 'Full Body Power'
  | 'Conditioning & Core'
  | 'Chest & Triceps'
  | 'Back & Biceps'
  | 'Legs & Calves'
  | 'Shoulders & Abs'

interface TrackDefinition {
  label: TrackFocus
  primary_patterns: MovementPattern[]
  secondary_patterns: MovementPattern[]
  forbidden_patterns: MovementPattern[]
  primer_patterns: MovementPattern[]
  required_patterns: MovementPattern[]
  slots: TrackSlot[]
}

// ---------------------------------------------------------------------------
// Pattern-guaranteed slots (Final Generator Round, Fix 1)
// ---------------------------------------------------------------------------
// The pre-existing selection model filtered the pool down to a track's
// primary/secondary patterns, shuffled, and picked N — "filter then hope."
// primary_patterns for "Push & Press" is [horizontal_push, vertical_push]
// as an OR, so a session could legally land two horizontal presses and zero
// vertical ones; "Pull & Hinge" only REQUIRED hip_hinge, never horizontal
// AND vertical pull separately. Reviews converged on exactly this: "zero
// vertical pull in the entire week," "zero vertical pressing... no pike
// push-up, no handstand progression," repeated across nearly every profile
// despite "pull" or "push" broadly being present.
//
// Slots are filled IN ORDER, each one guaranteed a specific pattern (or
// nearest-pattern substitute, logged, if equipment/injury genuinely leaves
// nothing) rather than a shared pool everything competes for. Filled first,
// before the legacy pickFromTier/refill pass (kept below to top up to the
// duration-based exercise count) — see selectExercisesForTrack.
interface TrackSlot {
  /** Patterns that satisfy this slot, in preference order. */
  patterns: MovementPattern[]
  /** Preferred DB tier — falls back to any tier if nothing at the preferred one is eligible. */
  tier: 'tier1_compound' | 'tier2_compound' | 'tier3_isolation' | 'cardio'
  /** Never silently dropped — falls through to NEAREST_PATTERN_FALLBACK and logs via trace if even that fails. */
  required: boolean
}

// Last-resort substitution when a required slot's own patterns have zero
// eligible candidates anywhere in the constrained pool (equipment/injury
// genuinely forbids the whole category) — the nearest coaching-equivalent
// pattern, not a random one, so a missing vertical press becomes a second
// horizontal press rather than an unrelated isolation exercise.
const NEAREST_PATTERN_FALLBACK: Partial<Record<MovementPattern, MovementPattern[]>> = {
  vertical_push: ['horizontal_push'],
  horizontal_push: ['vertical_push'],
  vertical_pull: ['horizontal_pull'],
  horizontal_pull: ['vertical_pull'],
  hip_hinge: ['knee_dominant', 'single_leg'],
  knee_dominant: ['hip_hinge', 'single_leg'],
  single_leg: ['knee_dominant', 'hip_hinge'],
  carry: ['core'],
  isolation_bicep: ['horizontal_pull'],
  isolation_tricep: ['horizontal_push'],
  isolation_shoulder: ['vertical_push'],
  isolation_quad: ['knee_dominant'],
  isolation_hamstring: ['hip_hinge'],
  isolation_calf: ['knee_dominant'],
}

const TRACKS: Record<TrackFocus, TrackDefinition> = {
  'Push & Press': {
    label: 'Push & Press',
    primary_patterns: ['horizontal_push', 'vertical_push'],
    secondary_patterns: ['isolation_tricep', 'isolation_shoulder', 'core'],
    forbidden_patterns: ['isolation_bicep', 'horizontal_pull', 'vertical_pull'],
    primer_patterns: ['horizontal_push', 'vertical_push'],
    required_patterns: [],
    slots: [
      { patterns: ['horizontal_push'], tier: 'tier1_compound', required: true },
      { patterns: ['vertical_push'], tier: 'tier2_compound', required: true },
      { patterns: ['isolation_tricep'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_shoulder'], tier: 'tier3_isolation', required: false },
      { patterns: ['core'], tier: 'tier3_isolation', required: false },
    ],
  },
  'Pull & Hinge': {
    label: 'Pull & Hinge',
    primary_patterns: ['horizontal_pull', 'vertical_pull', 'hip_hinge'],
    secondary_patterns: ['isolation_bicep', 'isolation_hamstring', 'core'],
    forbidden_patterns: ['isolation_tricep', 'horizontal_push', 'vertical_push'],
    primer_patterns: ['horizontal_pull', 'vertical_pull', 'hip_hinge'],
    required_patterns: ['hip_hinge'],
    slots: [
      { patterns: ['hip_hinge'], tier: 'tier1_compound', required: true },
      { patterns: ['vertical_pull'], tier: 'tier2_compound', required: true },
      { patterns: ['horizontal_pull'], tier: 'tier2_compound', required: true },
      { patterns: ['isolation_bicep'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_hamstring'], tier: 'tier3_isolation', required: false },
      { patterns: ['core'], tier: 'tier3_isolation', required: false },
    ],
  },
  'Squat & Carry': {
    label: 'Squat & Carry',
    primary_patterns: ['knee_dominant', 'single_leg', 'carry'],
    secondary_patterns: ['isolation_quad', 'isolation_calf', 'core'],
    forbidden_patterns: ['horizontal_push', 'horizontal_pull', 'isolation_bicep', 'isolation_tricep'],
    primer_patterns: ['knee_dominant'],
    required_patterns: ['carry'],
    slots: [
      { patterns: ['knee_dominant'], tier: 'tier1_compound', required: true },
      { patterns: ['carry'], tier: 'tier2_compound', required: true },
      { patterns: ['single_leg'], tier: 'tier2_compound', required: false },
      { patterns: ['isolation_quad'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_calf'], tier: 'tier3_isolation', required: false },
      { patterns: ['core'], tier: 'tier3_isolation', required: false },
    ],
  },
  'Upper Pull & Core': {
    label: 'Upper Pull & Core',
    primary_patterns: ['vertical_pull', 'horizontal_pull'],
    secondary_patterns: ['core', 'isolation_bicep', 'isolation_shoulder'],
    forbidden_patterns: ['isolation_tricep', 'horizontal_push'],
    primer_patterns: ['vertical_pull', 'horizontal_pull'],
    required_patterns: ['core'],
    slots: [
      { patterns: ['vertical_pull'], tier: 'tier1_compound', required: true },
      { patterns: ['horizontal_pull'], tier: 'tier2_compound', required: true },
      { patterns: ['isolation_bicep'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_shoulder'], tier: 'tier3_isolation', required: false },
      { patterns: ['core'], tier: 'tier3_isolation', required: true },
    ],
  },
  'Full Body Power': {
    label: 'Full Body Power',
    primary_patterns: ['hip_hinge', 'knee_dominant', 'horizontal_push', 'vertical_pull'],
    secondary_patterns: ['single_leg', 'core'],
    forbidden_patterns: [],
    primer_patterns: ['hip_hinge', 'knee_dominant', 'horizontal_push', 'vertical_pull'],
    required_patterns: [],
    slots: [
      { patterns: ['knee_dominant', 'hip_hinge'], tier: 'tier1_compound', required: true },
      { patterns: ['horizontal_push'], tier: 'tier2_compound', required: true },
      { patterns: ['vertical_pull', 'horizontal_pull'], tier: 'tier2_compound', required: true },
      { patterns: ['single_leg'], tier: 'tier2_compound', required: false },
      { patterns: ['core'], tier: 'tier3_isolation', required: false },
    ],
  },
  'Conditioning & Core': {
    label: 'Conditioning & Core',
    primary_patterns: ['cardio'],
    secondary_patterns: ['core'],
    forbidden_patterns: [],
    primer_patterns: ['cardio'],
    required_patterns: ['core'],
    slots: [
      { patterns: ['cardio'], tier: 'cardio', required: true },
      { patterns: ['core'], tier: 'tier3_isolation', required: true },
    ],
  },
  'Chest & Triceps': {
    label: 'Chest & Triceps',
    primary_patterns: ['horizontal_push'],
    secondary_patterns: ['isolation_tricep'],
    forbidden_patterns: ['horizontal_pull', 'vertical_pull', 'hip_hinge', 'knee_dominant', 'single_leg', 'carry', 'isolation_bicep', 'isolation_hamstring', 'isolation_quad', 'isolation_calf'],
    primer_patterns: ['horizontal_push'],
    required_patterns: [],
    slots: [
      { patterns: ['horizontal_push'], tier: 'tier1_compound', required: true },
      { patterns: ['horizontal_push'], tier: 'tier2_compound', required: false },
      { patterns: ['isolation_tricep'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_tricep'], tier: 'tier3_isolation', required: false },
    ],
  },
  'Back & Biceps': {
    label: 'Back & Biceps',
    primary_patterns: ['horizontal_pull', 'vertical_pull'],
    secondary_patterns: ['isolation_bicep'],
    forbidden_patterns: ['horizontal_push', 'vertical_push', 'hip_hinge', 'knee_dominant', 'single_leg', 'carry', 'isolation_tricep', 'isolation_shoulder', 'isolation_quad', 'isolation_calf'],
    primer_patterns: ['horizontal_pull', 'vertical_pull'],
    required_patterns: [],
    slots: [
      { patterns: ['vertical_pull'], tier: 'tier1_compound', required: true },
      { patterns: ['horizontal_pull'], tier: 'tier2_compound', required: true },
      { patterns: ['isolation_bicep'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_bicep'], tier: 'tier3_isolation', required: false },
    ],
  },
  'Legs & Calves': {
    label: 'Legs & Calves',
    primary_patterns: ['knee_dominant', 'hip_hinge', 'single_leg'],
    secondary_patterns: ['isolation_quad', 'isolation_hamstring', 'isolation_calf'],
    forbidden_patterns: ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'isolation_bicep', 'isolation_tricep', 'isolation_shoulder'],
    primer_patterns: ['knee_dominant', 'hip_hinge'],
    required_patterns: [],
    slots: [
      { patterns: ['knee_dominant'], tier: 'tier1_compound', required: true },
      { patterns: ['hip_hinge'], tier: 'tier2_compound', required: true },
      { patterns: ['single_leg'], tier: 'tier2_compound', required: false },
      { patterns: ['isolation_quad'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_hamstring'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_calf'], tier: 'tier3_isolation', required: false },
    ],
  },
  'Shoulders & Abs': {
    label: 'Shoulders & Abs',
    primary_patterns: ['vertical_push', 'isolation_shoulder', 'single_leg', 'knee_dominant', 'hip_hinge'],
    secondary_patterns: ['core'],
    // hip_hinge/knee_dominant/single_leg deliberately NOT forbidden — see
    // the leg-accessory slot below. A traditional 4-day body-part split
    // (Chest & Triceps / Back & Biceps / Legs & Calves / Shoulders & Abs)
    // otherwise trains legs on exactly one day out of four; every other
    // day's forbidden_patterns explicitly excludes squat/hinge by design
    // (a chest day isn't supposed to do legs), which left NOTHING for
    // balanceWeeklyStructure's leg-day-coverage pass to add to. Reviews
    // and this round's own audit both converged on "legs trained once a
    // week" for exactly this split.
    forbidden_patterns: ['horizontal_push', 'horizontal_pull', 'vertical_pull', 'carry', 'isolation_bicep', 'isolation_tricep', 'isolation_quad', 'isolation_calf'],
    // Matches this track's own primary_patterns (minus isolation_shoulder/
    // single_leg, which no primer covers) — same "primer_patterns derived
    // from the track's real primary emphasis" rule every track uses now.
    primer_patterns: ['vertical_push', 'knee_dominant', 'hip_hinge'],
    required_patterns: ['core'],
    slots: [
      { patterns: ['vertical_push'], tier: 'tier1_compound', required: true },
      // A light unilateral leg accessory — not a second leg day, just
      // enough real exposure to satisfy "legs >=2 days/week" without
      // turning a shoulders day into a squat day.
      { patterns: ['single_leg', 'knee_dominant', 'hip_hinge'], tier: 'tier2_compound', required: true },
      { patterns: ['isolation_shoulder'], tier: 'tier3_isolation', required: false },
      { patterns: ['core'], tier: 'tier3_isolation', required: true },
    ],
  },
}

// ---------------------------------------------------------------------------
// Style config (data-driven, not if/else)
// ---------------------------------------------------------------------------

interface StyleConfig {
  setRange: { tier1: number; tier2: number; tier3: number }
  repRange: { tier1: string; tier2: string; tier3: string }
  restSeconds: { tier1: number; tier2: number; tier3: number }
  conditioningRatio: number
  requiresPatterns?: MovementPattern[]
}

const STYLE_CONFIGS: Record<TrainingStyle, StyleConfig> = {
  bodybuilding: {
    setRange: { tier1: 4, tier2: 3, tier3: 3 },
    repRange: { tier1: '6-8', tier2: '8-12', tier3: '12-15' },
    restSeconds: { tier1: 120, tier2: 120, tier3: 60 },
    conditioningRatio: 0,
  },
  functional: {
    setRange: { tier1: 4, tier2: 3, tier3: 3 },
    repRange: { tier1: '5-8', tier2: '8-12', tier3: '12-15' },
    restSeconds: { tier1: 90, tier2: 75, tier3: 60 },
    conditioningRatio: 0.15,
  },
  combat: {
    setRange: { tier1: 4, tier2: 3, tier3: 3 },
    repRange: { tier1: '3-5', tier2: '6-8', tier3: '12-15' },
    restSeconds: { tier1: 75, tier2: 60, tier3: 45 },
    conditioningRatio: 0.25,
    requiresPatterns: ['core', 'carry'],
  },
  hybrid: {
    setRange: { tier1: 4, tier2: 3, tier3: 3 },
    repRange: { tier1: '6-10', tier2: '8-12', tier3: '12-15' },
    restSeconds: { tier1: 90, tier2: 75, tier3: 60 },
    conditioningRatio: 0.1,
  },
}

// ---------------------------------------------------------------------------
// Equipment access sets
// ---------------------------------------------------------------------------

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
  // Anyone can put weight in a backpack regardless of tier — it's the one
  // genuinely progressive external load available to a bodyweight-only
  // client, which is exactly why it's included at every tier, not gated
  // like real gym equipment.
  bodyweight: new Set(['bodyweight', 'pull-up bar', 'weighted backpack']),
}

// ---------------------------------------------------------------------------
// Context-aware required patterns (adjusted for infeasible scenarios)
// ---------------------------------------------------------------------------

function getFeaibleRequiredPatterns(
  styleConfig: StyleConfig,
  equipmentAccess: EquipmentAccess,
  injuries: string[]
): MovementPattern[] {
  if (!styleConfig.requiresPatterns) return []
  
  let patterns = [...styleConfig.requiresPatterns]
  
  // If using bodyweight-only, remove 'carry' since there's no external load
  // (new bodyweight carry exercises are fallbacks, not primary solutions)
  if (equipmentAccess === 'bodyweight' && patterns.includes('carry')) {
    patterns = patterns.filter(p => p !== 'carry')
  }
  
  // If wrists are injured AND using limited equipment, remove 'carry'
  // (most carry variations require wrist stability)
  if (injuries.includes('wrists') && 
      (equipmentAccess === 'minimalist' || equipmentAccess === 'bodyweight') &&
      patterns.includes('carry')) {
    patterns = patterns.filter(p => p !== 'carry')
  }
  
  return patterns
}

// ---------------------------------------------------------------------------
// Injured joint mapping
// ---------------------------------------------------------------------------

const INJURED_JOINTS: Record<string, string[]> = {
  lower_back: ['lower_back_axial'],
  knees: ['knee'],
  shoulders: ['shoulder'],
  neck: ['neck'],
  wrists: ['wrist'],
}

/**
 * Single source of truth for injury-code -> flagged-joint mapping, exported
 * so callers outside this module (the injury-adaptation feature,
 * dev-constraint-audit.ts) read the real map instead of hand-duplicating it.
 * Only 5 of the 8 INJURY_OPTIONS codes are mapped — hips/ankles/elbows are
 * collected at onboarding but currently have no joint tag to filter on.
 */
export function getFlaggedJoints(injuries: string[]): Set<string> {
  const joints = new Set<string>()
  for (const injury of injuries) {
    for (const joint of INJURED_JOINTS[injury] ?? []) joints.add(joint)
  }
  return joints
}

/** True when an exercise's declared equipment is fully covered by the given tier's allowed set (full_gym = everything allowed). */
export function isEquipmentAllowed(entry: ExerciseEntry, tier: EquipmentAccess): boolean {
  const allowed = EQUIPMENT_SETS[tier]
  if (!allowed) return true
  return entry.equipment.every(eq => allowed.has(eq))
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

// The only source of randomness in the whole generation pipeline — every
// other exercise-selection decision is deterministic given the same pool and
// profile. Defaults to Math.random (a real user's plan should vary run to
// run); test/audit harnesses call setRandomSource() with a seeded generator
// so the same profile always produces the same plan and the same score.
// Production code should never call setRandomSource() — this is a testing
// seam, not a feature.
let randomSource: () => number = Math.random

export function setRandomSource(fn: () => number): void {
  randomSource = fn
}

export function resetRandomSource(): void {
  randomSource = Math.random
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(randomSource() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// ---------------------------------------------------------------------------
// STAGE 1: Equipment filter
// ---------------------------------------------------------------------------

function stageEquipmentFilter(
  pool: ExerciseEntry[],
  equipmentAccess: EquipmentAccess,
  trace: ConstraintTrace
): ExerciseEntry[] {
  const allowed = EQUIPMENT_SETS[equipmentAccess]
  if (!allowed) {
    trace.pool_size_after_each_stage.equipment = pool.length
    return pool
  }
  const result: ExerciseEntry[] = []
  for (const ex of pool) {
    const hasAll = ex.equipment.every(eq => allowed.has(eq))
    if (hasAll) {
      result.push(ex)
    } else {
      trace.equipment_filtered.push({
        exercise: ex.name,
        stage: 'equipment',
        reason: `user has ${equipmentAccess} equipment; exercise requires [${ex.equipment.join(', ')}]`,
      })
    }
  }
  trace.pool_size_after_each_stage.equipment = result.length
  return result
}

// ---------------------------------------------------------------------------
// STAGE 2: Injury filter with substitution-group replacement
// ---------------------------------------------------------------------------

function stageInjuryFilter(
  pool: ExerciseEntry[],
  equipmentPool: ExerciseEntry[],
  injuries: string[],
  trace: ConstraintTrace
): ExerciseEntry[] {
  if (injuries.length === 0) {
    trace.pool_size_after_each_stage.injury = pool.length
    return pool
  }

  const flaggedJoints = new Set<string>()
  for (const injury of injuries) {
    const joints = INJURED_JOINTS[injury]
    if (joints) joints.forEach(j => flaggedJoints.add(j))
  }

  const poolNames = new Set(pool.map(e => e.name))
  const result: ExerciseEntry[] = []
  const addedReplacements = new Set<string>()

  for (const ex of pool) {
    const conflict = ex.loads_joints.some(j => flaggedJoints.has(j))
    if (!conflict) {
      result.push(ex)
    } else {
      trace.injury_filtered.push({
        exercise: ex.name,
        stage: 'injury',
        reason: `loads joints [${ex.loads_joints.join(', ')}]; user flagged [${injuries.join(', ')}]`,
      })
      const replacement = equipmentPool.find(r =>
        r.substitution_group === ex.substitution_group &&
        r.name !== ex.name &&
        !r.loads_joints.some(j => flaggedJoints.has(j)) &&
        !poolNames.has(r.name) &&
        !addedReplacements.has(r.name)
      )
      if (replacement) {
        result.push(replacement)
        addedReplacements.add(replacement.name)
      }
    }
  }
  trace.pool_size_after_each_stage.injury = result.length
  return result
}

// ---------------------------------------------------------------------------
// STAGE 3: Style filter
// ---------------------------------------------------------------------------

// Below this many exercises there is not enough material to build distinct
// sessions across a training week, and style becomes a luxury we cannot afford.
const MIN_VIABLE_POOL = 12

function stageStyleFilter(
  pool: ExerciseEntry[],
  style: TrainingStyle,
  trace: ConstraintTrace
): ExerciseEntry[] {
  const result: ExerciseEntry[] = []
  const rejected: ExerciseEntry[] = []

  for (const ex of pool) {
    if (ex.style_tags.includes(style)) {
      result.push(ex)
    } else {
      rejected.push(ex)
    }
  }

  // Style is a preference, not a safety constraint — unlike equipment (you
  // physically don't have the kit) or injury (it will hurt you). When the
  // remaining pool is too thin to fill a week, a bodyweight trainee who picked
  // 'bodybuilding' is better served by a full week of slightly off-style
  // sessions than by one session and three empty days.
  if (result.length < MIN_VIABLE_POOL) {
    trace.style_filtered.push({
      exercise: '(all)',
      stage: 'style',
      reason:
        `style '${style}' would leave only ${result.length} exercises ` +
        `(minimum ${MIN_VIABLE_POOL} needed for a full week) — style preference relaxed`,
    })
    trace.pool_size_after_each_stage.style = pool.length
    return pool
  }

  for (const ex of rejected) {
    trace.style_filtered.push({
      exercise: ex.name,
      stage: 'style',
      reason: `exercise tags [${ex.style_tags.join(', ')}] do not include '${style}'`,
    })
  }

  trace.pool_size_after_each_stage.style = result.length
  return result
}

// ---------------------------------------------------------------------------
// STAGE 4: Skill / experience filter
// ---------------------------------------------------------------------------
// Removes movements the trainee is not yet ready to attempt. This runs late,
// after equipment and injury, so that a beginner in a fully-equipped gym still
// ends up with a workable pool — the exercises being removed here almost always
// have a lower-skill sibling in the same substitution group (Pull-Ups ->
// Assisted Pull-Ups -> Lat Pulldown).
//
// Guard rail: if filtering would empty the pool entirely, the filter yields.
// A thin plan with one movement above the trainee's level is far better than
// no plan at all, and the constraint trace records that it happened.

function stageSkillFilter(
  pool: ExerciseEntry[],
  experience: TrainingExperience,
  trace: ConstraintTrace
): ExerciseEntry[] {
  const result: ExerciseEntry[] = []
  const rejected: ExerciseEntry[] = []

  for (const ex of pool) {
    if (!meetsCapabilityRequirement(ex, experience)) {
      rejected.push(ex)
      trace.skill_filtered.push({
        exercise: ex.name,
        stage: 'skill',
        reason: `requires ${ex.capability_requirement!.minExperience}+ experience — '${experience}' gets "${ex.capability_requirement!.regression}" instead`,
      })
    } else if (isSkillAppropriate(ex.name, experience)) {
      result.push(ex)
    } else {
      rejected.push(ex)
      trace.skill_filtered.push({
        exercise: ex.name,
        stage: 'skill',
        reason: `${getSkillDemand(ex.name)} skill demand exceeds what is appropriate for '${experience}'`,
      })
    }
  }

  if (result.length === 0) {
    trace.skill_filtered.push({
      exercise: '(all)',
      stage: 'skill',
      reason: 'skill filter would empty the pool — relaxed to keep the plan viable',
    })
    trace.pool_size_after_each_stage.skill = pool.length
    return pool
  }

  trace.pool_size_after_each_stage.skill = result.length
  return result
}

// ---------------------------------------------------------------------------
// STAGE 5: Time-cap density optimization
// ---------------------------------------------------------------------------

const ANTAGONIST_PAIRS: [MovementPattern, MovementPattern][] = [
  ['horizontal_push', 'horizontal_pull'],
  ['vertical_push', 'vertical_pull'],
  ['isolation_bicep', 'isolation_tricep'],
  ['knee_dominant', 'hip_hinge'],
  ['isolation_quad', 'isolation_hamstring'],
  ['core', 'carry'],
]

function getOpposingPattern(pattern: MovementPattern): MovementPattern | null {
  for (const [a, b] of ANTAGONIST_PAIRS) {
    if (pattern === a) return b
    if (pattern === b) return a
  }
  return null
}

/**
 * Whether an exercise may take EITHER slot in a superset pair. The
 * ['knee_dominant', 'hip_hinge'] antagonist entry above exists for pairing a
 * light hinge accessory with a light knee-dominant accessory — it was also,
 * unfiltered, pairing Barbell Squats with Trap Bar Deadlift as A1/A2, two
 * heavy tier1/tier2 compounds that each need full, un-halved rest. Isolation
 * work (tier3) and core/carry work (tagged by pattern, not tier — several
 * core movements like Ab Wheel Rollout are tier2_compound) are the only
 * things meant to go in a superset; every genuine compound lift stays out,
 * regardless of which antagonist pattern pair it happens to match.
 */
function isSupersetEligible(entry: ExerciseEntry): boolean {
  if (entry.movement_pattern === 'core' || entry.movement_pattern === 'carry') return true
  return entry.mechanics_tier === 'tier3_isolation'
}

function estimateSessionDuration(exercises: { entry: ExerciseEntry; sets: number; reps: string; restSeconds: number }[]): number {
  return estimateSlotsSeconds(exercises)
}

interface SupersetLabel {
  index: number
  label: string
}

function buildSupersetPairs(
  exercises: Exercise[],
  pool: ExerciseEntry[],
  duration: SessionDuration,
  style: TrainingStyle,
  trace: ConstraintTrace,
): Exercise[] {
  const isShort = duration === '30-45' || duration === '45-60'
  if (!isShort && style !== 'combat') return exercises

  const result = [...exercises]
  const paired = new Set<number>()
  let labelCounter = 0

  for (let i = 0; i < result.length; i++) {
    if (paired.has(i)) continue
    const entryA = pool.find(e => e.name === result[i].name)
    if (!entryA || !isSupersetEligible(entryA)) continue

    const opposing = getOpposingPattern(entryA.movement_pattern)
    if (!opposing) continue

    for (let j = i + 1; j < result.length; j++) {
      if (paired.has(j)) continue
      const entryB = pool.find(e => e.name === result[j].name)
      if (!entryB || !isSupersetEligible(entryB)) continue

      if (entryB.movement_pattern === opposing) {
        const letter = String.fromCharCode(65 + labelCounter)
        result[i] = { ...result[i], superset_label: `${letter}1` }
        result[j] = { ...result[j], superset_label: `${letter}2`, rest: 'alternate' }
        paired.add(i)
        paired.add(j)
        labelCounter++
        break
      }
    }
  }

  // Labeling alone doesn't make a pair ADJACENT in the rendered order — the
  // A2 partner can still be found sitting several exercises later in the
  // list. An LLM coach review caught exactly that: "Farmer's Walk is tagged
  // [A1] and Dead Bug [A2], but they're separated by four other exercises
  // in the list. Nobody can execute that superset as written." Walk the
  // original order and pull each A2 to sit immediately after its A1;
  // everything else keeps its relative position.
  const ordered: Exercise[] = []
  const emitted = new Set<number>()
  for (let i = 0; i < result.length; i++) {
    if (emitted.has(i)) continue
    ordered.push(result[i])
    emitted.add(i)
    if (result[i].superset_label?.endsWith('1')) {
      const letter = result[i].superset_label![0]
      const partnerIdx = result.findIndex((e, idx) => !emitted.has(idx) && e.superset_label === `${letter}2`)
      if (partnerIdx !== -1) {
        ordered.push(result[partnerIdx])
        emitted.add(partnerIdx)
      }
    }
  }

  return ordered
}

function stageTimeCap(
  dayExercises: { entry: ExerciseEntry; sets: number; reps: string; rest: string; restSeconds: number }[],
  budgetSeconds: number,
  style: TrainingStyle,
  trace: ConstraintTrace,
  /**
   * Names that filled a REQUIRED track slot (selectExercisesForTrack) —
   * Phase 4 below must never remove one of these outright under duration
   * pressure, or Fix 1's "never silently drop the slot" guarantee gets
   * silently undone one stage later. They can still lose SETS (Phase 5),
   * just not disappear entirely.
   */
  protectedNames: Set<string> = new Set(),
): { entry: ExerciseEntry; sets: number; reps: string; rest: string; restSeconds: number }[] {
  let estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds })))

  if (estimated <= budgetSeconds) return dayExercises

  // Phase 1: Convert to antagonist supersets (halves rest between paired
  // exercises). Same eligibility gate as buildSupersetPairs — main lifts
  // keep full rest even under time pressure; only isolation/core/carry work
  // gets compressed here.
  const paired = new Set<number>()
  for (let i = 0; i < dayExercises.length; i++) {
    if (paired.has(i)) continue
    if (!isSupersetEligible(dayExercises[i].entry)) continue
    const opposing = getOpposingPattern(dayExercises[i].entry.movement_pattern)
    if (!opposing) continue
    for (let j = i + 1; j < dayExercises.length; j++) {
      if (paired.has(j)) continue
      if (!isSupersetEligible(dayExercises[j].entry)) continue
      if (dayExercises[j].entry.movement_pattern === opposing) {
        dayExercises[j] = { ...dayExercises[j], restSeconds: Math.round(dayExercises[j].restSeconds * 0.5), rest: `${Math.round(dayExercises[j].restSeconds * 0.5)}s` }
        paired.add(i)
        paired.add(j)
        break
      }
    }
  }

  estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds })))
  if (estimated <= budgetSeconds) return dayExercises

  // Phase 2: Reduce rest by 15s across the board
  for (let i = 0; i < dayExercises.length; i++) {
    const newRest = Math.max(30, dayExercises[i].restSeconds - 15)
    dayExercises[i] = { ...dayExercises[i], restSeconds: newRest, rest: `${newRest}s` }
  }

  estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds })))
  if (estimated <= budgetSeconds) return dayExercises

  // Phase 3: Drop sets from isolation exercises first
  for (let pass = 0; pass < 3 && estimated > budgetSeconds; pass++) {
    for (let i = dayExercises.length - 1; i >= 0; i--) {
      if (dayExercises[i].entry.mechanics_tier === 'tier3_isolation' && dayExercises[i].sets > 2) {
        dayExercises[i] = { ...dayExercises[i], sets: dayExercises[i].sets - 1 }
        trace.time_cap_adjusted.push({
          exercise: dayExercises[i].entry.name,
          stage: 'time_cap',
          reason: `reduced sets to ${dayExercises[i].sets} to fit ${Math.round(budgetSeconds / 60)}min budget`,
        })
      }
    }
    estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds })))
  }

  // Phase 4: Only as last resort, remove lowest-tier exercises from the end.
  // Cardio/interval work is skipped here the same way it's protected in
  // Phase 5 below — on a dedicated conditioning day it usually sits at the
  // END of the array (selection sorts tier1->tier2->tier3->cardio), so a
  // blind pop() would remove the conditioning content FIRST on exactly the
  // day it matters most. Required-slot exercises (protectedNames) are
  // skipped the same way — dropping a Fix-1 guaranteed pattern here would
  // silently undo the "never silently drop the slot" promise one stage
  // later; those exercises can still lose sets in Phase 5, just not
  // disappear outright.
  while (estimated > budgetSeconds && dayExercises.length > 3) {
    let removeIdx = dayExercises.length - 1
    while (removeIdx >= 0 && (dayExercises[removeIdx].entry.mechanics_tier === 'cardio' || protectedNames.has(dayExercises[removeIdx].entry.name))) removeIdx--
    if (removeIdx < 0 || dayExercises.length <= 3) break
    const removed = dayExercises.splice(removeIdx, 1)[0]
    trace.time_cap_adjusted.push({
      exercise: removed.entry.name,
      stage: 'time_cap',
      reason: `dropped entirely — still over ${Math.round(budgetSeconds / 60)}min budget after superset conversion and set reduction`,
    })
    estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds })))
  }

  // Phase 5: At the three-exercise floor and still over. Rather than stripping
  // the session down to one or two movements, trim sets across the board —
  // a short session should mean fewer sets, not a session missing whole
  // movement patterns. Two working sets is the floor; below that there is no
  // meaningful stimulus.
  // Main lifts are trimmed last, and only once every accessory/isolation
  // slot is already at the 2-set floor — cutting the main lift's volume to
  // hit a time budget is the wrong lever when an accessory still has sets
  // to give up first.
  for (let pass = 0; pass < 4 && estimated > budgetSeconds; pass++) {
    let trimmed = false
    const order = dayExercises
      .map((e, i) => ({
        i,
        cost: e.sets * (e.entry.avg_duration_seconds + e.restSeconds),
        // Cardio/interval work is protected the same as the main lift —
        // trimmed only once every accessory/isolation slot has already
        // given up sets. A conditioning "round" floors at 4, not 2 (see
        // getRoleSetFloor) — an interval circuit cut to 2 rounds isn't a
        // conditioning stimulus.
        isMain: e.entry.mechanics_tier === 'tier1_compound' || e.entry.mechanics_tier === 'cardio',
        floor: e.entry.mechanics_tier === 'cardio' ? 4 : 2,
      }))
      .sort((a, b) => b.cost - a.cost)

    for (const priority of [false, true]) {
      for (const { i, isMain, floor } of order) {
        if (isMain !== priority) continue
        if (estimated <= budgetSeconds) break
        if (dayExercises[i].sets <= floor) continue
        dayExercises[i] = { ...dayExercises[i], sets: dayExercises[i].sets - 1 }
        trimmed = true
        trace.time_cap_adjusted.push({
          exercise: dayExercises[i].entry.name,
          stage: 'time_cap',
          reason: `reduced to ${dayExercises[i].sets} sets — session budget is tight at ${Math.round(budgetSeconds / 60)}min`,
        })
        estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds })))
      }
      if (estimated <= budgetSeconds) break
    }

    if (!trimmed) break
  }

  return dayExercises
}

// ---------------------------------------------------------------------------
// Split selection (preserved from previous version)
// ---------------------------------------------------------------------------

function getSplitForDays(dayCount: number, goal: FitnessGoal, splitPref: WorkoutSplit, trainingStyle: TrainingStyle = 'hybrid'): TrackFocus[] {
  if (splitPref === 'ppl') {
    if (dayCount <= 2) return ['Push & Press', 'Pull & Hinge']
    if (dayCount === 3) return ['Push & Press', 'Pull & Hinge', 'Squat & Carry']
    if (dayCount === 4) return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Push & Press']
    if (dayCount === 5) return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Push & Press', 'Pull & Hinge']
    return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Push & Press', 'Pull & Hinge', 'Squat & Carry']
  }
  if (splitPref === 'upper_lower') {
    if (dayCount <= 2) return ['Push & Press', 'Squat & Carry']
    if (dayCount === 3) return ['Push & Press', 'Squat & Carry', 'Upper Pull & Core']
    if (dayCount === 4) return ['Push & Press', 'Squat & Carry', 'Upper Pull & Core', 'Squat & Carry']
    if (dayCount === 5) return ['Push & Press', 'Squat & Carry', 'Upper Pull & Core', 'Squat & Carry', 'Pull & Hinge']
    return ['Push & Press', 'Squat & Carry', 'Upper Pull & Core', 'Squat & Carry', 'Pull & Hinge', 'Squat & Carry']
  }
  if (splitPref === 'full_body') {
    return Array(dayCount).fill('Full Body Power') as TrackFocus[]
  }
  if (splitPref === 'bro_split') {
    if (dayCount <= 2) return ['Chest & Triceps', 'Back & Biceps']
    if (dayCount === 3) return ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves']
    if (dayCount === 4) return ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves', 'Shoulders & Abs']
    if (dayCount === 5) return ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves', 'Shoulders & Abs', 'Chest & Triceps']
    return ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves', 'Shoulders & Abs', 'Chest & Triceps', 'Back & Biceps']
  }

  if (trainingStyle === 'combat') {
    if (dayCount <= 2) return ['Full Body Power', 'Conditioning & Core']
    if (dayCount === 3) return ['Full Body Power', 'Full Body Power', 'Conditioning & Core']
    if (dayCount === 4) return ['Full Body Power', 'Push & Press', 'Pull & Hinge', 'Conditioning & Core']
    if (dayCount === 5) return ['Full Body Power', 'Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Conditioning & Core']
    return ['Full Body Power', 'Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Conditioning & Core', 'Full Body Power']
  }
  if (trainingStyle === 'functional') {
    if (dayCount <= 2) return ['Full Body Power', 'Squat & Carry']
    if (dayCount === 3) return ['Full Body Power', 'Full Body Power', 'Squat & Carry']
    if (dayCount === 4) return ['Full Body Power', 'Push & Press', 'Pull & Hinge', 'Squat & Carry']
    if (dayCount === 5) return ['Full Body Power', 'Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Full Body Power']
    return ['Full Body Power', 'Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Full Body Power', 'Conditioning & Core']
  }
  if (trainingStyle === 'bodybuilding') {
    if (dayCount <= 2) return ['Chest & Triceps', 'Back & Biceps']
    if (dayCount === 3) return ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves']
    if (dayCount === 4) return ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves', 'Shoulders & Abs']
    if (dayCount === 5) return ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves', 'Shoulders & Abs', 'Chest & Triceps']
    return ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves', 'Shoulders & Abs', 'Chest & Triceps', 'Back & Biceps']
  }

  if (goal === 'conditioning') {
    if (dayCount <= 2) return ['Full Body Power', 'Conditioning & Core']
    if (dayCount === 3) return ['Full Body Power', 'Full Body Power', 'Full Body Power']
    if (dayCount === 4) return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Conditioning & Core']
    if (dayCount === 5) return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Upper Pull & Core', 'Conditioning & Core']
    return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Full Body Power', 'Conditioning & Core', 'Upper Pull & Core']
  }

  if (dayCount <= 2) return ['Full Body Power', 'Full Body Power']
  if (dayCount === 3) return ['Full Body Power', 'Full Body Power', 'Full Body Power']
  if (dayCount === 4) return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Upper Pull & Core']
  if (dayCount === 5) return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Upper Pull & Core', 'Full Body Power']
  return ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Upper Pull & Core', 'Conditioning & Core', 'Full Body Power']
}

// ---------------------------------------------------------------------------
// Exercise selection for a given track from the filtered pool
// ---------------------------------------------------------------------------

// With the set-count hierarchy in place (main >= accessory >= isolation,
// each individually capped — see enforceSetHierarchy), a longer session can
// no longer be filled by stacking extra sets onto 2-3 accessories; it needs
// more DISTINCT exercises instead. These counts were raised for 60-90/90+
// specifically to close the gap that opened once accessory/isolation top-up
// stopped being allowed to run unbounded.
function getExerciseCountForDuration(duration: SessionDuration): { tier1: number; tier2: number; tier3: number } {
  switch (duration) {
    case '30-45': return { tier1: 1, tier2: 2, tier3: 1 }
    case '45-60': return { tier1: 1, tier2: 2, tier3: 2 }
    case '60-90': return { tier1: 1, tier2: 4, tier3: 3 }
    case '90+': return { tier1: 1, tier2: 5, tier3: 4 }
    default: return { tier1: 1, tier2: 2, tier3: 2 }
  }
}

/**
 * Beginners get one fewer accessory (less volume to recover from, and more
 * attention per movement); advanced trainees get one more. The tier-1 slot is
 * never touched — every session needs its main lift.
 */
function adjustCountsForExperience(
  counts: { tier1: number; tier2: number; tier3: number },
  experience: ExperienceConfig,
): { tier1: number; tier2: number; tier3: number } {
  const adjust = experience.exercise_count_adjust
  if (adjust === 0) return counts

  if (adjust < 0) {
    // Trim accessories first, then secondary compounds. Never below one each.
    const tier3 = Math.max(1, counts.tier3 + adjust)
    const remaining = adjust + (counts.tier3 - tier3)
    return {
      tier1: counts.tier1,
      tier2: Math.max(1, counts.tier2 + remaining),
      tier3,
    }
  }

  return { ...counts, tier3: counts.tier3 + adjust }
}

// A bodyweight/thin-pool session that reuses an exercise across multiple
// days in the week (the refill() fallback below explicitly allows this —
// an empty session is worse than a repeat) can otherwise reuse it on EVERY
// training day. Combined with each day's own per-exercise set ceiling
// (see getRoleSetCeiling), an uncapped exercise could still land at
// 4-5 days x 3-4 sets — the review's literal complaint was Hanging Leg
// Raises at 26 sets/week. Capped at 2 appearances/week; see below.
const WEEKLY_APPEARANCE_CAP = 2

/**
 * Redistributes accessory slots between isolation (tier3) and compound-
 * accessory (tier2) without changing the total accessory count — a goal's
 * isolationSlotShift moves slot BUDGET (what kind of accessory work fills
 * the session), not overall volume (policy.setVolumeMultiplier already owns
 * volume). Positive = more isolation/variety (hypertrophy); negative =
 * fewer isolation slots in favor of compound/multi-joint accessories
 * (fat_loss, functional, conditioning). Tier1 (main lift) is never touched
 * — that's the count the "fat_loss never has fewer main-compound slots
 * than hypertrophy" audit guards. Floored at 1 each so a goal can never
 * zero out an entire tier's presence.
 */
function applyIsolationSlotShift(
  counts: { tier1: number; tier2: number; tier3: number },
  shift: number,
): { tier1: number; tier2: number; tier3: number } {
  if (shift === 0) return counts
  const tier3 = Math.max(1, counts.tier3 + shift)
  const actualShift = tier3 - counts.tier3
  const tier2 = Math.max(1, counts.tier2 - actualShift)
  return { tier1: counts.tier1, tier2, tier3 }
}

/** True for exercises functional's preferUnilateralCarry policy should surface first: unilateral movements, carry-pattern work, and rotational/anti-rotation core/accessory work — the "unilateral, carry, rotational and multi-planar" emphasis from the differentiation round. */
function isUnilateralCarryOrRotational(e: ExerciseEntry): boolean {
  return e.unilateral || e.movement_pattern === 'carry' || e.angle_vector === 'rotational' || e.angle_vector === 'anti_rotation'
}

/**
 * Goal-aware candidate ordering: when a policy prefers unilateral/carry/
 * rotational work, those candidates are shuffled and tried FIRST, with the
 * rest of the eligible pool shuffled and appended after as a fallback —
 * never excluded, just deprioritized. Every existing eligibility filter
 * (equipment/injury/style/skill/pattern/family/weekly-used) runs unchanged
 * before this is ever called, so pattern-coverage and required-slot
 * guarantees are untouched; this only changes which of several ALREADY-
 * eligible candidates gets tried first.
 */
function orderCandidates(candidates: ExerciseEntry[], policy: GoalPolicy): ExerciseEntry[] {
  if (!policy.preferUnilateralCarry) return shuffle(candidates)
  const preferred = candidates.filter(isUnilateralCarryOrRotational)
  const rest = candidates.filter(e => !isUnilateralCarryOrRotational(e))
  return [...shuffle(preferred), ...shuffle(rest)]
}

function selectExercisesForTrack(
  track: TrackDefinition,
  pool: ExerciseEntry[],
  countsIn: { tier1: number; tier2: number; tier3: number },
  weeklyUsed: Set<string>,
  styleConfig: StyleConfig,
  trace: ConstraintTrace,
  policy: GoalPolicy,
  feasibleRequiredPatterns?: MovementPattern[],
  weeklyAppearanceCount?: Map<string, number>,
): { primer: ExerciseEntry | null; main: ExerciseEntry[]; requiredNames: Set<string> } {
  const counts = applyIsolationSlotShift(countsIn, policy.isolationSlotShift)
  const allPatterns = new Set([...track.primary_patterns, ...track.secondary_patterns])
  const forbidden = new Set(track.forbidden_patterns)

  const trackPool = pool.filter(e =>
    allPatterns.has(e.movement_pattern) &&
    !forbidden.has(e.movement_pattern)
  )

  // Every primer's own movement_pattern is 'activation' (see exercise-db.ts's
  // MovementPattern comment), so matching against it was a no-op — every
  // primer was equally eligible for every track. primer_pattern_affinity is
  // the real, track-aware signal; movement_pattern stays untouched so
  // quality-score.ts's weekly pattern-coverage checks don't start counting a
  // 2x8 primer set as real pattern volume.
  //
  // The affinity filter is a PREFERENCE, not a gate — measured after landing
  // (commit 3c2b191), it left 37% of combos with at least one session missing
  // a primer outright (a mismatched primer beats no primer; the user still
  // warms up). `pool` has already applied equipment/injury/experience, so
  // falling back to it unfiltered keeps every hard constraint and only drops
  // the soft track-fit preference. Selection within either pool is identical
  // (uniform shuffle(), not ranked by "closeness" — there's no distance
  // metric between patterns in the data model to rank by, and this is the
  // same random-from-pool behavior every primer had before affinity existed,
  // which is exactly the right fallback for the one case where affinity
  // can't be honored).
  const affinityPrimerPool = pool.filter(e =>
    e.mechanics_tier === 'primer' &&
    (e.primer_pattern_affinity ?? []).some(p => track.primer_patterns.includes(p))
  )
  const anyPrimerPool = pool.filter(e => e.mechanics_tier === 'primer')
  const primerPool = affinityPrimerPool.length > 0 ? affinityPrimerPool : anyPrimerPool
  const primer = primerPool.length > 0
    ? shuffle(primerPool.filter(p => !weeklyUsed.has(p.name)))[0] ?? shuffle(primerPool)[0]
    : null

  // Keyed by movement family, not substitution_group, so the same movement
  // cannot appear twice under two different classifications. Seeded with the
  // primer's family (if any) up front — Kettlebell Swings (primer,
  // 'activation' pattern) and Kettlebell Swing (Heavy) (main, 'hip_hinge'
  // pattern) share a family via MOVEMENT_FAMILIES despite having different
  // movement_pattern values, but the primer is picked before this set even
  // existed, so nothing stopped both from landing in the same session.
  const usedGroups = new Set<string>()
  if (primer) usedGroups.add(getMovementFamily(primer))
  const selected: ExerciseEntry[] = []
  // Names that filled a REQUIRED slot — stageTimeCap must never silently
  // drop one of these under duration pressure (that's exactly the "never
  // silently drop the slot" guarantee Fix 1 exists to provide); it may
  // still trim their SETS, just not remove them outright.
  const requiredNames = new Set<string>()

  // Pattern-guaranteed slots — filled FIRST, in order, before the legacy
  // pickFromTier/refill pass below tops up to the duration-based count. See
  // TrackSlot's doc comment for why this replaced pure filter-then-shuffle.
  const slotForbidden = new Set(track.forbidden_patterns)
  function findForSlot(patterns: MovementPattern[], tier: TrackSlot['tier'] | null, respectWeeklyUsed: boolean): ExerciseEntry | null {
    const candidates = shuffle(
      pool.filter(e =>
        patterns.includes(e.movement_pattern) &&
        !slotForbidden.has(e.movement_pattern) &&
        (tier === null || e.mechanics_tier === tier) &&
        !selected.some(s => s.name === e.name) &&
        !usedGroups.has(getMovementFamily(e)) &&
        (!respectWeeklyUsed || !weeklyUsed.has(e.name))
      )
    )
    return candidates[0] ?? null
  }
  function fillSlot(slot: TrackSlot): void {
    // Preferred tier wins over "fresh this week" — reusing the same main
    // lift on a second day (normal in full-body/PPL splits) is a better
    // outcome than downgrading a squat slot to a lunge just to avoid
    // repetition, so tier preference is resolved FIRST, freshness second:
    // preferred tier + fresh -> preferred tier + reused ok -> any tier +
    // fresh -> any tier + reused ok -> nearest-pattern substitute (required
    // slots only, logged) -> give up (required slots only, logged).
    const pick =
      findForSlot(slot.patterns, slot.tier, true) ??
      findForSlot(slot.patterns, slot.tier, false) ??
      findForSlot(slot.patterns, null, true) ??
      findForSlot(slot.patterns, null, false)
    if (pick) {
      selected.push(pick)
      usedGroups.add(getMovementFamily(pick))
      if (slot.required) requiredNames.add(pick.name)
      return
    }
    if (!slot.required) return
    const nearest = slot.patterns.flatMap(p => NEAREST_PATTERN_FALLBACK[p] ?? [])
    const substitute = nearest.length > 0 ? (findForSlot(nearest, null, true) ?? findForSlot(nearest, null, false)) : null
    if (substitute) {
      selected.push(substitute)
      usedGroups.add(getMovementFamily(substitute))
      requiredNames.add(substitute.name)
      trace.structure_adjusted.push({
        exercise: substitute.name, stage: 'structure',
        reason: `"${track.label}" required slot for [${slot.patterns.join('/')}] had no eligible exercise — substituted nearest pattern "${substitute.movement_pattern}"`,
      })
      return
    }
    trace.structure_adjusted.push({
      exercise: '(none)', stage: 'structure',
      reason: `"${track.label}" required slot for [${slot.patterns.join('/')}] could not be filled even with a nearest-pattern substitute — equipment/injury genuinely leaves nothing eligible`,
    })
  }
  for (const slot of track.slots) fillSlot(slot)

  function pickFromTier(tier: string, count: number, patterns: MovementPattern[]) {
    const candidates = orderCandidates(
      trackPool.filter(e =>
        e.mechanics_tier === tier &&
        patterns.includes(e.movement_pattern) &&
        !weeklyUsed.has(e.name) &&
        !selected.some(s => s.name === e.name) &&
        !usedGroups.has(getMovementFamily(e))
      ),
      policy,
    )
    for (const c of candidates) {
      if (selected.length >= counts.tier1 + counts.tier2 + counts.tier3) break
      if (count <= 0) break
      // Re-check the family here, not only in the filter above. `candidates`
      // is evaluated once, so a family claimed earlier in THIS loop would
      // otherwise slip through — which is how Chest Dips and Tricep Dips
      // (both family 'dip') ended up in the same session.
      if (usedGroups.has(getMovementFamily(c))) continue
      selected.push(c)
      usedGroups.add(getMovementFamily(c))
      count--
    }
    return count
  }

  // Cardio-tier exercises have mechanics_tier 'cardio', which never matches
  // tier1_compound/tier2_compound/tier3_isolation below — so on a track
  // whose whole point IS conditioning (primary_patterns includes 'cardio'),
  // cardio exercises could ONLY ever reach selection through the refill()
  // fallback further down, which only fires when the tier picks undershoot
  // the target. Core-pattern tier2/tier3 exercises (Plank, Hanging Leg
  // Raises, Ab Wheel...) are plentiful enough to satisfy that target on
  // their own, so refill() rarely triggered — a "Conditioning & Core" day
  // ended up almost entirely core with one or two token cardio entries, a
  // direct, repeated LLM coach review finding. Reserving real cardio slots
  // FIRST, before core competes for the same count, fixes that at the
  // source.
  if (track.primary_patterns.includes('cardio')) {
    const cardioCount = Math.max(2, Math.ceil((counts.tier1 + counts.tier2 + counts.tier3) / 2))
    pickFromTier('cardio', cardioCount, track.primary_patterns)
  }

  pickFromTier('tier1_compound', counts.tier1, track.primary_patterns)
  pickFromTier('tier2_compound', counts.tier2, [...track.primary_patterns, ...track.secondary_patterns])
  pickFromTier('tier3_isolation', counts.tier3, track.secondary_patterns)

  // FALLBACK: when the pool is small (bodyweight, heavy injury filtering), the
  // week's earlier sessions can consume everything available and leave nothing
  // for later days. Repeating a movement across the week is normal training
  // practice — an empty session is not. So if we came up short, refill while
  // allowing exercises already used earlier in the week.
  if (selected.length < counts.tier1 + counts.tier2 + counts.tier3) {
    const target = counts.tier1 + counts.tier2 + counts.tier3
    // Prefer bigger movements first so a refilled session still opens with a
    // compound rather than leading on isolation work.
    const tierRank = (e: ExerciseEntry) =>
      ({ tier1_compound: 0, tier2_compound: 1, tier3_isolation: 2 } as Record<string, number>)[e.mechanics_tier] ?? 3

    const refill = (respectFamilies: boolean, respectWeeklyCap: boolean) => {
      const candidates = shuffle(
        trackPool.filter(e =>
          e.mechanics_tier !== 'primer' &&
          !selected.some(s => s.name === e.name) &&
          (!respectFamilies || !usedGroups.has(getMovementFamily(e))) &&
          (!respectWeeklyCap || !weeklyAppearanceCount || (weeklyAppearanceCount.get(e.name) ?? 0) < WEEKLY_APPEARANCE_CAP)
        )
      ).sort((a, b) => tierRank(a) - tierRank(b))

      for (const c of candidates) {
        if (selected.length >= target) break
        selected.push(c)
        usedGroups.add(getMovementFamily(c))
      }
    }

    // Keeps one movement per family. refill() already permits exercises used
    // earlier in the WEEK, which is the point of this fallback — repeating a
    // movement across days is normal training. Repeating it twice in the SAME
    // session is not, so families stay enforced even here. A slightly shorter
    // session beats one padded with Chest Dips next to Tricep Dips.
    // Weekly-appearance cap is tried first (see WEEKLY_APPEARANCE_CAP); only
    // relaxed if that alone can't fill the session — an occasional exercise
    // over-capped by one appearance beats an empty slot.
    refill(true, true)
    if (selected.length < target) refill(true, false)
  }

  // Ensure required patterns are present
  for (const reqPattern of track.required_patterns) {
    if (!selected.some(e => e.movement_pattern === reqPattern)) {
      const fill = trackPool.find(e =>
        e.movement_pattern === reqPattern &&
        !selected.some(s => s.name === e.name) &&
        !usedGroups.has(getMovementFamily(e))
      )
      if (fill) {
        selected.push(fill)
        usedGroups.add(getMovementFamily(fill))
      }
    }
  }

  // Ensure style-required patterns are present (use feasible patterns if provided)
  const requiredPatterns = feasibleRequiredPatterns || styleConfig.requiresPatterns || []
  if (requiredPatterns.length > 0) {
    for (const reqPattern of requiredPatterns) {
      if (!selected.some(e => e.movement_pattern === reqPattern)) {
        // PASS 1: Strict search (respect all constraints)
        const fill = pool.find(e =>
          e.movement_pattern === reqPattern &&
          !selected.some(s => s.name === e.name) &&
          !forbidden.has(e.movement_pattern) &&
          !usedGroups.has(getMovementFamily(e))
        )
        
        if (fill) {
          selected.push(fill)
          usedGroups.add(getMovementFamily(fill))
        } else {
          // PASS 2: Relaxed search (allow reusing substitution groups)
          const relaxedFill = pool.find(e =>
            e.movement_pattern === reqPattern &&
            !selected.some(s => s.name === e.name) &&
            !forbidden.has(e.movement_pattern)
          )
          
          if (relaxedFill) {
            selected.push(relaxedFill)
            usedGroups.add(getMovementFamily(relaxedFill))
          } else {
            // FALLBACK: Warn but continue (required pattern unavailable)
            console.warn(
              `[Exercise Engine] Could not find exercise for required pattern "${reqPattern}" ` +
              `in track "${track.label}" — pattern will not be present this session`
            )
          }
        }
      }
    }
  }

  // A day is named after what it's supposed to contain — "Squat & Carry"
  // with no squat, or "Push & Press" with no overhead press, is exactly
  // what an LLM coach review caught ("Squat & Carry" days containing zero
  // squat/lunge/split-squat reps). track.required_patterns only covers a
  // SINGLE exact pattern; squat spans two (knee_dominant, single_leg), and
  // "Push & Press" had no requirement at all. Same push-a-fill-in fallback
  // as the required-pattern loop above, scoped to just these two labels.
  const ensurePatternPresent = (patterns: MovementPattern[]) => {
    if (patterns.some(p => selected.some(e => e.movement_pattern === p))) return
    // Never fills with a SECOND tier1_compound — that slot is reserved to
    // exactly one exercise per day (pickFromTier('tier1_compound', ...)
    // above already claimed it). Filling with another main lift here
    // silently doubled a day's main-compound count, which broke the
    // fat_loss-vs-hypertrophy main-compound-slot comparison the goal-
    // alignment scorer relies on.
    const fill = trackPool.find(e =>
      patterns.includes(e.movement_pattern) &&
      e.mechanics_tier !== 'tier1_compound' &&
      !selected.some(s => s.name === e.name) &&
      !usedGroups.has(getMovementFamily(e))
    )
    if (fill) {
      selected.push(fill)
      usedGroups.add(getMovementFamily(fill))
    }
  }
  if (track.label === 'Squat & Carry') ensurePatternPresent(['knee_dominant', 'single_leg'])
  if (track.label === 'Push & Press') ensurePatternPresent(['vertical_push'])

  // Sort: tier1 compounds first, then tier2, then tier3
  const tierOrder = { tier1_compound: 0, tier2_compound: 1, tier3_isolation: 2, cardio: 3, primer: 4 }
  selected.sort((a, b) => (tierOrder[a.mechanics_tier] ?? 3) - (tierOrder[b.mechanics_tier] ?? 3))

  return { primer, main: selected, requiredNames }
}

// ---------------------------------------------------------------------------
// Assign sets/reps/rest using the style config
// ---------------------------------------------------------------------------

/**
 * Shifts a rep-range string by a signed rep delta ("6-8" at -2 -> "4-6"),
 * flooring the low bound at 1 and keeping the high bound at least one above
 * it. Non-range strings (single numbers, "AMRAP", time/distance text) pass
 * through untouched — a goal's rep bias only makes sense for an actual
 * low-high rep range, and applyRepFloor (the experience floor) runs AFTER
 * this shift, so the two never fight over which one wins the bottom bound.
 */
function shiftRepRange(reps: string, delta: number): string {
  if (delta === 0) return reps
  const range = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!range) return reps
  const low = Math.max(1, Number(range[1]) + delta)
  const high = Math.max(low + 1, Number(range[2]) + delta)
  return `${low}-${high}`
}

/** Multiplies a base rest-seconds value by a goal's per-tier bias, floored at 20s — even the densest circuit-adjacent goal needs SOME recovery between working sets. */
function shiftRestSeconds(seconds: number, multiplier: number): number {
  return Math.max(20, Math.round(seconds * multiplier))
}

function assignSetsRepsFromConfig(
  entry: ExerciseEntry,
  config: StyleConfig,
  experience: ExperienceConfig,
  policy: GoalPolicy,
): { sets: number; reps: string; rest: string; restSeconds: number } {
  // Primers are not scaled — a 5-rep activation drill is a 5-rep activation
  // drill regardless of how long you have been training.
  if (entry.mechanics_tier === 'primer') {
    return { sets: 2, reps: '5', rest: '30s', restSeconds: 30 }
  }

  // A beginner never drops below 2 working sets — one set is not a stimulus.
  const scaleSets = (base: number) =>
    Math.max(2, Math.round(base * experience.sets_multiplier))

  // Dispatched on prescription_type, not movement_pattern — two exercises
  // can share a pattern ('carry') while needing entirely different units
  // (Farmer Squat Hold is a hold, Farmer's Walk is a measured distance).
  // See PrescriptionType's doc comment in exercise-db.ts.
  switch (entry.prescription_type) {
    case 'time':
      return { sets: 3, reps: '30-45s', rest: '45s', restSeconds: 45 }
    case 'distance_load':
      return { sets: 3, reps: '40m', rest: '60s', restSeconds: 60 }
    case 'intervals':
      // Rounds of work:rest, never a rep count — a jump-rope or battle-rope
      // set is not "15-18 reps."
      return { sets: scaleSets(6), reps: '30s', rest: '30s', restSeconds: 30 }
    case 'reps':
    default: {
      // Goal differentiation round: the goal's repRangeShift/
      // restSecondsMultiplier apply on TOP of training_style's own base
      // numbers, per tier — the two axes stay independent (a goal never
      // overrides a style's numbers, it biases them) and this is the one
      // choke point every tier's reps/rest passes through, so the bias
      // reaches every call site (initial build, block rotation, weekly
      // accessory sub-rotation, swap/gap-fill repair) for free.
      const tierKey = entry.mechanics_tier === 'tier1_compound' ? 'tier1' : entry.mechanics_tier === 'tier2_compound' ? 'tier2' : 'tier3'
      const restSeconds = shiftRestSeconds(config.restSeconds[tierKey], policy.restSecondsMultiplier[tierKey])
      return {
        sets: scaleSets(config.setRange[tierKey]),
        reps: applyRepFloor(shiftRepRange(config.repRange[tierKey], policy.repRangeShift[tierKey]), experience.min_reps),
        rest: `${restSeconds}s`,
        restSeconds,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Substitution from the filtered pool
// ---------------------------------------------------------------------------

function getSubstitution(entry: ExerciseEntry, pool: ExerciseEntry[], selected: Set<string>): string {
  const candidate = pool.find(e =>
    e.substitution_group === entry.substitution_group &&
    e.name !== entry.name &&
    !selected.has(e.name)
  )
  return candidate?.name ?? ''
}

// ---------------------------------------------------------------------------
// Track viability check
// ---------------------------------------------------------------------------

function countAvailableForTrack(t: TrackDefinition, pool: ExerciseEntry[]): number {
  const allPatterns = [...t.primary_patterns, ...t.secondary_patterns]
  const forbidden = new Set(t.forbidden_patterns)
  return pool.filter(e =>
    allPatterns.includes(e.movement_pattern) &&
    !forbidden.has(e.movement_pattern) &&
    e.mechanics_tier !== 'primer'
  ).length
}

function isTrackViable(t: TrackDefinition, pool: ExerciseEntry[]): boolean {
  const forbidden = new Set(t.forbidden_patterns)
  const requiredOk = t.required_patterns.every(rp =>
    pool.some(e => e.movement_pattern === rp && !forbidden.has(e.movement_pattern))
  )
  // "Squat & Carry"/"Push & Press" only declare 'carry'/nothing in
  // required_patterns (required_patterns is a single exact pattern; squat
  // spans two — knee_dominant, single_leg). A knee injury filters out
  // every squat-pattern exercise while leaving carries untouched, so the
  // check above alone still called this track "viable" — a knee-injured
  // user got handed a "Squat & Carry" day with nothing to fill the squat.
  // ensurePatternPresent (selectExercisesForTrack) can only guarantee the
  // pattern APPEARS when the pool actually has one; when it genuinely
  // doesn't, the fix has to happen here, by not choosing this track label
  // at all.
  const squatOk = t.label !== 'Squat & Carry' ||
    pool.some(e => (e.movement_pattern === 'knee_dominant' || e.movement_pattern === 'single_leg') && !forbidden.has(e.movement_pattern))
  const pushOk = t.label !== 'Push & Press' ||
    pool.some(e => e.movement_pattern === 'vertical_push' && !forbidden.has(e.movement_pattern))
  return countAvailableForTrack(t, pool) >= 3 && requiredOk && squatOk && pushOk
}

/**
 * Resolves a proposed day focus to one the filtered pool can actually support.
 *
 * The previous implementation fell back to 'Full Body Power' and, if that was
 * also unsupported, returned it regardless — producing days with zero
 * exercises. That fails hardest exactly where it matters most: a trainee with
 * multiple injuries, whose pool may contain nothing matching that track's
 * patterns at all. Now we search every track and take the richest viable one,
 * only settling for a best-effort choice when nothing clears the bar.
 */
function getViableTrack(
  candidate: TrackFocus,
  pool: ExerciseEntry[],
): TrackFocus {
  if (isTrackViable(TRACKS[candidate], pool)) return candidate

  const ranked = (Object.keys(TRACKS) as TrackFocus[])
    .map(focus => ({ focus, available: countAvailableForTrack(TRACKS[focus], pool) }))
    .sort((a, b) => b.available - a.available)

  const viable = ranked.find(r => isTrackViable(TRACKS[r.focus], pool))
  if (viable) return viable.focus

  // Nothing is viable — the pool is severely constrained. Return whichever
  // track has the most material so the session is as full as it can be
  // rather than empty.
  return ranked[0]?.available > 0 ? ranked[0].focus : candidate
}

// ---------------------------------------------------------------------------
// Weekly structural balancing (push:pull ratio, squat/hinge/push/pull coverage)
// ---------------------------------------------------------------------------
// Each day is selected independently (selectExercisesForTrack knows nothing
// about any other day's picks), so nothing upstream can see — let alone
// correct — a WEEKLY imbalance: five days that each individually look fine
// but collectively lean 3:1 push over pull, or never touch a hip hinge all
// week despite the equipment allowing one. This runs once, after every day's
// exercises are fully built, and corrects both by swapping the weakest
// eligible accessory slot it can find.

function findEntry(name: string): ExerciseEntry | undefined {
  return EXERCISE_DATABASE.find(e => e.name.toLowerCase() === name.toLowerCase())
}

// ---------------------------------------------------------------------------
// Set-count hierarchy (main >= accessory >= isolation)
// ---------------------------------------------------------------------------
// The LLM coach review's #1 convergent finding: main lifts landing at 2 sets
// while accessories/isolation sat at 7. Root cause was two-fold — the
// duration top-up (below) filled ONLY accessories with no ceiling relative to
// the main lift, while phase/goal/recovery multipliers could independently
// crush the main lift's own set count with nothing stopping it. These
// functions are the hard floor/ceiling every non-deload set count must
// respect, plus a same-day cross-check that an accessory can never end up
// with more sets than that day's main lift.

/** 90+ min sessions are the one case a main lift is allowed past 5 sets — "dedicated long sessions" in the review's own language. */
function getRoleSetCeiling(role: VolumeRole, isLongSession: boolean): number {
  switch (role) {
    case 'main': return isLongSession ? 6 : 5
    case 'accessory': return 4
    case 'isolation': return 3
    // A conditioning "set" is 20-60s of interval work, not a fatiguing
    // strength set — rounds, not sets. Sharing the isolation ceiling (3) is
    // exactly how a dedicated conditioning day's interval work got trimmed
    // to "3 rounds = 3 minutes of work."
    case 'conditioning': return isLongSession ? 10 : 8
  }
}

function getRoleSetFloor(role: VolumeRole): number {
  if (role === 'main') return 3
  if (role === 'conditioning') return 4
  return 2
}

function clampToVolumeRole(sets: number, role: VolumeRole | null, isLongSession: boolean): number {
  if (!role) return sets
  return Math.min(getRoleSetCeiling(role, isLongSession), Math.max(getRoleSetFloor(role), sets))
}

/**
 * Same-day cross-check: an accessory or isolation exercise's sets must never
 * exceed that day's main lift(s). The per-exercise role clamp above bounds
 * each exercise independently (main floor 3, accessory ceiling 4) — which on
 * its own still allows a 3-set main next to a 4-set accessory. Days with no
 * main lift at all (pure carry/core sessions) are left alone; there is
 * nothing to hold the hierarchy against.
 */
function enforceSetHierarchy(exercises: Exercise[]): Exercise[] {
  const roles = exercises.map(ex => {
    const entry = findEntry(ex.name)
    return entry ? getVolumeRole(entry) : null
  })
  const mainSets = exercises.filter((_, i) => roles[i] === 'main').map(ex => ex.sets)
  if (mainSets.length === 0) return exercises
  const mainCeiling = Math.max(...mainSets)
  // Conditioning rounds are exempt — a conditioning "set" isn't the same
  // unit of fatigue as a strength set, so it isn't subordinate to the main
  // lift's set count the way an accessory is (see getVolumeRole's doc
  // comment and Part 4's "never trim the conditioning" requirement).
  return exercises.map((ex, i) =>
    roles[i] && roles[i] !== 'main' && roles[i] !== 'conditioning' && ex.sets > mainCeiling
      ? { ...ex, sets: mainCeiling }
      : ex
  )
}

// ---------------------------------------------------------------------------
// Load coherence — cross-exercise sanity pass
// ---------------------------------------------------------------------------
// prescribeLoad estimates every exercise independently — it has no idea what
// the day's main lift is loaded at, or what a sibling accessory in the same
// muscle group is showing THIS SAME WEEK. That's how an LLM coach review
// found a 26kg/hand curl next to a 2kg shrug in the same week, and a
// unilateral Bulgarian split squat outweighing the bilateral back squat it
// shared a session with. Runs once per week, after every exercise's load is
// resolved, and pulls outliers back toward what's actually coherent.

const RELATED_PRESS_FRACTION_CEILING = 0.55 // curls/laterals/shrugs vs. the day's main press
const UNILATERAL_VS_MAIN_FRACTION_CEILING = 0.65 // unilateral accessory vs. the day's bilateral main, same broad pattern
const SAME_MUSCLE_GROUP_MAX_RATIO = 2 // heaviest same-group accessory vs. lightest, within the week

type BroadPattern = 'push' | 'pull' | 'squat' | 'hinge' | null

function broadPattern(pattern: MovementPattern): BroadPattern {
  switch (pattern) {
    case 'horizontal_push': case 'vertical_push': return 'push'
    case 'horizontal_pull': case 'vertical_pull': return 'pull'
    case 'knee_dominant': case 'single_leg': return 'squat'
    case 'hip_hinge': return 'hinge'
    default: return null
  }
}

/** Same-muscle-group coherence bucket — exercises whose absolute load should stay in the same ballpark within a week. Laterals and shrugs share a bucket deliberately: both are the same "small, high-rep shoulder-girdle isolation" complaint class in the review. */
function coherenceGroup(entry: ExerciseEntry): string | null {
  switch (entry.movement_pattern) {
    case 'isolation_bicep': return 'bicep'
    case 'isolation_tricep': return 'tricep'
    case 'isolation_shoulder': return 'shoulder_isolation'
    case 'isolation_quad': return 'quad_isolation'
    case 'isolation_hamstring': return 'hamstring_isolation'
    case 'isolation_calf': return 'calf_isolation'
    default: return null
  }
}

/** Overwrites an exercise's load fields in place to a new (plate-rounded) target — used only to pull an outlier DOWN toward coherence, never to invent a heavier number. Any set-by-set ramp collapses to a flat value at the new target; a load already being clamped down is not a candidate for a strength-phase ramp anyway. */
function rebuildLoadForExercise(ex: Exercise, entry: ExerciseEntry, targetKg: number): void {
  const mode = loadingMode(entry)
  const rounded = roundToPlate(targetKg, mode)
  // Shared with prescribeLoad's own label logic (load-prescription.ts) so a
  // coherence-clamped Suitcase Carry or Overhead Carry still reads "(single
  // side)" instead of silently losing that qualifier — this used to
  // re-derive its own isDumbbell-only check, which is exactly the
  // single-implement-unilateral gap that produced the "per hand" bug on a
  // one-sided carry in the first place.
  const display = formatLoad(rounded, labelModeForEntry(entry))
  ex.suggested_load_kg = rounded
  ex.suggested_load = display
  if (ex.per_set_load && ex.per_set_load.length > 0) {
    ex.per_set_load = ex.per_set_load.map(s => ({ ...s, load_kg: rounded, display }))
  }
}

function enforceLoadCoherence(days: WorkoutDay[]): void {
  for (const day of days) {
    const mainLifts = day.exercises.filter(ex => {
      const entry = findEntry(ex.name)
      return entry && ex.suggested_load_kg != null && entry.mechanics_tier === 'tier1_compound' && !entry.unilateral
    })

    // Unilateral accessory vs. this day's bilateral main lift, same broad pattern.
    for (const ex of day.exercises) {
      const entry = findEntry(ex.name)
      if (!entry || !entry.unilateral || ex.suggested_load_kg == null) continue
      const pattern = broadPattern(entry.movement_pattern)
      if (!pattern) continue
      const main = mainLifts.find(m => broadPattern(findEntry(m.name)!.movement_pattern) === pattern)
      if (!main || main.suggested_load_kg == null) continue
      const ceiling = main.suggested_load_kg * UNILATERAL_VS_MAIN_FRACTION_CEILING
      if (ex.suggested_load_kg > ceiling) rebuildLoadForExercise(ex, entry, ceiling)
    }

    // Incline press vs. flat press, same day — incline should never exceed flat.
    const flat = day.exercises.find(ex => {
      const entry = findEntry(ex.name)
      return entry?.substitution_group === 'bench_press' && entry.angle_vector === 'horizontal' && ex.suggested_load_kg != null
    })
    if (flat?.suggested_load_kg != null) {
      for (const ex of day.exercises) {
        const entry = findEntry(ex.name)
        if (!entry || entry.name === flat.name || ex.suggested_load_kg == null) continue
        const isInclinePress = entry.substitution_group === 'bench_press' && entry.angle_vector === 'diagonal' && entry.movement_pattern === 'horizontal_push'
        if (isInclinePress && ex.suggested_load_kg > flat.suggested_load_kg) {
          rebuildLoadForExercise(ex, entry, flat.suggested_load_kg * 0.9)
        }
      }
    }

    // Curls/laterals/shrugs vs. this day's main press.
    const mainPress = mainLifts.find(m => {
      const p = findEntry(m.name)?.movement_pattern
      return p === 'horizontal_push' || p === 'vertical_push'
    })
    if (mainPress?.suggested_load_kg != null) {
      const ceiling = mainPress.suggested_load_kg * RELATED_PRESS_FRACTION_CEILING
      for (const ex of day.exercises) {
        const entry = findEntry(ex.name)
        if (!entry || ex.suggested_load_kg == null) continue
        const isBoundedIsolation = entry.movement_pattern === 'isolation_bicep' || entry.movement_pattern === 'isolation_shoulder'
        if (isBoundedIsolation && ex.suggested_load_kg > ceiling) rebuildLoadForExercise(ex, entry, ceiling)
      }
    }
  }

  // Same-muscle-group accessories within ~2x of each other, across the whole week.
  const groups = new Map<string, { ex: Exercise; entry: ExerciseEntry }[]>()
  for (const day of days) {
    for (const ex of day.exercises) {
      const entry = findEntry(ex.name)
      if (!entry || ex.suggested_load_kg == null) continue
      const group = coherenceGroup(entry)
      if (!group) continue
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push({ ex, entry })
    }
  }
  for (const items of groups.values()) {
    if (items.length < 2) continue
    const min = Math.min(...items.map(i => i.ex.suggested_load_kg!))
    if (min <= 0) continue
    const ceiling = min * SAME_MUSCLE_GROUP_MAX_RATIO
    for (const { ex, entry } of items) {
      if (ex.suggested_load_kg! > ceiling) rebuildLoadForExercise(ex, entry, ceiling)
    }
  }
}

type BalancePattern = 'push' | 'pull' | 'squat' | 'hinge' | null

function classifyForBalance(pattern: MovementPattern): BalancePattern {
  switch (pattern) {
    case 'horizontal_push':
    case 'vertical_push':
      return 'push'
    case 'horizontal_pull':
    case 'vertical_pull':
      return 'pull'
    case 'knee_dominant':
    case 'single_leg':
      return 'squat'
    case 'hip_hinge':
      return 'hinge'
    default:
      return null
  }
}

/**
 * Rebuilds one Exercise object for a swapped-in replacement. Reuses the
 * ORIGINAL slot's sets/reps/rest — tier2 and tier3 accessories share the
 * same base set count across every training style (see STYLE_CONFIGS), so
 * this is not an approximation — and recomputes only what's specific to the
 * new exercise: load, the "swap for" suggestion, and load guidance. Drops
 * any superset_label, since it was built against the OLD exercise's
 * antagonist movement pattern and may no longer describe a real pairing.
 */
function rebuildExerciseForSwap(
  oldExercise: Exercise,
  newEntry: ExerciseEntry,
  experience: ExperienceConfig,
  profile: UserProfile,
  pool: ExerciseEntry[],
  allSelectedNames: Set<string>,
  styleConfig: StyleConfig,
): Exercise {
  const isPrimer = newEntry.mechanics_tier === 'primer'
  const intensity = isPrimer ? oldExercise.intensity : experience.target_rpe
  const load = prescribeLoad(newEntry, profile, { targetRpeLabel: intensity, isFirstBlock: true, sets: oldExercise.sets })
  // The weekly-structure swap can pull its replacement from a slot whose
  // OLD exercise had an entirely different prescription_type (the weakest-
  // accessory-slot search for missing pattern coverage picks any
  // tier3_isolation exercise, including a core/carry hold) — reusing
  // oldExercise.reps unchanged is how "Dumbbell Rows: 3x30-45s" happened.
  // Reps are always re-derived from the NEW exercise; only sets/rest are
  // carried over, since those genuinely share the same base value across
  // every STYLE_CONFIGS style (see the doc comment above).
  const reps = isPrimer ? oldExercise.reps : assignSetsRepsFromConfig(newEntry, styleConfig, experience, getGoalPolicy(profile.fitness_goal || 'hypertrophy')).reps
  return {
    ...oldExercise,
    id: newEntry.id,
    name: newEntry.name,
    reps,
    substitution: getSubstitution(newEntry, pool, allSelectedNames),
    intensity,
    prescription_type: newEntry.prescription_type,
    load_guidance: isPrimer ? oldExercise.load_guidance : `${experience.load_guidance} ${load.basis}`,
    suggested_load: isPrimer ? 'Light' : load.display,
    suggested_load_kg: isPrimer ? null : load.starting_weight_kg,
    load_source: isPrimer ? undefined : load.load_source,
    per_set_load: isPrimer ? null : load.per_set,
    superset_label: undefined,
  }
}

function balanceWeeklyStructure(
  days: WorkoutDay[],
  pool: ExerciseEntry[],
  weeklyUsed: Set<string>,
  allSelectedNames: Set<string>,
  experience: ExperienceConfig,
  profile: UserProfile,
  trace: ConstraintTrace,
  styleConfig: StyleConfig,
  /**
   * Names that filled a REQUIRED slot somewhere in the week
   * (selectExercisesForTrack) — the push:pull/coverage passes below must
   * never swap-away or remove one of these. A review-round regression: the
   * push:pull ratio pass' "remove weakest exercise" fallback (Fix 2) once
   * removed the exact Dumbbell Shoulder Press that Fix 1's required
   * vertical_push slot had just placed, because nothing here knew it was
   * protected — the guarantee and the balancer were fighting each other.
   */
  protectedNames: Set<string> = new Set(),
): void {
  const dayFamilies = (dayIdx: number): Set<string> =>
    new Set(
      days[dayIdx].exercises
        .map(ex => findEntry(ex.name))
        .filter((e): e is ExerciseEntry => !!e)
        .map(e => getMovementFamily(e))
    )

  // The raw movement_pattern(s) each BalancePattern can be realized by —
  // used to check a candidate swap against the HOST DAY's own track
  // definition, not just against family-duplication. Without this, the
  // weekly-coverage/push-pull passes could (and did) push a horizontal_push
  // exercise onto a "Pull & Hinge" day, which forbids that pattern for a
  // reason: an LLM coach review found exactly that — "Dumbbell Bench Press"
  // landing on a day named after pulling.
  const BALANCE_PATTERN_RAW: Record<Exclude<BalancePattern, null>, MovementPattern[]> = {
    push: ['horizontal_push', 'vertical_push'],
    pull: ['horizontal_pull', 'vertical_pull'],
    squat: ['knee_dominant', 'single_leg'],
    hinge: ['hip_hinge'],
  }
  const dayForbidden = (dayIdx: number): Set<MovementPattern> =>
    new Set(TRACKS[days[dayIdx].focus as TrackFocus]?.forbidden_patterns ?? [])
  const dayAllowsPattern = (dayIdx: number, pattern: Exclude<BalancePattern, null>): boolean =>
    BALANCE_PATTERN_RAW[pattern].some(p => !dayForbidden(dayIdx).has(p))

  // Finer-grained coverage check than BalancePattern's push/pull — Fix 1's
  // day-templates now guarantee horizontal+vertical push/pull PER DAY, but
  // this weekly pass is the backstop for splits where no single day's
  // template carries both (a 2-3 day split, or a required slot that fell
  // through to a nearest-pattern substitute). "push" broadly present was
  // never the review complaint; "zero vertical pull in the entire week"
  // while horizontal pull was plentiful was.
  type CoveragePattern = 'squat' | 'hinge' | 'horizontal_push' | 'vertical_push' | 'horizontal_pull' | 'vertical_pull'
  const COVERAGE_PATTERNS: CoveragePattern[] = ['squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull']
  function classifyForCoverage(pattern: MovementPattern): CoveragePattern | null {
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
  const COVERAGE_PATTERN_RAW: Record<CoveragePattern, MovementPattern[]> = {
    squat: ['knee_dominant', 'single_leg'],
    hinge: ['hip_hinge'],
    horizontal_push: ['horizontal_push'],
    vertical_push: ['vertical_push'],
    horizontal_pull: ['horizontal_pull'],
    vertical_pull: ['vertical_pull'],
  }
  const dayAllowsCoveragePattern = (dayIdx: number, pattern: CoveragePattern): boolean =>
    COVERAGE_PATTERN_RAW[pattern].some(p => !dayForbidden(dayIdx).has(p))

  function findAccessorySlot(want: (p: BalancePattern) => boolean): { dayIdx: number; exIdx: number } | null {
    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const exercises = days[dayIdx].exercises
      for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
        const entry = findEntry(exercises[exIdx].name)
        if (!entry || entry.mechanics_tier === 'tier1_compound' || entry.mechanics_tier === 'primer') continue
        if (protectedNames.has(exercises[exIdx].name)) continue
        if (want(classifyForBalance(entry.movement_pattern))) return { dayIdx, exIdx }
      }
    }
    return null
  }

  function swap(dayIdx: number, exIdx: number, replacement: ExerciseEntry, reason: string): void {
    const oldName = days[dayIdx].exercises[exIdx].name
    trace.structure_adjusted.push({
      exercise: oldName, stage: 'structure',
      reason: `${reason} — swapped "${oldName}" for "${replacement.name}" on ${days[dayIdx].day}`,
    })
    weeklyUsed.delete(oldName)
    weeklyUsed.add(replacement.name)
    allSelectedNames.delete(oldName)
    allSelectedNames.add(replacement.name)
    days[dayIdx].exercises[exIdx] = rebuildExerciseForSwap(
      days[dayIdx].exercises[exIdx], replacement, experience, profile, pool, allSelectedNames, styleConfig,
    )
  }

  // Final Generator round, Fix 2: when there's no accessory slot LEFT to
  // swap (every slot on every eligible day already carries the pattern
  // that's already in excess), swapping can't close the gap — the week
  // needs one more exercise, not a substitution. Builds a fresh Exercise
  // the same way the base-plan construction loop does (no movement_pattern/
  // tier/fatigue_cost — those are only added later, during periodization).
  function addExercise(dayIdx: number, entry: ExerciseEntry, reason: string): void {
    trace.structure_adjusted.push({
      exercise: entry.name, stage: 'structure',
      reason: `${reason} — added "${entry.name}" to ${days[dayIdx].day} (no swap candidate could close the gap)`,
    })
    weeklyUsed.add(entry.name)
    allSelectedNames.add(entry.name)
    const isPrimer = entry.mechanics_tier === 'primer'
    const intensity = isPrimer ? 'Light — movement prep' : experience.target_rpe
    const sr = assignSetsRepsFromConfig(entry, styleConfig, experience, getGoalPolicy(profile.fitness_goal || 'hypertrophy'))
    const load = prescribeLoad(entry, profile, { targetRpeLabel: intensity, isFirstBlock: true, sets: sr.sets })
    days[dayIdx].exercises.push({
      id: entry.id,
      name: entry.name,
      sets: sr.sets,
      reps: sr.reps,
      rest: sr.rest,
      substitution: getSubstitution(entry, pool, allSelectedNames),
      intensity,
      prescription_type: entry.prescription_type,
      load_guidance: isPrimer ? 'Stay light and controlled. This is preparation, not a working set.' : `${experience.load_guidance} ${load.basis}`,
      suggested_load: isPrimer ? 'Light' : load.display,
      suggested_load_kg: isPrimer ? null : load.starting_weight_kg,
      load_source: isPrimer ? undefined : load.load_source,
      per_set_load: isPrimer ? null : load.per_set,
    })
  }

  // Mirror of addExercise — removes the weakest excess-pattern accessory
  // outright rather than trimming it toward a floor that can't fall any
  // further. Never removes a day's last exercise, and never a superset
  // partner (would orphan the label onto a pairing that no longer exists).
  function removeWeakestExercise(pattern: Exclude<BalancePattern, null>, reason: string): boolean {
    for (let dayIdx = days.length - 1; dayIdx >= 0; dayIdx--) {
      const exercises = days[dayIdx].exercises
      if (exercises.length <= 1) continue
      for (let exIdx = exercises.length - 1; exIdx >= 0; exIdx--) {
        const entry = findEntry(exercises[exIdx].name)
        if (!entry || entry.mechanics_tier === 'tier1_compound' || entry.mechanics_tier === 'primer') continue
        if (classifyForBalance(entry.movement_pattern) !== pattern) continue
        if (exercises[exIdx].superset_label) continue
        if (protectedNames.has(exercises[exIdx].name)) continue
        trace.structure_adjusted.push({
          exercise: exercises[exIdx].name, stage: 'structure',
          reason: `${reason} — removed "${exercises[exIdx].name}" from ${days[dayIdx].day}`,
        })
        weeklyUsed.delete(exercises[exIdx].name)
        allSelectedNames.delete(exercises[exIdx].name)
        exercises.splice(exIdx, 1)
        return true
      }
    }
    return false
  }

  // --- Weekly pattern coverage: squat, hinge, horizontal/vertical push,
  // horizontal/vertical pull — each guaranteed >=1x/week where the
  // constrained pool has anything eligible at all. Six distinct checks, not
  // four collapsed ones (see CoveragePattern's doc comment above) — this is
  // the weekly-level backstop behind Fix 1's per-day slot guarantees.
  const coveragePresent = new Set<CoveragePattern>()
  for (const day of days) {
    for (const ex of day.exercises) {
      const entry = findEntry(ex.name)
      const cov = entry ? classifyForCoverage(entry.movement_pattern) : null
      if (cov) coveragePresent.add(cov)
    }
  }
  const poolHasCoveragePattern = (pattern: CoveragePattern) =>
    pool.some(e => classifyForCoverage(e.movement_pattern) === pattern)

  for (const missing of COVERAGE_PATTERNS) {
    if (coveragePresent.has(missing)) continue
    // Equipment/injuries genuinely leave nothing of this pattern available —
    // nothing to add, and nothing worth flagging as a gap.
    if (!poolHasCoveragePattern(missing)) continue

    // Sacrifice the weakest accessory slot: prefer a tier3 isolation slot,
    // scanning from the end of the week backward so the days built around
    // heavier/earlier tracks are disturbed last.
    let slot: { dayIdx: number; exIdx: number } | null = null
    for (let dayIdx = days.length - 1; dayIdx >= 0 && !slot; dayIdx--) {
      if (!dayAllowsCoveragePattern(dayIdx, missing)) continue
      const exercises = days[dayIdx].exercises
      for (let exIdx = exercises.length - 1; exIdx >= 0; exIdx--) {
        if (protectedNames.has(exercises[exIdx].name)) continue
        if (findEntry(exercises[exIdx].name)?.mechanics_tier === 'tier3_isolation') { slot = { dayIdx, exIdx }; break }
      }
    }
    if (!slot) {
      for (let dayIdx = days.length - 1; dayIdx >= 0 && !slot; dayIdx--) {
        if (!dayAllowsCoveragePattern(dayIdx, missing)) continue
        const exercises = days[dayIdx].exercises
        for (let exIdx = exercises.length - 1; exIdx >= 0; exIdx--) {
          if (protectedNames.has(exercises[exIdx].name)) continue
          const entry = findEntry(exercises[exIdx].name)
          if (entry && entry.mechanics_tier !== 'tier1_compound' && entry.mechanics_tier !== 'primer') { slot = { dayIdx, exIdx }; break }
        }
      }
    }
    if (!slot) continue

    const usedFamilies = dayFamilies(slot.dayIdx)
    const forbidden = dayForbidden(slot.dayIdx)
    const eligible = (e: ExerciseEntry) =>
      classifyForCoverage(e.movement_pattern) === missing &&
      e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer' &&
      !usedFamilies.has(getMovementFamily(e)) &&
      !forbidden.has(e.movement_pattern)
    const replacement = pool.find(e => eligible(e) && !weeklyUsed.has(e.name)) ?? pool.find(eligible)

    if (replacement) {
      swap(slot.dayIdx, slot.exIdx, replacement, `weekly pattern coverage missing '${missing}'`)
      coveragePresent.add(missing)
      // This exercise IS the week's only source of `missing` right now —
      // protect it from the push:pull pass below, which runs after this
      // loop and would otherwise be free to remove the exact thing this
      // pass just added (observed: coverage adds a vertical press for
      // weekly coverage, then push:pull removes it two passes later
      // because it doesn't know that's the only vertical press in the
      // week).
      protectedNames.add(replacement.name)
    } else {
      trace.structure_adjusted.push({
        exercise: '(weekly pattern coverage)', stage: 'structure',
        reason: `'${missing}' pattern is available in the constrained pool but no swappable accessory slot could add it without a movement-family duplicate`,
      })
    }
  }

  // --- Legs trained >=2 days/week on 4+ day splits ---
  // A "leg day" here is any day carrying a real squat or hinge pattern in a
  // non-isolation role (tier1/tier2) — satisfied by the day's OWN main lift
  // or a tier2 accessory, not by calf raises. Reviews repeatedly cited
  // single-leg-day weeks even on 4-5 day splits with plenty of room
  // ("quads get one day... hamstrings get zero direct work").
  if (days.length >= 4) {
    const isLegDay = (dayIdx: number): boolean =>
      days[dayIdx].exercises.some(ex => {
        const entry = findEntry(ex.name)
        if (!entry) return false
        const cov = classifyForCoverage(entry.movement_pattern)
        return (cov === 'squat' || cov === 'hinge') && entry.mechanics_tier !== 'tier3_isolation'
      })
    const legDayCount = days.filter((_, i) => isLegDay(i)).length
    if (legDayCount < 2) {
      // Add a squat/hinge accessory to the strongest remaining non-leg day
      // rather than a random one — prefer a day whose track already allows
      // knee_dominant/hip_hinge (Full Body Power, Pull & Hinge's own hinge
      // slot already covers it, so this mainly matters for Push & Press /
      // Upper Pull & Core / Chest-Triceps-style days).
      let slot: { dayIdx: number; exIdx: number } | null = null
      for (let dayIdx = days.length - 1; dayIdx >= 0 && !slot; dayIdx--) {
        if (isLegDay(dayIdx)) continue
        if (!dayAllowsCoveragePattern(dayIdx, 'squat') && !dayAllowsCoveragePattern(dayIdx, 'hinge')) continue
        const exercises = days[dayIdx].exercises
        for (let exIdx = exercises.length - 1; exIdx >= 0; exIdx--) {
          if (protectedNames.has(exercises[exIdx].name)) continue
          if (findEntry(exercises[exIdx].name)?.mechanics_tier === 'tier3_isolation') { slot = { dayIdx, exIdx }; break }
        }
      }
      if (slot) {
        const usedFamilies = dayFamilies(slot.dayIdx)
        const forbidden = dayForbidden(slot.dayIdx)
        const eligible = (e: ExerciseEntry) =>
          (classifyForCoverage(e.movement_pattern) === 'squat' || classifyForCoverage(e.movement_pattern) === 'hinge') &&
          e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer' &&
          !usedFamilies.has(getMovementFamily(e)) &&
          !forbidden.has(e.movement_pattern)
        const replacement = pool.find(e => eligible(e) && !weeklyUsed.has(e.name)) ?? pool.find(eligible)
        if (replacement) {
          swap(slot.dayIdx, slot.exIdx, replacement, `legs trained on only ${legDayCount} day(s), need >=2 on a ${days.length}-day split`)
          protectedNames.add(replacement.name)
        } else {
          trace.structure_adjusted.push({
            exercise: '(weekly leg-day coverage)', stage: 'structure',
            reason: `legs trained on only ${legDayCount} day(s) of ${days.length} — no swappable accessory slot could add a second leg exposure`,
          })
        }
      } else {
        trace.structure_adjusted.push({
          exercise: '(weekly leg-day coverage)', stage: 'structure',
          reason: `legs trained on only ${legDayCount} day(s) of ${days.length} — every remaining day's track forbids squat/hinge patterns`,
        })
      }
    }
  }

  // --- Weekly push:pull ratio ---
  // Set counts for tier2/tier3 accessories share the same base value across
  // every training style (see STYLE_CONFIGS), so exercise COUNT among
  // swap-eligible accessories is a reliable proxy for the SET-based ratio the
  // quality scorer actually checks — periodization's multipliers (applied
  // later, per mesocycle week) scale push and pull work by the same factor,
  // so whatever ratio is set here survives into every week.
  //
  // Band is asymmetric, not the naive 0.8-1.4/0.6-1.6 either direction: push
  // volume should never exceed pull (shoulder-health convention — external
  // rotation/rear delt work is chronically undertrained in generated
  // programs), but pull is allowed to run up to 1.5x push. Matches
  // enforceWeeklyPatternBalance's later per-week pass so both layers agree
  // on what "balanced" means. Raised from a 6-swap budget to 20 (Fix 2) —
  // with Fix 1's day-templates already guaranteeing pattern PRESENCE per
  // day, this pass now mainly closes residual volume gaps and should rarely
  // need many iterations; heavy firing here in dev logs is a template bug
  // signal, not expected steady-state behavior.
  const MAX_SWAPS = 20
  for (let attempt = 0; attempt < MAX_SWAPS; attempt++) {
    let pushCount = 0
    let pullCount = 0
    for (const day of days) {
      for (const ex of day.exercises) {
        const entry = findEntry(ex.name)
        if (!entry) continue
        const cls = classifyForBalance(entry.movement_pattern)
        if (cls === 'push') pushCount++
        if (cls === 'pull') pullCount++
      }
    }
    if (pushCount === 0 || pullCount === 0) break
    if (pushCount <= pullCount && pullCount <= pushCount * 1.5) break

    const excessIsPush = pushCount > pullCount
    const wantPattern = excessIsPush ? 'pull' : 'push'
    const excessPattern = excessIsPush ? 'push' : 'pull'
    // Only pull FROM (and swap INTO) a day whose track actually allows the
    // pattern we want to add — same reasoning as the weekly-coverage pass
    // above: the fix must not plant a push exercise on a Pull & Hinge day.
    const target = findAccessorySlot(p => p === excessPattern)
    const validTarget = target && dayAllowsPattern(target.dayIdx, wantPattern) ? target : null

    const usedFamilies = validTarget ? dayFamilies(validTarget.dayIdx) : null
    const forbidden = validTarget ? dayForbidden(validTarget.dayIdx) : null
    const eligible = (e: ExerciseEntry) =>
      classifyForBalance(e.movement_pattern) === wantPattern &&
      e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer' &&
      !usedFamilies!.has(getMovementFamily(e)) &&
      !forbidden!.has(e.movement_pattern)
    const replacement = validTarget ? (pool.find(e => eligible(e) && !weeklyUsed.has(e.name)) ?? pool.find(eligible)) : null

    if (validTarget && replacement) {
      swap(validTarget.dayIdx, validTarget.exIdx, replacement, `push:pull exercise-count ratio ${(pushCount / pullCount).toFixed(2)}`)
      continue
    }

    // No swappable slot, or nothing in the pool to swap in — Fix 2's added
    // authority: add a whole new exercise instead of giving up. Falls back
    // to removing an excess-pattern exercise if there's genuinely nothing
    // in the pool to add either.
    const addTarget = days.findIndex((_, i) => dayAllowsPattern(i, wantPattern))
    const addCandidate = addTarget >= 0
      ? pool.find(e =>
          classifyForBalance(e.movement_pattern) === wantPattern &&
          e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer' &&
          !dayFamilies(addTarget).has(getMovementFamily(e)) &&
          !dayForbidden(addTarget).has(e.movement_pattern) &&
          !weeklyUsed.has(e.name)
        )
      : undefined

    if (addTarget >= 0 && addCandidate) {
      addExercise(addTarget, addCandidate, `push:pull exercise-count ratio ${(pushCount / pullCount).toFixed(2)}`)
      continue
    }

    if (removeWeakestExercise(excessPattern, `push:pull exercise-count ratio ${(pushCount / pullCount).toFixed(2)}`)) {
      continue
    }

    trace.structure_adjusted.push({
      exercise: '(weekly push:pull)', stage: 'structure',
      reason: `push:pull ratio ${(pushCount / pullCount).toFixed(2)} is outside the 1:1-1:1.5 band and no swap, add, or remove could correct it`,
    })
    break
  }
}

// No @types/node global in this project (it's a Vite/browser app that also
// runs under plain tsx for scripts) — reach through globalThis rather than
// referencing `process` directly so this compiles in both contexts without
// pulling in Node's type definitions project-wide.
const BALANCE_DEV_LOGGING = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== 'production'

function logWeeklyBalanceDecision(message: string): void {
  if (BALANCE_DEV_LOGGING) console.debug(`[weekly-pattern-balance] ${message}`)
}

/**
 * Final per-week structural check — runs on the ACTUALLY SHIPPED week, after
 * periodization, weekly accessory rotation, and duration-budget trimming.
 * balanceWeeklyStructure (above) only ever runs once, on the base
 * unperiodized template; a review round found set-count imbalances that
 * survived it anyway ("4 sets of pushing against 20 sets of pulling") —
 * duration-budget trimming and phase/goal set multipliers run AFTER that
 * pass and can each independently reshape how many SETS land on each
 * pattern, with nothing re-checking the aggregate once they're done.
 *
 * Deliberately does NOT swap exercise identities the way
 * balanceWeeklyStructure does — a swap this late would need a fresh,
 * periodization-aware load/rep rebuild (this week might be week 3 of a
 * ramping block) that rebuildExerciseForSwap doesn't do; it always
 * re-prescribes as if it were a first-block estimate. Nudging existing
 * SET COUNTS within each exercise's already-established role floor/ceiling
 * is cheap, safe, and never touches load or reps.
 *
 * Target band is asymmetric, not the naive 0.8-1.4 either direction: push
 * volume should never exceed pull (shoulder-health convention — external
 * rotation/rear delt work is chronically undertrained in generated
 * programs), but pull is allowed to run up to 1.5x push before it's
 * flagged as its own imbalance.
 */
function enforceWeeklyPatternBalance(days: WorkoutDay[]): void {
  const trainingDays = days.filter(d => d.exercises.length > 0)

  function patternSetTotal(pattern: 'push' | 'pull'): number {
    let total = 0
    for (const day of trainingDays) {
      for (const ex of day.exercises) {
        const entry = findEntry(ex.name)
        if (entry && classifyForBalance(entry.movement_pattern) === pattern) total += ex.sets
      }
    }
    return total
  }

  // Only accessory/isolation slots are nudged — main lifts are governed by
  // the phase's own set-count logic and enforceSetHierarchy elsewhere, and
  // nudging one to fix a pattern ratio would fight that. A same-day ceiling
  // (that day's own main lift's set count, if it has one) is respected on
  // the way up so a nudge can't invert the main >= accessory hierarchy
  // enforceSetHierarchy establishes.
  function findAdjustable(pattern: 'push' | 'pull', direction: 'up' | 'down'): Exercise | null {
    for (const day of trainingDays) {
      const dayMainSets = Math.max(
        0,
        ...day.exercises
          .map(ex => (findEntry(ex.name) ? getVolumeRole(findEntry(ex.name)!) : null) === 'main' ? ex.sets : -1)
      )
      for (const ex of day.exercises) {
        const entry = findEntry(ex.name)
        if (!entry || classifyForBalance(entry.movement_pattern) !== pattern) continue
        const role = getVolumeRole(entry)
        if (role !== 'accessory' && role !== 'isolation') continue
        const ceiling = getRoleSetCeiling(role, false)
        const floor = getRoleSetFloor(role)
        if (direction === 'up' && ex.sets < ceiling && (dayMainSets === 0 || ex.sets + 1 <= dayMainSets)) return ex
        if (direction === 'down' && ex.sets > floor) return ex
      }
    }
    return null
  }

  // Raised from 4 (Calibration round) -- +-4 sets could never close the
  // 3:1-4:1 push:pull ratios reviews kept citing. +-20 sets is enough
  // headroom for any realistic weekly gap; Fix 1's day-templates should
  // mean this rarely needs more than a couple of nudges in practice now.
  const MAX_ADJUSTMENTS = 20
  for (let i = 0; i < MAX_ADJUSTMENTS; i++) {
    const pushSets = patternSetTotal('push')
    const pullSets = patternSetTotal('pull')
    if (pushSets === 0 || pullSets === 0) break
    if (pushSets <= pullSets && pullSets <= pushSets * 1.5) break

    const pushIsExcess = pushSets > pullSets
    const bumpTarget = findAdjustable(pushIsExcess ? 'pull' : 'push', 'up')
    if (bumpTarget) {
      bumpTarget.sets += 1
      logWeeklyBalanceDecision(`push:${pushSets} pull:${pullSets} sets — bumped "${bumpTarget.name}" to ${bumpTarget.sets} sets`)
      continue
    }
    const trimTarget = findAdjustable(pushIsExcess ? 'push' : 'pull', 'down')
    if (trimTarget) {
      trimTarget.sets -= 1
      logWeeklyBalanceDecision(`push:${pushSets} pull:${pullSets} sets — trimmed "${trimTarget.name}" to ${trimTarget.sets} sets`)
      continue
    }
    logWeeklyBalanceDecision(`push:${pushSets} pull:${pullSets} sets is outside the 1:1-1:1.5 band but no adjustable accessory/isolation slot remains`)
    break
  }

  // Leg-pattern day coverage: diagnostic only (not auto-corrected) — adding
  // a whole missing exercise to a day this late would need the same
  // periodization-aware rebuild the swap-based balancer above can't safely
  // do post-periodization either. balanceWeeklyStructure's missing-pattern
  // pass already covers this at the template level; this just confirms the
  // shipped week didn't lose that coverage to later trimming.
  if (trainingDays.length >= 2) {
    const legDayCount = trainingDays.filter(day =>
      day.exercises.some(ex => {
        const entry = findEntry(ex.name)
        if (!entry) return false
        const pattern = classifyForBalance(entry.movement_pattern)
        const role = getVolumeRole(entry)
        return (pattern === 'squat' || pattern === 'hinge') && (role === 'main' || role === 'accessory')
      })
    ).length
    if (legDayCount < 2) {
      logWeeklyBalanceDecision(`only ${legDayCount} of ${trainingDays.length} training day(s) carry a real leg pattern (knee/hip-dominant, main or accessory role)`)
    }
  }
}

/**
 * Zone 2 / dedicated-conditioning entries must not be byte-identical every
 * week — a direct, repeated LLM coach review finding ("three identical
 * 45-min Zone 2 sessions... no duration progression"). assignConditioningNotes
 * runs once on the base (pre-mesocycle) plan, so without this every week
 * inherited the exact same conditioning_note/recommendedCardio verbatim.
 * Nudges duration modestly across a block's three loading weeks and steps
 * it back down for the deload, matching the same shape load/reps
 * progression already takes. Regenerates the note text via a targeted
 * number replacement rather than rebuilding the string, so each branch's
 * own framing ("post-session", "Independent session:", etc. — see
 * assignConditioningNotes) survives untouched.
 */
function progressConditioningWeek(days: WorkoutDay[], weekInBlock: number, isDeload: boolean): void {
  const fraction = isDeload ? -0.15 : weekInBlock === 1 ? 0 : weekInBlock === 2 ? 0.1 : 0.18
  if (fraction === 0) return
  for (const day of days) {
    if (!day.recommendedCardio || day.recommendedCardio.is_filler) continue
    const base = day.recommendedCardio.duration
    const duration = Math.max(10, Math.round(base * (1 + fraction)))
    if (duration === base) continue
    day.recommendedCardio = { ...day.recommendedCardio, duration }
    if (day.conditioning_note) {
      day.conditioning_note = day.conditioning_note.replace(/\d+(?=\s*min)/, String(duration))
    }
  }
}

// ---------------------------------------------------------------------------
// Rest by fatigue cost, not just tier (Pre-ship safety patch)
// ---------------------------------------------------------------------------
// assignSetsRepsFromConfig assigns rest purely off mechanics_tier (tier1
// compounds all get the same base rest, regardless of WHICH tier1 compound
// it is) — so a heavy hip-hinge/knee-dominant lift and a horizontal press
// start the week equally rested. stageTimeCap's duration-budget trimming
// (Phase 2: "reduce rest by 15s across the board") then runs PER DAY,
// independently, only when THAT day is over budget — so whichever day
// happens to be tightest gets its rest cut, regardless of which lift is
// actually more systemically fatiguing. A review caught the resulting
// inversion directly: "Deadlifts 3x9-13 @ 92.5kg with 60s rest... while
// bench gets 75s... backwards." This is a hard, whole-week floor applied
// LAST, after every rest-modifying stage (style assignment, time-cap
// trimming, phase rest_adjust_seconds) has already run: a tier1_compound
// hip_hinge/knee_dominant exercise's rest must never fall below the
// highest tier1_compound horizontal_push/vertical_push rest anywhere else
// in the same week, full stop.
function enforceFatigueCostRestFloor(days: WorkoutDay[]): void {
  const restSecondsOf = (rest: string): number | null => {
    const m = rest.match(/^(\d+)s$/)
    return m ? Number(m[1]) : null
  }
  let maxUpperBodyRestSeconds = 0
  for (const day of days) {
    for (const ex of day.exercises) {
      const entry = findEntry(ex.name)
      if (!entry || entry.mechanics_tier !== 'tier1_compound') continue
      if (entry.movement_pattern !== 'horizontal_push' && entry.movement_pattern !== 'vertical_push') continue
      const seconds = restSecondsOf(ex.rest)
      if (seconds != null) maxUpperBodyRestSeconds = Math.max(maxUpperBodyRestSeconds, seconds)
    }
  }
  if (maxUpperBodyRestSeconds === 0) return
  for (const day of days) {
    for (const ex of day.exercises) {
      const entry = findEntry(ex.name)
      if (!entry || entry.mechanics_tier !== 'tier1_compound') continue
      if (entry.movement_pattern !== 'hip_hinge' && entry.movement_pattern !== 'knee_dominant') continue
      const seconds = restSecondsOf(ex.rest)
      if (seconds != null && seconds < maxUpperBodyRestSeconds) {
        ex.rest = `${maxUpperBodyRestSeconds}s`
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Final day-budget enforcement
// ---------------------------------------------------------------------------
// stageTimeCap (STAGE 5) fits each day to budget at SELECTION time — but two
// passes run after it and can both push a day back over: balanceWeeklyStructure
// swaps a slot's exercise for weekly pattern/push-pull coverage (same sets,
// but a different exercise's own work-time), and assignConditioningNotes can
// append a real post-session cardio block on top (a "Conditioning & Core" day
// gets both a full slate of accessories AND a 20-40min dedicated cardio
// note). This is the final honest-budget backstop, run last, that actually
// measures the day exactly as scored (estimateDaySeconds, unit-formula-
// identical) and trims accessory/isolation sets — main lifts last, same
// hierarchy as stageTimeCap and enforceSetHierarchy — until it fits.
function enforceDayDurationBudget(day: WorkoutDay, budgetSeconds: number): WorkoutDay {
  if (day.exercises.length === 0) return day
  let exercises = day.exercises
  let guard = 0
  while (estimateDaySeconds({ ...day, exercises }) > budgetSeconds && guard < 30) {
    guard++
    const trimmable = exercises
      .map((ex, i) => {
        const entry = findEntry(ex.name)
        const role = entry ? getVolumeRole(entry) : null
        const floor = role ? getRoleSetFloor(role) : 2
        return { i, sets: ex.sets, entry, role, floor }
      })
      .filter(t => t.entry && t.entry.mechanics_tier !== 'primer' && t.sets > t.floor)
    if (trimmable.length === 0) break
    // Accessories/isolation trim first; main lift AND conditioning rounds
    // are protected until nothing else is left to give — "accessories/core
    // trim to fit what remains, never the conditioning" (Part 4).
    const protectedRoles = new Set(['main', 'conditioning'])
    const nonProtected = trimmable.filter(t => !t.role || !protectedRoles.has(t.role))
    const candidates = nonProtected.length > 0 ? nonProtected : trimmable
    candidates.sort((a, b) => b.sets - a.sets)
    const target = candidates[0].i
    exercises = exercises.map((ex, i) => (i === target ? { ...ex, sets: ex.sets - 1 } : ex))
  }
  let trimmedDay: WorkoutDay = { ...day, exercises }

  // Every exercise is already at its 2-set floor and the day is still over
  // budget — the remaining overage is almost always a fixed-duration
  // post-session conditioning block (a dedicated "Conditioning & Core"
  // track day's cardio finisher can run 20-40min on its own). That's the
  // one remaining elastic cost: shorten it rather than leaving the session
  // over the trainee's stated time.
  const overBy = estimateDaySeconds(trimmedDay) - budgetSeconds
  if (overBy > 0 && trimmedDay.recommendedCardio?.timing === 'post_session') {
    const shrunkMinutes = Math.max(10, trimmedDay.recommendedCardio.duration - Math.ceil(overBy / 60))
    if (shrunkMinutes < trimmedDay.recommendedCardio.duration) {
      trimmedDay = {
        ...trimmedDay,
        recommendedCardio: { ...trimmedDay.recommendedCardio, duration: shrunkMinutes },
        conditioning_note: trimmedDay.conditioning_note?.replace(
          /\(?~?\d+\s*min/, `(~${shrunkMinutes} min`
        ) ?? trimmedDay.conditioning_note,
      }
    }
  }

  return trimmedDay
}

// ---------------------------------------------------------------------------
// Conditioning notes (preserved)
// ---------------------------------------------------------------------------

interface ConditioningProfile {
  dedicatedDay: Omit<RecommendedCardio, 'timing' | 'reason'>
  postSession: Omit<RecommendedCardio, 'timing' | 'reason'>
  heavyDayBrief: Omit<RecommendedCardio, 'timing' | 'reason'>
  independentBlock: Omit<RecommendedCardio, 'timing' | 'reason'>
  restDay: Omit<RecommendedCardio, 'timing' | 'reason'>
}

// Every activity string below carries its own structure — modality,
// work:rest/rounds where relevant, and an HR/RPE intensity anchor — because
// "Zone 2" or "HIIT" alone is a label, not a prescription. A review flagged
// this directly: rest-day "Long Aerobic Session" entries with "no duration,
// no HR target, no frequency minimum... that's not a prescription, that's a
// suggestion." assignConditioningNotes always appends duration on top of
// these strings; the strings themselves carry everything else.
function getConditioningProfile(goal: FitnessGoal): ConditioningProfile {
  if (goal === 'fat_loss') {
    return {
      dedicatedDay: { activity: 'HIIT Metabolic Circuit — 8 rounds of 30s max effort / 30s rest', duration: 25, targetRpe: 8 },
      postSession: { activity: 'Incline Walk or Cycling — Zone 2, conversational pace (~60-70% max HR)', duration: 20, targetRpe: 4 },
      heavyDayBrief: { activity: 'Rowing Intervals — 6 rounds of 20s hard / 40s easy', duration: 10, targetRpe: 7 },
      independentBlock: { activity: 'Brisk Walk or Light Cycling — Zone 2, conversational pace', duration: 30, targetRpe: 4 },
      restDay: { activity: 'Zone 2 Aerobic Base (walking, cycling, swimming) — conversational pace, ~60-70% max HR', duration: 35, targetRpe: 4 },
    }
  }
  if (goal === 'conditioning') {
    return {
      dedicatedDay: { activity: 'Steady-State Aerobic Base — Zone 2 (120-140 BPM, conversational pace)', duration: 40, targetRpe: 5 },
      postSession: { activity: 'Aerobic Base Building — Zone 2 (120-140 BPM)', duration: 25, targetRpe: 5 },
      heavyDayBrief: { activity: 'Easy Cooldown Cardio — HR below 130 BPM', duration: 12, targetRpe: 3 },
      independentBlock: { activity: 'Steady-State Run or Cycle — Zone 2 (120-140 BPM)', duration: 35, targetRpe: 5 },
      restDay: { activity: 'Long Aerobic Session (running, rowing, cycling) — Zone 2, 120-140 BPM', duration: 45, targetRpe: 5 },
    }
  }
  return {
    dedicatedDay: { activity: 'Light Conditioning Circuit — 5 rounds of 30s work / 45s rest', duration: 20, targetRpe: 5 },
    postSession: { activity: 'Light LISS (incline walk) — conversational pace', duration: 15, targetRpe: 3 },
    heavyDayBrief: { activity: 'Easy Cooldown Walk — conversational pace', duration: 8, targetRpe: 2 },
    independentBlock: { activity: 'Light Walk or Mobility Flow — conversational pace', duration: 20, targetRpe: 3 },
    restDay: { activity: 'Active Recovery Walk or Light Swim — conversational pace, easy effort', duration: 25, targetRpe: 3 },
  }
}

/**
 * Fills in conditioning notes/cardio recommendations up to the goal policy's
 * weekly frequency budget — dedicated conditioning-track days always get
 * filled (they exist specifically for this) and count against the budget;
 * remaining slots go to rest days first (zero interference with lifting),
 * then light training days, then heavy days last and only ever briefly.
 * Previously this only ran for fat_loss/conditioning and otherwise assigned
 * cardio to nearly every day unconditionally — hypertrophy's "1 optional
 * finisher/week" and functional's "moderate" targets need an actual budget,
 * not an all-or-nothing switch.
 */
function assignConditioningNotes(days: WorkoutDay[], profile: UserProfile, policy: GoalPolicy): void {
  const duration = profile.session_duration_preference || '45-60'
  const isTimeLimited = duration === '30-45'
  const goal = profile.fitness_goal

  const heavyTrackDays = new Set(['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Legs & Calves', 'Full Body Power'])
  const allDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const trainingDayNames = new Set(days.map(d => d.day))
  const restDayNames = allDayNames.filter(d => !trainingDayNames.has(d))

  const cardioForGoal = getConditioningProfile(goal)
  let remaining = Math.max(0, Math.round(resolveConditioningFrequency(policy, profile.conditioning_preference)))

  for (const day of days) {
    if (day.focus !== 'Conditioning & Core') continue
    // The day's own selected exercises now reliably include real interval
    // work (selectExercisesForTrack reserves cardio-tier slots before core
    // competes for them) — a SEPARATE dedicatedDay cardio block on top of
    // that would double-count this day's duration (recommendedCardio with
    // timing 'post_session' is added ON TOP of the exercises in
    // estimateDaySeconds), which is exactly the kind of padding that made
    // a "Conditioning & Core" day look like it needed constant trimming.
    const hasInDayConditioning = day.exercises.some(ex => {
      const entry = findEntry(ex.name)
      return entry && getVolumeRole(entry) === 'conditioning'
    })
    if (hasInDayConditioning) {
      // No separate note/cardio block here — the exercises already ARE the
      // conditioning prescription. Deliberately leaves conditioning_note
      // unset (rather than a placeholder string) so applyDurationFiller
      // (exercise-plan.ts, runs later per mesocycle week) can still top the
      // day up with more mobility/conditioning if it's genuinely short
      // after real interval content — a placeholder note here would have
      // silently blocked that fallback (it skips any day that already has
      // one) for exactly the thin-equipment-pool profiles that need it most.
      remaining--
      continue
    }
    day.conditioning_note = `${cardioForGoal.dedicatedDay.activity} (~${cardioForGoal.dedicatedDay.duration} min)`
    day.recommendedCardio = {
      ...cardioForGoal.dedicatedDay,
      timing: 'post_session',
      reason: 'Dedicated conditioning day -- full session devoted to metabolic work.',
    }
    remaining--
  }

  // At least one TRUE rest day survives per week for moderate/low recovery
  // — filling every "rest" day with a 45min Zone 2 session is how a review
  // found "seven training days a week... that's not a rest day, that's a
  // euphemism" on a client flagged moderate recovery. High recovery can
  // genuinely absorb cardio on every rest day; moderate/low cannot.
  const recovery = profile.recovery_capacity || 'moderate'
  const maxCardioRestDays = recovery === 'high'
    ? restDayNames.length
    : Math.max(0, restDayNames.length - 1)

  restDayNames.slice(0, maxCardioRestDays).forEach(restDay => {
    if (remaining <= 0) return
    days.push({
      day: restDay,
      focus: 'Active Recovery + Cardio',
      exercises: [],
      conditioning_note: `${cardioForGoal.restDay.activity} (~${cardioForGoal.restDay.duration} min)`,
      recommendedCardio: {
        ...cardioForGoal.restDay,
        timing: 'rest_day',
        reason: 'Programmed on a rest day for recovery-compatible conditioning.',
      },
    })
    remaining--
  })

  const remainingTrainingDays = days.filter(
    d => d.focus !== 'Conditioning & Core' && d.focus !== 'Active Recovery + Cardio'
  )
  const lightDays = remainingTrainingDays.filter(d => !heavyTrackDays.has(d.focus))
  const heavyDays = remainingTrainingDays.filter(d => heavyTrackDays.has(d.focus))

  for (const day of lightDays) {
    if (remaining <= 0) break
    if (isTimeLimited) {
      day.recommendedCardio = {
        ...cardioForGoal.independentBlock,
        timing: 'independent_session',
        reason: 'Scheduled as a separate session to preserve your strict lifting window.',
      }
      day.conditioning_note = `Independent session: ${cardioForGoal.independentBlock.activity} (${cardioForGoal.independentBlock.duration} min)`
    } else {
      day.conditioning_note = `${cardioForGoal.postSession.activity} (${cardioForGoal.postSession.duration} min post-session)`
      day.recommendedCardio = {
        ...cardioForGoal.postSession,
        timing: 'post_session',
        reason: 'Appended after main lifts on a lighter training day.',
      }
    }
    remaining--
  }

  for (const day of heavyDays) {
    if (remaining <= 0) break
    day.conditioning_note = `${cardioForGoal.heavyDayBrief.activity} (${cardioForGoal.heavyDayBrief.duration} min)`
    day.recommendedCardio = {
      ...cardioForGoal.heavyDayBrief,
      timing: 'post_session',
      reason: 'Brief conditioning post-lift to avoid interference with heavy compound work.',
    }
    remaining--
  }
}

// ---------------------------------------------------------------------------
// MAIN PLAN GENERATION — strict 5-stage pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the filter pipeline only, returning the exercises this user may
 * actually be given. Periodization needs this so a rotated variation cannot
 * escape the equipment, injury and skill constraints.
 */
export function getConstrainedPool(profile: UserProfile, exclusions: string[] = []): ExerciseEntry[] {
  const throwaway: ConstraintTrace = {
    equipment_filtered: [], injury_filtered: [], style_filtered: [], skill_filtered: [],
    time_cap_adjusted: [], exclusion_filtered: [], structure_adjusted: [],
    pool_size_after_each_stage: { equipment: 0, injury: 0, style: 0, skill: 0, final: 0 },
  }
  let pool = EXERCISE_DATABASE.filter(
    e => !exclusions.some(ex => ex.toLowerCase() === e.name.toLowerCase())
  )
  pool = stageEquipmentFilter(pool, profile.equipment_access || 'full_gym', throwaway)
  pool = stageInjuryFilter(pool, [...pool], profile.injuries || [], throwaway)
  pool = stageStyleFilter(pool, profile.training_style || 'hybrid', throwaway)
  pool = stageSkillFilter(pool, profile.training_experience || 'novice', throwaway)
  return pool
}

/**
 * Swap-dead-end fix: the free-entry search in ExercisePlan.tsx's swap dialog
 * deliberately searches the FULL catalog, not getConstrainedPool's filtered
 * output — a constraint-valid alternative can dead-end (every ranked option
 * also unavailable in the gym right now), and the fix is to let the user
 * pick anything and see why it might not fit, not to keep hiding options.
 * Reuses the exact equipment/injury logic stageEquipmentFilter/
 * stageInjuryFilter apply during generation, just reporting instead of
 * dropping. Style and skill are deliberately not checked here — those are
 * softer fit signals the ranked list already optimizes for, not hard
 * physical constraints worth blocking a user's own explicit pick over.
 */
export function getExerciseCompatibilityWarnings(
  exercise: ExerciseEntry,
  profile: UserProfile,
  exclusions: string[] = [],
): string[] {
  const warnings: string[] = []

  const allowedEquipment = EQUIPMENT_SETS[profile.equipment_access || 'full_gym']
  if (allowedEquipment) {
    const missing = exercise.equipment.filter(eq => !allowedEquipment.has(eq))
    if (missing.length > 0) {
      warnings.push(`Needs ${missing.join(', ')} — outside your ${(profile.equipment_access || 'full_gym').replace(/_/g, ' ')} equipment.`)
    }
  }

  const flaggedJoints = new Set<string>()
  for (const injury of profile.injuries || []) {
    const joints = INJURED_JOINTS[injury]
    if (joints) joints.forEach(j => flaggedJoints.add(j))
  }
  const conflictingJoints = exercise.loads_joints.filter(j => flaggedJoints.has(j))
  if (conflictingJoints.length > 0) {
    warnings.push(`Loads your ${conflictingJoints.join(', ').replace(/_/g, ' ')} — you've flagged an injury there.`)
  }

  if (exclusions.some(ex => ex.toLowerCase() === exercise.name.toLowerCase())) {
    warnings.push(`You've previously banned this exercise.`)
  }

  return warnings
}

export function generateExercisePlan(profile: UserProfile, exclusions: string[] = []): PlanResult {
  const trace: ConstraintTrace = {
    equipment_filtered: [],
    injury_filtered: [],
    style_filtered: [],
    skill_filtered: [],
    time_cap_adjusted: [],
    exclusion_filtered: [],
    structure_adjusted: [],
    pool_size_after_each_stage: { equipment: 0, injury: 0, style: 0, skill: 0, final: 0 },
  }

  const trainingStyle: TrainingStyle = profile.training_style || 'hybrid'
  const styleConfig = STYLE_CONFIGS[trainingStyle]
  const duration = profile.session_duration_preference || '45-60'
  const totalBudgetSeconds = getDurationBudgetSeconds(duration)
  // Hold time back for the warm-up BEFORE exercises are allocated. Adding a
  // warm-up after the fact would push every session past the length the user
  // told us they have.
  const warmupReserve = getWarmupReserveSeconds(totalBudgetSeconds)
  const budgetSeconds = totalBudgetSeconds - warmupReserve
  const experience = getExperienceConfig(profile.training_experience)
  const counts = adjustCountsForExperience(
    getExerciseCountForDuration(duration),
    experience,
  )
  const policy = getGoalPolicy(profile.fitness_goal || 'hypertrophy')

  // Compute feasible required patterns based on equipment & injury constraints
  const feasiblePatterns = getFeaibleRequiredPatterns(
    styleConfig,
    profile.equipment_access || 'full_gym',
    profile.injuries || []
  )

  // Pre-filter: manual exclusions
  let pool = EXERCISE_DATABASE.filter(e => {
    const excluded = exclusions.some(ex => ex.toLowerCase() === e.name.toLowerCase())
    if (excluded) {
      trace.exclusion_filtered.push({
        exercise: e.name,
        stage: 'exclusion',
        reason: 'manually excluded by user',
      })
    }
    return !excluded
  })

  // STAGE 1: Equipment
  pool = stageEquipmentFilter(pool, profile.equipment_access || 'full_gym', trace)

  // STAGE 2: Injury (replacements sourced from equipment-filtered pool only)
  pool = stageInjuryFilter(pool, [...pool], profile.injuries || [], trace)

  // STAGE 3: Style
  pool = stageStyleFilter(pool, trainingStyle, trace)

  // STAGE 4: Skill / experience
  pool = stageSkillFilter(pool, profile.training_experience || 'novice', trace)

  trace.pool_size_after_each_stage.final = pool.length

  // Build the weekly plan
  let availableDays = profile.training_days.filter(d => d.available)
  if (profile.recovery_capacity === 'low' && availableDays.length >= 5) {
    // Low recovery capacity (poor sleep, high stress, a physically demanding
    // job) can't safely absorb 5+ weekly sessions on top of everything else
    // it's already carrying — trim the last selected day back to rest rather
    // than silently overloading someone who told us recovery was the limiter.
    availableDays = availableDays.slice(0, -1)
  }
  const splitPref = profile.workout_split_preference || 'ai_recommendation'
  const split = getSplitForDays(availableDays.length, profile.fitness_goal, splitPref, trainingStyle)


  const weeklyUsed = new Set<string>()
  const allSelectedNames = new Set<string>()
  const weeklyAppearanceCount = new Map<string, number>()
  // Accumulated across every day — fed to balanceWeeklyStructure so it
  // never swaps away or removes an exercise that's the one thing satisfying
  // a Fix 1 required-slot guarantee elsewhere in the week.
  const weeklyRequiredNames = new Set<string>()

  const days: WorkoutDay[] = availableDays.map((day, index) => {
    const rawTrack = split[index % split.length]
    const trackFocus = getViableTrack(rawTrack, pool)
    const track = TRACKS[trackFocus]

    const { primer, main, requiredNames } = selectExercisesForTrack(track, pool, counts, weeklyUsed, styleConfig, trace, policy, feasiblePatterns, weeklyAppearanceCount)
    for (const name of requiredNames) weeklyRequiredNames.add(name)

    // Build exercise list with sets/reps from style config
    const daySlots: { entry: ExerciseEntry; sets: number; reps: string; rest: string; restSeconds: number }[] = []

    if (primer) {
      weeklyUsed.add(primer.name)
      const sr = assignSetsRepsFromConfig(primer, styleConfig, experience, policy)
      daySlots.push({ entry: primer, ...sr })
    }

    for (const entry of main) {
      weeklyUsed.add(entry.name)
      allSelectedNames.add(entry.name)
      weeklyAppearanceCount.set(entry.name, (weeklyAppearanceCount.get(entry.name) ?? 0) + 1)
      const sr = assignSetsRepsFromConfig(entry, styleConfig, experience, policy)
      daySlots.push({ entry, ...sr })
    }

    // STAGE 5: Time-cap optimization per day
    const optimized = stageTimeCap(daySlots, budgetSeconds, trainingStyle, trace, requiredNames)

    // Convert to Exercise objects
    const exercises: Exercise[] = optimized.map(slot => {
      const isPrimer = slot.entry.mechanics_tier === 'primer'
      // Primers are deliberately submaximal — prescribing an RPE target on a
      // warm-up movement invites people to load it, which defeats the point.
      const intensity = isPrimer ? 'Light — movement prep' : experience.target_rpe
      // This is a first, unverified plan for someone we've never seen lift —
      // isFirstBlock stays true here regardless of self-reported experience.
      // No phase yet either (that's a mesocycle concept), so this always
      // comes back as a straight, flat per-set weight.
      const load = prescribeLoad(slot.entry, profile, { targetRpeLabel: intensity, isFirstBlock: true, sets: slot.sets })
      return {
        id: slot.entry.id,
        name: slot.entry.name,
        sets: slot.sets,
        reps: slot.reps,
        rest: slot.rest,
        substitution: getSubstitution(slot.entry, pool, allSelectedNames),
        intensity,
        prescription_type: slot.entry.prescription_type,
        load_guidance: isPrimer
          ? 'Stay light and controlled. This is preparation, not a working set.'
          : `${experience.load_guidance} ${load.basis}`,
        suggested_load: isPrimer ? 'Light' : load.display,
        suggested_load_kg: isPrimer ? null : load.starting_weight_kg,
        load_source: isPrimer ? undefined : load.load_source,
        per_set_load: isPrimer ? null : load.per_set,
      }
    })

    // Build superset pairings
    const paired = buildSupersetPairs(exercises, pool, duration, trainingStyle, trace)

    // Warm-up is derived from what this session actually contains, so a squat
    // day and a bench day get genuinely different preparation. Every
    // compound gets a ramp candidate (C0 calibration round, Fix 2) — buildWarmup
    // itself decides which ones actually qualify (see needsRampUp). `exercises`
    // is built in the same order as `optimized`, so a straight index zip pairs
    // each entry with the load it was actually prescribed.
    const sessionEntries = optimized.map(s => s.entry)
    const compounds = optimized.map((s, i) => ({
      entry: s.entry,
      suggestedLoadKg: exercises[i]?.suggested_load_kg ?? null,
      loadSource: exercises[i]?.load_source,
    }))

    const warmup = buildWarmup({
      patterns: sessionEntries.map(e => e.movement_pattern),
      compounds,
      equipment: profile.equipment_access || 'full_gym',
      injuries: profile.injuries || [],
      experience: profile.training_experience || 'novice',
      budgetSeconds: warmupReserve,
    })

    // Ramp-up-visibility fix: buildWarmup already decided which exercises
    // qualify for a ramp (needsRampUp in warmup.ts) — copy each RampBlock
    // onto its Exercise (matched by name, the same key warmup.ts itself
    // uses) so the exercise row can render its own build-up, not just the
    // day-level warmup block. Every later pass on `exercises` (buildSuperset
    // Pairs already ran above; enforceSetHierarchy/enforceLoadCoherence/
    // enforceDayDurationBudget below) uses object-spread or in-place field
    // mutation, never a from-scratch reconstruction, so this survives them.
    const rampByName = new Map(warmup.ramp_ups.map(r => [r.exercise, r]))
    const withRamps = rampByName.size > 0
      ? paired.map(ex => rampByName.has(ex.name) ? { ...ex, ramp_up: rampByName.get(ex.name) } : ex)
      : paired

    return {
      day: day.day,
      focus: trackFocus,
      exercises: enforceSetHierarchy(withRamps),
      warmup,
    }
  })

  balanceWeeklyStructure(days, pool, weeklyUsed, allSelectedNames, experience, profile, trace, styleConfig, weeklyRequiredNames)
  assignConditioningNotes(days, profile, policy)
  enforceLoadCoherence(days)

  const budgetedDays = days.map(d => enforceDayDurationBudget(d, totalBudgetSeconds))
  // Last step, after every rest-modifying stage (style assignment,
  // stageTimeCap's per-day trimming, this duration-budget pass) — the
  // periodized mesocycle inherits this base plan's warmup/rest fields
  // unchanged via object spread, so fixing it once here is sufficient.
  enforceFatigueCostRestFloor(budgetedDays)

  return { plan: budgetedDays, constraint_trace: trace }
}

// ---------------------------------------------------------------------------
// 4-WEEK PERIODIZED MESOCYCLE (preserved)
// ---------------------------------------------------------------------------

/**
 * A short, honest sentence describing what's actually different about THIS
 * week versus last, appended to the phase/goal coach note. An LLM coach
 * review's most repeated complaint across every profile was some version of
 * "nothing is progressing" or "the RPE label is the only thing that
 * changes" — even in cases (Part E, prior round) where reps genuinely WERE
 * climbing for 'reps'/'maintain'-emphasis goals, because nothing ever SAID
 * so at the week level. This is deliberately generic (goal/week-number
 * driven, not per-exercise) since the note has to describe an entire
 * week's worth of exercises in one sentence — the per-exercise basis text
 * (load-prescription.ts) still carries the exact numbers.
 */
function buildProgressionNote(
  weekInBlock: number,
  isDeload: boolean,
  isCalibrationWeek: boolean,
  policy: GoalPolicy,
): string {
  if (isDeload) {
    return 'Deload week — load and volume both step back so you arrive at the next block recovered, not because progress stalled.'
  }
  if (isCalibrationWeek) {
    return 'Loads start deliberately light — find the weight where the last rep feels like RPE 6, log it, and next week builds from YOUR numbers.'
  }
  const rampsLoad = policy.progressionEmphasis === 'load'
  if (weekInBlock === 1) {
    return rampsLoad
      ? 'Baseline week — this sets the working weight every later week in the block adds load on top of.'
      : 'Baseline week — weight holds flat this block by design; this sets the rep target every later week builds on.'
  }
  if (rampsLoad) {
    return weekInBlock === 2
      ? 'Load goes up this week on the main lifts — same rep target, more weight than last week.'
      : 'Load goes up again this week — the heaviest working sets of the block before the deload.'
  }
  // 'reps' or 'maintain' emphasis: weight intentionally holds flat, reps are
  // the real lever. Named explicitly so this doesn't read as stagnation.
  return weekInBlock === 2
    ? 'Weight holds flat by design — reps climb this week. That IS the progression for this goal, not a missing one.'
    : 'Weight still holds flat, reps climb again — building work capacity before the next block changes the stimulus.'
}

// A bodyweight trainee has no external load to ramp — 'strength' and
// 'power' phases both assume one. Restricted to the same set beginners get
// (see periodization.ts's getPhaseSequence), regardless of experience.
const BODYWEIGHT_ALLOWED_PHASES: TrainingPhase[] = ['anatomical_adaptation', 'hypertrophy', 'metabolic']

const MESOCYCLE_WEEK_LABELS = [
  'Week 1 — Anatomical Adaptation',
  'Week 2 — Hypertrophy Accumulation',
  'Week 3 — Intensification',
  'Week 4 — Deload / Active Recovery',
]

interface MesocycleVolumeModifier {
  setsMultiplier: number
  repsAdjust: (baseReps: string) => string
  restAdjust: (baseRest: string) => string
  rpeNote: string
}

function getMesocycleModifier(weekNumber: number, goal: FitnessGoal): MesocycleVolumeModifier {
  if (weekNumber === 1) {
    return {
      setsMultiplier: 0.75,
      repsAdjust: (r) => bumpReps(r, 2),
      restAdjust: (r) => r,
      rpeNote: 'RPE 6-7 — Focus on form and tempo',
    }
  }
  if (weekNumber === 2) {
    return {
      setsMultiplier: 1.0,
      repsAdjust: (r) => r,
      restAdjust: (r) => r,
      rpeNote: 'RPE 7-8 — Working sets at moderate intensity',
    }
  }
  if (weekNumber === 3) {
    const isStrength = goal === 'hypertrophy'
    return {
      setsMultiplier: isStrength ? 1.15 : 1.0,
      repsAdjust: (r) => isStrength ? bumpReps(r, -1) : bumpReps(r, 1),
      restAdjust: (r) => isStrength ? addRestSeconds(r, 15) : r,
      rpeNote: 'RPE 8-9 — Peak overload week',
    }
  }
  return {
    setsMultiplier: 0.5,
    repsAdjust: (r) => bumpReps(r, 2),
    restAdjust: (r) => r,
    rpeNote: 'RPE 5-6 — Deload: recover, maintain movement quality',
  }
}

function bumpReps(reps: string, delta: number): string {
  const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    const lo = Math.max(1, parseInt(rangeMatch[1]) + delta)
    const hi = Math.max(lo, parseInt(rangeMatch[2]) + delta)
    return `${lo}-${hi}`
  }
  const singleMatch = reps.match(/^(\d+)$/)
  if (singleMatch) {
    return String(Math.max(1, parseInt(singleMatch[1]) + delta))
  }
  return reps
}

function addRestSeconds(rest: string, seconds: number): string {
  const match = rest.match(/^(\d+)\s*s?$/)
  if (match) {
    return `${parseInt(match[1]) + seconds}s`
  }
  return rest
}

export function mapMovementPattern(pattern: MovementPattern): MesocycleMovementPattern {
  const mapping: Record<string, MesocycleMovementPattern> = {
    horizontal_push: 'push',
    vertical_push: 'push',
    horizontal_pull: 'pull',
    vertical_pull: 'pull',
    hip_hinge: 'hinge',
    knee_dominant: 'squat',
    single_leg: 'squat',
    isolation_bicep: 'isolation',
    isolation_tricep: 'isolation',
    isolation_shoulder: 'isolation',
    isolation_quad: 'isolation',
    isolation_hamstring: 'isolation',
    isolation_calf: 'isolation',
    core: 'isolation',
    carry: 'isolation',
    cardio: 'isolation',
  }
  return mapping[pattern] || 'isolation'
}

export function mapTier(mechanicsTier: string): ExerciseTier {
  const mapping: Record<string, ExerciseTier> = {
    tier1_compound: 'tier_1_primary',
    tier2_compound: 'tier_2_secondary',
    tier3_isolation: 'tier_3_isolation',
    // A real pre-existing bug: MechanicsTier's actual value for a primer is
    // 'primer' (exercise-db.ts) — 'activation' is a movement_pattern value,
    // never a mechanics_tier one, so this key never matched and EVERY
    // primer silently fell through to the 'tier_3_isolation' default
    // below. Surfaced by the capability round's frozen_week check, which
    // was (correctly) trying to exempt primers by tier and finding none
    // tagged 'tier_0_primer' to exempt.
    primer: 'tier_0_primer',
  }
  return mapping[mechanicsTier] || 'tier_3_isolation'
}

export function deriveFatigueCost(entry: ExerciseEntry): FatigueCost {
  if (entry.mechanics_tier === 'tier1_compound') return 'high'
  if (entry.mechanics_tier === 'tier2_compound') return 'moderate'
  return 'low'
}

function applyWeekModifiers(
  baseDay: WorkoutDay,
  weekNumber: number,
  goal: FitnessGoal
): WorkoutDay {
  const mod = getMesocycleModifier(weekNumber, goal)
  const exercises: Exercise[] = baseDay.exercises.map((ex) => {
    const adjustedSets = Math.max(1, Math.round(ex.sets * mod.setsMultiplier))
    const adjustedReps = mod.repsAdjust(ex.reps)
    const adjustedRest = mod.restAdjust(ex.rest)
    return { ...ex, sets: adjustedSets, reps: adjustedReps, rest: adjustedRest }
  })
  const condNote = baseDay.conditioning_note
    ? `${baseDay.conditioning_note} | ${mod.rpeNote}`
    : mod.rpeNote
  return { ...baseDay, exercises, conditioning_note: condNote }
}

// ---------------------------------------------------------------------------
// Two-tier rotation
// ---------------------------------------------------------------------------
// Main lifts need to stay put for the trainee to actually track progress on
// them — that's what the whole double-progression system above is for.
// Accessories don't carry that same tracking weight and get stale faster, so
// they're allowed to move on a tighter cycle. Core/carry work is exempt
// entirely; it already rotates at block boundaries like everything else and
// doesn't need a faster cycle on top of that.

type RotationTier = 'main' | 'accessory' | 'core'

/**
 * Tags each exercise in a (block-level, pre-week-modifiers) day by rotation
 * tier. Computed once per day per block — position and tier don't change
 * week to week within a block, only an accessory's specific variation does.
 */
function classifyRotationTiers(exercises: Exercise[]): RotationTier[] {
  let mainCount = 0
  return exercises.map(ex => {
    const dbEntry = EXERCISE_DATABASE.find(e => e.name.toLowerCase() === ex.name.toLowerCase())
    if (!dbEntry || dbEntry.mechanics_tier === 'primer') return 'core'
    if (dbEntry.movement_pattern === 'core' || dbEntry.movement_pattern === 'carry') return 'core'

    // "First 1-2 externally-loaded compounds" — in practice this is almost
    // always exactly one exercise (getExerciseCountForDuration always asks
    // for a single tier1 slot), but the cap stays at 2 to match the spec for
    // any future session shape that requests more.
    if (dbEntry.mechanics_tier === 'tier1_compound' && isExternallyLoaded(dbEntry) && mainCount < 2) {
      mainCount++
      return 'main'
    }
    return 'accessory'
  })
}

/**
 * How many extra sets (per day, per exercise index) to add on top of
 * periodization's normal volume formula so a loading week doesn't run well
 * under the trainee's stated session length. Only tier2/tier3 accessories
 * are eligible — primers and the main lift keep exactly what the
 * warm-up/progression systems prescribed for them — and each exercise is
 * capped at +3 sets so this fills genuinely wasted time rather than
 * inflating accessory volume without bound.
 */
/**
 * Runs the top-up's "keep adding sets until the day fills the target
 * duration" loop against a given starting point, optionally bounded by a
 * per-exercise ceiling on top of the flat EXTRA_SETS_CAP. Shared by both the
 * unconstrained (high-recovery) path and the recovery-ratio-preserving path
 * below so the two can't silently diverge in how they estimate duration.
 */
function simulateSetTopUp(
  baseSets: number[],
  eligible: number[],
  entries: (ExerciseEntry | undefined)[],
  restSeconds: number[],
  targetSeconds: number,
  extraCap: number,
  ceilingSets?: number[],
  reps?: string[],
): number[] {
  // Reuses the same honest per-set formula the scorer/UI read (see
  // session-duration.ts) so top-up fills a day to the same target the final
  // rendered duration will actually be scored against, not a cheaper
  // estimate that quietly under-fills.
  const estimate = (sets: number[]) => estimateSlotsSeconds(
    sets.map((s, i) => ({ entry: entries[i], sets: s, reps: reps?.[i] ?? '10', restSeconds: restSeconds[i] }))
  )

  const extra = baseSets.map(() => 0)
  if (eligible.length === 0) return extra

  const currentSets = [...baseSets]
  let guard = 0
  while (estimate(currentSets) < targetSeconds && guard < 50) {
    let addedThisPass = false
    for (const i of eligible) {
      if (estimate(currentSets) >= targetSeconds) break
      if (extra[i] >= extraCap) continue
      if (ceilingSets && currentSets[i] >= ceilingSets[i]) continue
      currentSets[i]++
      extra[i]++
      addedThisPass = true
    }
    guard++
    if (!addedThisPass) break
  }
  return extra
}

/**
 * How many extra sets (per day, per exercise index) to add on top of
 * periodization's normal volume formula so a loading week doesn't run well
 * under the trainee's stated session length. Only tier2/tier3 accessories
 * are eligible — primers and the main lift keep exactly what the
 * warm-up/progression systems prescribed for them — and each exercise is
 * capped at +3 sets so this fills genuinely wasted time rather than
 * inflating accessory volume without bound.
 */
function computeDurationTopUp(
  blockDays: WorkoutDay[],
  rotationTiers: RotationTier[][],
  profile: UserProfile,
  policy: GoalPolicy,
  recoverySetMultiplier: number,
  phaseConfig: PhaseConfig,
): number[][] {
  const totalBudgetSeconds = getDurationBudgetSeconds(profile.session_duration_preference || '45-60')
  const dayBudgetSeconds = totalBudgetSeconds - getWarmupReserveSeconds(totalBudgetSeconds)
  const targetSeconds = dayBudgetSeconds * 0.95
  // A real ceiling, not just a knob to raise until the numbers work out: no
  // sane program puts 15-20+ sets on one accessory. Raising this past ~6
  // (tried up to 20 while tuning) stopped fixing anything and started
  // prescribing "22 sets of Dumbbell Curls" instead — a worse problem than
  // the one it was meant to solve. When a day has too few distinct eligible
  // exercises to reach the target within this cap, that's the real
  // limitation: the exercise SELECTION is too thin for the requested
  // session length, and no amount of set-stacking on 2-3 movements fixes
  // that honestly. See generateMesocycle's doc comment for the profiles
  // this still doesn't fully close.
  const EXTRA_SETS_CAP = 6

  // What fraction of a high-recovery peer's volume this profile is supposed
  // to sit at, BEFORE top-up. Below 1.0 for low/moderate recovery. Chasing
  // the same duration TARGET every recovery tier chases, with no memory of
  // that ratio, is what let the top-up quietly re-add back everything
  // recovery_capacity had just cut — a low-recovery and a high-recovery plan
  // could land at nearly identical weekly sets despite one being deliberately
  // built at 75% the volume of the other. See RECOVERY_SET_MULTIPLIER.
  const recoveryRatio = recoverySetMultiplier / RECOVERY_SET_MULTIPLIER.high

  // A main lift only ever gets extra top-up sets in a 90+ min "dedicated
  // long session" — everywhere else, spare time goes to accessories and
  // isolation work exclusively, never by inflating the main lift past its
  // own set-hierarchy ceiling (see enforceSetHierarchy).
  const isLongSession = (profile.session_duration_preference || '45-60') === '90+'

  return blockDays.map((day, dayIdx) => {
    const entries = day.exercises.map(ex => EXERCISE_DATABASE.find(e => e.name.toLowerCase() === ex.name.toLowerCase()))
    const restSeconds = day.exercises.map(ex => {
      const match = ex.rest.match(/(\d+)/)
      const base = match ? parseInt(match[1], 10) : 60
      return Math.max(20, base + phaseConfig.rest_adjust_seconds)
    })
    const roles = entries.map(e => e ? getVolumeRole(e) : null)
    const roleCeilings = day.exercises.map((_, i) => roles[i] ? getRoleSetCeiling(roles[i]!, isLongSession) : EXTRA_SETS_CAP + 99)
    const reps = day.exercises.map(ex => ex.reps)
    const eligible = day.exercises
      .map((_, i) => i)
      .filter(i => entries[i] && entries[i]!.mechanics_tier !== 'primer' && (roles[i] !== 'main' || isLongSession))
      // Accessories/isolation are ordered before mains so round-robin growth
      // fills them first — mains only start climbing once every accessory
      // slot has already hit its own (lower) ceiling.
      .sort((a, b) => (roles[a] === 'main' ? 1 : 0) - (roles[b] === 'main' ? 1 : 0))

    const baseSets = day.exercises.map(ex =>
      Math.max(2, Math.round(ex.sets * policy.setVolumeMultiplier * recoverySetMultiplier * phaseConfig.sets_multiplier))
    )

    if (recoveryRatio >= 1) {
      // High recovery (or nothing eligible): no recovery-driven deficit to
      // guard against restoring, so top-up is bounded only by the role
      // ceiling and EXTRA_SETS_CAP.
      return simulateSetTopUp(baseSets, eligible, entries, restSeconds, targetSeconds, EXTRA_SETS_CAP, roleCeilings, reps)
    }

    // The reference this profile's ceiling scales off of: what a
    // high-recovery peer of this SAME profile would end up with after its
    // own (uncapped, but still role-bounded) top-up.
    const baseSetsAtHigh = day.exercises.map(ex =>
      Math.max(2, Math.round(ex.sets * policy.setVolumeMultiplier * RECOVERY_SET_MULTIPLIER.high * phaseConfig.sets_multiplier))
    )
    const extraAtHigh = simulateSetTopUp(baseSetsAtHigh, eligible, entries, restSeconds, targetSeconds, EXTRA_SETS_CAP, roleCeilings, reps)
    const ceilingSets = baseSetsAtHigh.map((s, i) =>
      Math.min(roleCeilings[i], Math.max(2, Math.round((s + extraAtHigh[i]) * recoveryRatio)))
    )

    return simulateSetTopUp(baseSets, eligible, entries, restSeconds, targetSeconds, EXTRA_SETS_CAP, ceilingSets, reps)
  })
}

// Below this underrun, a day is "close enough" and gets no filler — matches
// the quality scorer's tighter (10%/20%) overrun bands staying strict while
// underrun gets real headroom before anything is appended.
const FILLER_TRIGGER_SECONDS = 15 * 60

/**
 * When a session still runs meaningfully short after duration top-up — most
 * often because the top-up hit its recovery-scaled ceiling before reaching
 * the time budget, sometimes because the exercise pool was simply too thin
 * to fill more sets — the honest move is to fill the gap with something that
 * doesn't ADD lifting volume, not to keep stacking sets past what recovery
 * or exercise selection can support. Low/moderate recovery (or an explicit
 * 'avoid' conditioning preference) gets mobility only; everything else gets
 * a light goal-appropriate conditioning finisher. Never overwrites a
 * conditioning note the day already has from assignConditioningNotes.
 */
function applyDurationFiller(
  days: WorkoutDay[],
  profile: UserProfile,
  policy: GoalPolicy,
  totalBudgetSeconds: number,
): void {
  const recovery = profile.recovery_capacity || 'moderate'
  const mobilityOnly = recovery === 'low' || recovery === 'moderate' || profile.conditioning_preference === 'avoid'

  for (const day of days) {
    if (day.exercises.length === 0 || day.conditioning_note) continue
    const actualSeconds = estimateDaySeconds(day)
    const underBySeconds = totalBudgetSeconds - actualSeconds
    if (underBySeconds <= FILLER_TRIGGER_SECONDS) continue

    // Capped higher than the old 20min ceiling now that the honest duration
    // model (session-duration.ts) charges real per-exercise setup overhead
    // and rep-scaled work time — a thin equipment/experience pool (e.g.
    // minimalist + beginner) genuinely cannot fill a 90+ min session with
    // quality distinct lifting, and the honest move is a longer mobility/
    // conditioning close-out, not pretending the gap doesn't exist.
    const fillerMinutes = Math.min(30, Math.round(underBySeconds / 60))

    if (mobilityOnly) {
      day.conditioning_note = `Optional mobility flow (~${fillerMinutes} min) — today's session ran under your time budget; the extra time goes to mobility, not more lifting volume.`
      day.recommendedCardio = {
        activity: 'Mobility & Movement Prep Flow',
        duration: fillerMinutes,
        targetRpe: 2,
        timing: 'post_session',
        reason: 'Session finished under the time budget; recovery capacity means the extra time goes to mobility, not additional training volume.',
        is_filler: true,
      }
      continue
    }

    const cardioForGoal = getConditioningProfile(profile.fitness_goal)
    day.conditioning_note = `Optional finisher: ${cardioForGoal.heavyDayBrief.activity} (~${fillerMinutes} min) — today's session ran under your time budget.`
    day.recommendedCardio = {
      ...cardioForGoal.heavyDayBrief,
      duration: fillerMinutes,
      timing: 'post_session',
      reason: 'Session finished under the time budget; a light finisher fills the remaining time without adding lifting volume.',
      is_filler: true,
    }
  }
}

/**
 * Ramp-visibility fix: a variation rotation (block-boundary main-lift swap,
 * or a weekly accessory sub-rotation) changes Exercise.name but every one of
 * those call sites spreads `...ex` — carrying the OLD ramp_up forward
 * unchanged, still labeled with the exercise it no longer belongs to.
 * formatRampSets in ExercisePlan.tsx name-guards against rendering that
 * mismatch (so it fails safe, never wrong), but a silent hide reintroduces
 * this exact bug for any rotated week: working weight shown, ramp gone.
 * Re-derives instead — same experience-scaled percentage scheme (it isn't
 * exercise-specific), just re-labeled for the new movement, so a rotated
 * main lift still shows its build-up. Drops the ramp entirely (returns
 * undefined) if the new exercise no longer qualifies under the same rule
 * needsRampUp (warmup.ts) applies — e.g. rotating from a barbell press into
 * a bodyweight variant.
 */
function carryRampUp(
  previousRamp: Exercise['ramp_up'],
  previousName: string,
  newName: string,
  newEntry: ExerciseEntry | undefined,
): Exercise['ramp_up'] {
  if (!previousRamp || previousRamp.exercise !== previousName) return undefined
  if (newName === previousName) return previousRamp
  if (!newEntry || newEntry.mechanics_tier !== 'tier1_compound' || !isExternallyLoaded(newEntry)) return undefined
  return { ...previousRamp, exercise: newName }
}

export function generateMesocycle(
  profile: UserProfile,
  baseWorkout?: WorkoutDay[],
  exclusions: string[] = [],
): MesocycleWeek[] {
  const baseWeek = baseWorkout ?? generateExercisePlan(profile, exclusions).plan
  const goal = (profile.fitness_goal || 'hypertrophy') as FitnessGoal
  const experience = profile.training_experience || 'novice'
  const expConfig = getExperienceConfig(experience)
  const styleConfig = STYLE_CONFIGS[profile.training_style || 'hybrid']
  const pool = getConstrainedPool(profile, exclusions)
  const policy = getGoalPolicy(goal)
  const recoverySetMultiplier = RECOVERY_SET_MULTIPLIER[profile.recovery_capacity || 'moderate']
  const totalBudgetSeconds = getDurationBudgetSeconds(profile.session_duration_preference || '45-60')

  // Experience already trims power/strength for beginners/novices
  // (getPhaseSequence); the goal policy trims further on top — e.g.
  // conditioning never sees a strength or power block regardless of how
  // experienced the trainee is.
  let sequence = restrictPhaseSequence(getPhaseSequence(goal, experience), policy.allowedPhases)
  // A bodyweight-only trainee has no mechanism to express "heavier" the way
  // a strength/power block assumes — an LLM coach review caught an advanced
  // bodyweight profile being handed "Maximal Strength — lower reps, high
  // intensity" with literally no way to add load. Remapped the same way
  // experience/goal restrictions above already work: fall back toward
  // hypertrophy/metabolic work, where reps and leverage are still real
  // progression levers.
  // BODYWEIGHT_ALLOWED_PHASES is already the authoritative "what's a
  // legitimate phase for equipment-free training" list, independent of
  // goal — using it directly (rather than intersecting with the goal
  // policy's own allowed set again) is what lets dedup reach for
  // 'metabolic' as a bodyweight hypertrophy/functional trainee's block 3/4
  // differentiator even though those goals don't normally feature
  // conditioning work. Without this, the intersection left only
  // {anatomical_adaptation, hypertrophy} for that combination — nowhere
  // for dedup to go except accept three straight "Hypertrophy" blocks
  // (better than reintroducing AA, but still the exact monotony problem
  // this function exists to solve). Bodyweight metabolic/conditioning
  // circuits are a legitimate, common variation regardless of the
  // trainee's primary goal.
  const effectiveAllowedPhases = profile.equipment_access === 'bodyweight'
    ? BODYWEIGHT_ALLOWED_PHASES
    : policy.allowedPhases
  if (profile.equipment_access === 'bodyweight') {
    sequence = restrictPhaseSequence(sequence, BODYWEIGHT_ALLOWED_PHASES)
  }
  // Any of the restrictions above (experience, goal, equipment) can each
  // independently be safe on their own and still stack into two identical
  // adjacent blocks — a novice's power->strength remap landing right after
  // an already-'strength' block 3 produced exactly that ("Blocks 3 and 4 are
  // both 'Maximal Strength'... an identical, duplicated block"). Final pass,
  // after every restriction has applied. Passing the effective allowed set
  // (Fix 4) lets the dedup reach for a genuinely different, still-valid
  // phase instead of just alternating hypertrophy/anatomical_adaptation —
  // see dedupeAdjacentPhases's doc comment for why the old unconditional
  // alternation could reintroduce AA mid-macrocycle.
  sequence = dedupeAdjacentPhases(sequence, effectiveAllowedPhases)
  const weeks: MesocycleWeek[] = []
  let weekCounter = 0

  // Onboarding "I know my numbers" path — present only when the trainee
  // opted out of calibration. Absent (undefined) rather than an
  // all-undefined object so prescribeLoad's family lookup has nothing to
  // match against for a trainee who skipped the question entirely.
  const knownWorkingWeights: KnownWorkingWeights | undefined = profile.skip_calibration_week
    ? {
        squat: profile.known_squat_kg,
        bench: profile.known_bench_kg,
        deadlift: profile.known_deadlift_kg,
      }
    : undefined

  // Persists ACROSS blocks (unlike blockBaselineKg/blockWeek3Kg below, which
  // reset every block) — the last loading week's actual resolved load for a
  // still-unverified exercise, keyed by [dayIndex][exerciseIndex]. Stable
  // indexing across blocks since day/slot structure doesn't change (only the
  // variation NAME in a slot rotates). Deload weeks never write to this —
  // the next block's week 1 steps from the last real loading week, not the
  // deload number. See UNVERIFIED_RAMP_STEP_KG's doc comment.
  const lastUnverifiedLoadingWeekKg: (number | null)[][] = baseWeek.map(day => day.exercises.map(() => null))

  sequence.forEach((phase, blockIndex) => {
    let phaseConfig = getPhaseConfig(phase)
    // A metabolic/metcon block at full volume is the right call for someone
    // who genuinely loves conditioning work. For 'tolerate' (and more so
    // 'avoid'), a whole block at that intensity is exactly what a review
    // flagged: conditioning "dumps an entire metcon phase on a client who
    // only tolerates conditioning." Scaled down rather than removed — the
    // goal still needs SOME metabolic work, just not the full dose.
    if (phase === 'metabolic' && profile.conditioning_preference !== 'love') {
      const scale = profile.conditioning_preference === 'avoid' ? 0.7 : 0.85
      phaseConfig = { ...phaseConfig, sets_multiplier: phaseConfig.sets_multiplier * scale }
    }

    // Variations rotate ONCE PER BLOCK, not per week. Changing them weekly
    // would make progression impossible to read; holding them for four weeks
    // gives enough repetitions to actually improve at the movement.
    const blockDays = baseWeek.map(day => {
      // Per-day dedup: a block rotation is computed independently per
      // exercise, with no visibility into what its day-mates just resolved
      // to. Without this set, a rotation that falls back past a
      // regression-excluded current exercise (see rotateVariation) can land
      // on a name another slot in the SAME day already has.
      const usedNamesThisDay = new Set<string>()
      // Pre-rotation families for every slot on this day — a stable proxy
      // for what each slot's family will still be AFTER its own rotation,
      // since rotateVariation only ever offers same-substitution_group/
      // same-pattern/same-tier candidates, which (bar an explicit
      // MOVEMENT_FAMILIES override) share one family throughout. Lets each
      // slot's own rotation avoid landing on a family another slot already
      // holds — the gap that let Deficit Push-Ups and Archer Push-Ups (two
      // different names, same 'bench_press' family) land in one session.
      const dayFamiliesByIndex = day.exercises.map(ex => {
        const e = findEntry(ex.name)
        return e ? getMovementFamily(e) : null
      })
      const exercises = day.exercises.map((ex, exIdx) => {
        const avoidFamilies = new Set(
          dayFamiliesByIndex.filter((f, i) => f && i !== exIdx) as string[]
        )
        const rotated = rotateVariation(ex.name, blockIndex, pool, experience, profile, usedNamesThisDay, avoidFamilies)
        usedNamesThisDay.add(rotated)
        if (rotated === ex.name) return { ...ex, name: rotated }
        // A rotation can land on an exercise with a different prescription
        // TYPE, not just a different name — same substitution_group/tier is
        // no guarantee (Farmer Squat Hold, a time-based hold, shares the
        // 'carry' group/tier with Farmer's Walk, a distance-based walk).
        // Re-derive reps from the NEW exercise's own prescription_type
        // rather than carrying over the old exercise's format, which is
        // exactly how an isometric hold ended up prescribed in meters.
        const newEntry = findEntry(rotated)
        const reps = newEntry ? assignSetsRepsFromConfig(newEntry, styleConfig, expConfig, policy).reps : ex.reps
        // The rotated slot is a different movement — its logging identity must
        // follow (a stale id would thread the old lift's history into the new
        // one's ghosts/progression).
        return {
          ...ex,
          id: newEntry?.id ?? getExerciseId(rotated),
          name: rotated,
          reps,
          ramp_up: carryRampUp(ex.ramp_up, ex.name, rotated, newEntry),
        }
      })
      return { ...day, exercises }
    })

    // Double progression's within-block memory: each exercise's week-1
    // ("baseline") load, keyed by [dayIndex][exerciseIndex] — weeks 2-3 are
    // that SAME number plus fixed increments, not independently re-estimated,
    // and the deload is a fraction of week 3. Reset every block since a new
    // block means a new baseline (and possibly a rotated variation).
    const blockBaselineKg: (number | null)[][] = blockDays.map(day => day.exercises.map(() => null))
    // Week 3's ACTUAL resolved load — tracked separately from the baseline
    // because a 'reps' or 'maintain' progressionEmphasis exercise never gets
    // a forced baseline+increment number, so week 3's real weight can't be
    // derived from the baseline formula. The deload always backs off from
    // whatever week 3 actually ended up being, regardless of emphasis.
    const blockWeek3Kg: (number | null)[][] = blockDays.map(day => day.exercises.map(() => null))

    // Rotation tier per (day, exercise) — fixed for the whole block; only an
    // accessory's specific variation moves within it (see fortnightOffset).
    const rotationTiers: RotationTier[][] = blockDays.map(day => classifyRotationTiers(day.exercises))

    // Periodization's phase/goal/recovery volume multipliers can shrink a
    // LOADING week well below the duration the base plan's exercise
    // SELECTION was originally time-fit for — stageTimeCap (STAGE 5) only
    // ever runs once, on the unperiodized base plan, and periodization
    // purely scales sets down from there with nothing to refill the freed
    // time. A user who asked for 45-60min sessions could otherwise get a
    // 20-30min week 1 despite it not even being a deload. Sized once per
    // block from week 1's structure and applied flatly across weeks 1-3 (not
    // deload — a shorter recovery week is intentional) so "sets stay flat
    // within a block" still holds.
    const blockExtraSets: number[][] = computeDurationTopUp(blockDays, rotationTiers, profile, policy, recoverySetMultiplier, phaseConfig)

    for (let w = 1; w <= 4; w++) {
      weekCounter++
      const isDeload = w === 4
      // Which (day, exercise) slots this week are eligible to feed
      // lastUnverifiedLoadingWeekKg — populated during the exercises.map
      // below, consumed AFTER enforceLoadCoherence runs (see the tracker
      // write-back after that call): the coherence pass can independently
      // clamp a slot down some weeks and not others (its ceiling depends on
      // sibling exercises in the same coherence group, which move on their
      // own schedule), so the step-cap must anchor to whatever was actually
      // DISPLAYED last week, not the pre-coherence estimate — otherwise a
      // week whose clamp happens to release produces a jump larger than one
      // step even though the pre-coherence number was correctly capped.
      const unverifiedLoadingFlags: boolean[][] = blockDays.map(day => day.exercises.map(() => false))

      // The very first week of the whole mesocycle, for a trainee who told
      // onboarding they don't know their numbers — not repeated per block,
      // since calibration is a one-time "find the weight" exercise, not a
      // recurring one.
      const isCalibrationWeek = weekCounter === 1 && profile.skip_calibration_week !== true

      const days: WorkoutDay[] = blockDays.map((day, dayIdx) => {
        // Fixed for this week (main/core never rotate weekly), so these
        // names are known up front — seeding the avoidance set with them
        // means an accessory rotation can never collide with a sibling slot
        // on the same day, whether that sibling is fixed or an
        // already-resolved accessory earlier in this same array.
        const usedWeeklyNames = new Set<string>(
          day.exercises
            .filter((_, i) => rotationTiers[dayIdx][i] !== 'accessory')
            .map(ex => ex.name)
        )
        const exercises: Exercise[] = day.exercises.map((ex, exIdx) => {
          // Accessories rotate on a 2-week sub-cycle within the block (weeks
          // 1-2 stay on the block's starting variation, weeks 3-4 move one
          // step further through the same constrained-pool candidate list
          // rotateVariation() already builds for block-boundary rotation —
          // same substitution group, same tier, skill-appropriate, never a
          // downgrade). Main lifts and core/carry work stay on whatever the
          // block-level rotation above picked, for the whole block.
          const tier = rotationTiers[dayIdx][exIdx]
          // Accessory rotation cadence is goal-tunable (Part 4) — 'maintain'
          // policies rotate faster (variety over strict overload) than the
          // hypertrophy-default 2-week fortnight. Main/core stay on whatever
          // the block-level rotation above picked, for the whole block,
          // regardless of goal — see GoalPolicy.mainRotationWeeks.
          //
          // Beginners/novices need REPETITION to actually learn a movement
          // (expConfig.repeat_movements_for_practice — declared in
          // experience-config.ts but never wired up until now) — a
          // mid-block accessory swap works against that the same way it
          // would for a main lift, so they hold the block-level variation
          // for all four weeks. Intermediate+ keep the sub-cycle.
          const rotatesWeekly = tier === 'accessory' && !expConfig.repeat_movements_for_practice
          const weeklyFamilies = new Set(
            day.exercises
              .map((e, i) => (i === exIdx ? null : findEntry(e.name)))
              .filter((e): e is ExerciseEntry => !!e)
              .map(e => getMovementFamily(e))
          )
          const weeklyName = rotatesWeekly
            ? rotateVariation(ex.name, Math.floor((w - 1) / policy.accessoryRotationWeeks), pool, experience, profile, usedWeeklyNames, weeklyFamilies)
            : ex.name
          if (rotatesWeekly) usedWeeklyNames.add(weeklyName)

          const dbEntry = EXERCISE_DATABASE.find(
            e => e.name.toLowerCase() === weeklyName.toLowerCase()
          )
          const isPrimer = dbEntry?.mechanics_tier === 'primer'
          const category = dbEntry ? categorize(dbEntry) : null
          // Same re-derivation as the block-level rotation above — a weekly
          // accessory sub-rotation can also land on a different prescription
          // TYPE (same substitution_group/tier is no guarantee of matching
          // units), so the base reps text is recomputed from the new
          // exercise rather than inherited from the old one.
          const baseReps = weeklyName !== ex.name && dbEntry && !isPrimer
            ? assignSetsRepsFromConfig(dbEntry, styleConfig, expConfig, policy).reps
            : ex.reps

          // A deload normally backs off by dropping the WEIGHT (70% of week
          // 3). When week 3 was already resolving near the equipment floor
          // (empty bar, lightest dumbbell pair), 70% of it rounds straight
          // back up to that same floor — there is nowhere lower for the
          // number to go. Detected here, before `sets` is computed, so the
          // recovery reduction that weight can no longer provide gets pushed
          // into volume instead.
          const isLoadedNonPrimer = !!dbEntry && !isPrimer && isExternallyLoaded(dbEntry)
          const equipmentFloor = isLoadedNonPrimer ? getEquipmentFloorKg(dbEntry!) : null
          const week3KgForFloorCheck = isDeload ? blockWeek3Kg[dayIdx][exIdx] : null
          const deloadAtFloor =
            isDeload && equipmentFloor != null && week3KgForFloorCheck != null &&
            week3KgForFloorCheck * 0.7 < equipmentFloor

          // Sets stay near-constant across the three loading weeks of a
          // block — load is the progression lever below, not set count. The
          // deload is the one week that deliberately drops both. The goal's
          // set-volume multiplier scales the whole block up or down (e.g.
          // fat_loss/conditioning run lighter than hypertrophy), and
          // recovery_capacity scales it again on top (low recovery trains
          // at 75% the volume of high, all else equal) — before the phase
          // and deload multipliers apply.
          const goalAdjustedBaseSets = ex.sets * policy.setVolumeMultiplier * recoverySetMultiplier
          const standardDeloadSets = Math.max(2, Math.round(goalAdjustedBaseSets * 0.5))
          // Bar-floor deload: weight can't drop, so cut sets further than a
          // normal deload (0.5x -> 0.25x), respecting the 2-set floor. If
          // that floor was ALREADY hit at the standard 0.5x cut, there's no
          // more room in sets either — the rep target absorbs the rest of
          // the reduction instead (see repShift below).
          const floorDeloadSets = Math.max(2, Math.round(goalAdjustedBaseSets * 0.25))
          const deloadNeedsRepCut = deloadAtFloor && floorDeloadSets === standardDeloadSets
          // Main >= accessory >= isolation, every loading week. Deload is
          // exempt — its whole point is going below these ranges — but every
          // non-deload set count is clamped to its role's floor/ceiling
          // (see getRoleSetFloor/Ceiling) regardless of what the goal/phase/
          // recovery multiplier chain above computed, so a beginner's
          // anatomical-adaptation week can no longer crush a main lift to 2
          // sets while duration top-up inflates an accessory to 7.
          const volumeRole = dbEntry ? getVolumeRole(dbEntry) : null
          const sets = isDeload
            ? (deloadAtFloor ? floorDeloadSets : standardDeloadSets)
            // + the once-per-block duration top-up (see computeDurationTopUp)
            // — a fixed per-slot amount, so this still holds sets flat
            // across weeks 1-3 despite being duration-driven.
            : clampToVolumeRole(
                Math.max(2, Math.round(goalAdjustedBaseSets * phaseConfig.sets_multiplier)) + blockExtraSets[dayIdx][exIdx],
                volumeRole,
                (profile.session_duration_preference || '45-60') === '90+',
              )

          // No externally loaded weight to ramp (true bodyweight movement, or
          // one prescribeLoad can't categorize) — progress these via reps
          // regardless of the goal's progressionEmphasis, since there's no
          // weight for that setting to apply to. Loaded exercises follow the
          // goal: 'reps' AND 'maintain' both ramp the rep target — 'maintain'
          // previously ramped neither reps nor load, which is how a plan
          // ended up with three visually identical weeks distinguishable
          // only by an RPE label (a direct LLM coach review finding: "same
          // bar, same reps, 'now it's harder' is not a plan"). Only 'load'
          // emphasis holds reps flat, since load itself is that goal's lever.
          const isBodyweight = !!dbEntry && !isPrimer && !isExternallyLoaded(dbEntry)
          // A loaded carry's "reps" field is a fixed distance ('40m') —
          // shiftReps deliberately never touches it (distance is the wrong
          // lever for a carry). For a 'reps'/'maintain'-emphasis goal that
          // would otherwise leave BOTH load and distance frozen every week
          // — a carry has no progression lever at all under those goals
          // unless load is the one that moves instead, same reasoning as
          // bodyweight always ramping reps regardless of goal.
          const isCarry = dbEntry?.prescription_type === 'distance_load'
          // The day's flagship lift — tier1_compound ONLY (mapTier() maps
          // this 1:1 to the tier_1_primary slot; tier2_compound is
          // secondary/accessory work like Dumbbell Rows, Arnold Press, or
          // the single_leg_dumbbell family, NOT the day's main lift) —
          // always progresses by weight, independent of the goal's
          // progressionEmphasis. 'reps'/'maintain' goals previously held it
          // dead flat for the entire block — a review round converged hard
          // on this ("Bench is 45kg in Week 1 and 45kg in Week 3... the app
          // promised a ramp and it never ramps", repeated near-verbatim
          // across every conditioning/functional profile) even with a coach
          // note explaining the design. No real coach leaves the actual
          // squat/bench/deadlift/OHP number untouched for three straight
          // weeks regardless of program philosophy. An earlier version of
          // this override also included tier2_compound, which caught
          // secondary/accessory slots (Arnold Press, DB Rows, split squats)
          // and produced a NEW review finding — "50-67% two-week jumps on
          // curls and tricep extensions" — by forcing full main-lift-style
          // ramping onto accessory work that should have stayed on the
          // goal's own (usually gentler, reps-led) accessory progression.
          // Accessories are exactly where a goal's "variety over load" or
          // "reps not weight" identity belongs, so only the true main lift
          // is exempted from policy below.
          const isMainCompound = !!dbEntry && dbEntry.mechanics_tier === 'tier1_compound'
          const rampLoadCandidate = !isBodyweight && (policy.progressionEmphasis === 'load' || isCarry || isMainCompound)

          // A percentage-sized step snapped to the loading mode's real
          // granularity (see getLoadIncrementKg) can still be a large
          // percentage on a LIGHT baseline — the minimum real dumbbell notch
          // is 2kg/hand, which is 33% of a 6kg curl no matter how gently the
          // target rate is set. Carries are exempt: a carry's only lever is
          // load (distance is fixed, and shiftReps deliberately never
          // touches it), so there's nothing to fall back to. When the step
          // is unaffordable, hold load flat this block and ramp reps
          // instead — the load catches up once the baseline itself has
          // grown enough to afford a real step (this can legitimately take
          // a whole block or more on light isolation work; that's correct,
          // not a bug).
          let loadStepUnaffordable = false
          if (rampLoadCandidate && !isCarry && dbEntry) {
            const affordabilityBaseline = blockBaselineKg[dayIdx][exIdx]
            if (affordabilityBaseline != null && affordabilityBaseline > 0) {
              const stepKg = getLoadIncrementKg(dbEntry, category, affordabilityBaseline)
              loadStepUnaffordable = stepKg / affordabilityBaseline > 0.12
            }
          }
          const rampLoad = rampLoadCandidate && !loadStepUnaffordable
          const rampReps = (isBodyweight || loadStepUnaffordable || ((policy.progressionEmphasis === 'reps' || policy.progressionEmphasis === 'maintain') && !isMainCompound)) && !isCarry
          const repShift = isDeload
            ? (deloadAtFloor
                // Weight held flat (can't drop further) — reps carry the
                // recovery reduction instead of the usual +2 "back off"
                // bump, which would INCREASE volume here, the opposite of
                // the point. If sets also had no room to cut, reps drop
                // outright rather than just holding flat.
                ? (deloadNeedsRepCut ? phaseConfig.rep_shift - 2 : phaseConfig.rep_shift)
                : phaseConfig.rep_shift + 2)
            : phaseConfig.rep_shift + (rampReps ? w - 1 : 0)
          const restShift = isDeload ? 0 : phaseConfig.rest_adjust_seconds
          const reps = shiftReps(baseReps, repShift, expConfig.min_reps)

          // Primers stay submaximal and un-scaled for the same reason as the
          // base plan — a warm-up movement should never carry a working-set
          // RPE or a load that scales with the block.
          const intensity = isPrimer ? ex.intensity : resolveTargetRpe(phase, experience, w, isDeload)

          let load = null as ReturnType<typeof prescribeLoad> | null
          if (dbEntry && !isPrimer) {
            const baselineKg = blockBaselineKg[dayIdx][exIdx]
            const increment = getLoadIncrementKg(dbEntry, category, baselineKg ?? 0)

            // Week 1 sets the baseline through the normal estimate pipeline
            // (bodyweight/known-weight/RPE/first-block/calibration all still
            // apply there). Weeks 2-3 are ALWAYS a forced number derived from
            // that baseline, never a fresh independently RPE-scaled estimate
            // — that re-estimate is exactly what made load swing by 5-10kg
            // week to week for 'reps'/'maintain' goals before this, despite
            // being meant to hold flat. When this goal ramps load, weeks 2-3
            // are baseline plus one/two fixed increments; otherwise ('reps'
            // or 'maintain' emphasis) the weight holds flat at the baseline
            // and only reps/RPE move. Either way, the deload is 65-75% of
            // whatever week 3 actually resolved to.
            //
            // For an accessory that rotates variation mid-block, the
            // baseline number still carries over from week 1's (different)
            // variation — rotateVariation only offers same substitution-
            // group/tier candidates, so the magnitude stays reasonable —
            // but `increment` above is recomputed for whichever variation is
            // actually being lifted this week.
            let forceStartingWeightKg: number | undefined
            let unverifiedPreviousLoadingWeekKg: number | undefined
            // Still no verified working weight for this exercise: every
            // loading week after calibration steps from the last loading
            // week's ACTUAL resolved load (not just within block 1 — see
            // UNVERIFIED_RAMP_STEP_KG's doc comment for why the old
            // block-1-only, percentage-of-standards ramp let block 2 week 1
            // snap straight back to the full undamped estimate). Scoped to
            // rampLoad only — a 'reps'/'maintain' accessory that
            // intentionally holds flat at baseline is unaffected; its
            // progression lever is reps, not this.
            const unverifiedForCategory = !hasKnownWorkingWeight(category, knownWorkingWeights)
            if (rampLoad && unverifiedForCategory && !isDeload && !isCalibrationWeek) {
              const previous = lastUnverifiedLoadingWeekKg[dayIdx][exIdx]
              if (previous != null) unverifiedPreviousLoadingWeekKg = previous
            }
            if (unverifiedPreviousLoadingWeekKg == null && baselineKg != null) {
              if (w === 2) {
                forceStartingWeightKg = rampLoad ? baselineKg + increment : baselineKg
              } else if (w === 3) {
                forceStartingWeightKg = rampLoad ? baselineKg + 2 * increment : baselineKg
              }
            }

            // Pre-ship safety patch: a carried-forward baseline assumes the
            // SAME exercise (or a same-magnitude rotation) — but
            // rotateVariation only guarantees same substitution-group/tier,
            // not same real-world load. A review caught a "~56kg per hand"
            // Dumbbell Rows prescription that was really a week-1 Backpack
            // Row's (broken, since-capped) baseline carried forward across
            // a rotation into an unrelated implement — a capped or broken
            // anchor must never propagate through a rotation. Whenever the
            // carried-forward number diverges by more than 25% from what a
            // FRESH, this-week estimate for the exercise ACTUALLY in this
            // slot would produce, discard the carried value and re-derive.
            // A legitimate (non-rotated) ramp only drifts a few percent
            // above a fresh estimate by week 3 (see load-prescription.ts's
            // percentage-based increments), so this is a pure backstop for
            // contamination, not a constraint on normal progression.
            if (forceStartingWeightKg != null) {
              const freshReference = prescribeLoad(dbEntry, profile, {
                targetRpeLabel: intensity, isFirstBlock: blockIndex === 0, sets, phase,
                isCalibrationWeek, knownWorkingWeights, repRangeLabel: reps, loadIsProgressing: rampLoad,
              })
              if (freshReference.starting_weight_kg != null && forceStartingWeightKg > freshReference.starting_weight_kg * 1.25) {
                forceStartingWeightKg = freshReference.starting_weight_kg
              }
            }
            if (isDeload) {
              const week3Kg = blockWeek3Kg[dayIdx][exIdx]
              if (week3Kg != null) {
                // At the equipment floor, prescribeLoad's own rounding would
                // clamp 70% right back up to the floor anyway — set it
                // explicitly so the intent ("weight held at the floor,
                // volume did the reducing") is unambiguous rather than an
                // accident of rounding.
                forceStartingWeightKg = deloadAtFloor ? equipmentFloor! : week3Kg * 0.7
              }
            }

            load = prescribeLoad(dbEntry, profile, {
              targetRpeLabel: intensity,
              isFirstBlock: blockIndex === 0,
              sets,
              phase,
              isCalibrationWeek,
              knownWorkingWeights,
              forceStartingWeightKg,
              unverifiedPreviousLoadingWeekKg,
              repRangeLabel: reps,
              loadIsProgressing: rampLoad,
            })

            if (w === 1) blockBaselineKg[dayIdx][exIdx] = load.starting_weight_kg
            if (w === 3) blockWeek3Kg[dayIdx][exIdx] = load.starting_weight_kg
            // Deload weeks are read-only for this tracker (see its
            // declaration) — the next block's week 1 must step from the
            // last real loading week, not the deload back-off. Written
            // regardless of THIS week's own rampLoad value (unlike the read
            // above) — an accessory can flip between holding flat and
            // ramping week to week (loadStepUnaffordable depends on the
            // block's baseline, and a within-block variation rotation via
            // fortnightOffset can change loading mode/category mid-block).
            // Actually written AFTER enforceLoadCoherence runs (see below);
            // this just marks the slot as eligible.
            if (!isDeload && unverifiedForCategory) {
              unverifiedLoadingFlags[dayIdx][exIdx] = true
            }
          }

          return {
            ...ex,
            name: weeklyName,
            sets,
            reps,
            rest: adjustRest(ex.rest, restShift),
            intensity,
            load_guidance: deloadAtFloor
              ? (deloadNeedsRepCut
                  ? 'Bar stays the same — reduced reps this week. Recovery comes from doing less, not lifting lighter.'
                  : 'Bar stays the same — reduced sets this week. Recovery comes from doing less, not lifting lighter.')
              : (load ? `${expConfig.load_guidance} ${load.basis}` : ex.load_guidance),
            suggested_load: load ? load.display : ex.suggested_load,
            suggested_load_kg: load ? load.starting_weight_kg : ex.suggested_load_kg,
            load_source: load ? load.load_source : ex.load_source,
            per_set_load: load ? load.per_set : (ex.per_set_load ?? null),
            movement_pattern: dbEntry ? mapMovementPattern(dbEntry.movement_pattern) : undefined,
            tier: dbEntry ? mapTier(dbEntry.mechanics_tier) : undefined,
            fatigue_cost: dbEntry ? deriveFatigueCost(dbEntry) : undefined,
            prescription_type: dbEntry?.prescription_type ?? ex.prescription_type,
            ramp_up: carryRampUp(ex.ramp_up, ex.name, weeklyName, dbEntry),
          }
        })

        // Per-exercise role clamping bounds each slot independently but
        // can't see its day-mates — a 3-set (floor) main next to a 4-set
        // (ceiling) accessory both pass their own clamp yet still invert the
        // hierarchy. This closes that gap. Skipped on deload weeks, where
        // the main lift itself is deliberately at its lowest point.
        return { ...day, exercises: isDeload ? exercises : enforceSetHierarchy(exercises) }
      })

      enforceLoadCoherence(days)

      // Anchor to the FINAL, post-coherence displayed number — see
      // unverifiedLoadingFlags's declaration for why this can't be written
      // during the exercises.map above.
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        const dayExercises = days[dayIdx].exercises
        for (let exIdx = 0; exIdx < dayExercises.length; exIdx++) {
          if (!unverifiedLoadingFlags[dayIdx][exIdx]) continue
          const finalKg = dayExercises[exIdx].suggested_load_kg
          if (finalKg != null) lastUnverifiedLoadingWeekKg[dayIdx][exIdx] = finalKg
        }
      }

      progressConditioningWeek(days, w, isDeload)

      // Deload weeks are SUPPOSED to run short (half volume, by design) — a
      // filler there would fight the whole point of the recovery week, so
      // this only applies to loading weeks.
      if (!isDeload) {
        applyDurationFiller(days, profile, policy, totalBudgetSeconds)
        // Runs last, after rotation, periodization and duration-budget
        // trimming have all had their say — see enforceWeeklyPatternBalance's
        // doc comment. Deload weeks are exempt (like the duration filler
        // above): their volume is deliberately, uniformly cut, and nudging
        // set counts would fight that.
        enforceWeeklyPatternBalance(days)
      }

      weeks.push({
        week_number: weekCounter,
        block_number: blockIndex + 1,
        week_in_block: w,
        phase_label: phaseConfig.label,
        phase_focus: phaseConfig.focus,
        is_deload: isDeload,
        isCalibrationWeek,
        coach_note: [
          isDeload
            ? 'Deload week — volume is deliberately cut so you arrive at the next block recovered. Resist the urge to push.'
            // The goal's own framing shows once per block, alongside the
            // phase's — repeating it every week would bury the phase-specific
            // note under the same paragraph four times over.
            : w === 1
              ? `${phaseConfig.coach_note} ${policy.coachNote}`
              : phaseConfig.coach_note,
          buildProgressionNote(w, isDeload, isCalibrationWeek, policy),
        ].join(' '),
        label: isDeload
          ? `Week ${weekCounter} — ${phaseConfig.label}: Deload`
          : `Week ${weekCounter} — ${phaseConfig.label} (wk ${w} of block ${blockIndex + 1})`,
        days,
      })
    }
  })

  return weeks
}


export { MESOCYCLE_WEEK_LABELS }
