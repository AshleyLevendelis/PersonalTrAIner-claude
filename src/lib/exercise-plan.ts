import type {
  UserProfile, WorkoutDay, Exercise, FitnessGoal, SessionDuration,
  WorkoutSplit, RecommendedCardio, MesocycleWeek, ExerciseTier,
  FatigueCost, MesocycleMovementPattern, EquipmentAccess, TrainingStyle,
  ConstraintTrace, ConstraintTraceEntry, PlanResult, TrainingExperience,
} from './types'
import { EXERCISE_DATABASE, getMovementFamily, getVolumeRole, type ExerciseEntry, type MovementPattern, type AngleVector, type VolumeRole } from './exercise-db'
import {
  getExperienceConfig, getSkillDemand, isSkillAppropriate, applyRepFloor,
  type ExperienceConfig,
} from './experience-config'
import { buildWarmup, getWarmupReserveSeconds } from './warmup'
import { prescribeLoad, categorize, getLoadIncrementKg, isExternallyLoaded, getEquipmentFloorKg, type KnownWorkingWeights } from './load-prescription'
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
}

const TRACKS: Record<TrackFocus, TrackDefinition> = {
  'Push & Press': {
    label: 'Push & Press',
    primary_patterns: ['horizontal_push', 'vertical_push'],
    secondary_patterns: ['isolation_tricep', 'isolation_shoulder', 'core'],
    forbidden_patterns: ['isolation_bicep', 'horizontal_pull', 'vertical_pull'],
    primer_patterns: ['activation'],
    required_patterns: [],
  },
  'Pull & Hinge': {
    label: 'Pull & Hinge',
    primary_patterns: ['horizontal_pull', 'vertical_pull', 'hip_hinge'],
    secondary_patterns: ['isolation_bicep', 'isolation_hamstring', 'core'],
    forbidden_patterns: ['isolation_tricep', 'horizontal_push', 'vertical_push'],
    primer_patterns: ['activation'],
    required_patterns: ['hip_hinge'],
  },
  'Squat & Carry': {
    label: 'Squat & Carry',
    primary_patterns: ['knee_dominant', 'single_leg', 'carry'],
    secondary_patterns: ['isolation_quad', 'isolation_calf', 'core'],
    forbidden_patterns: ['horizontal_push', 'horizontal_pull', 'isolation_bicep', 'isolation_tricep'],
    primer_patterns: ['activation'],
    required_patterns: ['carry'],
  },
  'Upper Pull & Core': {
    label: 'Upper Pull & Core',
    primary_patterns: ['vertical_pull', 'horizontal_pull'],
    secondary_patterns: ['core', 'isolation_bicep', 'isolation_shoulder'],
    forbidden_patterns: ['isolation_tricep', 'horizontal_push'],
    primer_patterns: ['activation'],
    required_patterns: ['core'],
  },
  'Full Body Power': {
    label: 'Full Body Power',
    primary_patterns: ['hip_hinge', 'knee_dominant', 'horizontal_push', 'vertical_pull'],
    secondary_patterns: ['single_leg', 'core'],
    forbidden_patterns: [],
    primer_patterns: ['activation'],
    required_patterns: [],
  },
  'Conditioning & Core': {
    label: 'Conditioning & Core',
    primary_patterns: ['cardio'],
    secondary_patterns: ['core'],
    forbidden_patterns: [],
    primer_patterns: ['activation'],
    required_patterns: ['core'],
  },
  'Chest & Triceps': {
    label: 'Chest & Triceps',
    primary_patterns: ['horizontal_push'],
    secondary_patterns: ['isolation_tricep'],
    forbidden_patterns: ['horizontal_pull', 'vertical_pull', 'hip_hinge', 'knee_dominant', 'single_leg', 'carry', 'isolation_bicep', 'isolation_hamstring', 'isolation_quad', 'isolation_calf'],
    primer_patterns: ['activation'],
    required_patterns: [],
  },
  'Back & Biceps': {
    label: 'Back & Biceps',
    primary_patterns: ['horizontal_pull', 'vertical_pull'],
    secondary_patterns: ['isolation_bicep'],
    forbidden_patterns: ['horizontal_push', 'vertical_push', 'hip_hinge', 'knee_dominant', 'single_leg', 'carry', 'isolation_tricep', 'isolation_shoulder', 'isolation_quad', 'isolation_calf'],
    primer_patterns: ['activation'],
    required_patterns: [],
  },
  'Legs & Calves': {
    label: 'Legs & Calves',
    primary_patterns: ['knee_dominant', 'hip_hinge', 'single_leg'],
    secondary_patterns: ['isolation_quad', 'isolation_hamstring', 'isolation_calf'],
    forbidden_patterns: ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'isolation_bicep', 'isolation_tricep', 'isolation_shoulder'],
    primer_patterns: ['activation'],
    required_patterns: [],
  },
  'Shoulders & Abs': {
    label: 'Shoulders & Abs',
    primary_patterns: ['vertical_push', 'isolation_shoulder'],
    secondary_patterns: ['core'],
    forbidden_patterns: ['horizontal_push', 'horizontal_pull', 'vertical_pull', 'hip_hinge', 'knee_dominant', 'single_leg', 'carry', 'isolation_bicep', 'isolation_tricep', 'isolation_quad', 'isolation_calf'],
    primer_patterns: ['activation'],
    required_patterns: ['core'],
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
  ]),
  minimalist: new Set([
    'kettlebell', 'resistance band', 'bodyweight', 'dumbbells', 'dumbbell',
    'pull-up bar', 'jump rope', 'medicine ball', 'plyo box', 'ab wheel',
  ]),
  bodyweight: new Set(['bodyweight', 'pull-up bar']),
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
    if (isSkillAppropriate(ex.name, experience)) {
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

  return result
}

