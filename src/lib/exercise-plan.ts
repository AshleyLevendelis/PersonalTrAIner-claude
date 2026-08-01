import type {
  UserProfile, WorkoutDay, Exercise, FitnessGoal, SessionDuration,
  WorkoutSplit, RecommendedCardio, MesocycleWeek, ExerciseTier,
  FatigueCost, MesocycleMovementPattern, EquipmentAccess, TrainingStyle,
  ConstraintTrace, ConstraintTraceEntry, PlanResult, TrainingExperience,
} from './types'
import { EXERCISE_DATABASE, getMovementFamily, type ExerciseEntry, type MovementPattern, type AngleVector } from './exercise-db'
import {
  getExperienceConfig, getSkillDemand, isSkillAppropriate, applyRepFloor,
  type ExperienceConfig,
} from './experience-config'
import { buildWarmup, getWarmupReserveSeconds } from './warmup'
import { prescribeLoad, categorize, getLoadIncrementKg, isExternallyLoaded, type KnownWorkingWeights } from './load-prescription'
import {
  getPhaseSequence, getPhaseConfig, rotateVariation, resolveTargetRpe,
  shiftReps, adjustRest,
} from './periodization'

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

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

function getDurationBudgetSeconds(duration: SessionDuration): number {
  switch (duration) {
    case '30-45': return 37 * 60
    case '45-60': return 52 * 60
    case '60-90': return 75 * 60
    case '90+': return 100 * 60
    default: return 52 * 60
  }
}

