import type {
  UserProfile, WorkoutDay, Exercise, FitnessGoal, SessionDuration,
  WorkoutSplit, RecommendedCardio, MesocycleWeek, ExerciseTier,
  FatigueCost, MesocycleMovementPattern, EquipmentAccess, TrainingStyle,
  ConstraintTrace, ConstraintTraceEntry, PlanResult,
} from './types'
import { EXERCISE_DATABASE, type ExerciseEntry, type MovementPattern, type AngleVector } from './exercise-db'

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

function stageStyleFilter(
  pool: ExerciseEntry[],
  style: TrainingStyle,
  trace: ConstraintTrace
): ExerciseEntry[] {
  const result: ExerciseEntry[] = []
  for (const ex of pool) {
    if (ex.style_tags.includes(style)) {
      result.push(ex)
    } else {
      trace.style_filtered.push({
        exercise: ex.name,
        stage: 'style',
        reason: `exercise tags [${ex.style_tags.join(', ')}] do not include '${style}'`,
      })
    }
  }
  trace.pool_size_after_each_stage.style = result.length
  return result
}

// ---------------------------------------------------------------------------
// STAGE 4: Time-cap density optimization
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
    if (!entryA || entryA.mechanics_tier === 'primer') continue

    const opposing = getOpposingPattern(entryA.movement_pattern)
    if (!opposing) continue

    for (let j = i + 1; j < result.length; j++) {
      if (paired.has(j)) continue
      const entryB = pool.find(e => e.name === result[j].name)
      if (!entryB || entryB.mechanics_tier === 'primer') continue

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

  // Phase 1: Convert to antagonist supersets (halves rest between paired exercises)
  const paired = new Set<number>()
  for (let i = 0; i < dayExercises.length; i++) {
    if (paired.has(i)) continue
    const opposing = getOpposingPattern(dayExercises[i].entry.movement_pattern)
    if (!opposing) continue
    for (let j = i + 1; j < dayExercises.length; j++) {
      if (paired.has(j)) continue
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

  const usedGroups = new Set<string>()
  const selected: ExerciseEntry[] = []

  function pickFromTier(tier: string, count: number, patterns: MovementPattern[]) {
    const candidates = shuffle(
      trackPool.filter(e =>
        e.mechanics_tier === tier &&
        patterns.includes(e.movement_pattern) &&
        !weeklyUsed.has(e.name) &&
        !selected.some(s => s.name === e.name) &&
        !usedGroups.has(e.substitution_group)
      )
    )
    for (const c of candidates) {
      if (selected.length >= counts.tier1 + counts.tier2 + counts.tier3) break
      if (count <= 0) break
      selected.push(c)
      usedGroups.add(c.substitution_group)
      count--
    }
    return count
  }

  pickFromTier('tier1_compound', counts.tier1, track.primary_patterns)
  pickFromTier('tier2_compound', counts.tier2, [...track.primary_patterns, ...track.secondary_patterns])
  pickFromTier('tier3_isolation', counts.tier3, track.secondary_patterns)

  // Ensure required patterns are present
  for (const reqPattern of track.required_patterns) {
    if (!selected.some(e => e.movement_pattern === reqPattern)) {
      const fill = trackPool.find(e =>
        e.movement_pattern === reqPattern &&
        !selected.some(s => s.name === e.name) &&
        !usedGroups.has(e.substitution_group)
      )
      if (fill) {
        selected.push(fill)
        usedGroups.add(fill.substitution_group)
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
          !usedGroups.has(e.substitution_group)
        )
        
        if (fill) {
          selected.push(fill)
          usedGroups.add(fill.substitution_group)
        } else {
          // PASS 2: Relaxed search (allow reusing substitution groups)
          const relaxedFill = pool.find(e =>
            e.movement_pattern === reqPattern &&
            !selected.some(s => s.name === e.name) &&
            !forbidden.has(e.movement_pattern)
          )
          
          if (relaxedFill) {
            selected.push(relaxedFill)
            usedGroups.add(relaxedFill.substitution_group)
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

function assignSetsRepsFromConfig(entry: ExerciseEntry, config: StyleConfig): { sets: number; reps: string; rest: string; restSeconds: number } {
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

  switch (entry.mechanics_tier) {
    case 'tier1_compound':
      return {
        sets: config.setRange.tier1,
        reps: config.repRange.tier1,
        rest: `${config.restSeconds.tier1}s`,
        restSeconds: config.restSeconds.tier1,
      }
    case 'tier2_compound':
      return {
        sets: config.setRange.tier2,
        reps: config.repRange.tier2,
        rest: `${config.restSeconds.tier2}s`,
        restSeconds: config.restSeconds.tier2,
      }
    default:
      return {
        sets: config.setRange.tier3,
        reps: config.repRange.tier3,
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

function getViableTrack(
  candidate: TrackFocus,
  pool: ExerciseEntry[],
): TrackFocus {
  const t = TRACKS[candidate]
  const allPatterns = [...t.primary_patterns, ...t.secondary_patterns]
  const forbidden = new Set(t.forbidden_patterns)

  const available = pool.filter(e =>
    allPatterns.includes(e.movement_pattern) &&
    !forbidden.has(e.movement_pattern) &&
    e.mechanics_tier !== 'primer'
  ).length

  const requiredOk = t.required_patterns.every(rp =>
    pool.some(e => e.movement_pattern === rp && !forbidden.has(e.movement_pattern))
  )

  if (available >= 3 && requiredOk) return candidate
  if (candidate !== 'Full Body Power') return getViableTrack('Full Body Power', pool)
  return candidate
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

export function generateExercisePlan(profile: UserProfile, exclusions: string[] = []): PlanResult {
  const trace: ConstraintTrace = {
    equipment_filtered: [],
    injury_filtered: [],
    style_filtered: [],
    time_cap_adjusted: [],
    exclusion_filtered: [],
    pool_size_after_each_stage: { equipment: 0, injury: 0, style: 0, final: 0 },
  }

  const trainingStyle: TrainingStyle = profile.training_style || 'hybrid'
  const styleConfig = STYLE_CONFIGS[trainingStyle]
  const duration = profile.session_duration_preference || '45-60'
  const budgetSeconds = getDurationBudgetSeconds(duration)
  const counts = getExerciseCountForDuration(duration)

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
      const sr = assignSetsRepsFromConfig(primer, styleConfig)
      daySlots.push({ entry: primer, ...sr })
    }

    for (const entry of main) {
      weeklyUsed.add(entry.name)
      allSelectedNames.add(entry.name)
      const sr = assignSetsRepsFromConfig(entry, styleConfig)
      daySlots.push({ entry, ...sr })
    }

    // STAGE 4: Time-cap optimization per day
    const optimized = stageTimeCap(daySlots, budgetSeconds, trainingStyle, trace)

    // Convert to Exercise objects
    const exercises: Exercise[] = optimized.map(slot => ({
      name: slot.entry.name,
      sets: slot.sets,
      reps: slot.reps,
      rest: slot.rest,
      substitution: getSubstitution(slot.entry, pool, allSelectedNames),
    }))

    // Build superset pairings
    const paired = buildSupersetPairs(exercises, pool, duration, trainingStyle, trace)

    return {
      day: day.day,
      focus: trackFocus,
      exercises: paired,
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

export function generateMesocycle(profile: UserProfile, baseWorkout?: WorkoutDay[]): MesocycleWeek[] {
  const baseWeek = baseWorkout ?? generateExercisePlan(profile).plan
  const goal = (profile.fitness_goal || 'hypertrophy') as FitnessGoal

  const weeks: MesocycleWeek[] = []
  for (let w = 1; w <= 4; w++) {
    const days = baseWeek.map((day) => {
      const modifiedDay = applyWeekModifiers(day, w, goal)
      const exercises = modifiedDay.exercises.map((ex) => {
        const dbEntry = EXERCISE_DATABASE.find(
          (e) => e.name.toLowerCase() === ex.name.toLowerCase()
        )
        return {
          ...ex,
          movement_pattern: dbEntry ? mapMovementPattern(dbEntry.movement_pattern) : undefined,
          tier: dbEntry ? mapTier(dbEntry.mechanics_tier) : undefined,
          fatigue_cost: dbEntry ? deriveFatigueCost(dbEntry) : undefined,
        }
      })
      return { ...modifiedDay, exercises }
    })
    weeks.push({
      week_number: w,
      label: MESOCYCLE_WEEK_LABELS[w - 1],
      days,
    })
  }
  return weeks
}

export { MESOCYCLE_WEEK_LABELS }