function stageTimeCap(
  dayExercises: { entry: ExerciseEntry; sets: number; reps: string; rest: string; restSeconds: number }[],
  budgetSeconds: number,
  style: TrainingStyle,
  trace: ConstraintTrace,
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

  // Phase 4: Only as last resort, remove lowest-tier exercises from the end
  while (estimated > budgetSeconds && dayExercises.length > 3) {
    const removed = dayExercises.pop()!
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
      .map((e, i) => ({ i, cost: e.sets * (e.entry.avg_duration_seconds + e.restSeconds), isMain: e.entry.mechanics_tier === 'tier1_compound' }))
      .sort((a, b) => b.cost - a.cost)

    for (const priority of [false, true]) {
      for (const { i, isMain } of order) {
        if (isMain !== priority) continue
        if (estimated <= budgetSeconds) break
        if (dayExercises[i].sets <= 2) continue
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

function selectExercisesForTrack(
  track: TrackDefinition,
  pool: ExerciseEntry[],
  counts: { tier1: number; tier2: number; tier3: number },
  weeklyUsed: Set<string>,
  styleConfig: StyleConfig,
  feasibleRequiredPatterns?: MovementPattern[],
  weeklyAppearanceCount?: Map<string, number>,
): { primer: ExerciseEntry | null; main: ExerciseEntry[] } {
  const allPatterns = new Set([...track.primary_patterns, ...track.secondary_patterns])
  const forbidden = new Set(track.forbidden_patterns)

  const trackPool = pool.filter(e =>
    allPatterns.has(e.movement_pattern) &&
    !forbidden.has(e.movement_pattern)
  )

  const primerPool = pool.filter(e =>
    e.mechanics_tier === 'primer' &&
    track.primer_patterns.includes(e.movement_pattern)
  )
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

  function pickFromTier(tier: string, count: number, patterns: MovementPattern[]) {
    const candidates = shuffle(
      trackPool.filter(e =>
        e.mechanics_tier === tier &&
        patterns.includes(e.movement_pattern) &&
        !weeklyUsed.has(e.name) &&
        !selected.some(s => s.name === e.name) &&
        !usedGroups.has(getMovementFamily(e))
      )
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

  // Sort: tier1 compounds first, then tier2, then tier3
  const tierOrder = { tier1_compound: 0, tier2_compound: 1, tier3_isolation: 2, cardio: 3, primer: 4 }
  selected.sort((a, b) => (tierOrder[a.mechanics_tier] ?? 3) - (tierOrder[b.mechanics_tier] ?? 3))

  return { primer, main: selected }
}

// ---------------------------------------------------------------------------
// Assign sets/reps/rest using the style config
// ---------------------------------------------------------------------------

function assignSetsRepsFromConfig(
  entry: ExerciseEntry,
  config: StyleConfig,
  experience: ExperienceConfig,
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
    default:
      switch (entry.mechanics_tier) {
        case 'tier1_compound':
          return {
            sets: scaleSets(config.setRange.tier1),
            reps: applyRepFloor(config.repRange.tier1, experience.min_reps),
            rest: `${config.restSeconds.tier1}s`,
            restSeconds: config.restSeconds.tier1,
          }
        case 'tier2_compound':
          return {
            sets: scaleSets(config.setRange.tier2),
            reps: applyRepFloor(config.repRange.tier2, experience.min_reps),
            rest: `${config.restSeconds.tier2}s`,
            restSeconds: config.restSeconds.tier2,
          }
        default:
          return {
            sets: scaleSets(config.setRange.tier3),
            reps: applyRepFloor(config.repRange.tier3, experience.min_reps),
            rest: `${config.restSeconds.tier3}s`,
            restSeconds: config.restSeconds.tier3,
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
  return countAvailableForTrack(t, pool) >= 3 && requiredOk
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
  }
}

function getRoleSetFloor(role: VolumeRole): number {
  return role === 'main' ? 3 : 2
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
  return exercises.map((ex, i) =>
    roles[i] && roles[i] !== 'main' && ex.sets > mainCeiling ? { ...ex, sets: mainCeiling } : ex
  )
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
  const reps = isPrimer ? oldExercise.reps : assignSetsRepsFromConfig(newEntry, styleConfig, experience).reps
  return {
    ...oldExercise,
    name: newEntry.name,
    reps,
    substitution: getSubstitution(newEntry, pool, allSelectedNames),
    intensity,
    prescription_type: newEntry.prescription_type,
    load_guidance: isPrimer ? oldExercise.load_guidance : `${experience.load_guidance} ${load.basis}`,
    suggested_load: isPrimer ? 'Light' : load.display,
    suggested_load_kg: isPrimer ? null : load.starting_weight_kg,
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
): void {
  const dayFamilies = (dayIdx: number): Set<string> =>
    new Set(
      days[dayIdx].exercises
        .map(ex => findEntry(ex.name))
        .filter((e): e is ExerciseEntry => !!e)
        .map(e => getMovementFamily(e))
    )

  function findAccessorySlot(want: (p: BalancePattern) => boolean): { dayIdx: number; exIdx: number } | null {
    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const exercises = days[dayIdx].exercises
      for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
        const entry = findEntry(exercises[exIdx].name)
        if (!entry || entry.mechanics_tier === 'tier1_compound' || entry.mechanics_tier === 'primer') continue
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

  // --- Weekly pattern coverage: squat, hinge, push, pull ---
  const patternsPresent = new Set<BalancePattern>()
  for (const day of days) {
    for (const ex of day.exercises) {
      const entry = findEntry(ex.name)
      if (entry) patternsPresent.add(classifyForBalance(entry.movement_pattern))
    }
  }
  const poolHasPattern = (test: (p: BalancePattern) => boolean) =>
    pool.some(e => test(classifyForBalance(e.movement_pattern)))

  for (const missing of ['squat', 'hinge', 'push', 'pull'] as const) {
    if (patternsPresent.has(missing)) continue
    // Equipment/injuries genuinely leave nothing of this pattern available —
    // nothing to add, and nothing worth flagging as a gap.
    if (!poolHasPattern(p => p === missing)) continue

    // Sacrifice the weakest accessory slot: prefer a tier3 isolation slot,
    // scanning from the end of the week backward so the days built around
    // heavier/earlier tracks are disturbed last.
    let slot: { dayIdx: number; exIdx: number } | null = null
    for (let dayIdx = days.length - 1; dayIdx >= 0 && !slot; dayIdx--) {
      const exercises = days[dayIdx].exercises
      for (let exIdx = exercises.length - 1; exIdx >= 0; exIdx--) {
        if (findEntry(exercises[exIdx].name)?.mechanics_tier === 'tier3_isolation') { slot = { dayIdx, exIdx }; break }
      }
    }
    if (!slot) {
      for (let dayIdx = days.length - 1; dayIdx >= 0 && !slot; dayIdx--) {
        const exercises = days[dayIdx].exercises
        for (let exIdx = exercises.length - 1; exIdx >= 0; exIdx--) {
          const entry = findEntry(exercises[exIdx].name)
          if (entry && entry.mechanics_tier !== 'tier1_compound' && entry.mechanics_tier !== 'primer') { slot = { dayIdx, exIdx }; break }
        }
      }
    }
    if (!slot) continue

    const usedFamilies = dayFamilies(slot.dayIdx)
    const eligible = (e: ExerciseEntry) =>
      classifyForBalance(e.movement_pattern) === missing &&
      e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer' &&
      !usedFamilies.has(getMovementFamily(e))
    const replacement = pool.find(e => eligible(e) && !weeklyUsed.has(e.name)) ?? pool.find(eligible)

    if (replacement) {
      swap(slot.dayIdx, slot.exIdx, replacement, `weekly pattern coverage missing '${missing}'`)
      patternsPresent.add(missing)
    } else {
      trace.structure_adjusted.push({
        exercise: '(weekly pattern coverage)', stage: 'structure',
        reason: `'${missing}' pattern is available in the constrained pool but no swappable accessory slot could add it without a movement-family duplicate`,
      })
    }
  }

  // --- Weekly push:pull ratio ---
  // Set counts for tier2/tier3 accessories share the same base value across
  // every training style (see STYLE_CONFIGS), so exercise COUNT among
  // swap-eligible accessories is a reliable proxy for the SET-based ratio the
  // quality scorer actually checks — periodization's multipliers (applied
  // later, per mesocycle week) scale push and pull work by the same factor,
  // so whatever ratio is set here survives into every week.
  const MAX_SWAPS = 6
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
    const ratio = pushCount / pullCount
    if (ratio >= 0.6 && ratio <= 1.6) break

    const excessIsPush = ratio > 1.6
    const target = findAccessorySlot(p => p === (excessIsPush ? 'push' : 'pull'))
    if (!target) {
      trace.structure_adjusted.push({
        exercise: '(weekly push:pull)', stage: 'structure',
        reason: `push:pull ratio ${ratio.toFixed(2)} is outside 0.6-1.6 and no swappable accessory remains to correct it`,
      })
      break
    }

    const usedFamilies = dayFamilies(target.dayIdx)
    const wantPattern = excessIsPush ? 'pull' : 'push'
    const eligible = (e: ExerciseEntry) =>
      classifyForBalance(e.movement_pattern) === wantPattern &&
      e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer' &&
      !usedFamilies.has(getMovementFamily(e))
    const replacement = pool.find(e => eligible(e) && !weeklyUsed.has(e.name)) ?? pool.find(eligible)

    if (!replacement) {
      trace.structure_adjusted.push({
        exercise: '(weekly push:pull)', stage: 'structure',
        reason: `push:pull ratio ${ratio.toFixed(2)} needs a ${wantPattern} swap on ${days[target.dayIdx].day} but no valid replacement exists in the constrained pool`,
      })
      break
    }

    swap(target.dayIdx, target.exIdx, replacement, `push:pull exercise-count ratio ${ratio.toFixed(2)}`)
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
      .map((ex, i) => ({ i, sets: ex.sets, entry: findEntry(ex.name) }))
      .filter(t => t.sets > 2 && t.entry && t.entry.mechanics_tier !== 'primer')
    if (trimmable.length === 0) break
    const nonMain = trimmable.filter(t => t.entry!.mechanics_tier !== 'tier1_compound')
    const candidates = nonMain.length > 0 ? nonMain : trimmable
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

function getConditioningProfile(goal: FitnessGoal): ConditioningProfile {
  if (goal === 'fat_loss') {
    return {
      dedicatedDay: { activity: 'HIIT Metabolic Circuit (30s work / 30s rest)', duration: 25, targetRpe: 8 },
      postSession: { activity: 'Incline Walk or Cycling (LISS)', duration: 20, targetRpe: 4 },
      heavyDayBrief: { activity: 'Rowing Intervals or Sled Pushes', duration: 10, targetRpe: 7 },
      independentBlock: { activity: 'Brisk Walk or Light Cycling (Zone 2)', duration: 30, targetRpe: 4 },
      restDay: { activity: 'Zone 2 Aerobic Base (walking, cycling, swimming)', duration: 35, targetRpe: 4 },
    }
  }
  if (goal === 'conditioning') {
    return {
      dedicatedDay: { activity: 'Steady-State Aerobic Base (Zone 2: 120-140 BPM)', duration: 40, targetRpe: 5 },
      postSession: { activity: 'Aerobic Base Building (Zone 2)', duration: 25, targetRpe: 5 },
      heavyDayBrief: { activity: 'Easy Cooldown Cardio (HR below 130 BPM)', duration: 12, targetRpe: 3 },
      independentBlock: { activity: 'Steady-State Run or Cycle (Zone 2)', duration: 35, targetRpe: 5 },
      restDay: { activity: 'Long Aerobic Session (running, rowing, cycling)', duration: 45, targetRpe: 5 },
    }
  }
  return {
    dedicatedDay: { activity: 'Light Conditioning Circuit', duration: 20, targetRpe: 5 },
    postSession: { activity: 'Light LISS (incline walk)', duration: 15, targetRpe: 3 },
    heavyDayBrief: { activity: 'Easy Cooldown Walk', duration: 8, targetRpe: 2 },
    independentBlock: { activity: 'Light Walk or Mobility Flow', duration: 20, targetRpe: 3 },
    restDay: { activity: 'Active Recovery Walk or Light Swim', duration: 25, targetRpe: 3 },
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
    day.conditioning_note = cardioForGoal.dedicatedDay.activity
    day.recommendedCardio = {
      ...cardioForGoal.dedicatedDay,
      timing: 'post_session',
      reason: 'Dedicated conditioning day -- full session devoted to metabolic work.',
    }
    remaining--
  }

  for (const restDay of restDayNames) {
    if (remaining <= 0) break
    days.push({
      day: restDay,
      focus: 'Active Recovery + Cardio',
      exercises: [],
      conditioning_note: cardioForGoal.restDay.activity,
      recommendedCardio: {
        ...cardioForGoal.restDay,
        timing: 'rest_day',
        reason: 'Programmed on a rest day for recovery-compatible conditioning.',
      },
    })
    remaining--
  }

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

  const days: WorkoutDay[] = availableDays.map((day, index) => {
    const rawTrack = split[index % split.length]
    const trackFocus = getViableTrack(rawTrack, pool)
    const track = TRACKS[trackFocus]

    const { primer, main } = selectExercisesForTrack(track, pool, counts, weeklyUsed, styleConfig, feasiblePatterns, weeklyAppearanceCount)

    // Build exercise list with sets/reps from style config
    const daySlots: { entry: ExerciseEntry; sets: number; reps: string; rest: string; restSeconds: number }[] = []

    if (primer) {
      weeklyUsed.add(primer.name)
      const sr = assignSetsRepsFromConfig(primer, styleConfig, experience)
      daySlots.push({ entry: primer, ...sr })
    }

    for (const entry of main) {
      weeklyUsed.add(entry.name)
      allSelectedNames.add(entry.name)
      weeklyAppearanceCount.set(entry.name, (weeklyAppearanceCount.get(entry.name) ?? 0) + 1)
      const sr = assignSetsRepsFromConfig(entry, styleConfig, experience)
      daySlots.push({ entry, ...sr })
    }

    // STAGE 5: Time-cap optimization per day
    const optimized = stageTimeCap(daySlots, budgetSeconds, trainingStyle, trace)

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
        per_set_load: isPrimer ? null : load.per_set,
      }
    })

    // Build superset pairings
    const paired = buildSupersetPairs(exercises, pool, duration, trainingStyle, trace)

    // Warm-up is derived from what this session actually contains, so a squat
    // day and a bench day get genuinely different preparation.
    const sessionEntries = optimized.map(s => s.entry)
    const mainLift =
      sessionEntries.find(e => e.mechanics_tier === 'tier1_compound') ??
      sessionEntries.find(e => e.mechanics_tier === 'tier2_compound') ??
      null

    const warmup = buildWarmup({
      patterns: sessionEntries.map(e => e.movement_pattern),
      mainLift,
      equipment: profile.equipment_access || 'full_gym',
      injuries: profile.injuries || [],
      experience: profile.training_experience || 'novice',
      budgetSeconds: warmupReserve,
    })

    return {
      day: day.day,
      focus: trackFocus,
      exercises: enforceSetHierarchy(paired),
      warmup,
    }
  })

  balanceWeeklyStructure(days, pool, weeklyUsed, allSelectedNames, experience, profile, trace, styleConfig)
  assignConditioningNotes(days, profile, policy)

  const budgetedDays = days.map(d => enforceDayDurationBudget(d, totalBudgetSeconds))

  return { plan: budgetedDays, constraint_trace: trace }
}

// ---------------------------------------------------------------------------
// 4-WEEK PERIODIZED MESOCYCLE (preserved)
// ---------------------------------------------------------------------------

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
    activation: 'tier_0_primer',
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
  if (profile.equipment_access === 'bodyweight') {
    sequence = restrictPhaseSequence(sequence, BODYWEIGHT_ALLOWED_PHASES)
  }
  // Any of the restrictions above (experience, goal, equipment) can each
  // independently be safe on their own and still stack into two identical
  // adjacent blocks — a novice's power->strength remap landing right after
  // an already-'strength' block 3 produced exactly that ("Blocks 3 and 4 are
  // both 'Maximal Strength'... an identical, duplicated block"). Final pass,
  // after every restriction has applied.
  sequence = dedupeAdjacentPhases(sequence)
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

  sequence.forEach((phase, blockIndex) => {
    const phaseConfig = getPhaseConfig(phase)

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
      const exercises = day.exercises.map(ex => {
        const rotated = rotateVariation(ex.name, blockIndex, pool, experience, usedNamesThisDay)
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
        const reps = newEntry ? assignSetsRepsFromConfig(newEntry, styleConfig, expConfig).reps : ex.reps
        return { ...ex, name: rotated, reps }
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
          const weeklyName = tier === 'accessory'
            ? rotateVariation(ex.name, Math.floor((w - 1) / policy.accessoryRotationWeeks), pool, experience, usedWeeklyNames)
            : ex.name
          if (tier === 'accessory') usedWeeklyNames.add(weeklyName)

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
            ? assignSetsRepsFromConfig(dbEntry, styleConfig, expConfig).reps
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
          // goal: 'reps' ramps the rep target the same way, 'load' ramps
          // weight instead (see forceStartingWeightKg below), 'maintain'
          // ramps neither.
          const isBodyweight = !!dbEntry && !isPrimer && !isExternallyLoaded(dbEntry)
          const rampReps = isBodyweight || policy.progressionEmphasis === 'reps'
          const rampLoad = !isBodyweight && policy.progressionEmphasis === 'load'
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
            const increment = getLoadIncrementKg(dbEntry, category)

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
            if (baselineKg != null) {
              if (w === 2) forceStartingWeightKg = rampLoad ? baselineKg + increment : baselineKg
              else if (w === 3) forceStartingWeightKg = rampLoad ? baselineKg + 2 * increment : baselineKg
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
              repRangeLabel: reps,
            })

            if (w === 1) blockBaselineKg[dayIdx][exIdx] = load.starting_weight_kg
            if (w === 3) blockWeek3Kg[dayIdx][exIdx] = load.starting_weight_kg
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
            per_set_load: load ? load.per_set : (ex.per_set_load ?? null),
            movement_pattern: dbEntry ? mapMovementPattern(dbEntry.movement_pattern) : undefined,
            tier: dbEntry ? mapTier(dbEntry.mechanics_tier) : undefined,
            fatigue_cost: dbEntry ? deriveFatigueCost(dbEntry) : undefined,
            prescription_type: dbEntry?.prescription_type ?? ex.prescription_type,
          }
        })

        // Per-exercise role clamping bounds each slot independently but
        // can't see its day-mates — a 3-set (floor) main next to a 4-set
        // (ceiling) accessory both pass their own clamp yet still invert the
        // hierarchy. This closes that gap. Skipped on deload weeks, where
        // the main lift itself is deliberately at its lowest point.
        return { ...day, exercises: isDeload ? exercises : enforceSetHierarchy(exercises) }
      })

      // Deload weeks are SUPPOSED to run short (half volume, by design) — a
      // filler there would fight the whole point of the recovery week, so
      // this only applies to loading weeks.
      if (!isDeload) {
        applyDurationFiller(days, profile, policy, totalBudgetSeconds)
      }

      weeks.push({
        week_number: weekCounter,
        block_number: blockIndex + 1,
        week_in_block: w,
        phase_label: phaseConfig.label,
        phase_focus: phaseConfig.focus,
        is_deload: isDeload,
        isCalibrationWeek,
        coach_note: isDeload
          ? 'Deload week — volume is deliberately cut so you arrive at the next block recovered. Resist the urge to push.'
          // The goal's own framing shows once per block, alongside the
          // phase's — repeating it every week would bury the phase-specific
          // note under the same paragraph four times over.
          : w === 1
            ? `${phaseConfig.coach_note} ${policy.coachNote}`
            : phaseConfig.coach_note,
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