function estimateSessionDuration(exercises: { entry: ExerciseEntry; sets: number; restSeconds: number }[]): number {
  let total = 0
  for (const ex of exercises) {
    total += ex.sets * (ex.entry.avg_duration_seconds + ex.restSeconds)
  }
  return total
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
  let estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, restSeconds: e.restSeconds })))

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

  estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, restSeconds: e.restSeconds })))
  if (estimated <= budgetSeconds) return dayExercises

  // Phase 2: Reduce rest by 15s across the board
  for (let i = 0; i < dayExercises.length; i++) {
    const newRest = Math.max(30, dayExercises[i].restSeconds - 15)
    dayExercises[i] = { ...dayExercises[i], restSeconds: newRest, rest: `${newRest}s` }
  }

  estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, restSeconds: e.restSeconds })))
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
    estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, restSeconds: e.restSeconds })))
  }

  // Phase 4: Only as last resort, remove lowest-tier exercises from the end
  while (estimated > budgetSeconds && dayExercises.length > 3) {
    const removed = dayExercises.pop()!
    trace.time_cap_adjusted.push({
      exercise: removed.entry.name,
      stage: 'time_cap',
      reason: `dropped entirely — still over ${Math.round(budgetSeconds / 60)}min budget after superset conversion and set reduction`,
    })
    estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, restSeconds: e.restSeconds })))
  }

  // Phase 5: At the three-exercise floor and still over. Rather than stripping
  // the session down to one or two movements, trim sets across the board —
  // a short session should mean fewer sets, not a session missing whole
  // movement patterns. Two working sets is the floor; below that there is no
  // meaningful stimulus.
  for (let pass = 0; pass < 4 && estimated > budgetSeconds; pass++) {
    let trimmed = false
    // Trim the biggest time consumers first.
    const order = dayExercises
      .map((e, i) => ({ i, cost: e.sets * (e.entry.avg_duration_seconds + e.restSeconds) }))
      .sort((a, b) => b.cost - a.cost)

    for (const { i } of order) {
      if (estimated <= budgetSeconds) break
      if (dayExercises[i].sets <= 2) continue
      dayExercises[i] = { ...dayExercises[i], sets: dayExercises[i].sets - 1 }
      trimmed = true
      trace.time_cap_adjusted.push({
        exercise: dayExercises[i].entry.name,
        stage: 'time_cap',
        reason: `reduced to ${dayExercises[i].sets} sets — session budget is tight at ${Math.round(budgetSeconds / 60)}min`,
      })
      estimated = estimateSessionDuration(dayExercises.map(e => ({ entry: e.entry, sets: e.sets, restSeconds: e.restSeconds })))
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

function getExerciseCountForDuration(duration: SessionDuration): { tier1: number; tier2: number; tier3: number } {
  switch (duration) {
    case '30-45': return { tier1: 1, tier2: 2, tier3: 1 }
    case '45-60': return { tier1: 1, tier2: 2, tier3: 2 }
    case '60-90': return { tier1: 1, tier2: 3, tier3: 2 }
    case '90+': return { tier1: 1, tier2: 4, tier3: 3 }
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

function selectExercisesForTrack(
  track: TrackDefinition,
  pool: ExerciseEntry[],
  counts: { tier1: number; tier2: number; tier3: number },
  weeklyUsed: Set<string>,
  styleConfig: StyleConfig,
  feasibleRequiredPatterns?: MovementPattern[],
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
  // cannot appear twice under two different classifications.
  const usedGroups = new Set<string>()
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

    const refill = (respectFamilies: boolean) => {
      const candidates = shuffle(
        trackPool.filter(e =>
          e.mechanics_tier !== 'primer' &&
          !selected.some(s => s.name === e.name) &&
          (!respectFamilies || !usedGroups.has(getMovementFamily(e)))
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
    refill(true)
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
  // Primers and time/distance-based work are not scaled — a 30-second plank is
  // a 30-second plank regardless of how long you have been training, and
  // trimming warm-up sets for a beginner would be exactly backwards.
  if (entry.mechanics_tier === 'primer') {
    return { sets: 2, reps: '5', rest: '30s', restSeconds: 30 }
  }

  const isCore = ['core', 'carry'].includes(entry.movement_pattern)
  if (isCore && entry.movement_pattern === 'core') {
    return { sets: 3, reps: '30-45s', rest: '45s', restSeconds: 45 }
  }
  if (entry.movement_pattern === 'carry') {
    return { sets: 3, reps: '40m', rest: '60s', restSeconds: 60 }
  }

  // A beginner never drops below 2 working sets — one set is not a stimulus.
  const scaleSets = (base: number) =>
    Math.max(2, Math.round(base * experience.sets_multiplier))

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

function assignConditioningNotes(days: WorkoutDay[], profile: UserProfile): void {
  const duration = profile.session_duration_preference || '45-60'
  const isTimeLimited = duration === '30-45'
  const goal = profile.fitness_goal

  const heavyTrackDays = new Set(['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Legs & Calves', 'Full Body Power'])
  const allDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const trainingDayNames = new Set(days.map(d => d.day))
  const restDayNames = allDayNames.filter(d => !trainingDayNames.has(d))

  const cardioForGoal = getConditioningProfile(goal)

  for (const day of days) {
    const isHeavy = heavyTrackDays.has(day.focus)

    if (day.focus === 'Conditioning & Core') {
      day.conditioning_note = cardioForGoal.dedicatedDay.activity
      day.recommendedCardio = {
        ...cardioForGoal.dedicatedDay,
        timing: 'post_session',
        reason: 'Dedicated conditioning day -- full session devoted to metabolic work.',
      }
      continue
    }

    if (isTimeLimited) {
      if (!isHeavy) {
        day.recommendedCardio = {
          ...cardioForGoal.independentBlock,
          timing: 'independent_session',
          reason: 'Scheduled as a separate session to preserve your strict lifting window.',
        }
        day.conditioning_note = `Independent session: ${cardioForGoal.independentBlock.activity} (${cardioForGoal.independentBlock.duration} min)`
      }
      continue
    }

    if (!isHeavy) {
      day.conditioning_note = `${cardioForGoal.postSession.activity} (${cardioForGoal.postSession.duration} min post-session)`
      day.recommendedCardio = {
        ...cardioForGoal.postSession,
        timing: 'post_session',
        reason: 'Appended after main lifts on a lighter training day.',
      }
    } else {
      day.conditioning_note = `${cardioForGoal.heavyDayBrief.activity} (${cardioForGoal.heavyDayBrief.duration} min)`
      day.recommendedCardio = {
        ...cardioForGoal.heavyDayBrief,
        timing: 'post_session',
        reason: 'Brief conditioning post-lift to avoid interference with heavy compound work.',
      }
    }
  }

  const maxRestDayCardio = goal === 'fat_loss' ? 3 : goal === 'conditioning' ? 2 : 1
  const restDaysToFill = restDayNames.slice(0, maxRestDayCardio)

  for (const restDay of restDaysToFill) {
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
    time_cap_adjusted: [], exclusion_filtered: [],
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
  const availableDays = profile.training_days.filter(d => d.available)
  const splitPref = profile.workout_split_preference || 'ai_recommendation'
  const split = getSplitForDays(availableDays.length, profile.fitness_goal, splitPref, trainingStyle)

  const needsConditioningIntegration =
    profile.fitness_goal === 'fat_loss' ||
    profile.fitness_goal === 'conditioning'

  const weeklyUsed = new Set<string>()
  const allSelectedNames = new Set<string>()

  const days: WorkoutDay[] = availableDays.map((day, index) => {
    const rawTrack = split[index % split.length]
    const trackFocus = getViableTrack(rawTrack, pool)
    const track = TRACKS[trackFocus]

    const { primer, main } = selectExercisesForTrack(track, pool, counts, weeklyUsed, styleConfig, feasiblePatterns)

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
      exercises: paired,
      warmup,
    }
  })

  if (needsConditioningIntegration) {
    assignConditioningNotes(days, profile)
  }

  return { plan: days, constraint_trace: trace }
}

// ---------------------------------------------------------------------------
// 4-WEEK PERIODIZED MESOCYCLE (preserved)
// ---------------------------------------------------------------------------

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

function mapMovementPattern(pattern: MovementPattern): MesocycleMovementPattern {
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

function mapTier(mechanicsTier: string): ExerciseTier {
  const mapping: Record<string, ExerciseTier> = {
    tier1_compound: 'tier_1_primary',
    tier2_compound: 'tier_2_secondary',
    tier3_isolation: 'tier_3_isolation',
    activation: 'tier_0_primer',
  }
  return mapping[mechanicsTier] || 'tier_3_isolation'
}

function deriveFatigueCost(entry: ExerciseEntry): FatigueCost {
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

export function generateMesocycle(
  profile: UserProfile,
  baseWorkout?: WorkoutDay[],
  exclusions: string[] = [],
): MesocycleWeek[] {
  const baseWeek = baseWorkout ?? generateExercisePlan(profile, exclusions).plan
  const goal = (profile.fitness_goal || 'hypertrophy') as FitnessGoal
  const experience = profile.training_experience || 'novice'
  const expConfig = getExperienceConfig(experience)
  const pool = getConstrainedPool(profile, exclusions)

  const sequence = getPhaseSequence(goal, experience)
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
    const blockDays = baseWeek.map(day => ({
      ...day,
      exercises: day.exercises.map(ex => ({
        ...ex,
        name: rotateVariation(ex.name, blockIndex, pool, experience),
      })),
    }))

    // Double progression's within-block memory: each exercise's week-1
    // ("baseline") load, keyed by [dayIndex][exerciseIndex] — weeks 2-3 are
    // that SAME number plus fixed increments, not independently re-estimated,
    // and the deload is a fraction of week 3. Reset every block since a new
    // block means a new baseline (and possibly a rotated variation).
    const blockBaselineKg: (number | null)[][] = blockDays.map(day => day.exercises.map(() => null))

    // Rotation tier per (day, exercise) — fixed for the whole block; only an
    // accessory's specific variation moves within it (see fortnightOffset).
    const rotationTiers: RotationTier[][] = blockDays.map(day => classifyRotationTiers(day.exercises))

    for (let w = 1; w <= 4; w++) {
      weekCounter++
      const isDeload = w === 4

      // The very first week of the whole mesocycle, for a trainee who told
      // onboarding they don't know their numbers — not repeated per block,
      // since calibration is a one-time "find the weight" exercise, not a
      // recurring one.
      const isCalibrationWeek = weekCounter === 1 && profile.skip_calibration_week !== true

      const days: WorkoutDay[] = blockDays.map((day, dayIdx) => {
        const exercises: Exercise[] = day.exercises.map((ex, exIdx) => {
          // Accessories rotate on a 2-week sub-cycle within the block (weeks
          // 1-2 stay on the block's starting variation, weeks 3-4 move one
          // step further through the same constrained-pool candidate list
          // rotateVariation() already builds for block-boundary rotation —
          // same substitution group, same tier, skill-appropriate, never a
          // downgrade). Main lifts and core/carry work stay on whatever the
          // block-level rotation above picked, for the whole block.
          const tier = rotationTiers[dayIdx][exIdx]
          const weeklyName = tier === 'accessory'
            ? rotateVariation(ex.name, w <= 2 ? 0 : 1, pool, experience)
            : ex.name

          // Sets stay near-constant across the three loading weeks of a
          // block — load is the progression lever below, not set count. The
          // deload is the one week that deliberately drops both.
          const sets = isDeload
            ? Math.max(2, Math.round(ex.sets * 0.5))
            : Math.max(2, Math.round(ex.sets * phaseConfig.sets_multiplier))

          const dbEntry = EXERCISE_DATABASE.find(
            e => e.name.toLowerCase() === weeklyName.toLowerCase()
          )
          const isPrimer = dbEntry?.mechanics_tier === 'primer'
          const category = dbEntry ? categorize(dbEntry) : null

          // No externally loaded weight to ramp (true bodyweight movement, or
          // one prescribeLoad can't categorize) — progress these via reps
          // instead: one extra rep-range notch per week within the block.
          // The deload keeps the existing, larger "easier" notch either way.
          const isBodyweightProgression = !!dbEntry && !isPrimer && !isExternallyLoaded(dbEntry)
          const repShift = isDeload
            ? phaseConfig.rep_shift + 2
            : phaseConfig.rep_shift + (isBodyweightProgression ? w - 1 : 0)
          const restShift = isDeload ? 0 : phaseConfig.rest_adjust_seconds
          const reps = shiftReps(ex.reps, repShift, expConfig.min_reps)

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
            // apply there). Weeks 2-3 are that exact baseline plus one/two
            // fixed increments — not a fresh, independently RPE-scaled
            // estimate, which is what made load look flat despite sets
            // climbing. The deload is 65-75% of week 3's number.
            //
            // For an accessory that rotates variation at the week-3 fortnight
            // boundary, the baseline number still carries over from week 1's
            // (different) variation — rotateVariation only offers same
            // substitution-group/tier candidates, so the magnitude stays
            // reasonable — but `increment` above is recomputed for whichever
            // variation is actually being lifted this week.
            let forceStartingWeightKg: number | undefined
            if (baselineKg != null) {
              if (w === 2) forceStartingWeightKg = baselineKg + increment
              else if (w === 3) forceStartingWeightKg = baselineKg + 2 * increment
              else if (isDeload) forceStartingWeightKg = (baselineKg + 2 * increment) * 0.7
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
          }

          return {
            ...ex,
            name: weeklyName,
            sets,
            reps,
            rest: adjustRest(ex.rest, restShift),
            intensity,
            load_guidance: load ? `${expConfig.load_guidance} ${load.basis}` : ex.load_guidance,
            suggested_load: load ? load.display : ex.suggested_load,
            suggested_load_kg: load ? load.starting_weight_kg : ex.suggested_load_kg,
            per_set_load: load ? load.per_set : (ex.per_set_load ?? null),
            movement_pattern: dbEntry ? mapMovementPattern(dbEntry.movement_pattern) : undefined,
            tier: dbEntry ? mapTier(dbEntry.mechanics_tier) : undefined,
            fatigue_cost: dbEntry ? deriveFatigueCost(dbEntry) : undefined,
          }
        })

        return { ...day, exercises }
      })

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
