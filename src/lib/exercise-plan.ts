import type {
  UserProfile, WorkoutDay, Exercise, FitnessGoal, SessionDuration,
  WorkoutSplit, RecommendedCardio, MesocycleWeek, ExerciseTier,
  FatigueCost, MesocycleMovementPattern, EquipmentAccess, TrainingStyle,
  ConstraintTrace, ConstraintTraceEntry, PlanResult, TrainingExperience,
} from './types'
import { EXERCISE_DATABASE, getMovementFamily, getVolumeRole, meetsCapabilityRequirement, getExerciseId, contraindicatedJoints, isContraindicatedFor, isIndicatedFor, isBandEquipped, jointListDisplay, NEAREST_PATTERN_FALLBACK, type ExerciseEntry, type MovementPattern, type AngleVector, type VolumeRole } from './exercise-db'
import {
  getExperienceConfig, getSkillDemand, isSkillAppropriate, applyRepFloor,
  type ExperienceConfig,
} from './experience-config'
import { buildWarmup, getWarmupReserveSeconds } from './warmup'
import { prescribeLoad, prescribeAddedLoad, categorize, getLoadIncrementKg, isExternallyLoaded, getEquipmentFloorKg, loadingMode, roundToPlate, formatLoad, labelModeForEntry, hasKnownWorkingWeight, unverifiedRampStepKg, isolationTargetBelowFloor, resolveBodyBasis, prescribeAssistance, assistanceGuidance, isImprovisedLoadImplement, IMPROVISED_IMPLEMENT_CEILING_KG, type KnownWorkingWeights } from './load-prescription'
import {
  getPhaseSequence, getPhaseConfig, rotateVariation, resolveTargetRpe,
  shiftReps, adjustRest, dedupeAdjacentPhases, isRegressionFor, stepIntervalSeconds, getPhaseTempo, formatTempo, type PhaseConfig, type TrainingPhase,
} from './periodization'
import { getGoalPolicy, restrictPhaseSequence, resolveConditioningFrequency, RECOVERY_SET_MULTIPLIER, MAIN_LIFT_REST_FLOOR_SECONDS, type GoalPolicy } from './goal-policies'
import { dayAnchorExercise, anchorScore } from './session-derive'
import { isStartingOut, applyStartingOut, startingOutActivity } from './starting-out'
import { getDurationBudgetSeconds, getSessionMinimumSeconds, getSessionMaximumSeconds, getSteadyStateSeconds, DEFAULT_CARRY_DISTANCE_M, estimateDaySeconds, estimateSlotsSeconds, parseRestSeconds, SESSION_OVERHEAD_SECONDS } from './session-duration'
import { implausibleLifts } from './lift-plausibility'

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
    secondary_patterns: ['isolation_bicep', 'isolation_hamstring', 'isolation_trap', 'core'],
    forbidden_patterns: ['isolation_tricep', 'horizontal_push', 'vertical_push'],
    primer_patterns: ['horizontal_pull', 'vertical_pull', 'hip_hinge'],
    required_patterns: ['hip_hinge'],
    slots: [
      { patterns: ['hip_hinge'], tier: 'tier1_compound', required: true },
      { patterns: ['vertical_pull'], tier: 'tier2_compound', required: true },
      { patterns: ['horizontal_pull'], tier: 'tier2_compound', required: true },
      { patterns: ['isolation_bicep'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_hamstring'], tier: 'tier3_isolation', required: false },
      // Where shrugs live now. Splitting isolation_trap out of
      // isolation_shoulder took away the (push-day) slot they used to fill;
      // a fix that left them unreachable would be worse than the bug.
      { patterns: ['isolation_trap'], tier: 'tier3_isolation', required: false },
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
    // isolation_shoulder here is REAR-delt work on a pull day, which is
    // ordinary. It could already serve a shrug too — correctly, but by the
    // same accident that made 'Push & Press' serve one incorrectly. The two
    // are now separate slots that each mean what they say.
    secondary_patterns: ['core', 'isolation_bicep', 'isolation_shoulder', 'isolation_trap'],
    forbidden_patterns: ['isolation_tricep', 'horizontal_push'],
    primer_patterns: ['vertical_pull', 'horizontal_pull'],
    required_patterns: ['core'],
    slots: [
      { patterns: ['vertical_pull'], tier: 'tier1_compound', required: true },
      { patterns: ['horizontal_pull'], tier: 'tier2_compound', required: true },
      { patterns: ['isolation_bicep'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_shoulder'], tier: 'tier3_isolation', required: false },
      { patterns: ['isolation_trap'], tier: 'tier3_isolation', required: false },
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
    // NO isolation_trap slot here, despite a dedicated back day being the
    // textbook home for shrugs. Measured: swapping the second bicep slot for
    // one put this track's 30-45min sessions at 43min against a 37min budget
    // — 4 duration failures in an audit that was otherwise at zero. This
    // track is already at its time ceiling at the short tier, and shrugs have
    // two other homes ('Pull & Hinge', 'Upper Pull & Core') carrying 54 of
    // their 66 measured placements. Worth revisiting if this track's budget
    // ever loosens; not worth buying with a duration overrun.
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

/**
 * The same pattern set selectExercisesForTrack's primer filter matches
 * against, exported so quality-score.ts's primerFit dimension can check a
 * chosen primer's fit without re-deriving (and risking drift from) this
 * track's real primer_patterns. `focus` is a WorkoutDay.focus string, which
 * is always a TrackFocus value at runtime — returns [] for anything else
 * (a rest/off day, or a focus this map doesn't know) rather than throwing.
 */
export function primerPatternsForTrack(focus: string): MovementPattern[] {
  return TRACKS[focus as TrackFocus]?.primer_patterns ?? []
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
// Equipment QUALITY — how well an implement loads a working set
// ---------------------------------------------------------------------------
// EQUIPMENT_SETS above answers "can they physically do this?". This answers
// the separate question "is this the best tool they own for the job?", which
// nothing asked until now: equipment was a filter and never a preference, so
// for a full-gym trainee a resistance band and a cable stack scored
// IDENTICALLY in a tricep slot and the pick came down to the +/-0.3 jitter.
// That is the whole mechanism behind "why is there a band in my full gym" —
// not a broken filter, just an absent preference.
//
// Deliberately keyed on the IMPLEMENT, not on exercise names. The existing
// REGRESSION_VARIATIONS list (periodization.ts) demotes easier variants by
// hardcoded name, which means every exercise added later starts unranked;
// keying on equipment means a new band exercise is ranked correctly the day
// it's added, with no list to maintain.
//
// NOT a blacklist. A band is the right answer often — see the injury note on
// scoreCandidate's equipment_fit factor: injury filtering runs BEFORE
// scoring, so when a shoulder rules out pushdowns the band is the only
// survivor and wins regardless of this rank.
//
// Absent from this map = unranked = contributes nothing:
//   - accessories that aren't the loading implement at all ('bench',
//     'incline bench', 'squat rack', 'box', 'farmer handles')
//   - cardio machines ('treadmill', 'rowing machine', 'stationary bike',
//     'elliptical machine', 'battle ropes', 'jump rope') — these are picked
//     by the cardio reservation, not ranked against strength implements, and
//     ranking a treadmill against a barbell is a category error.
// Both cases fall through to a 0 contribution rather than a low one, so an
// unranked entry is never quietly penalised for being unranked.
const EQUIPMENT_QUALITY: Record<string, 'high' | 'medium' | 'low'> = {
  // Externally loaded in fine increments — the tools a working set is
  // actually built on.
  barbell: 'high',
  'EZ bar': 'high',
  'trap bar': 'high',
  't-bar': 'high',
  'cable machine': 'high',
  machine: 'high',
  'leg press machine': 'high',
  'hack squat machine': 'high',
  'assisted pull-up machine': 'high',
  // 'dumbbells' (two implements, one per hand) and 'dumbbell' (ONE implement,
  // held centrally) are listed SEPARATELY and deliberately. They are not a
  // typo for each other: loadingMode() (load-prescription.ts:415) reads that
  // distinction to decide whether to halve the prescribed weight and label it
  // "per hand". Collapsing them doubles the prescribed load on goblet squats,
  // carries and swings, and TypeScript cannot catch it because both are
  // string[]. They rank the same here, which costs nothing — but they must
  // stay two keys.
  dumbbells: 'high',
  dumbbell: 'high',
  kettlebell: 'high',
  'dip bars': 'high',
  'pull-up bar': 'high',
  // Real training tools whose load is fixed, coarse, or capped by the
  // trainee's own mass.
  bodyweight: 'medium',
  'ab wheel': 'medium',
  'medicine ball': 'medium',
  'plyo box': 'medium',
  // Loadable, but by an accommodating resistance curve (lightest exactly
  // where a muscle is strongest) or in crude, unrepeatable increments.
  'resistance band': 'low',
  'weighted backpack': 'low',
}

/**
 * The best-ranked implement this exercise actually uses, or null when none of
 * its equipment is ranked (pure cardio, or an accessory-only entry).
 *
 * Takes the MAXIMUM rather than the minimum because the equipment array means
 * two different things depending on `equipment_alternatives`: with the flag
 * it's a list of interchangeable options (['barbell','dumbbells'] — either
 * works), without it every item is required (['dumbbells','bench'] — the
 * bench is furniture, not the load). Max is right in both readings: the best
 * option they'd choose, or the primary implement rather than its furniture.
 */
export function bestEquipmentRank(entry: ExerciseEntry): 'high' | 'medium' | 'low' | null {
  let best: 'high' | 'medium' | 'low' | null = null
  for (const eq of entry.equipment) {
    const rank = EQUIPMENT_QUALITY[eq]
    if (!rank) continue
    if (rank === 'high') return 'high'
    if (rank === 'medium' || best === null) best = rank
  }
  return best
}

/**
 * Two places where "the band is a compromise" is simply false, so the
 * preference must not apply — Ashley's ruling, after a full-grid measurement
 * showed the first draft demoting both:
 *
 * 1. REHAB WORK (`indicated_joints` non-empty). A banded terminal knee
 *    extension is prescribed for a knee BECAUSE of the band's accommodating
 *    resistance — light where the joint is vulnerable, building as it
 *    straightens. Ranking it below an unloaded quad set inverted the point of
 *    the exercise: measured at a 90% drop (1637 -> 162 appearances across the
 *    grid) before this exemption existed.
 * 2. CORE WORK (`movement_pattern === 'core'`). Anti-rotation and
 *    anti-extension work isn't judged by how much load an implement carries —
 *    the resistance of a band or cable IS the exercise. Pallof Press is the
 *    clearest case: its equipment reads ['resistance band'] only because the
 *    array is AND-ed during filtering, so tagging the cable too would have
 *    narrowed it to full-gym-only (see its own comment in exercise-db.ts) —
 *    its form cues literally say "band or cable". The tag is an availability
 *    floor, not a claim about the right tool, and reading it as the latter
 *    cost it 29% of its appearances.
 *
 * Applied to the CANDIDATE, which makes it symmetric where it matters: every
 * candidate in a core slot scores 0 here, so core selection is left exactly
 * as it was rather than being re-ranked by implement.
 */
export function isEquipmentQualityExempt(entry: ExerciseEntry): boolean {
  return entry.movement_pattern === 'core' || (entry.indicated_joints?.length ?? 0) > 0
}

/**
 * Tiers where preferring the better implement is a real choice.
 *
 * `bodyweight` is excluded outright: that trainee owns bodyweight, a pull-up
 * bar and a backpack, so a band-style "make do" option genuinely IS their
 * best available tool and demoting it would be demoting the only thing they
 * have. Every other tier owns dumbbells or better, so the preference has
 * something to prefer.
 */
export const EQUIPMENT_QUALITY_TIERS = new Set<EquipmentAccess>(['full_gym', 'home_gym', 'minimalist'])

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
  // hips/elbows/ankles were collected at onboarding and mapped to NOTHING, so
  // a plan built for someone with a bad hip came out byte-for-byte identical
  // to a healthy person's — they were still handed Deadlifts. Three of the
  // eight injuries a user can report did nothing at all, and the comment that
  // used to sit here said so without anyone acting on it.
  hips: ['hip'],
  elbows: ['elbow'],
  ankles: ['ankle'],
}

/**
 * Single source of truth for injury-code -> flagged-joint mapping, exported
 * so callers outside this module (the injury-adaptation feature,
 * dev-constraint-audit.ts) read the real map instead of hand-duplicating it.
 *
 * ALL EIGHT INJURY_OPTIONS codes are mapped. Keep it that way: a code missing
 * here is not a partial feature, it is an injury the app collects, stores,
 * shows back to the user and then silently ignores. test:injury-coverage
 * asserts the map covers every option and that each one visibly changes a
 * plan, because "mapped" and "has any effect" are different claims — hip and
 * elbow tags existed on 1 and 2 exercises respectively while doing nothing.
 */
export function getFlaggedJoints(injuries: string[]): Set<string> {
  const joints = new Set<string>()
  for (const injury of injuries) {
    for (const joint of INJURED_JOINTS[injury] ?? []) joints.add(joint)
  }
  return joints
}

/**
 * True when an exercise's declared equipment is satisfiable at the given
 * tier (full_gym = everything allowed). `equipment_alternatives` entries
 * (interchangeable implements — T-Bar Rows' "straddle bar or use landmine")
 * need only ONE listed item present; every other entry needs all of them,
 * the historical behaviour.
 */
export function isEquipmentAllowed(entry: ExerciseEntry, tier: EquipmentAccess): boolean {
  const allowed = EQUIPMENT_SETS[tier]
  if (!allowed) return true
  return entry.equipment_alternatives
    ? entry.equipment.some(eq => allowed.has(eq))
    : entry.equipment.every(eq => allowed.has(eq))
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
    const hasAll = isEquipmentAllowed(ex, equipmentAccess)
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
    // Reads contraindication, NOT participation — an exercise can load a
    // flagged joint and still belong in the plan (a rotator-cuff rehab
    // movement loads the shoulder; that's the point of it). See
    // isContraindicatedFor / the three-state tag doc in exercise-db.ts.
    const conflict = isContraindicatedFor(ex, flaggedJoints)
    if (!conflict) {
      result.push(ex)
    } else {
      trace.injury_filtered.push({
        exercise: ex.name,
        stage: 'injury',
        reason: `contraindicated for joints [${contraindicatedJoints(ex).join(', ')}]; user flagged [${injuries.join(', ')}]`,
      })
      const replacement = equipmentPool.find(r =>
        r.substitution_group === ex.substitution_group &&
        r.name !== ex.name &&
        !isContraindicatedFor(r, flaggedJoints) &&
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
  trace: ConstraintTrace,
  /**
   * A style preference must not be able to delete an injury RESPONSE. This
   * function's own comment below already draws the line — "style is a
   * preference, not a safety constraint — unlike equipment (you physically
   * don't have the kit) or injury (it will hurt you)" — and rehab work sits
   * on the injury axis, not the taste one.
   *
   * MEASURED, which is how this was found: a knee-injured trainee who picked
   * 'bodybuilding' had EVERY knee-rehab movement stripped here. Full gym left
   * exactly one survivor (Lying Leg Curl, a machine); home gym, minimalist
   * and bodyweight left ZERO, because a seated short-arc quad set is tagged
   * functional/hybrid and nobody tags a rehab drill 'bodybuilding'. That was
   * 36 of 144 knee plans containing no knee rehab at all, and the
   * MIN_VIABLE_POOL escape hatch never fired because the pool was still
   * plenty big — just missing the one category that mattered.
   *
   * Same defect shape as the four rounds before it: a tag answering one
   * question ("what does this movement feel like to train?") used to answer
   * another ("may this person have the work their joint needs?").
   */
  flaggedJoints: Set<string> = new Set(),
): ExerciseEntry[] {
  const result: ExerciseEntry[] = []
  const rejected: ExerciseEntry[] = []

  for (const ex of pool) {
    if (ex.style_tags.includes(style) || isIndicatedFor(ex, flaggedJoints)) {
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

/**
 * The rest floor under one exercise, in seconds — 0 for anything that is not
 * the day's main lift, so callers can write Math.max(rest, floor)
 * unconditionally.
 *
 * ONE function rather than a Math.max sprinkled at each site, because the
 * defect this closes was exactly that shape: the goal's loaded floor WAS
 * asserted at three separate paths (prescription, the weekly rest_adjust,
 * trimWeekRestForBudget) and a fourth path — stageTimeCap's blanket -15s —
 * had no main-lift gate at all, so it silently undercut all three. Every
 * path that can lower a main lift's rest calls this; adding a fifth path
 * without calling it is the only way to reintroduce the bug.
 *
 * `policy` is optional so the duration ESTIMATORS (computeDurationTopUp,
 * sizeBlockToRestBudget) can apply the universal floor without pretending to
 * know the goal's loaded one. They under-estimate rest slightly for a
 * conditioning loaded main lift as a result — pre-existing, unchanged by
 * this, and it errs toward a shorter forecast, never a longer one.
 */
function mainLiftRestFloor(
  entry: ExerciseEntry | undefined,
  policy?: GoalPolicy,
  /**
   * This exercise is the day's PROMOTED anchor — it is not tier-1, but its
   * day contains no tier-1 at all and it is the hardest standalone thing in
   * the session (see dayAnchorExercise in session-derive).
   *
   * 96 of 256 generated days have no tier-1, all of them bodyweight or
   * minimalist, because 6 of the catalogue's 8 tier1_compound entries need a
   * barbell. Without this flag the floor those days get is zero, and the rule
   * "the day's hardest lift keeps its rest" silently covers a pull-up day
   * while leaving a leg day on accessory rest.
   *
   * Only the FLAT 60s applies to a promoted anchor, never the goal's higher
   * loaded floor: minLoadedMainLiftRestSeconds is a density rule about a
   * barbell main lift, and a promoted Air Squat is not one. Promotion should
   * make the app honest about the hardest movement, not quietly rewrite a
   * bodyweight session into a strength session.
   */
  promoted = false,
): number {
  if (!entry) return 0
  if (entry.mechanics_tier !== 'tier1_compound') return promoted ? MAIN_LIFT_REST_FLOOR_SECONDS : 0
  const loaded = policy?.minLoadedMainLiftRestSeconds
  return loaded && isExternallyLoaded(entry)
    ? Math.max(MAIN_LIFT_REST_FLOOR_SECONDS, loaded)
    : MAIN_LIFT_REST_FLOOR_SECONDS
}

function stageTimeCap(
  dayExercises: { entry: ExerciseEntry; sets: number; reps: string; rest: string; restSeconds: number }[],
  budgetSeconds: number,
  style: TrainingStyle,
  policy: GoalPolicy,
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

  // Phase 2: Reduce rest by 15s across the board — except cardio-tier,
  // same reasoning as trimWeekRestForBudget's own exemption: cutting an
  // interval's rest changes what the exercise IS rather than shaving
  // time off it, and a steady-state block (rest: '0s' by design) has no
  // rest to cut at all. Without this, this earlier, selection-time pass
  // was the one actually responsible for a steady-state exercise showing
  // a stray non-zero rest in the first place — caught live verifying the
  // new cardio reservation, where Elliptical still showed "30s" instead
  // of its real "0s" (Math.max(30, 0 - 15) = 30) despite never going
  // through trimWeekRestForBudget at all.
  //
  // The day's main lift is floored here too. Phase 1 above already exempts
  // it (isSupersetEligible excludes tier1/tier2 compounds), and the comment
  // there says "main lifts keep full rest even under time pressure" — but
  // that was only ever true of Phase 1. This blanket -15s was the path that
  // took a conditioning pull-up from 72s to 57s, and then anatomical
  // adaptation's own -15s took it to 42s. Both later floors were gated on
  // isExternallyLoaded, so a bodyweight main lift fell through every one.
  // The PROMOTED anchor, computed once for this day rather than per exercise.
  // stageTimeCap holds ExerciseEntry objects, not the Exercise rows
  // dayAnchorExercise takes, so it ranks with the shared anchorRank instead —
  // same rule, one definition, no chance of the label and the floor landing
  // on different movements. Nothing is promoted on a day that HAS a tier-1.
  const promotedIdx = (() => {
    if (dayExercises.some(d => d.entry.mechanics_tier === 'tier1_compound')) return -1
    let best = -1, bestRank = 0
    for (let i = 0; i < dayExercises.length; i++) {
      const t = dayExercises[i].entry.mechanics_tier
      if (t === 'cardio' || t === 'primer') continue
      const r = anchorScore(t, dayExercises[i].entry.name)
      if (r > bestRank) { bestRank = r; best = i }
    }
    return best
  })()
  for (let i = 0; i < dayExercises.length; i++) {
    if (dayExercises[i].entry.mechanics_tier === 'cardio') continue
    // Math.max, not an early `continue`: for everything that is not a main
    // lift the floor stays 30 and the expression is byte-identical to what
    // shipped before, so this change cannot move an accessory's rest.
    const floor = Math.max(30, mainLiftRestFloor(dayExercises[i].entry, policy, i === promotedIdx))
    const newRest = Math.max(floor, dayExercises[i].restSeconds - 15)
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
 * Goal- and capability-aware candidate ordering. Every existing eligibility
 * filter (equipment/injury/style/skill/pattern/family/weekly-used) runs
 * unchanged before this is ever called, so pattern-coverage and required-
 * slot guarantees are untouched; this only changes which of several
 * ALREADY-eligible candidates gets tried first.
 *
 * Capability-tier bias (primary split): meetsCapabilityRequirement is a
 * pure floor — an on-ramp/regression variant (Pull-Ups (Assisted), Goblet
 * Squats, ...) clearing the floor for a trainee who has already outgrown it
 * was winning selection purely on shuffle luck, with nothing upstream ever
 * preferring the full version once both are eligible. Regression variants
 * (isRegressionFor, periodization.ts) are demoted below every non-regression
 * alternative in the SAME candidate list — never excluded outright, so a
 * slot where the regression variant is the only eligible option still fills.
 *
 * Goal-aware ordering (secondary, within each half): when a policy prefers
 * unilateral/carry/rotational work, those candidates are tried first within
 * whichever capability tier they landed in.
 */
/**
 * How much a band gives up to a real weight for a main or secondary slot.
 * Sized deliberately: above the 0.3 tie-break jitter and above anything the
 * five scoring factors can swing together (~5), and far below the 30-point
 * gap between mechanics tiers — so it reorders implements WITHIN a tier and
 * can never reorder the tiers themselves.
 */
const BAND_WITHOUT_WEIGHT_PENALTY = 12

/** Shared empty set, so the no-injury path doesn't allocate one per candidate scored. */
const EMPTY_JOINTS: Set<string> = new Set()

interface ScoreContext {
  /** The day's own patterns (track.primary_patterns + secondary_patterns) — what "supports today's session" is measured against. */
  trackPatterns: MovementPattern[]
  selectedSoFar: ExerciseEntry[]
  weeklyAppearanceCount?: Map<string, number>
  /** The trainee's injured joints, so a band prescribed AS rehab is never demoted for being a band. */
  flaggedJoints?: Set<string>
  /**
   * True when some OTHER candidate in this same ranked list carries a real
   * external load. Filled in by orderCandidates, never by a caller: it is a
   * property of the slot being filled, not of the pool in general, and that
   * is exactly what makes the band rule a preference rather than a ban.
   */
  listHasLoadedAlternative?: boolean
  /**
   * What the trainee can train with — used ONLY to decide whether the
   * equipment_fit factor applies at all (see EQUIPMENT_QUALITY_TIERS). The
   * pool reaching this scorer is already equipment-filtered, so this is not
   * a second filter; omitted means the factor is off, which is why every
   * call site passes it explicitly rather than defaulting to full_gym.
   */
  equipmentAccess?: EquipmentAccess
}

/**
 * The five VISION.md-named factors (quality/goal/experience/session/
 * variety), each isolated to its own point value instead of folded straight
 * into one number. Deliberately excludes the tier-preference bonus and the
 * tie-break jitter below — those decide close ties or keep a compound ahead
 * of an accessory, which is structural, not "a coach's reasoning" a trainee
 * would find non-obvious (VISION.md Step 2: "where a choice is non-obvious,
 * say why"). Kept as a Record so explainWinner (below) can diff two
 * candidates factor-by-factor to find what actually decided a pick, instead
 * of guessing from the final score alone.
 */
interface ScoreFactors {
  role_support: number
  goal_fit: number
  experience_fit: number
  session_balance: number
  weekly_variety: number
  equipment_fit: number
}

interface ScoredCandidate {
  e: ExerciseEntry
  score: number
  factors: ScoreFactors
}

/**
 * Weighs one eligible candidate the way a coach actually chooses, not just
 * filters (VISION.md: "score eligible candidates on quality, goal fit,
 * experience fit, what's already in the session, and variety across the
 * block — then pick the best, not any valid one"). Every weight below reuses
 * a signal that already existed in this file for some OTHER purpose
 * (PATTERN_TO_RELATED_ISOLATION, GoalPolicy, isRegressionFor,
 * WEEKLY_APPEARANCE_CAP) — this is the first place they combine into an
 * actual ranking instead of being applied individually.
 *
 * Cross-week/cross-block variety is deliberately NOT part of this score —
 * that's rotateVariation()'s job at block boundaries, with its own
 * used-name tracking. This function only orders ONE day's candidates at the
 * moment of the initial pick.
 */
function scoreCandidate(candidate: ExerciseEntry, policy: GoalPolicy, rawExperience: TrainingExperience, ctx: ScoreContext): { score: number; factors: ScoreFactors } {
  const factors: ScoreFactors = { role_support: 0, goal_fit: 0, experience_fit: 0, session_balance: 0, weekly_variety: 0, equipment_fit: 0 }

  // 1. Quality for the role: an isolation exercise that directly supports
  // today's main compound pattern (hamstring work on a hinge day) beats one
  // that's only generically eligible for the slot.
  if (ctx.trackPatterns.some(p => (PATTERN_TO_RELATED_ISOLATION[p] ?? []).includes(candidate.movement_pattern))) {
    factors.role_support = 2
  }

  // 2. Goal fit — GoalPolicy's existing preferences, now weighted instead of
  // an absolute float-to-top/bottom split.
  let goalFit = 0
  if (policy.preferUnilateralCarry && isUnilateralCarryOrRotational(candidate)) goalFit += 2
  if (policy.goal === 'fat_loss' && candidate.mechanics_tier === 'tier2_compound') goalFit += 1
  if (policy.goal === 'conditioning' && candidate.joint_stress === 'low') goalFit += 1
  factors.goal_fit = goalFit

  // 3. Experience fit — was an absolute "sort after every non-regression"
  // partition; now a real penalty that composes with everything else
  // instead of overriding it (a regression can still win if every other
  // eligible candidate is a worse fit on every other axis).
  factors.experience_fit = isRegressionFor(candidate.name, rawExperience) ? -3 : 0

  // 4. What's already in the session — penalize real muscle overlap with
  // anything already picked today, so the session comes out balanced rather
  // than four different exercises hammering the same muscle.
  let overlapPenalty = 0
  for (const already of ctx.selectedSoFar) {
    const overlap = already.primary_muscles.filter(m => candidate.primary_muscles.includes(m)).length
    if (overlap >= 2) overlapPenalty -= 1
  }
  factors.session_balance = Math.max(overlapPenalty, -3)

  // 5. Variety across the week — graduated, on top of (not instead of)
  // WEEKLY_APPEARANCE_CAP's hard ceiling elsewhere: each prior appearance
  // this week costs a point, so a fresh exercise wins over a repeat before
  // the cap ever has to step in.
  factors.weekly_variety = ctx.weeklyAppearanceCount ? -(ctx.weeklyAppearanceCount.get(candidate.name) ?? 0) : 0

  // 6. Best tool for the job — prefer the implement that loads a working set
  // well over one that merely qualifies, when the trainee owns both. Before
  // this existed equipment was a filter and never a preference, so a
  // full-gym tricep slot scored a resistance band and a cable stack
  // identically and resolved on jitter.
  //
  // Kept at +/-1 ON PURPOSE — the same order as role_support and goal_fit,
  // and an order of magnitude below the tier gap (30/60/90) so it can
  // reorder two same-tier candidates but can NEVER promote an isolation
  // exercise over a compound. role_support (+2) alone outweighs it, which is
  // the right precedence: an exercise that genuinely supports today's main
  // pattern beats a nicer implement doing something less relevant.
  //
  // Injuries need no carve-out here. Injury filtering runs BEFORE scoring
  // (findForSlot scores an already-filtered `pool`), so when a shoulder
  // rules out pushdowns and skull crushers those candidates are gone and the
  // band wins for being the only survivor, whatever it scores. A preference
  // can only ever choose between options that are already safe.
  if (ctx.equipmentAccess && EQUIPMENT_QUALITY_TIERS.has(ctx.equipmentAccess) && !isEquipmentQualityExempt(candidate)) {
    const rank = bestEquipmentRank(candidate)
    factors.equipment_fit = rank === 'high' ? 1 : rank === 'low' ? -1 : 0
  }

  let score = factors.role_support + factors.goal_fit + factors.experience_fit + factors.session_balance + factors.weekly_variety + factors.equipment_fit

  // Tier preference — deliberately UNCONDITIONAL and with a much bigger gap
  // than every other factor combined can ever swing (roughly +/-10 at the
  // extreme): a tier1 main lift must never lose a comparison to a tier2/3
  // accessory, in ANY call site, not just the ones that obviously mix tiers
  // (refill()). findForSlot's required-pattern slots can ALSO have tier set
  // to null (any tier satisfies the slot) — that's exactly where this bit
  // me. The goal-fit bonus two lines up (+1 for a fat_loss tier2_compound)
  // was enough, on its own, to occasionally outrank an available tier1
  // candidate in one of those null-tier slots: caught live by test:audit's
  // goal_structure check, which measured a fat_loss day landing on fewer
  // main-compound slots than hypertrophy for exactly that reason — a rowing
  // slot resolved to Dumbbell Rows (tier2) instead of Barbell Rows (tier1)
  // purely because of the fat_loss bonus. pickFromTier/findForSlot calls
  // that already fixed their own tier before filtering are unaffected
  // (every candidate in the list gets the identical bonus, so relative
  // order — and therefore all the OTHER scoring below — is untouched); this
  // only changes outcomes where multiple tiers were being compared side by
  // side, which is exactly where it needs to. Kept OUT of `factors` on
  // purpose — explainWinner must never cite "it's a bigger movement" as a
  // trainee-facing reason, that's baseline session structure, not a
  // non-obvious coaching call.
  score += ({ tier1_compound: 90, tier2_compound: 60, tier3_isolation: 30 } as Record<string, number>)[candidate.mechanics_tier] ?? 0

  // A REAL WEIGHT BEATS A BAND, when a real weight is actually on offer.
  //
  // A resistance band is not in LOADED_EQUIPMENT, so the app shows NO WEIGHT
  // for it — the lift can only progress by reps and the weight column that
  // carries a lift's whole progression story is blank. MEASURED before this
  // existed: 906 of 18,909 main/secondary slots (4.79%) resolved to a band
  // on a day that already contained a real load, peaking at 8.03% for a
  // minimalist trainee. Nothing was broken; nothing was CHOOSING either.
  // Dumbbell Shoulder Press and Band Shoulder Press are both tier2_compound
  // vertical_push and scored IDENTICALLY on all five factors above, so the
  // winner was decided by the jitter two lines down. A coin flip, 906 times.
  //
  // Four conditions, each load-bearing:
  //   - listHasLoadedAlternative keeps this a PREFERENCE, not a ban. A
  //     minimalist trainee whose only vertical_pull is a band keeps the band;
  //     demoting the only thing left is not an improvement.
  //   - the isIndicatedFor exemption protects the rehab pass. Spanish Squat
  //     is a patellar-tendon rehab tool and Kneeling Band Lat Pulldown is
  //     shoulder-tolerable pulling; 352 current placements are deliberate
  //     rehab and must survive untouched.
  //   - tier1/tier2 only. A band in a tier3 isolation slot (Band Pull-Aparts,
  //     Band Face Pulls) is the right tool for that job.
  //   - the magnitude sits above the jitter (0.3) and above anything the five
  //     factors can swing together (~5), and far below the 30-point gap
  //     between tiers — so it reorders IMPLEMENTS within a tier and never
  //     reorders the tiers themselves.
  //
  // Kept OUT of `factors` for the same reason as the tier bonus directly
  // above: "we used the real weight because you have one" is baseline
  // structure, not a non-obvious coaching call, and explainWinner would
  // otherwise cite it on nearly every affected pick.
  if (
    ctx.listHasLoadedAlternative &&
    (candidate.mechanics_tier === 'tier1_compound' || candidate.mechanics_tier === 'tier2_compound') &&
    isBandEquipped(candidate) &&
    !isExternallyLoaded(candidate) &&
    !isIndicatedFor(candidate, ctx.flaggedJoints ?? EMPTY_JOINTS)
  ) {
    score -= BAND_WITHOUT_WEIGHT_PENALTY
  }

  // Tie-break only: small enough to never overturn a genuine difference
  // above, large enough to stop two truly equal candidates from always
  // resolving the same way. Goes through the same seeded randomSource() as
  // everything else, so audit/test runs stay reproducible.
  score += (randomSource() - 0.5) * 0.6

  return { score, factors }
}

function orderCandidates(candidates: ExerciseEntry[], policy: GoalPolicy, rawExperience: TrainingExperience, ctx: ScoreContext): ScoredCandidate[] {
  // Answered here, once, from the list actually being ranked — not by any
  // caller and not from the pool at large. "Was a real weight on offer for
  // THIS slot?" is the only form of the question that makes the band rule
  // safe for a trainee whose whole kit is bands.
  const scoped: ScoreContext = {
    ...ctx,
    listHasLoadedAlternative: candidates.some(e => isExternallyLoaded(e) && !isBandEquipped(e)),
  }
  return candidates
    .map(e => ({ e, ...scoreCandidate(e, policy, rawExperience, scoped) }))
    .sort((a, b) => b.score - a.score)
}

/**
 * One human-readable clause per reason factor, VISION.md Step 2 style
 * ("trap bar rather than conventional because your recovery is stretched
 * thin"). Every branch here states something independently verifiable about
 * `winner` — never invented, never guessed — which is why this only runs
 * against the SPECIFIC factor explainWinner already proved was decisive,
 * not against the winner's full trait list.
 */
const REASON_CLAUSES: { [K in keyof ScoreFactors]: (winner: ExerciseEntry, runnerUp: ExerciseEntry, policy: GoalPolicy) => string } = {
  role_support: (w, r) => `${w.name} over ${r.name} because it lines up more directly with today's main movement pattern, not just generically eligible for the slot.`,
  goal_fit: (w, r, policy) => {
    if (policy.preferUnilateralCarry && isUnilateralCarryOrRotational(w)) return `${w.name} over ${r.name} because unilateral, single-side work fits your training goal better.`
    if (policy.goal === 'fat_loss' && w.mechanics_tier === 'tier2_compound') return `${w.name} over ${r.name} to keep a bigger, more efficient movement in the mix for fat loss.`
    if (policy.goal === 'conditioning' && w.joint_stress === 'low') return `${w.name} over ${r.name} because it's easier on your joints, matching your conditioning focus.`
    return `${w.name} over ${r.name} to better fit your ${policy.label.toLowerCase()} goal.`
  },
  experience_fit: (w, r) => `${w.name} over ${r.name} because you're ready for the standard version, not the easier on-ramp.`,
  session_balance: (w, r) => `${w.name} over ${r.name} to avoid repeating a muscle group you already worked earlier in this session.`,
  weekly_variety: (w, r) => `${w.name} over ${r.name} because it's fresher — ${r.name} already showed up earlier this week.`,
  // Names the runner-up's implement rather than praising the winner's, because
  // the runner-up is the one whose absence needs explaining — a trainee who
  // expected a band and got a cable wants to know why, and "you've got better
  // available" is the honest answer. Only ever fires when the trainee's own
  // equipment includes the better tool (the factor is gated on that), so it
  // can't tell a home trainee they should have used a machine.
  equipment_fit: (w, r) => `${w.name} over ${r.name} because it loads the movement better with the equipment you've got.`,
}

/**
 * The "quieter" design call (VISION.md Step 2 plan, confirmed with Ashley):
 * only speak up when a factor genuinely decided the pick, not whenever one
 * merely applied. Compares the winner against the very next candidate in
 * the same ranked list (its real runner-up, not some other alternative),
 * and only returns a note when one reason factor accounts for at least half
 * of the total score gap between them — i.e. it's the reason they'd have
 * tied, or the runner-up would have won, without it. A close call with no
 * single deciding factor (or one only separated by tier/jitter) stays
 * silent, same as an obvious pick always has.
 */
function explainWinner(winner: ScoredCandidate, runnerUp: ScoredCandidate | undefined, policy: GoalPolicy): string | undefined {
  if (!runnerUp) return undefined
  const totalGap = winner.score - runnerUp.score
  if (totalGap <= 0) return undefined
  const keys = Object.keys(winner.factors) as (keyof ScoreFactors)[]
  const decisive = keys
    .map(key => ({ key, diff: winner.factors[key] - runnerUp.factors[key] }))
    .filter(d => d.diff > 0)
    .sort((a, b) => b.diff - a.diff)[0]
  if (!decisive || decisive.diff < totalGap * 0.5) return undefined
  return REASON_CLAUSES[decisive.key](winner.e, runnerUp.e, policy)
}

/**
 * The subset of an already-filtered pool that's primer-tier AND
 * affinity-matched to a track's primer_patterns — the exact predicate
 * selectExercisesForTrack uses to decide whether a day's primer comes
 * from the affinity-preferred pool or falls back to any eligible primer.
 * Exported (not just a local const inside selectExercisesForTrack) so
 * quality-score.ts's primerFit dimension can ask "would THIS profile have
 * had a matching primer" — e.g. against an injury-free clone of the same
 * profile, to tell an injury-driven fallback apart from a genuine
 * catalogue-thin one — by calling the SAME function real selection uses,
 * not a hand-copied filter that can silently drift out of sync with it if
 * this predicate ever changes.
 */
export function getAffinityPrimerPool(pool: ExerciseEntry[], trackPatterns: MovementPattern[]): ExerciseEntry[] {
  return pool.filter(e =>
    e.mechanics_tier === 'primer' &&
    (e.primer_pattern_affinity ?? []).some(p => trackPatterns.includes(p))
  )
}

/**
 * The gentlest movement the database marks as INDICATED for an injured
 * joint — the rehab work a physio would prescribe FOR it, as opposed to
 * merely tolerate.
 *
 * exercise-db.ts's own doc comment on `indicated_joints` has always said
 * "the plan should deliberately include them when the matching injury is
 * present, which is the whole reason this is a third state rather than a
 * boolean." Until this function existed, nothing did: `isIndicatedFor` was
 * read only by `isContraindicatedFor` (to keep rehab ELIGIBLE) and by the
 * line that labels a rehab movement "Chosen to help your shoulder" — a
 * sentence that was untrue, because nothing had chosen it. MEASURED before
 * this landed, across 576 training days per joint: rehab arrived on 51.0%
 * of a shoulder-injured trainee's days and 50.7% of a knee-injured
 * trainee's, purely by luck of the shuffle, and 40 of 144 knee plans
 * contained no knee rehab at all.
 *
 * GENTLEST IS TIER-THEN-DURATION, and it has to be, because the obvious
 * signal doesn't work: every knee-indicated entry in the database is
 * `joint_stress: 'low'`, so that field cannot discriminate between a
 * 24-second seated quad set and a 40-second wall sit, and using it would
 * only look principled.
 *
 * tier2_compound is excluded outright rather than merely ranked last. That
 * is Ashley's ruling made mechanical: rehab goes in EVERY session, and the
 * only version of "every session" that stays defensible is the small one —
 * a short-arc quad set on a bench-press day is prep, a Spanish Squat is leg
 * day arriving uninvited. Those movements stay fully available through
 * ordinary slots; they're just not what a guaranteed slot reaches for.
 */
export function pickRehabMovement(
  pool: ExerciseEntry[],
  flaggedJoints: Set<string>,
  weeklyUsed: Set<string>,
): ExerciseEntry | null {
  if (flaggedJoints.size === 0) return null
  // `pool` is already equipment/injury/experience filtered, so anything here
  // is genuinely available to this trainee.
  const indicated = pool.filter(e => isIndicatedFor(e, flaggedJoints) && e.mechanics_tier !== 'tier2_compound')
  if (indicated.length === 0) return null

  // Warm-up tier first where it exists (the whole shoulder set), isolation
  // otherwise (the whole knee set) — never both at once, so a 15-second band
  // pull-apart is never compared against a 28-second leg curl as though the
  // numbers meant the same thing.
  const primers = indicated.filter(e => e.mechanics_tier === 'primer')
  const band = primers.length > 0 ? primers : indicated

  // "Gentlest" is a BAND, not the single cheapest entry, and that distinction
  // is load-bearing. MEASURED with a strict minimum: Seated Short-Arc Quad
  // Set (24s) is uniquely the shortest knee drill, so it won every session of
  // every knee plan — 576 of 576, the same movement for sixteen weeks. Rehab
  // is repetitive by nature but that is monotony, not prescription. Within a
  // quarter of the cheapest option everything is equivalently gentle, so
  // rotate freely inside that; Ashley's ruling survives intact because the
  // band still excludes Wall Sit (40s) and tier2 was never in the running.
  const cheapest = Math.min(...band.map(e => e.avg_duration_seconds))
  const gentlest = band.filter(e => e.avg_duration_seconds <= cheapest * 1.25)
  // Prefer one not already used this week, then shuffle — the same idiom the
  // primer pick uses immediately below.
  return shuffle(gentlest.filter(e => !weeklyUsed.has(e.name)))[0] ?? shuffle(gentlest)[0] ?? null
}

/**
 * Which isolation patterns are "the target muscle" for a given day's own
 * compound pattern(s) — e.g. a hinge day's hamstring isolation work directly
 * supports the hinge; its bicep/tricep isolation work does not. Drives the
 * intra-tier3 sequencing below: pickFromTier's tier3_isolation pass
 * (movement-variety selection) still picks WHICH isolation exercises make
 * the day via a plain shuffle — this table only reorders the ones already
 * chosen, so it never biases selection itself, only presentation order.
 */
const PATTERN_TO_RELATED_ISOLATION: Partial<Record<MovementPattern, MovementPattern[]>> = {
  hip_hinge: ['isolation_hamstring'],
  knee_dominant: ['isolation_quad', 'isolation_calf'],
  single_leg: ['isolation_quad', 'isolation_hamstring'],
  horizontal_push: ['isolation_tricep', 'isolation_shoulder'],
  vertical_push: ['isolation_shoulder', 'isolation_tricep'],
  horizontal_pull: ['isolation_bicep', 'isolation_trap'],
  vertical_pull: ['isolation_bicep', 'isolation_trap'],
}

/**
 * Plain-English name for a movement pattern, for the ONE place a pattern
 * name reaches the trainee directly (pattern_gap_note below) — everywhere
 * else this stays internal jargon (trace entries, dev tooling). Covers every
 * MovementPattern, not just the ones that can appear as a required slot —
 * buildPatternGapNote also uses this for the "what the rest of the session
 * covers" half, which draws from whatever actually got selected (isolation/
 * core/cardio work included), not just required patterns.
 */
export function patternLabel(pattern: MovementPattern): string {
  switch (pattern) {
    case 'vertical_push': return 'an overhead press'
    case 'vertical_pull': return 'a pull-up or pulldown movement'
    case 'horizontal_push': return 'a horizontal press'
    case 'horizontal_pull': return 'a row'
    case 'knee_dominant': return 'a squat'
    case 'single_leg': return 'a lunge or split squat'
    case 'hip_hinge': return 'a hip-hinge movement (deadlift/RDL pattern)'
    case 'carry': return 'a loaded carry'
    case 'isolation_bicep': return 'bicep work'
    case 'isolation_tricep': return 'tricep work'
    case 'isolation_shoulder': return 'shoulder isolation work'
    case 'isolation_trap': return 'trap work'
    case 'isolation_quad': return 'quad work'
    case 'isolation_hamstring': return 'hamstring work'
    case 'isolation_calf': return 'calf work'
    case 'cardio': return 'conditioning work'
    case 'core': return 'core work'
    case 'activation': return 'warm-up/activation work'
  }
}

/**
 * Item 4 (queue-clearing round 3): a required slot that hits fillSlot's
 * "(none)" case used to be silent to the trainee — only an internal trace
 * entry. This turns that into a plain sentence naming the gap and what the
 * rest of the session still covers, per the explicit instruction to "tell
 * them plainly ... and offer what it can" rather than let the plan quietly
 * come up short. `covered` is what the day's OTHER required/primary
 * patterns actually landed (already-selected exercises), so the note never
 * claims coverage the day doesn't have.
 */
function buildPatternGapNote(uncovered: MovementPattern[], covered: ExerciseEntry[]): string {
  const uncoveredLabels = [...new Set(uncovered)].map(patternLabel)
  const coveredLabels = [...new Set(covered.map(e => e.movement_pattern))]
    .filter(p => !uncovered.includes(p))
    .map(patternLabel)
  const gapPart = uncoveredLabels.length === 1
    ? `nothing eligible for ${uncoveredLabels[0]} today`
    : `nothing eligible for ${uncoveredLabels.slice(0, -1).join(', ')} or ${uncoveredLabels[uncoveredLabels.length - 1]} today`
  const offerPart = coveredLabels.length > 0
    ? ` The rest of this session still covers ${coveredLabels.join(', ')}.`
    : ''
  return `Your current equipment and injury settings leave ${gapPart} — not a bug, just a real gap in what's available.${offerPart} Update your equipment or injuries in Profile, or ask your coach in Chat, if that changes.`
}

/**
 * Share of the total session budget a "Conditioning & Core" track's cardio
 * block is allowed to reserve — a real minute cap, not a slot count. Picked
 * from the middle of the 25-30% range this was scoped at; see
 * selectExercisesForTrack's cardio-reservation block for why a minute share
 * replaced the old ceil(slots/2) formula.
 */
export const CARDIO_RESERVED_SHARE = 0.28

/**
 * What one cardio candidate would actually cost in the final rendered plan
 * — same fixedUnitPrescription + experience-scaling + estimateSlotsSeconds
 * chain real generation uses, not a separate guess. Using a different
 * estimate here than what ships is exactly the mismatch class of bug that
 * let a steady-state block get counted at ~30s instead of its real ~20min
 * before it shipped; this reuses the real numbers so the reservation
 * decision and the final prescription can't drift apart.
 */
function estimateCardioCandidateSeconds(
  candidate: ExerciseEntry,
  experience: ExperienceConfig,
  sessionDurationPreference: SessionDuration | undefined,
): number {
  const fixedUnits = fixedUnitPrescription(candidate, sessionDurationPreference)
  if (!fixedUnits) return 0
  // Mirrors the real per-week sets computation exactly, including its
  // steady-state exemption (generateMesocycle's per-week loop) — a
  // different floor here than what actually ships is exactly the
  // mismatch that let this reservation's own budget check pass while the
  // rendered day still came out 2-3x over.
  const sets = candidate.prescription_type === 'steady_state'
    ? 1
    : Math.max(2, Math.round(fixedUnits.sets * experience.sets_multiplier))
  return estimateSlotsSeconds([{ entry: candidate, sets, reps: fixedUnits.reps, restSeconds: fixedUnits.restSeconds }])
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
  rawExperience: TrainingExperience = 'novice',
  sessionDurationPreference?: SessionDuration,
  flaggedJoints: Set<string> = new Set(),
  equipmentAccess?: EquipmentAccess,
): { primer: ExerciseEntry | null; rehab: ExerciseEntry | null; main: ExerciseEntry[]; requiredNames: Set<string>; uncoveredPatterns: MovementPattern[]; selectionNotes: Map<string, string> } {
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
  const affinityPrimerPool = getAffinityPrimerPool(pool, track.primer_patterns)
  const anyPrimerPool = pool.filter(e => e.mechanics_tier === 'primer')
  const primerPool = affinityPrimerPool.length > 0 ? affinityPrimerPool : anyPrimerPool
  const primer = primerPool.length > 0
    ? shuffle(primerPool.filter(p => !weeklyUsed.has(p.name)))[0] ?? shuffle(primerPool)[0]
    : null

  // Rehab is picked BEFORE the main selection below, for the same reason the
  // primer is: `usedGroups` has to know about it, or a knee-injured trainee
  // draws Sliding Leg Curl as their guaranteed rehab and again as an
  // accessory. Deliberately NOT filtered by primer_pattern_affinity — that
  // is track fit, and the shoulder primers are tagged for push/pull
  // patterns, so an affinity-respecting pick would find nothing on leg day.
  // A shoulder needs its band pull-aparts on leg day too; rehab is not track
  // work.
  //
  // Nothing to add when the day's own primer is ALREADY rehab for the injured
  // joint. Seven of the nine shoulder-indicated movements are primers, so an
  // ordinary primer pick lands on one often — and adding a second alongside
  // it produced exactly what you would expect: a session opening "Scapular
  // Push-Ups, Scapular Push-Ups", and, where the names differed, two warm-ups
  // doing the same job. The guarantee is that every session carries rehab,
  // not that every session carries a rehab SLOT.
  const primerIsRehab = primer != null && isIndicatedFor(primer, flaggedJoints)
  const rehab = primerIsRehab ? null : pickRehabMovement(pool, flaggedJoints, weeklyUsed)

  // Keyed by movement family, not substitution_group, so the same movement
  // cannot appear twice under two different classifications. Seeded with the
  // primer's family (if any) up front — Kettlebell Swings (primer,
  // 'activation' pattern) and Kettlebell Swing (Heavy) (main, 'hip_hinge'
  // pattern) share a family via MOVEMENT_FAMILIES despite having different
  // movement_pattern values, but the primer is picked before this set even
  // existed, so nothing stopped both from landing in the same session.
  const usedGroups = new Set<string>()
  if (primer) usedGroups.add(getMovementFamily(primer))
  if (rehab) usedGroups.add(getMovementFamily(rehab))
  const selected: ExerciseEntry[] = []
  // Names that filled a REQUIRED slot — stageTimeCap must never silently
  // drop one of these under duration pressure (that's exactly the "never
  // silently drop the slot" guarantee Fix 1 exists to provide); it may
  // still trim their SETS, just not remove them outright.
  const requiredNames = new Set<string>()
  // Required slots that hit fillSlot's final "(none)" case — equipment/
  // injury genuinely leaves nothing eligible, even with a nearest-pattern
  // substitute. Previously only reached trace.structure_adjusted (an
  // internal diagnostic array, never shown to the trainee); collected here
  // so the caller can turn it into a plain-language note on the day itself.
  const uncoveredPatterns: MovementPattern[] = []
  // VISION.md Step 2 ("say why, where a choice is non-obvious") — keyed by
  // exercise name because every name is unique within a single day's
  // `selected` list (usedGroups/duplicate-name checks already guarantee
  // that), so this survives the rest of the day-build pipeline as a plain
  // name -> note lookup without needing to carry a reference through every
  // downstream transform.
  const selectionNotes = new Map<string, string>()

  // Pattern-guaranteed slots — filled FIRST, in order, before the legacy
  // pickFromTier/refill pass below tops up to the duration-based count. See
  // TrackSlot's doc comment for why this replaced pure filter-then-shuffle.
  const slotForbidden = new Set(track.forbidden_patterns)
  function findForSlot(patterns: MovementPattern[], tier: TrackSlot['tier'] | null, respectWeeklyUsed: boolean): ExerciseEntry | null {
    const candidates = orderCandidates(
      pool.filter(e =>
        patterns.includes(e.movement_pattern) &&
        !slotForbidden.has(e.movement_pattern) &&
        (tier === null || e.mechanics_tier === tier) &&
        !selected.some(s => s.name === e.name) &&
        !usedGroups.has(getMovementFamily(e)) &&
        (!respectWeeklyUsed || !weeklyUsed.has(e.name))
      ),
      policy,
      rawExperience,
      { trackPatterns: [...track.primary_patterns, ...track.secondary_patterns], selectedSoFar: selected, weeklyAppearanceCount, flaggedJoints, equipmentAccess },
    )
    const winner = candidates[0]
    if (winner) {
      const note = explainWinner(winner, candidates[1], policy)
      if (note) selectionNotes.set(winner.e.name, note)
    }
    return winner?.e ?? null
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
    uncoveredPatterns.push(...slot.patterns)
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
      rawExperience,
      { trackPatterns: [...track.primary_patterns, ...track.secondary_patterns], selectedSoFar: selected, weeklyAppearanceCount, flaggedJoints, equipmentAccess },
    )
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]
      if (selected.length >= counts.tier1 + counts.tier2 + counts.tier3) break
      if (count <= 0) break
      // Re-check the family here, not only in the filter above. `candidates`
      // is evaluated once, so a family claimed earlier in THIS loop would
      // otherwise slip through — which is how Chest Dips and Tricep Dips
      // (both family 'dip') ended up in the same session.
      if (usedGroups.has(getMovementFamily(c.e))) continue
      selected.push(c.e)
      usedGroups.add(getMovementFamily(c.e))
      // Runner-up is the next entry in this same ranked list — the real
      // alternative this pick beat, not some other candidate elsewhere.
      const note = explainWinner(c, candidates[i + 1], policy)
      if (note) selectionNotes.set(c.e.name, note)
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
  // direct, repeated LLM coach review finding. Reserving real cardio work
  // FIRST, before core competes for the same budget, fixes that at the
  // source.
  //
  // Reserved as MINUTES, not a slot count. A slot-count formula
  // (previously ceil(total/2)) has no idea what a slot actually costs in
  // time — it can only ever be "enough cardio," never "not too much,"
  // because it doesn't know the session's time budget exists. Measured
  // live: at 90+ min preference, EVERY combat/conditioning combo tested
  // filled every eligible cardio-tier exercise (up to 8) and needed
  // computeDurationTopUp + trimWeekRestForBudget to force the day back
  // under budget afterward — one of them by piling extra sets onto
  // cardio specifically (now excluded, see computeDurationTopUp's
  // eligible filter), the other by shaving interval rest toward a 30s
  // floor regardless of category (now exempted, see
  // trimWeekRestForBudget's order filter) — silently breaking the work:
  // rest ratio stepIntervalSeconds is supposed to hold, on whichever
  // exercise happened to get reached first. Reserving a minute share up
  // front means cardio's own volume is decided once, honestly, instead
  // of being decided by slot count and then quietly corrected downstream
  // by two mechanisms that don't know why the day got big in the first
  // place.
  if (track.primary_patterns.includes('cardio')) {
    const totalBudgetSeconds = getDurationBudgetSeconds(sessionDurationPreference ?? '45-60')
    const reservedCardioSeconds = totalBudgetSeconds * CARDIO_RESERVED_SHARE
    const experienceConfig = getExperienceConfig(rawExperience)
    // track.slots' own required cardio slot (fillSlot, run earlier in this
    // function — see the pattern-guaranteed-slots pass above) may already
    // have picked one cardio exercise, unconditionally, with no idea this
    // budget exists. Seeding the running total with whatever it already
    // spent is what makes the two mechanisms cooperate instead of
    // stacking blind: caught live reconciling a reported number against
    // its own math — the reservation loop's own budget math was correct
    // in isolation, but starting it fresh at 0 every time meant a day
    // where the slot pass had already spent, say, a 9-minute Rowing
    // Machine pick got a FULL extra 21 minutes on top from this loop,
    // landing the real total at 56% of budget instead of the ~28% either
    // mechanism thought it was granting on its own.
    const preSelectedCardio = selected.filter(e => e.mechanics_tier === 'cardio')
    let cardioSecondsUsed = preSelectedCardio.reduce((sum, e) => sum + estimateCardioCandidateSeconds(e, experienceConfig, sessionDurationPreference), 0)
    let cardioAdded = preSelectedCardio.length
    const cardioCandidates = orderCandidates(
      trackPool.filter(e =>
        e.mechanics_tier === 'cardio' &&
        !weeklyUsed.has(e.name) &&
        !selected.some(s => s.name === e.name) &&
        !usedGroups.has(getMovementFamily(e))
      ),
      policy,
      rawExperience,
      { trackPatterns: [...track.primary_patterns, ...track.secondary_patterns], selectedSoFar: selected, weeklyAppearanceCount, flaggedJoints, equipmentAccess },
    )
    for (let i = 0; i < cardioCandidates.length; i++) {
      const c = cardioCandidates[i]
      if (usedGroups.has(getMovementFamily(c.e))) continue
      const cost = estimateCardioCandidateSeconds(c.e, experienceConfig, sessionDurationPreference)
      // The floor: the FIRST candidate this loop itself adds is always
      // taken, even over budget — but only when nothing (including the
      // slot pass above) has provided a cardio exercise yet. A session
      // too short to "afford" one by the numbers still gets one; a
      // session that already has one from the slot pass doesn't get a
      // second free pass just for being first through THIS loop.
      if (cardioAdded > 0 && cardioSecondsUsed + cost > reservedCardioSeconds) continue
      selected.push(c.e)
      usedGroups.add(getMovementFamily(c.e))
      cardioSecondsUsed += cost
      cardioAdded++
      const note = explainWinner(c, cardioCandidates[i + 1], policy)
      if (note) selectionNotes.set(c.e.name, note)
      if (cardioSecondsUsed >= reservedCardioSeconds) break
    }
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

    const refill = (respectFamilies: boolean, respectWeeklyCap: boolean) => {
      // Prefer bigger movements first (scoreCandidate's tier-preference
      // component is unconditional) so a refilled session still opens with
      // a compound rather than leading on isolation work — scored alongside
      // quality/goal-fit/session-balance/variety instead of a separate
      // tier-only sort, now that this fallback pools all three tiers
      // together.
      //
      // Cardio-tier is excluded here too, not just primer — on a
      // "Conditioning & Core" track trackPool is cardio-and-core only, so
      // once core-isolation candidates ran thin this was the back door
      // that let refill silently re-stuff MORE cardio back in after the
      // reservation above had already made its own, deliberate,
      // budget-respecting decision to stop. Caught live reconciling a
      // reported number against its own math: the reservation loop by
      // itself admitted 3 exercises (22min, correctly under its 28min
      // share); this fallback alone added 4 more, un-budgeted, to chase
      // the slot-count target — the exact "count, not minutes" anti-
      // pattern this whole change exists to remove. A day that comes up
      // short on core candidates now ends up with fewer total exercises,
      // bounded by the time budget, rather than refill forcing the slot
      // count back up with more cardio.
      const candidates = orderCandidates(
        trackPool.filter(e =>
          e.mechanics_tier !== 'primer' &&
          e.mechanics_tier !== 'cardio' &&
          !selected.some(s => s.name === e.name) &&
          (!respectFamilies || !usedGroups.has(getMovementFamily(e))) &&
          (!respectWeeklyCap || !weeklyAppearanceCount || (weeklyAppearanceCount.get(e.name) ?? 0) < WEEKLY_APPEARANCE_CAP)
        ),
        policy,
        rawExperience,
        { trackPatterns: [...track.primary_patterns, ...track.secondary_patterns], selectedSoFar: selected, weeklyAppearanceCount, flaggedJoints, equipmentAccess },
      )

      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]
        if (selected.length >= target) break
        selected.push(c.e)
        usedGroups.add(getMovementFamily(c.e))
        const note = explainWinner(c, candidates[i + 1], policy)
        if (note) selectionNotes.set(c.e.name, note)
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

  // Sort: tier1 compounds first, then tier2, then tier3 — and WITHIN tier3,
  // target muscle (directly related to the day's own compound pattern(s))
  // before supporting isolation work, core/anti-extension always last. A
  // hinge day's hamstring curl finishing before its bicep curl, and its
  // core work finishing the session, is how a real coach orders a page —
  // pickFromTier's shuffle decides WHICH isolation exercises make the day;
  // this only decides the order they're written down in.
  //
  // Relevance alone isn't enough on a day whose primary_patterns span TWO
  // compounds (e.g. "Pull & Hinge" — hip_hinge AND horizontal_pull/
  // vertical_pull), since it would then rate hamstring isolation (hinge)
  // and bicep isolation (pull) as equally "target" and fall back to
  // whatever order the tier3 shuffle happened to produce — exactly the
  // Incline Curls-before-Leg-Curl case this rule exists to fix. A muscle-
  // size sub-rank breaks that tie in relevance's favor: legs first, then
  // shoulders, then arms, matching the classic big-to-small accessory
  // convention regardless of which compound patterns the day covers.
  const tierOrder = { tier1_compound: 0, tier2_compound: 1, tier3_isolation: 2, cardio: 3, primer: 4 }
  const MUSCLE_SIZE_RANK: Partial<Record<MovementPattern, number>> = {
    isolation_hamstring: 0, isolation_quad: 0,
    isolation_calf: 1,
    isolation_shoulder: 2, isolation_trap: 2,
    isolation_bicep: 3, isolation_tricep: 3,
  }
  const relatedIsolation = new Set<MovementPattern>()
  for (const p of track.primary_patterns) {
    for (const r of PATTERN_TO_RELATED_ISOLATION[p] ?? []) relatedIsolation.add(r)
  }
  const isolationPriority = (e: ExerciseEntry): number => {
    if (e.movement_pattern === 'core') return 100
    if (e.mechanics_tier !== 'tier3_isolation') return -1
    const sizeRank = MUSCLE_SIZE_RANK[e.movement_pattern] ?? 2
    return (relatedIsolation.has(e.movement_pattern) ? 0 : 10) + sizeRank
  }
  selected.sort((a, b) => {
    const tierDiff = (tierOrder[a.mechanics_tier] ?? 3) - (tierOrder[b.mechanics_tier] ?? 3)
    return tierDiff !== 0 ? tierDiff : isolationPriority(a) - isolationPriority(b)
  })

  // "In every session" and "the first thing dropped when the session runs
  // long" cannot both be true. requiredNames is already exactly the set
  // stageTimeCap's protectedNames parameter refuses to remove outright (it
  // may still trim sets), so the guarantee is the existing mechanism reused
  // rather than a second one invented beside it.
  if (rehab) requiredNames.add(rehab.name)

  return { primer, rehab, main: selected, requiredNames, uncoveredPatterns, selectionNotes }
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

/**
 * Conventional coaching brackets a rep range is snapped to at BASE
 * assignment only — see snapToRepBracket's own doc comment for why the
 * weekly shiftReps drift is deliberately left untouched. Ordered low to
 * high so a nearest-low-bound search is a simple linear scan.
 */
const REP_BRACKETS = ['1-3', '3-5', '5-6', '6-8', '8-10', '10-12', '12-15', '15-20', '20-25']

/**
 * Snaps a computed rep range (style base + goal shift + experience floor)
 * to the nearest real coaching bracket by low-bound distance, so the BASE
 * assignment reads like a range a coach would actually prescribe ("8-10")
 * instead of arbitrary algebra ("7-11"). Deliberately called ONLY here, at
 * base assignment — never inside shiftReps (periodization.ts)'s per-week
 * call. Reps already hold flat across a block for rampLoad-only exercises
 * (repShift carries no `w-1` term for them — see the rampLoad/rampReps
 * split in the per-week loop below), so snapping the base alone already
 * gives those exercises a genuinely bracket-fixed block, with load as the
 * sole week-to-week lever, unchanged. For rampReps exercises (bodyweight /
 * unaffordable-load / reps-emphasis accessories), the existing +1 rep/week
 * drift is what keeps every consecutive week distinct for frozen_week — an
 * earlier attempt to ALSO snap the weekly-shifted value collapsed distinct
 * weeks onto the same bracket and reintroduced frozen_week failures
 * (measured: Progression 1.70->1.60, Overall 11.10->11.01/12); leaving the
 * per-week shift alone and only cleaning up its starting point measured as
 * a no-op on every quality dimension (Overall 11.10/12 unchanged,
 * Progression 1.70->1.69 — noise) while still landing week 1 on a real
 * bracket, which is the one part of this that's safe to ship.
 */
function snapToRepBracket(reps: string): string {
  const m = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!m) return reps
  const low = Number(m[1])
  let best = REP_BRACKETS[0]
  let bestDist = Infinity
  for (const bracket of REP_BRACKETS) {
    const bracketLow = Number(bracket.split('-')[0])
    const dist = Math.abs(bracketLow - low)
    if (dist < bestDist) {
      bestDist = dist
      best = bracket
    }
  }
  return best
}

/** Multiplies a base rest-seconds value by a goal's per-tier bias, floored at 20s — even the densest circuit-adjacent goal needs SOME recovery between working sets. */
function shiftRestSeconds(seconds: number, multiplier: number): number {
  return Math.max(20, Math.round(seconds * multiplier))
}

/**
 * The prescription for every non-'reps' unit — a hold duration, a measured
 * carry distance, a work:rest interval. These are the STARTING values: unlike
 * a rep range they don't bend to training style, experience or goal — a 40m
 * farmer's walk starts at 40m for everyone.
 *
 * "Only the load moves" is what this comment used to say, and it stopped
 * being true. A carry's load converges on its ceiling and then nothing moved
 * at all — measured, 100 of 265 frozen week-to-week transitions, the largest
 * single bucket. generateMesocycle now walks the distance up (+5m per frozen
 * week, capped) when the weight has stopped; see FROZEN_CARRY_DISTANCE_STEP_M.
 * This function still returns the DEFAULT, which is what a rotated-in carry
 * must start from. Returns null for 'reps', which genuinely does need the
 * style/experience/policy chain.
 *
 * Exported because any path that changes WHICH exercise occupies a slot has
 * to re-derive these when the incoming exercise's prescription_type differs
 * from the outgoing one — inheriting the old units is how a carry ended up
 * prescribed "8-12 reps" and a hold ended up "40m". applyReplacement
 * (mesocycle-edit.ts) is the shared choke point for the swap/ban/injury/
 * equipment paths and reads this rather than keeping a second copy of the
 * same three constants.
 */
export function fixedUnitPrescription(
  entry: ExerciseEntry | undefined,
  sessionDurationPreference?: SessionDuration,
): { sets: number; reps: string; rest: string; restSeconds: number } | null {
  switch (entry?.prescription_type) {
    case 'time':
      return { sets: 3, reps: '30-45s', rest: '45s', restSeconds: 45 }
    case 'distance_load':
      // The DEFAULT, and always the default — a carry rotated into a slot by
      // swap/ban/injury/equipment starts here, never at the outgoing carry's
      // progressed distance. That is the whole reason this function is the
      // shared choke point (see its doc comment: "a carry ended up prescribed
      // 8-12 reps and a hold ended up 40m"), and test:slot-replacement is the
      // gate that asserts no outgoing-exercise data survives a swap.
      return { sets: 3, reps: `${DEFAULT_CARRY_DISTANCE_M}m`, rest: '60s', restSeconds: 60 }
    case 'intervals': {
      // Rounds of work:rest, never a rep count — a jump-rope or battle-rope
      // set is not "15-18 reps." Differentiated by category rather than one
      // literal for every exercise sharing this type — the direct cause of
      // Burpees, Mountain Climbers and Cycling Intervals all showing an
      // identical "6x33s" in a live bug report. Bodyweight-HIIT (Burpees,
      // Mountain Climbers, Jump Rope, Battle Ropes) runs shorter, rest-
      // matched bursts; machine-interval (Treadmill/Cycling Intervals,
      // Rowing Machine) tolerates a longer work bout with a real recovery
      // period. Checked against the small closed set of actual cardio
      // MACHINES rather than `equipment.includes('bodyweight')` — Jump Rope
      // and Battle Ropes are light-prop, bodyweight-adjacent HIIT work, not
      // literally tagged 'bodyweight', and a naive bodyweight check silently
      // dropped both into machine-interval (caught live, before shipping,
      // by the verification script; every one of the four bodyweight-HIIT
      // exercises came back with the identical 45s/40s machine numbers). An
      // unlisted future cardio machine defaults to the gentler bodyweight-
      // HIIT numbers rather than the more demanding ones — the safer
      // direction for a gap in this list to fail toward.
      const CARDIO_MACHINE_EQUIPMENT = ['treadmill', 'stationary bike', 'rowing machine']
      const isMachine = entry.equipment.some(e => CARDIO_MACHINE_EQUIPMENT.includes(e))
      return isMachine
        ? { sets: 6, reps: '45s', rest: '40s', restSeconds: 40 }
        : { sets: 6, reps: '30s', rest: '30s', restSeconds: 30 }
    }
    case 'steady_state': {
      // One continuous block — no rounds, no rest. Sized to the trainee's
      // session length rather than a flat duration; see
      // getSteadyStateSeconds' own doc comment (session-duration.ts).
      const seconds = getSteadyStateSeconds(sessionDurationPreference ?? '45-60')
      return { sets: 1, reps: `${seconds}s`, rest: '0s', restSeconds: 0 }
    }
    default:
      return null
  }
}

function assignSetsRepsFromConfig(
  entry: ExerciseEntry,
  config: StyleConfig,
  experience: ExperienceConfig,
  policy: GoalPolicy,
  sessionDurationPreference?: SessionDuration,
): { sets: number; reps: string; rest: string; restSeconds: number } {
  // Primers are not scaled — a 5-rep activation drill is a 5-rep activation
  // drill regardless of how long you have been training.
  //
  // NOT SCALED IS NOT THE SAME AS NOT MEASURED, and this branch used to
  // conflate them: it returned before the prescription_type dispatch below,
  // so EVERY primer got "5" reps whatever its unit. That was invisible for as
  // long as all 25 primers in the catalogue were rep-based. The first two
  // time-based ones — Isometric Grip Squeeze and Single-Leg Balance Hold,
  // added for wrist/elbow and ankle rehab — came out prescribed "2 x 5" for a
  // movement you hold, which test:audit caught 1,459 times.
  //
  // So the unit comes from the same choke point every other tier uses, while
  // the no-scaling rule keeps its sets and rest. Provably inert for every
  // pre-existing exercise: fixedUnitPrescription returns null for
  // prescription_type 'reps', which all 25 older primers are, so this cannot
  // move a single existing prescription.
  if (entry.mechanics_tier === 'primer') {
    const fixed = fixedUnitPrescription(entry, sessionDurationPreference)
    return fixed
      ? { ...fixed, sets: 2, rest: '30s', restSeconds: 30 }
      : { sets: 2, reps: '5', rest: '30s', restSeconds: 30 }
  }

  // A beginner never drops below 2 working sets — one set is not a stimulus.
  const scaleSets = (base: number) =>
    Math.max(2, Math.round(base * experience.sets_multiplier))

  // Dispatched on prescription_type, not movement_pattern — two exercises
  // can share a pattern ('carry') while needing entirely different units
  // (Farmer Squat Hold is a hold, Farmer's Walk is a measured distance).
  // See PrescriptionType's doc comment in exercise-db.ts.
  const fixedUnits = fixedUnitPrescription(entry, sessionDurationPreference)
  if (fixedUnits) {
    return entry.prescription_type === 'intervals'
      ? { ...fixedUnits, sets: scaleSets(fixedUnits.sets), restSeconds: fixedUnits.restSeconds }
      : fixedUnits
  }
  switch (entry.prescription_type) {
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
      let restSeconds = shiftRestSeconds(config.restSeconds[tierKey], policy.restSecondsMultiplier[tierKey])
      // A goal may compress rest as hard as it likes, except under a loaded
      // main lift. Conditioning's multiplier took Barbell Squats to 42s
      // between sets on a short session — the goal working exactly as
      // designed, on the one exercise where it should not. Gated on
      // isExternallyLoaded so a bodyweight main lift (chin-ups) keeps the
      // goal's density; the floor is about a bar, not about tier.
      // ...and under MAIN_LIFT_REST_FLOOR_SECONDS the scoping stops: 60s is
      // the floor for any main lift, bodyweight included. mainLiftRestFloor
      // returns the higher of the two, so this one expression carries both
      // rules and neither can be applied without the other.
      restSeconds = Math.max(restSeconds, mainLiftRestFloor(entry, policy))
      return {
        sets: scaleSets(config.setRange[tierKey]),
        reps: snapToRepBracket(applyRepFloor(shiftRepRange(config.repRange[tierKey], policy.repRangeShift[tierKey]), experience.min_reps)),
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
export function getRoleSetCeiling(role: VolumeRole, isLongSession: boolean): number {
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

export function getRoleSetFloor(role: VolumeRole): number {
  if (role === 'main') return 3
  if (role === 'conditioning') return 4
  return 2
}

export function clampToVolumeRole(sets: number, role: VolumeRole | null, isLongSession: boolean): number {
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

// Most extra reps a lift may accumulate while its weight sits at the
// unverified ramp's ceiling — see frozenLoadStreakByLift. shiftReps enforces a
// floor and no ceiling of its own, and a rep range carries its block's intent:
// let a strength block's 4-6 climb far enough and it quietly becomes an
// endurance block.
const MAX_FROZEN_LOAD_REP_BUMP = 3

/**
 * One step further, when a carry's weight has stopped moving.
 *
 * A carry's design is "only the load moves" (see fixedUnitPrescription) —
 * coherent until the load converges on its ceiling, after which NOTHING
 * moves: carries are excluded from rampReps and from the frozen-load rep
 * bump because shiftReps passes '40m' straight through. MEASURED, they were
 * 100 of 265 frozen week-to-week transitions, the largest single bucket.
 *
 * Ashley's ruling: when the weight can't move, walk further. 5m is one
 * honest increment on a 40m carry (12.5%) — small enough that the session
 * budget absorbs it, big enough to read as progress on the card.
 */
const FROZEN_CARRY_DISTANCE_STEP_M = 5

/**
 * Cap on the accumulated distance bump, in steps. Three takes a 40m carry to
 * 55m across a plan; without it a sixteen-week plan walks to 100m, which is
 * a different exercise. Mirrors MAX_FROZEN_LOAD_REP_BUMP's role exactly.
 */
const MAX_FROZEN_CARRY_DISTANCE_STEPS = 3

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

/**
 * Same-muscle-group coherence bucket — exercises whose absolute load should
 * stay in the same ballpark within a week, clamped by enforceLoadCoherence
 * below. Laterals and shrugs USED TO share a bucket deliberately ("both are
 * the same 'small, high-rep shoulder-girdle isolation' complaint class in
 * the review") — that premise was wrong: a shrug is structurally loaded
 * 2-4x heavier than a lateral raise for the same trainee (trapezius vs.
 * lateral deltoid), so sharing a bucket didn't just fail to catch real
 * incoherence, it actively clamped a legitimately heavy shrug DOWN toward
 * whatever the lateral raise happened to show — manufacturing the exact
 * "2kg shrug" complaint this pass exists to prevent, on the exercise it was
 * supposed to protect. Split via substitution_group (already the finer
 * distinction the data carries) — same fix as quality-score.ts's matching
 * coherenceGroupOf, which scores the OUTPUT of this pass and was silently
 * scoring clean because this clamp already forced every plan under its
 * threshold before scoring ever saw it.
 */
function coherenceGroup(entry: ExerciseEntry): string | null {
  switch (entry.movement_pattern) {
    case 'isolation_bicep': return 'bicep'
    case 'isolation_tricep': return 'tricep'
    case 'isolation_shoulder': return entry.substitution_group === 'shrug' ? 'shrug' : 'lateral_delt'
    case 'isolation_quad': return 'quad_isolation'
    case 'isolation_hamstring': return 'hamstring_isolation'
    case 'isolation_calf': return 'calf_isolation'
    default: return null
  }
}

/**
 * Overwrites an exercise's load fields in place to a new (plate-rounded)
 * target. THE ONLY SANCTIONED WAY TO CHANGE A PRESCRIBED WEIGHT after it is
 * built: `suggested_load_kg`, `suggested_load` and `per_set_load` are three
 * views of one number and every screen reads a different one, so they move
 * together or they contradict each other. The rep-target floor below is the
 * cautionary tale — it raised the number by hand and the app spent a release
 * telling the coach 7.5kg for a lift it had prescribed at 8kg.
 *
 * Two callers, in opposite directions: the coherence clamp pulls an outlier
 * DOWN toward its group, and the rep-target floor holds a weight UP when the
 * rep target rose. It never invents a number of its own — both callers pass
 * a figure already justified elsewhere.
 *
 * Any set-by-set ramp collapses to a flat value at the new target. Measured
 * zero occurrences in the 19,724-exercise sweep for either caller: a load
 * being clamped down is not a candidate for a strength-phase ramp, and a
 * ramped load has never also been a floored one.
 */
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

/**
 * Barbell/EZ-bar isolation work (Barbell Curls, Skull Crushers) has a much
 * higher equipment floor than its dumbbell/cable siblings in the same
 * substitution_group (20kg/10kg vs 2-5kg) — for a lighter trainee whose
 * true target is below that floor, roundToPlate clamps the DISPLAYED
 * number up to the bar weight, producing a load that doesn't represent
 * this trainee's actual strength at all. Both numbers were individually
 * "correct" given each implement's physical floor, but pairing them in
 * the same week reads as incoherent (quality-score.ts's load_incoherent
 * "weekly_group_spread" check exists specifically to catch this). The
 * honest fix is the same movement on a lower-floor implement — every
 * affected substitution_group already carries one — not inventing a
 * fractional barbell weight nobody can load.
 *
 * Runs on the BASE (un-periodized) plan, before any weekly/phase-specific
 * load computation, so the swap is decided once and every week of the
 * mesocycle inherits it consistently rather than drifting mid-block. Uses
 * isolationTargetBelowFloor's REFERENCE weight (the standards-model
 * baseline, same one prescribeLoad itself starts from) rather than
 * inspecting the just-computed suggested_load_kg — a rounded value of
 * exactly the floor is genuinely ambiguous (a trainee whose true target
 * is a few kg over the floor rounds to the same displayed number as one
 * who's meaningfully under it), while the reference weight says directly
 * whether THIS trainee's target sits below THIS implement's floor.
 */
function substituteFloorClampedIsolation(
  exercises: Exercise[],
  pool: ExerciseEntry[],
  profile: UserProfile,
  experienceLoadGuidance: string,
): void {
  for (let i = 0; i < exercises.length; i++) {
    const entry = findEntry(exercises[i].name)
    if (!entry || !isolationTargetBelowFloor(entry, profile)) continue

    // Every other exercise-adding pass in this file (fillSlot, pickFromTier,
    // refill, balanceWeeklyStructure's swap/addExercise) excludes a
    // candidate whose movement family already appears elsewhere in the same
    // day — this one didn't, because it only ever matched on
    // substitution_group. That's not the same key: Close-Grip Lat Pulldown
    // sits in substitution_group 'row' (it's a row-adjacent lat exercise)
    // but movement family 'pulldown' (MOVEMENT_FAMILIES override, since
    // it's genuinely the same movement as Lat Pulldown wearing a grip
    // variant). A barbell/EZ-bar row whose target rounded below the bar
    // floor would pick it as the lowest-floor 'row'-group sibling even when
    // Lat Pulldown was already sitting on the same day — two pulldowns,
    // identical prescription, on the same session.
    const otherFamilies = new Set(
      exercises
        .filter((_, j) => j !== i)
        .map(ex => findEntry(ex.name))
        .filter((e): e is ExerciseEntry => !!e)
        .map(e => getMovementFamily(e)),
    )

    // Lowest-floor same-substitution_group sibling available in the
    // constrained pool — equipment/injury/experience filtering has
    // already run by this point, so every candidate here is genuinely
    // eligible for this trainee, not just theoretically lower-floor.
    const sibling = pool
      .filter(e =>
        e.substitution_group === entry.substitution_group &&
        e.name !== entry.name &&
        !otherFamilies.has(getMovementFamily(e)),
      )
      .sort((a, b) => getEquipmentFloorKg(a) - getEquipmentFloorKg(b))[0]
    if (!sibling) continue

    const ex = exercises[i]
    const load = prescribeLoad(sibling, profile, { targetRpeLabel: ex.intensity, isFirstBlock: true, sets: ex.sets })
    exercises[i] = {
      ...ex,
      id: sibling.id,
      name: sibling.name,
      prescription_type: sibling.prescription_type,
      load_guidance: `${experienceLoadGuidance} ${load.basis}`,
      suggested_load: load.display,
      suggested_load_kg: load.starting_weight_kg,
      load_source: load.load_source,
      per_set_load: load.per_set,
      // The spread above carries `ex`'s selection_note forward, but that note
      // was written to explain the OLD exercise's win over its OWN runner-up
      // — it says nothing true about `sibling`. Left in place, a floor-clamp
      // swap would attach one exercise's "why" to a completely different
      // exercise's name (caught live: a Landmine Press row showing the note
      // "Single-Leg Dumbbell Calf Raise over Calf Raises... " — true of
      // neither exercise actually in that slot).
      selection_note: undefined,
    }
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

/**
 * ONE LIFT, ONE WEIGHT, IN A GIVEN WEEK — the half the per-slot memo cannot
 * reach.
 *
 * `weightDecidedThisWeek` (in the weekly build loop) already claims this rule
 * and states the tie-break: "the LOWER one wins: never tell someone to lift
 * more than the lift has earned elsewhere in the same week." It only holds
 * when the lower weight is prescribed FIRST. The memo is consulted while each
 * slot is being built, so it can pull a later day DOWN to an earlier one, and
 * has nothing to pull an earlier day down WITH — that day's object is already
 * finished. When the higher weight comes first the rule silently does not
 * apply.
 *
 * MEASURED, on the audit's own grid: Shoulder Press Machine, week 3,
 * intermediate/100kg/full_gym — Monday 45kg, Wednesday 32.5kg, identical
 * 3x11-13 @ RPE 6-7. Five cases in 1,536 lift-weeks, every one of them the
 * same shape: the heavier day came first. test:week-load-consistency §2 has
 * been red on these.
 *
 * Runs over the FINISHED week, so day order stops mattering, and runs BEFORE
 * enforceLoadCoherence so the per-day safety ceilings still get the last word
 * — those legitimately differ by day (a unilateral accessory is bounded
 * against THAT day's main lift). Note that after this pass, no ceiling
 * actually fires on a same-prescription pair anywhere in the audit's grid:
 * the gate's old exemption for that shape was covering for the day-order bug
 * above, and has been deleted rather than loosened.
 *
 * EXPORTED FOR ITS DIRECTION TO BE PINNED. The sweep in
 * test:week-load-consistency §2 proves the two days AGREE; it cannot see
 * WHICH of them moved, and swapping Math.min for Math.max left every gate in
 * the repo green — test:audit's 17,423 combos included — while inverting the
 * one thing that matters here: a week that quietly asks for MORE than the
 * lift earned. That gate's §4 calls this directly with a two-day fixture.
 */
export function enforceOneWeightPerPrescription(days: WorkoutDay[]): void {
  const byPrescription = new Map<string, { ex: Exercise; entry: ExerciseEntry }[]>()
  for (const day of days) {
    for (const ex of day.exercises) {
      if (ex.suggested_load_kg == null) continue
      const entry = findEntry(ex.name)
      if (!entry) continue
      // The same key the memo keys on, and the same one the gate groups by:
      // two days with different set counts are different prescriptions and
      // are allowed to differ.
      const key = `${ex.name}|${ex.sets}|${ex.reps}|${ex.intensity}`
      const bucket = byPrescription.get(key)
      if (bucket) bucket.push({ ex, entry })
      else byPrescription.set(key, [{ ex, entry }])
    }
  }
  for (const items of byPrescription.values()) {
    if (items.length < 2) continue
    const min = Math.min(...items.map(i => i.ex.suggested_load_kg!))
    for (const { ex, entry } of items) {
      if (ex.suggested_load_kg! > min) rebuildLoadForExercise(ex, entry, min)
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
  const reps = isPrimer ? oldExercise.reps : assignSetsRepsFromConfig(newEntry, styleConfig, experience, getGoalPolicy(profile.fitness_goal || 'hypertrophy'), profile.session_duration_preference).reps
  const assistance = isPrimer ? null : prescribeAssistance(newEntry, profile, 1, false)
  return {
    ...oldExercise,
    id: newEntry.id,
    name: newEntry.name,
    reps,
    substitution: getSubstitution(newEntry, pool, allSelectedNames),
    intensity,
    prescription_type: newEntry.prescription_type,
    load_guidance: isPrimer ? oldExercise.load_guidance : (assistance ? assistanceGuidance(assistance) : `${experience.load_guidance} ${load.basis}`),
    suggested_load: isPrimer ? 'Light' : load.display,
    suggested_load_kg: isPrimer ? null : load.starting_weight_kg,
    load_source: isPrimer ? undefined : load.load_source,
    per_set_load: isPrimer ? null : load.per_set,
    // Old exercise's assistance fields (spread above) must not leak through
    // a swap into a non-assistance exercise — explicit undefined here always
    // wins over the spread, mirroring how suggested_load_kg already
    // self-corrects via prescribeLoad's own null-for-bodyweight return.
    suggested_assistance_kg: assistance?.assistance_kg,
    assistance_ready_to_graduate: assistance?.ready_to_graduate,
    superset_label: undefined,
    // Same stale-identity risk as substituteFloorClampedIsolation: the
    // spread above carries oldExercise.selection_note forward, but that note
    // explained why the OLD exercise beat ITS OWN runner-up — nothing here
    // recomputes a reason for newEntry, so it must not inherit one that
    // isn't true of it.
    selection_note: undefined,
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
    const sr = assignSetsRepsFromConfig(entry, styleConfig, experience, getGoalPolicy(profile.fitness_goal || 'hypertrophy'), profile.session_duration_preference)
    const load = prescribeLoad(entry, profile, { targetRpeLabel: intensity, isFirstBlock: true, sets: sr.sets })
    const assistance = isPrimer ? null : prescribeAssistance(entry, profile, 1, false)
    days[dayIdx].exercises.push({
      id: entry.id,
      name: entry.name,
      sets: sr.sets,
      reps: sr.reps,
      rest: sr.rest,
      substitution: getSubstitution(entry, pool, allSelectedNames),
      intensity,
      prescription_type: entry.prescription_type,
      load_guidance: isPrimer ? 'Stay light and controlled. This is preparation, not a working set.' : (assistance ? assistanceGuidance(assistance) : `${experience.load_guidance} ${load.basis}`),
      suggested_load: isPrimer ? 'Light' : load.display,
      suggested_load_kg: isPrimer ? null : load.starting_weight_kg,
      load_source: isPrimer ? undefined : load.load_source,
      per_set_load: isPrimer ? null : load.per_set,
      suggested_assistance_kg: assistance?.assistance_kg,
      assistance_ready_to_graduate: assistance?.ready_to_graduate,
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

    const usedFamilies = slot ? dayFamilies(slot.dayIdx) : null
    const forbidden = slot ? dayForbidden(slot.dayIdx) : null
    const eligible = (e: ExerciseEntry) =>
      classifyForCoverage(e.movement_pattern) === missing &&
      e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer' &&
      !usedFamilies!.has(getMovementFamily(e)) &&
      !forbidden!.has(e.movement_pattern)
    const replacement = slot ? (pool.find(e => eligible(e) && !weeklyUsed.has(e.name)) ?? pool.find(eligible)) : null

    if (slot && replacement) {
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
      continue
    }

    // No swappable slot at all — every accessory slot on every eligible day
    // was either protected or absent. Previously this just gave up here,
    // silently: a profile with exactly ONE candidate for a pattern (a
    // constrained equipment/injury pool, e.g. Dumbbell Floor Press as the
    // only surviving horizontal_push for a shoulder injury on minimalist
    // equipment) got no attempt at all to place it, because the code only
    // ever tried to SWAP an existing slot, never to ADD one. Same Fix-2
    // authority the push:pull pass below already has: add a whole new
    // exercise instead of leaving the pattern absent. One candidate,
    // repeated every week, is worse variety than several — but it is far
    // better than the pattern being missing outright, which for an injured
    // profile can mean "no pressing in this plan at all" even though a
    // safe press exists.
    let addTarget = days.findIndex((_, i) => dayAllowsCoveragePattern(i, missing))
    let overriddenTrack = false
    if (addTarget === -1) {
      // Every day's TRACK forbids this pattern outright — observed for
      // injured/equipment-constrained pools where day-focus selection never
      // offered a track carrying this pattern at all (a shoulder injury
      // thinning the push-capable exercise pool means no day got assigned
      // "Push & Press", so EVERY day's template forbids horizontal_push,
      // not just some of them). The swap path above already respects track
      // identity for good reason (never plant a bench press on a day
      // labelled "Pull & Hinge") — but that guard assumes an alternative
      // day exists. When none does, honouring it means the pattern is
      // absent from the whole week even though a safe candidate exists in
      // the pool. A single candidate on an imperfectly-labelled day is
      // still a real, safe rep for the user; total absence is not better
      // structure, it is a worse plan wearing tidier labels. Last resort
      // only: falls through to the least-loaded day, family/duplicate
      // checks still apply.
      addTarget = days.reduce((best, _, i) => (days[i].exercises.length < days[best].exercises.length ? i : best), 0)
      overriddenTrack = true
    }
    const addCandidateBase = (e: ExerciseEntry) =>
      classifyForCoverage(e.movement_pattern) === missing &&
      !dayFamilies(addTarget).has(getMovementFamily(e)) &&
      (overriddenTrack || !dayForbidden(addTarget).has(e.movement_pattern)) &&
      !weeklyUsed.has(e.name)
    const addCandidate = pool.find(e => addCandidateBase(e) && e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer')
    // Last resort within the last resort: some patterns (e.g. vertical_pull
    // on bodyweight-only equipment) have exactly one real candidate and it's
    // a tier1 compound lift (Pull-Ups) — the accessory-only exclusion above
    // exists to stop a second heavy compound crowding an already-built day,
    // but that reasoning doesn't apply when it's the ONLY way to place the
    // pattern at all. Same "repeated single candidate beats total absence"
    // call already made for the track-forbidden case above; primer is still
    // excluded (a warm-up movement was never meant to stand in as the week's
    // vertical_pull rep).
    const tier1Candidate = addCandidate ? null : pool.find(e => addCandidateBase(e) && e.mechanics_tier !== 'primer')
    const finalCandidate = addCandidate ?? tier1Candidate

    if (finalCandidate) {
      const usedTier1Fallback = !addCandidate && !!tier1Candidate
      addExercise(addTarget, finalCandidate, `weekly pattern coverage missing '${missing}'${overriddenTrack ? ' (no day track allows it — placed anyway rather than leaving it absent)' : ''}${usedTier1Fallback ? ' (only candidate is a tier1 compound lift — added anyway rather than leaving it absent)' : ''}`)
      coveragePresent.add(missing)
      protectedNames.add(finalCandidate.name)
    } else {
      trace.structure_adjusted.push({
        exercise: '(weekly pattern coverage)', stage: 'structure',
        reason: `'${missing}' pattern is available in the constrained pool but neither a swap nor an add could place it without a movement-family duplicate`,
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
      let placed = false
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
          placed = true
        }
      }
      if (!placed) {
        // Same Fix-2 fallback as the pattern-coverage loop above: no
        // swappable slot (or nothing eligible in it) previously meant just
        // giving up, even when a single squat/hinge candidate existed and
        // could have been ADDED as a new exercise instead.
        const addTarget = days.findIndex((_, i) =>
          !isLegDay(i) && (dayAllowsCoveragePattern(i, 'squat') || dayAllowsCoveragePattern(i, 'hinge')))
        const addCandidate = addTarget >= 0
          ? pool.find(e =>
              (classifyForCoverage(e.movement_pattern) === 'squat' || classifyForCoverage(e.movement_pattern) === 'hinge') &&
              e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'primer' &&
              !dayFamilies(addTarget).has(getMovementFamily(e)) &&
              !dayForbidden(addTarget).has(e.movement_pattern) &&
              !weeklyUsed.has(e.name)
            )
          : undefined
        if (addTarget >= 0 && addCandidate) {
          addExercise(addTarget, addCandidate, `legs trained on only ${legDayCount} day(s), need >=2 on a ${days.length}-day split`)
          protectedNames.add(addCandidate.name)
        } else {
          trace.structure_adjusted.push({
            exercise: '(weekly leg-day coverage)', stage: 'structure',
            reason: `legs trained on only ${legDayCount} day(s) of ${days.length} — neither a swap nor an add could give a second leg exposure`,
          })
        }
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
function enforceDayDurationBudget(
  day: WorkoutDay,
  budgetSeconds: number,
  // Ashley's ruling, 29 Aug 2026, on the one trade-off ankle/wrist/elbow
  // rehab introduced: "shorten the rehab set when a session would overrun."
  // Empty for an uninjured trainee, which makes every branch below inert.
  flaggedJoints: Set<string> = new Set(),
): WorkoutDay {
  if (day.exercises.length === 0) return day
  let exercises = day.exercises
  let guard = 0
  while (estimateDaySeconds({ ...day, exercises }) > budgetSeconds && guard < 30) {
    guard++
    const trimmable = exercises
      .map((ex, i) => {
        const entry = findEntry(ex.name)
        const role = entry ? getVolumeRole(entry) : null
        // THE GUARANTEE IS PRESENCE, NOT VOLUME. Rehab is a required slot and
        // a primer, so it was doubly untouchable here: primers are excluded
        // from trimming outright, and the slot cannot be dropped. Measured
        // consequence — a wrist-injured trainee on bodyweight/30-45/
        // bodybuilding ran 43min against a 37min budget, because the one
        // extra movement had no give in it. One set of a rehab drill still
        // carries the rehab, so its floor is 1 where everything else is 2.
        const isRehab = !!entry && entry.mechanics_tier === 'primer' && isIndicatedFor(entry, flaggedJoints)
        const floor = isRehab ? 1 : role ? getRoleSetFloor(role) : 2
        return { i, sets: ex.sets, entry, role, floor, isRehab }
      })
      // The ordinary warm-up primer stays untouchable; the rehab one does not.
      .filter(t => t.entry && (t.entry.mechanics_tier !== 'primer' || t.isRehab) && t.sets > t.floor)
    if (trimmable.length === 0) break
    // Accessories/isolation trim first; main lift AND conditioning rounds
    // are protected until nothing else is left to give — "accessories/core
    // trim to fit what remains, never the conditioning" (Part 4).
    const protectedRoles = new Set(['main', 'conditioning'])
    // Three tiers, not two: accessories give first, then the rehab set, and
    // only then the main lift and conditioning. Trimming someone's squat to
    // preserve two sets of wrist circles would be the wrong way round.
    //
    // Provably inert without an injury: with no flagged joints nothing is
    // isRehab, so `accessories` equals the old `nonProtected`, `rehabOnly` is
    // empty, and this collapses to exactly the previous expression.
    const accessories = trimmable.filter(t => !t.isRehab && (!t.role || !protectedRoles.has(t.role)))
    const rehabOnly = trimmable.filter(t => t.isRehab)
    const candidates = accessories.length > 0 ? accessories : rehabOnly.length > 0 ? rehabOnly : trimmable
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
    e => !e.retired && !exclusions.some(ex => ex.toLowerCase() === e.name.toLowerCase())
  )
  pool = stageEquipmentFilter(pool, profile.equipment_access || 'full_gym', throwaway)
  pool = stageInjuryFilter(pool, [...pool], profile.injuries || [], throwaway)
  pool = stageStyleFilter(pool, profile.training_style || 'hybrid', throwaway, getFlaggedJoints(profile.injuries || []))
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
  // Warn on CONTRAINDICATION, not participation. A movement deliberately
  // included as rehab for the injured joint (Band Pull-Aparts for a
  // shoulder) does load that joint — warning "you've flagged an injury
  // there" about it would contradict the reason it's in the plan.
  //
  // "Good for" rather than the "Chosen to help" this said until rehab was
  // actually prescribed. That older wording was simply false — nothing
  // chose anything, the movement had arrived by luck of the shuffle. It is
  // true now for the guaranteed rehab slot, but this function sees only an
  // exercise and a profile, never which slot placed it, so it still fires
  // on an indicated movement that a perfectly ordinary accessory slot
  // happened to pick. "Good for" is true in both cases and needs no
  // provenance threaded down here to stay true.
  if (isIndicatedFor(exercise, flaggedJoints)) {
    warnings.push(`Good for your ${jointListDisplay(exercise.indicated_joints ?? [])} — keep it light and controlled.`)
  } else {
    const conflictingJoints = contraindicatedJoints(exercise).filter(j => flaggedJoints.has(j))
    if (conflictingJoints.length > 0) {
      warnings.push(`Loads your ${jointListDisplay(conflictingJoints)} — you've flagged an injury there.`)
    }
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

  // Pre-filter: retired entries, then manual exclusions
  let pool = EXERCISE_DATABASE.filter(e => {
    if (e.retired) return false
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
  pool = stageStyleFilter(pool, trainingStyle, trace, getFlaggedJoints(profile.injuries || []))

  // STAGE 4: Skill / experience
  pool = stageSkillFilter(pool, profile.training_experience || 'novice', trace)

  trace.pool_size_after_each_stage.final = pool.length

  // Build the weekly plan.
  // `|| []` is a backstop, not the contract: training_days is required and
  // array-typed on UserProfile for BOTH plan formats, and assembleProfile
  // always writes all seven entries. The guard exists because an undefined
  // here used to throw outright rather than degrade — an unhelpful failure
  // mode for a field a malformed stored row could plausibly be missing.
  let availableDays = (profile.training_days || []).filter(d => d.available)
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

    const { primer, rehab, main, requiredNames, uncoveredPatterns, selectionNotes } = selectExercisesForTrack(track, pool, counts, weeklyUsed, styleConfig, trace, policy, feasiblePatterns, weeklyAppearanceCount, profile.training_experience || 'novice', profile.session_duration_preference, getFlaggedJoints(profile.injuries ?? []), profile.equipment_access || 'full_gym')
    for (const name of requiredNames) weeklyRequiredNames.add(name)

    // Build exercise list with sets/reps from style config
    const daySlots: { entry: ExerciseEntry; sets: number; reps: string; rest: string; restSeconds: number }[] = []

    if (primer) {
      weeklyUsed.add(primer.name)
      const sr = assignSetsRepsFromConfig(primer, styleConfig, experience, policy, profile.session_duration_preference)
      daySlots.push({ entry: primer, ...sr })
    }

    // Straight after the warm-up, before the working sets: rehab is prep for
    // the joint that's complaining, so it belongs where the joint is still
    // fresh. Deliberately NOT folded into `main` — that list is sorted by
    // tier at the end of selectExercisesForTrack, which would bury a tier3
    // quad set behind every compound in the session.
    if (rehab) {
      weeklyUsed.add(rehab.name)
      allSelectedNames.add(rehab.name)
      weeklyAppearanceCount.set(rehab.name, (weeklyAppearanceCount.get(rehab.name) ?? 0) + 1)
      const sr = assignSetsRepsFromConfig(rehab, styleConfig, experience, policy, profile.session_duration_preference)
      daySlots.push({ entry: rehab, ...sr })
    }

    for (const entry of main) {
      weeklyUsed.add(entry.name)
      allSelectedNames.add(entry.name)
      weeklyAppearanceCount.set(entry.name, (weeklyAppearanceCount.get(entry.name) ?? 0) + 1)
      const sr = assignSetsRepsFromConfig(entry, styleConfig, experience, policy, profile.session_duration_preference)
      daySlots.push({ entry, ...sr })
    }

    // STAGE 5: Time-cap optimization per day
    const preTimeCapNames = new Set(daySlots.map(s => s.entry.name))
    const optimized = stageTimeCap(daySlots, budgetSeconds, trainingStyle, policy, trace, requiredNames)
    // stageTimeCap's Phase 4 can drop an exercise outright under duration
    // pressure — that name was already added to weeklyUsed/allSelectedNames
    // above, on the assumption it was staying. Left uncleared, it becomes a
    // permanent ghost: later weekly-balance passes see the name as "already
    // used this week" and refuse to place it again, even though no day
    // actually carries it — the exact shape that made a genuinely-available
    // single candidate (e.g. Pull-Ups, dropped from one day for time, then
    // unavailable to the weekly vertical_pull coverage backstop) look used
    // up when it never really was.
    const optimizedNames = new Set(optimized.map(s => s.entry.name))
    for (const name of preTimeCapNames) {
      if (!optimizedNames.has(name)) {
        weeklyUsed.delete(name)
        allSelectedNames.delete(name)
      }
    }

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
      const assistance = isPrimer ? null : prescribeAssistance(slot.entry, profile, 1, false)
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
          : (assistance ? assistanceGuidance(assistance) : `${experience.load_guidance} ${load.basis}`),
        suggested_load: isPrimer ? 'Light' : load.display,
        suggested_load_kg: isPrimer ? null : load.starting_weight_kg,
        load_source: isPrimer ? undefined : load.load_source,
        per_set_load: isPrimer ? null : load.per_set,
        suggested_assistance_kg: assistance?.assistance_kg,
        assistance_ready_to_graduate: assistance?.ready_to_graduate,
        selection_note: selectionNotes.get(slot.entry.name),
      }
    })

    substituteFloorClampedIsolation(exercises, pool, profile, experience.load_guidance)

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
      ...(uncoveredPatterns.length > 0 ? { pattern_gap_note: buildPatternGapNote(uncoveredPatterns, main) } : {}),
    }
  })

  balanceWeeklyStructure(days, pool, weeklyUsed, allSelectedNames, experience, profile, trace, styleConfig, weeklyRequiredNames)
  assignConditioningNotes(days, profile, policy)
  enforceLoadCoherence(days)

  const budgetedDays = days.map(d => enforceDayDurationBudget(d, totalBudgetSeconds, getFlaggedJoints(profile.injuries ?? [])))
  // Last step, after every rest-modifying stage (style assignment,
  // stageTimeCap's per-day trimming, this duration-budget pass) — the
  // periodized mesocycle inherits this base plan's warmup/rest fields
  // unchanged via object spread, so fixing it once here is sufficient.
  enforceFatigueCostRestFloor(budgetedDays)

  // Last: if this person's own answers say they aren't exercising yet, the
  // days they'd have trained become walks. Same plan, same days, same week —
  // only what's prescribed inside each day changes. Deliberately AFTER the
  // full build rather than instead of it, so the day structure (which
  // weekdays, how many) is decided by exactly the same code for everyone.
  const finalDays = isStartingOut(profile) ? applyStartingOut(budgetedDays, 1) : budgetedDays

  return { plan: finalDays, constraint_trace: trace, requiredNames: Array.from(weeklyRequiredNames) }
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
  // True when almost nothing this week carries a weight — see
  // isLoadlessWeek. Every branch below used to instruct the trainee to add,
  // find, or drop load, which for a bodyweight-only trainee is an
  // instruction about equipment she does not own.
  loadless = false,
): string {
  if (isDeload) {
    // Carries the "resist the urge to push" nudge as a trailing clause
    // rather than a second sentence: it used to be the opening of a separate
    // deload preamble that announced the same thing this sentence does, and
    // splitting it back out would restore the duplication.
    return loadless
      ? 'Deload week — volume steps back so you arrive at the next block recovered, not because progress stalled; resist the urge to push.'
      : 'Deload week — load and volume both step back so you arrive at the next block recovered, not because progress stalled; resist the urge to push.'
  }
  if (isCalibrationWeek) {
    return loadless
      ? 'Start easier than you think you need — find the version of each move where the last rep feels like RPE 6, log what you actually did, and next week builds from YOUR numbers.'
      : 'Loads start deliberately light — find the weight where the last rep feels like RPE 6, log it, and next week builds from YOUR numbers.'
  }
  // A loadless week has no weight lever, so it reads as reps-emphasis
  // regardless of what the goal would otherwise ramp.
  const rampsLoad = policy.progressionEmphasis === 'load' && !loadless
  if (weekInBlock === 1) {
    if (rampsLoad) return 'Baseline week — this sets the working weight that every later week in the block adds load on top of.'
    return loadless
      ? 'Baseline week — this sets the rep target every later week in the block builds on.'
      : 'Baseline week — weight holds flat this block by design; this sets the rep target every later week builds on.'
  }
  if (rampsLoad) {
    return weekInBlock === 2
      ? 'Load goes up this week on the main lifts — same rep target, more weight than last week.'
      : 'Load goes up again this week — the heaviest working sets of the block before the deload.'
  }
  if (loadless) {
    return weekInBlock === 2
      ? 'The work goes up this week — same movements, more reps than last week. That IS the progression when there is no weight to add, not a missing one.'
      : 'More again this week — the hardest working sets of the block before the deload.'
  }
  // 'reps' or 'maintain' emphasis: weight intentionally holds flat, reps are
  // the real lever. Named explicitly so this doesn't read as stagnation.
  return weekInBlock === 2
    ? 'Weight holds flat by design — reps climb this week. That IS the progression for this goal, not a missing one.'
    : 'Weight still holds flat, reps climb again — building work capacity before the next block changes the stimulus.'
}

/**
 * True when a week's working sets are overwhelmingly weightless, so every
 * sentence about adding, finding or dropping load is talking about equipment
 * this trainee does not have.
 *
 * Asked of the WEEK'S OWN EXERCISES rather than of equipment_access, and that
 * is the point. EQUIPMENT_SETS.bodyweight includes 'weighted backpack' —
 * genuinely the one progressive load available with no gym — so a
 * bodyweight-tier plan does contain a couple of real numbers (Backpack Row,
 * Loaded Backpack Walk). Keying on the equipment answer would have declared
 * those weightless; keying on the plan gets both right. MEASURED share of
 * working sets carrying a load, across four goals x three experience levels
 * x three splits: bodyweight 12.2%, minimalist 52.2%, full_gym 77.0%. The
 * threshold sits in the gap with room on both sides rather than on top of
 * either number, and test:loadless-notes prints all three every run so it
 * cannot drift without someone seeing it.
 */
const LOADLESS_WEEK_MAX_LOADED_SHARE = 0.25

function isLoadlessWeek(days: WorkoutDay[]): boolean {
  let working = 0, loaded = 0
  for (const day of days) {
    for (const ex of day.exercises) {
      if (ex.tier === 'tier_0_primer') continue
      working++
      if (ex.suggested_load_kg != null) loaded++
    }
  }
  // NO WORKING SETS AT ALL IS THE MOST LOADLESS A WEEK CAN BE. This returned
  // false — treating "nothing to measure" as "loaded" — which is exactly
  // backwards for the one plan shape that has no exercises whatsoever: a
  // starting-out walking week. That week was handed the LOADED progression
  // copy, so a plan containing four walks and no lifts told the trainee
  // "load goes up this week on the main lifts". Found on Ashley's screen,
  // 1 Sep 2026.
  if (working === 0) return true
  return loaded / working <= LOADLESS_WEEK_MAX_LOADED_SHARE
}

/**
 * Gives a weightless, rep-based working lift the block's tempo — the phase's
 * only available voice when there is no weight for it to speak through.
 *
 * Runs AFTER enforceLoadCoherence (loads are final, so "is this weightless"
 * is answerable) and BEFORE trimWeekRestForBudget/applyDurationFiller, which
 * is not a style preference: a 4-1-1 rep is 6s against SECONDS_PER_REP's
 * assumed 3.5, so a tempo assigned after the duration passes would be 71%
 * of working time those passes never saw. Same failure shape as a
 * prescription string the duration model cannot parse.
 *
 * Four exclusions, each for a different reason:
 *   - DELOAD: the week exists to back off. A slower, harder rep is the
 *     opposite of that.
 *   - non-'reps' prescriptions: a hold ('30-45s'), a carry ('40m') and an
 *     interval have no reps to slow down, so a tempo would be a unit
 *     mismatch — the same class of error as shiftReps' minReps being used as
 *     a seconds floor.
 *   - primers: movement prep, deliberately easy, never a working set.
 *   - anything carrying a weight: there the weight IS the lever, and adding
 *     a second one at the same time is what "one lever at a time" exists to
 *     prevent.
 */
function applyTempoPrescription(
  days: WorkoutDay[],
  phase: TrainingPhase,
  isDeload: boolean,
  experience: TrainingExperience,
): void {
  if (isDeload) return
  const tempo = getPhaseTempo(phase)
  if (!tempo) return
  const notation = formatTempo(tempo)
  const improvisedCeiling = IMPROVISED_IMPLEMENT_CEILING_KG[experience]
    ?? IMPROVISED_IMPLEMENT_CEILING_KG.novice
  for (const day of days) {
    for (const ex of day.exercises) {
      const entryForLoad = ex.suggested_load_kg != null
        ? EXERCISE_DATABASE.find(e => e.name === ex.name)
        : undefined
      // "NO MORE LOAD TO ADD", not "no load at all" — the condition this
      // function was written with, widened to the case it always meant.
      //
      // A weighted backpack has a hard physical ceiling
      // (IMPROVISED_IMPLEMENT_CEILING_KG, 8/12/20/25kg by experience). A lift
      // sitting on it has a weight — 20kg — and was therefore skipped, even
      // though 20kg is every kilogram it will ever have. MEASURED: Backpack
      // Row was 91 of 217 repeated week-to-week transitions, the single
      // largest contributor in the app.
      //
      // The exclusion below for accepts_added_load is Ashley's earlier ruling
      // and is NOT disturbed by this: a belt can always take another plate,
      // so slowing a chin-up down would paper over a gap instead of closing
      // it. A backpack cannot. That is the whole distinction — one implement
      // has more to give and one does not.
      const atImprovisedCeiling = entryForLoad != null
        && isImprovisedLoadImplement(entryForLoad)
        && (ex.suggested_load_kg ?? 0) >= improvisedCeiling
      if (ex.suggested_load_kg != null && !atImprovisedCeiling) continue
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (!entry || entry.mechanics_tier === 'primer') continue
      if (entry.prescription_type !== 'reps') continue
      // A chin-up or a dip CAN take a belt or a loaded backpack, so "there is
      // no weight to add" is false for them — showing no weight there is a
      // gap in this app, not a fact about the movement. Ashley's call, and
      // the right one: slowing the rep down would paper over that gap
      // instead of closing it. Excluded here and flagged in BACKLOG; the
      // real fix is prescribing the added load.
      if (entry.accepts_added_load) continue
      // Belt and braces: prescription_type says what the entry IS, this says
      // what the string actually holds. A mismatch between them has shipped
      // before (fixedUnitPrescription exists because of it).
      if (!/^\d+(\s*-\s*\d+)?$/.test(String(ex.reps).trim())) continue
      ex.tempo = notation
    }
  }
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
    // The same shape of bug as the primer fix above, just never caught: no
    // key here ever matched 'cardio' (MechanicsTier's real value for every
    // conditioning entry — Burpees, Mountain Climbers, Elliptical, Cycling
    // Intervals, etc.), so every cardio-tagged exercise silently fell
    // through to the 'tier_3_isolation' default and rendered under
    // "Accessory" instead of the dedicated Finisher section
    // tier_4_finisher already exists for. Confirmed dead until this line:
    // progression-engine.ts's NON_PROGRESSABLE_TIERS already excludes
    // tier_4_finisher from load-progression tracking, and quality-score.ts
    // / TodayPanel.tsx already branch on it — nothing ever produced it.
    cardio: 'tier_4_finisher',
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
 *
 * "main" here MUST match isMainLiftSlot's definition (mesocycle-edit.ts —
 * ex.tier === 'tier_1_primary', i.e. mechanics_tier === 'tier1_compound',
 * no other condition). This function used to additionally require
 * isExternallyLoaded(dbEntry), which silently fell through to 'accessory'
 * for the two bodyweight tier1_compound exercises (Pull-Ups, Chin-Ups —
 * the only two tier1_compound options for the vertical_pull pattern, so
 * any vertical-pull main-lift day was unavoidably affected). That made
 * them eligible for the 2-week accessory sub-rotation below, so an
 * intermediate/advanced trainee's PULLING main lift could silently become
 * a DIFFERENT exercise mid-block — confirmed live (Pull-Ups -> Pull-Ups ->
 * Chin-Ups across one block's 3 weeks) and confirmed as the direct cause
 * of two downstream problems: quality-score.ts's main_lift_changed_within_block
 * check, and progressive overload silently inheriting a position-indexed
 * baseline (blockBaselineKg) computed for a completely different
 * exercise. Checked: isExternallyLoaded was not load-bearing for anything
 * else here — every OTHER tier1_compound exercise in the database (Bench
 * Press, Barbell Rows, Overhead Press, Deadlifts, Trap Bar Deadlift,
 * Barbell Squats) is externally loaded already, so dropping the check
 * changes classification for exactly these two exercises and nothing else.
 */
function classifyRotationTiers(exercises: Exercise[]): RotationTier[] {
  let mainCount = 0
  return exercises.map(ex => {
    const dbEntry = EXERCISE_DATABASE.find(e => e.name.toLowerCase() === ex.name.toLowerCase())
    if (!dbEntry || dbEntry.mechanics_tier === 'primer') return 'core'
    if (dbEntry.movement_pattern === 'core' || dbEntry.movement_pattern === 'carry') return 'core'

    // "First 1-2 compounds" — in practice this is almost always exactly one
    // exercise (getExerciseCountForDuration always asks for a single tier1
    // slot), but the cap stays at 2 to match the spec for any future
    // session shape that requests more.
    if (dbEntry.mechanics_tier === 'tier1_compound' && mainCount < 2) {
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
    // Real per-day fixed cost (actual warmup, not the generic reserve;
    // session overhead; any post-session cardio finisher) subtracted from
    // the FULL budget — matching estimateDaySeconds's own accounting
    // exactly, not a cheaper working-set-only approximation. A prior
    // version compared bare estimateSlotsSeconds against a generic
    // (totalBudgetSeconds - warmupReserve) figure, which was measurably
    // more generous than the real final check trimWeekRestForBudget (and
    // sizeBlockToRestBudget, just above this call) both use — caught live
    // when top-up was still re-adding sets a same-block structural trim had
    // just correctly removed, because top-up's own target didn't agree
    // with what the day would actually be checked against later.
    const fixedCostSeconds = (day.warmup?.total_seconds ?? 0) + SESSION_OVERHEAD_SECONDS +
      (day.recommendedCardio?.timing === 'post_session' ? day.recommendedCardio.duration * 60 : 0)
    const targetSeconds = (totalBudgetSeconds - fixedCostSeconds) * 0.95
    const entries = day.exercises.map(ex => EXERCISE_DATABASE.find(e => e.name.toLowerCase() === ex.name.toLowerCase()))
    const topUpAnchor = dayAnchorExercise(day.exercises)
    const restSeconds = day.exercises.map((ex, i) => {
      const match = ex.rest.match(/(\d+)/)
      const base = match ? parseInt(match[1], 10) : 60
      // Same main-lift floor the real per-week derivation applies. Without
      // it this forecast under-costs exactly the sessions the floor makes
      // longer, and top-up would re-add sets the day can no longer afford.
      // The estimator must see the promoted floor too, or it under-costs
      // exactly the days the floor lengthens and top-up re-adds sets the
      // session can no longer afford — the failure the tier-1 round already
      // hit once and fixed here.
      return Math.max(20, base + phaseConfig.rest_adjust_seconds,
        mainLiftRestFloor(entries[i], policy, ex === topUpAnchor))
    })
    const roles = entries.map(e => e ? getVolumeRole(e) : null)
    const roleCeilings = day.exercises.map((_, i) => roles[i] ? getRoleSetCeiling(roles[i]!, isLongSession) : EXTRA_SETS_CAP + 99)
    const reps = day.exercises.map(ex => ex.reps)
    // Cardio-tier exercises are excluded — their volume is already decided
    // once, honestly, by selectExercisesForTrack's minute-based reservation
    // (CARDIO_RESERVED_SHARE). Letting this greedy fill also treat them as
    // eligible (it used to, and a 90+ "long session" already exempts every
    // OTHER main-classified exercise from the isLongSession guard too) is
    // exactly how a correctly-reserved cardio block got re-inflated to
    // 8-9 sets per exercise, blowing the reservation right back past
    // budget through a different lever. Their volume moves only if the
    // reservation itself changes, not via this separate top-up.
    const eligible = day.exercises
      .map((_, i) => i)
      .filter(i => entries[i] && entries[i]!.mechanics_tier !== 'primer' && entries[i]!.mechanics_tier !== 'cardio' && (roles[i] !== 'main' || isLongSession))
      // Accessories/isolation are ordered before mains so round-robin growth
      // fills them first — mains only start climbing once every accessory
      // slot has already hit its own (lower) ceiling.
      .sort((a, b) => (roles[a] === 'main' ? 1 : 0) - (roles[b] === 'main' ? 1 : 0))

    const baseSets = day.exercises.map(ex =>
      Math.max(2, Math.round(ex.sets * policy.setVolumeMultiplier * recoverySetMultiplier * phaseConfig.sets_multiplier))
    )

    // Recovery constraint outranks time budget: low recovery_capacity is
    // exempt from top-up entirely, not just capped by a recovery-scaled
    // ceiling. The ceiling-based path below still let available session
    // time pull sets back up toward what a high-recovery peer would get,
    // which is exactly how a deliberate ~25% volume cut
    // (RECOVERY_SET_MULTIPLIER.low) was quietly eroding to a much smaller
    // real-world reduction (measured: only ~14% actual, not ~25%, in the
    // majority of low-recovery combos before this exemption). The 2-set
    // floor in baseSets above is untouched.
    //
    // LOAD-BEARING COUPLING — do not change one side without the other:
    // quality-score.ts's scoreTimeRatio treats every low-recovery
    // under-budget day as a full pass, on the assumption that it can ONLY
    // be under budget because of this exact exemption — never because the
    // engine failed to fill it. That assumption is only true as long as
    // this function returns zero top-up for low recovery. Re-enable top-up
    // here (even partially) without updating scoreTimeRatio's exemption to
    // match, and the scorer will silently stop catching genuine under-fill
    // for low-recovery profiles — a real regression that the 9216-combo
    // harness will NOT flag, since the score would just look artificially
    // perfect.
    if (profile.recovery_capacity === 'low') {
      return day.exercises.map(() => 0)
    }

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

/**
 * stageTimeCap's set-count/removal trimming (STAGE 5, selection time) runs
 * ONCE, against block 1's anatomical_adaptation rest (-15s, see
 * PHASE_CONFIGS in periodization.ts). Every later block's phase can add real
 * rest time on top — Maximal Strength +45s, Power +60s — that the one-time
 * trim has no visibility into, since sets/reps/rest are all recomputed per
 * WEEK, well after selection-time trimming already ran. Measured directly
 * against the 9216-combo harness: the large majority of over-budget
 * worst-days land at week 9+ (block 3 onward, where 3 of 4 goal sequences
 * hit a rest-heavy strength/power phase), not week 1.
 *
 * Rather than re-running the full destructive stageTimeCap cascade (which
 * trims SETS — exactly what progression's frozen_week/sets_not_flat checks
 * expect to stay flat across a block's three loading weeks), this only
 * pulls the lever stageTimeCap's own Phase 2 already treats as acceptable
 * under time pressure: rest, never sets, and never the main lift below the
 * 60s floor structure's own main_lift_short_rest check expects. Deload
 * weeks are never passed in here — they're deliberately light and unlikely
 * to run over, and touching their rest would fight the same "designed to be
 * shorter" reasoning applyDurationFiller and scoreTimeFit already carve out
 * for them.
 */
function trimWeekRestForBudget(
  days: WorkoutDay[],
  budgetSeconds: number,
  trimLog?: ConstraintTraceEntry[],
  /**
   * Floor under a LOADED main lift's rest, from the goal's own
   * minLoadedMainLiftRestSeconds. Without it this function's hardcoded 60s
   * quietly overrode the goal floor set at prescription time — the
   * prescription said 90s for a conditioning squat and the trimmer took it
   * straight back to 60. Undefined keeps the historical 60s.
   */
  loadedMainLiftFloorSeconds?: number,
): void {
  for (const day of days) {
    if (day.exercises.length === 0) continue
    let seconds = estimateDaySeconds(day)
    if (seconds <= budgetSeconds) continue

    // Accessories/isolation first, main lift last — same priority order as
    // stageTimeCap's own Phase 5 set-trimming. Cardio-tier exercises
    // (tier_4_finisher — mapTier's only mapping to that tier, so this is
    // cardio-exclusive) are excluded entirely, not just deprioritized.
    // Cutting an interval's rest toward this 30s floor doesn't shave time
    // off the exercise the way it does for a lift — it changes the
    // exercise into a different, more intense modality, and which of
    // several cardio exercises loses its ratio is purely an accident of
    // iteration order (measured live: two of seven identically-categorized
    // exercises got cut, the rest didn't, for no principled reason). A day
    // over budget because of its cardio reservation should shed a whole
    // exercise via selectExercisesForTrack's reservation, not have one
    // arbitrary survivor's rest quietly degraded here; a day over budget
    // for other reasons still trims normally, cardio just isn't a
    // candidate.
    // THE FIFTH PATH. The promoted floor was applied at four sites and missed
    // here, and this one trims LAST — so 227 promoted anchors were floored to
    // 60s upstream and then walked back down to 30 by this loop. Exactly the
    // shape the tier-1 round already recorded ("a constraint asserted at
    // three paths, missed at the fourth"), repeated one round later on the
    // same constraint. Caught by measuring the outcome rather than trusting
    // that wiring the call sites was the whole job.
    //
    // A promoted anchor counts as main HERE TOO: it is trimmed last, and its
    // floor is 60 rather than 30.
    const trimAnchor = dayAnchorExercise(day.exercises)
    const order = day.exercises
      .map((ex, i) => ({ i, isMain: ex.tier === 'tier_1_primary' || ex === trimAnchor }))
      .filter(({ i }) => day.exercises[i].tier !== 'tier_4_finisher')
      .sort((a, b) => Number(a.isMain) - Number(b.isMain))

    for (let pass = 0; pass < 6 && seconds > budgetSeconds; pass++) {
      let trimmed = false
      for (const { i, isMain } of order) {
        if (seconds <= budgetSeconds) break
        const ex = day.exercises[i]
        const restSeconds = parseRestSeconds(ex.rest)
        // The goal's floor only applies to a LOADED main lift, matching where
        // it was set at prescription time — a bodyweight main lift keeps the
        // goal's density, because the risk this guards is a bar, not a tier.
        // A PROMOTED anchor gets the flat 60 only, never the goal's loaded
        // floor — same scoping as mainLiftRestFloor itself: that higher
        // number is a density rule about a barbell main lift, and a promoted
        // Air Squat is not one.
        const isRealMain = ex.tier === 'tier_1_primary'
        const mainFloor = isRealMain && loadedMainLiftFloorSeconds && isExternallyLoaded(findEntry(ex.name) ?? ({} as ExerciseEntry))
          ? Math.max(MAIN_LIFT_REST_FLOOR_SECONDS, loadedMainLiftFloorSeconds)
          : MAIN_LIFT_REST_FLOOR_SECONDS
        const floor = isMain ? mainFloor : 30
        if (restSeconds <= floor) continue
        const newRest = Math.max(floor, restSeconds - 15)
        day.exercises[i] = { ...ex, rest: `${newRest}s` }
        trimmed = true
        seconds = estimateDaySeconds(day)
        // A mechanism that silently modifies plans and leaves no trace is
        // precisely how the cardio-reservation overrun stayed hidden for
        // this whole investigation — worth fixing on its own merits,
        // independent of whether a scorer ever reads it (see
        // scoreCardioShare in quality-score.ts and
        // run-trim-magnitude-report.ts, which does).
        trimLog?.push({
          exercise: ex.name, stage: 'time_cap',
          reason: `rest trimmed ${restSeconds}s -> ${newRest}s (day was ${Math.round((seconds + (restSeconds - newRest)) / 60)}min, budget ${Math.round(budgetSeconds / 60)}min) on ${day.day}`,
          secondsCut: restSeconds - newRest,
        })
      }
      if (!trimmed) break
    }
  }
}

/**
 * Runs once per block, inside generateMesocycle's block loop, right after
 * that block's exercise names are rotated and before computeDurationTopUp.
 * Sized against THAT block's own real rest_adjust_seconds — not week 1's,
 * and not a forecast across every future block. Each block already knows
 * its own real phase config by the time this runs, so there's nothing to
 * guess: a day whose structure fit at generation-time's neutral rest can
 * still not fit once a heavier-rest phase's real number is honored (traced
 * live: the worst combo in the 9216-grid needed the identical rest-shave
 * re-applied in 12 of 12 non-deload weeks, growing from ~105s cut in week 1
 * to 855s cut in week 15, because nothing above trimWeekRestForBudget ever
 * asked this question once, per block, up front).
 *
 * Reuses the exact set-drop / exercise-removal priority order stageTimeCap
 * already uses at generation time (Phases 3-5) — this is the same
 * decision, re-run here because the day's real cost has changed, not a new
 * policy.
 *
 * Deliberately never writes an adjusted rest value onto a returned
 * exercise — only structure (sets, whether an exercise survives) changes
 * here. The per-week loop already derives real rest fresh every week via
 * adjustRest(ex.rest, restShift) from this exercise's neutral baseline; if
 * this function also baked the block's adjustment into the stored value,
 * it would apply twice.
 *
 * Budget comparison MUST match trimWeekRestForBudget's own accounting
 * (estimateDaySeconds — real warmup + session overhead + working sets +
 * any post-session cardio — against the full totalBudgetSeconds), not a
 * partial approximation. A first version of this function compared bare
 * working-set time against totalBudgetSeconds-minus-warmup-reserve (mirroring
 * computeDurationTopUp's own shorthand) and under-trimmed for short
 * sessions as a result — session overhead (2min) is a much bigger fraction
 * of a 30-45min budget than a 90+ one, and computeDurationTopUp's shorthand
 * is safe for it (only ever ADDS, so a generous estimate just adds
 * slightly less) in a way this function's DOWNWARD decision is not (a
 * generous estimate here means real overage slips through untrimmed).
 * Caught live: the bodyweight/bodybuilding/beginner/moderate-recovery
 * combo barely improved under the shorthand version (458 of 520 original
 * trim events still firing) because its remapped phase sequence for
 * bodyweight equipment never carries a positive rest_adjust_seconds at
 * all — the entire overage was this session-overhead gap, not a
 * cross-block rest increase, and the shorthand estimate was too generous
 * to see it.
 */
export function sizeBlockToRestBudget(
  blockDays: WorkoutDay[],
  restAdjustSeconds: number,
  totalBudgetSeconds: number,
  protectedNames: Set<string>,
  policy: GoalPolicy,
  trimLog?: ConstraintTraceEntry[],
): WorkoutDay[] {
  return blockDays.map(day => {
    if (day.exercises.length === 0) return day

    // Real, block-adjusted rest — used ONLY for this fit decision, never
    // stored. Same floor as adjustRest so this estimate can't diverge from
    // what the per-week loop will actually derive later. Reuses
    // estimateDaySeconds directly (rather than re-deriving its formula)
    // via a throwaway day object so this can never drift from the same
    // accounting trimWeekRestForBudget checks against later.
    const estimate = (exercises: Exercise[]) => {
      // Re-derived per call rather than hoisted: `exercises` shrinks as this
      // function trims, and the anchor can move when the previous one is cut.
      const anchor = dayAnchorExercise(exercises)
      return estimateDaySeconds({
        ...day,
        exercises: exercises.map(ex => ({
          ...ex,
          rest: `${Math.max(20, parseRestSeconds(ex.rest) + restAdjustSeconds, mainLiftRestFloor(findEntry(ex.name), policy, ex === anchor))}s`,
        })),
      })
    }

    let exercises = day.exercises
    if (estimate(exercises) <= totalBudgetSeconds) return day

    let removedAny = false

    // Phase A: drop sets toward each exercise's role floor, biggest first —
    // same priority order as enforceDayDurationBudget's own safety net.
    // Cardio-tier exempt, same reasoning as trimWeekRestForBudget/
    // stageTimeCap: cutting an interval's sets changes what the exercise
    // IS, not just its duration.
    for (let pass = 0; pass < 10 && estimate(exercises) > totalBudgetSeconds; pass++) {
      const trimmable = exercises
        .map((ex, i) => {
          const entry = findEntry(ex.name)
          const role = entry ? getVolumeRole(entry) : null
          const floor = role ? getRoleSetFloor(role) : 2
          return { i, sets: ex.sets, entry, role, floor }
        })
        .filter(t => t.entry && t.entry.mechanics_tier !== 'primer' && t.entry.mechanics_tier !== 'cardio' && t.sets > t.floor)
      if (trimmable.length === 0) break
      const protectedRoles = new Set(['main', 'conditioning'])
      const nonProtected = trimmable.filter(t => !t.role || !protectedRoles.has(t.role))
      const candidates = nonProtected.length > 0 ? nonProtected : trimmable
      candidates.sort((a, b) => b.sets - a.sets)
      const target = candidates[0].i
      const ex = exercises[target]
      exercises = exercises.map((e, i) => (i === target ? { ...e, sets: e.sets - 1 } : e))
      trimLog?.push({
        exercise: ex.name, stage: 'time_cap',
        reason: `sets trimmed ${ex.sets} -> ${ex.sets - 1} to fit this block's real rest cost on ${day.day}`,
      })
    }

    // Phase B: still over even at every set floor — remove whole
    // exercises, same order as stageTimeCap's own Phase 4 (lowest tier
    // first, since selection sorts tier1->tier2->tier3->cardio so the END
    // of the array is lowest-tier; required-slot and cardio exercises
    // never removed; floor of 3 exercises remaining, matching
    // stageTimeCap's own floor).
    for (let guard = 0; guard < 10 && estimate(exercises) > totalBudgetSeconds && exercises.length > 3; guard++) {
      let removeIdx = exercises.length - 1
      while (removeIdx >= 0) {
        const entry = findEntry(exercises[removeIdx].name)
        if (entry && entry.mechanics_tier !== 'cardio' && !protectedNames.has(exercises[removeIdx].name)) break
        removeIdx--
      }
      if (removeIdx < 0) break
      const removed = exercises[removeIdx]
      exercises = exercises.filter((_, i) => i !== removeIdx)
      removedAny = true
      trimLog?.push({
        exercise: removed.name, stage: 'structure',
        reason: `dropped entirely — ${day.day} still over budget at every set floor once this block's real rest is honored`,
      })
    }

    return removedAny
      ? { ...day, exercises, block_size_note: 'Fewer exercises this block — heavier lifts need longer rest between sets.' }
      : { ...day, exercises }
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
  /**
   * The LOW end of the trainee's stated range, not the midpoint budget. A
   * session under the midpoint can be perfectly fine; a session under the
   * MINIMUM is shorter than the time they actually set aside.
   */
  sessionMinimumSeconds: number,
): void {
  const recovery = profile.recovery_capacity || 'moderate'
  const mobilityOnly = recovery === 'low' || recovery === 'moderate' || profile.conditioning_preference === 'avoid'

  for (const day of days) {
    if (day.exercises.length === 0 || day.conditioning_note) continue
    const actualSeconds = estimateDaySeconds(day)
    const underBySeconds = totalBudgetSeconds - actualSeconds
    // Two triggers, because one flat number cannot serve every tier. The
    // 15-minute gap catches a session well short of the midpoint budget. The
    // minimum catches one that is merely a few minutes short of the midpoint
    // but still under the time the trainee told us they had — and that second
    // case is the one a flat threshold kept missing, because 15 minutes only
    // happens to line up with a tier minimum for "60-90" (75 - 15 = 60
    // exactly). Every other tier had a hole beneath its own minimum: "45-60"
    // filled nothing between 37 and 45 minutes. MEASURED on loading weeks
    // before this: 13% of "45-60" sessions came in under 45 minutes, against
    // 1% for "60-90".
    if (underBySeconds <= FILLER_TRIGGER_SECONDS && actualSeconds >= sessionMinimumSeconds) continue

    // Capped higher than the old 20min (then 30min, then 60min) ceiling now
    // that the honest duration model (session-duration.ts) charges real
    // per-exercise setup overhead and rep-scaled work time — a thin
    // equipment/experience pool (e.g. minimalist + beginner) genuinely
    // cannot fill a 90+ min session with quality distinct lifting, and the
    // honest move is a longer mobility/conditioning close-out, not
    // pretending the gap doesn't exist. A flat 30min was sized for a ~37min
    // (30-45min) budget but was chronically insufficient for a 100min (90+)
    // budget with a thin pool — measured directly against the 9216-combo
    // harness at each step. 90min is bounded by the longest budget tier
    // itself (90+ => 100min) — someone who told onboarding they have that
    // much time available isn't hearing an implausible number if the honest
    // answer is "the rest of it goes to mobility, not more lifting."
    const fillerMinutes = Math.min(90, Math.round(underBySeconds / 60))

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

/** The bottom of a "12-17" rep label, or null when it isn't one. */
function repLowOf(reps: string | undefined): number | null {
  const m = String(reps ?? '').match(/^(\d+)/)
  return m ? Number(m[1]) : null
}

/** Carries progress by DISTANCE, not weight — see the load-floor comment. */
function isCarryByName(name: string): boolean {
  const entry = EXERCISE_DATABASE.find(e => e.name === name)
  return entry?.prescription_type === 'distance_load'
}

export function generateMesocycle(
  profile: UserProfile,
  baseWorkout?: WorkoutDay[],
  exclusions: string[] = [],
  /**
   * Optional out-parameter, mutated in place — same idiom as the
   * ConstraintTrace threading elsewhere in this file. Nothing inside this
   * function reads it back; it exists purely so a caller (today: the
   * trim-magnitude report) can inspect what trimWeekRestForBudget actually
   * cut, without generateMesocycle's own return type (MesocycleWeek[],
   * relied on by every existing caller) having to change to carry it.
   */
  trimLog?: ConstraintTraceEntry[],
): MesocycleWeek[] {
  // requiredNames is only available when this function does its own base
  // generation — a caller-supplied baseWorkout (mesocycle-edit.ts's
  // regeneration paths) has no equivalent tracking today, so
  // sizeBlockToRestBudget below just gets nothing to protect in that case,
  // same as stageTimeCap's own protectedNames defaults to empty.
  const basePlanResult = baseWorkout ? undefined : generateExercisePlan(profile, exclusions)
  const baseWeek = baseWorkout ?? basePlanResult!.plan
  const requiredNames = new Set(basePlanResult?.requiredNames ?? [])
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
  // A STATED LIFT THE APP'S OWN TABLE CALLS IMPOSSIBLE ANCHORS NOTHING.
  //
  // Ashley's live profile carried bench 150 kg and deadlift 150 kg at 86 kg
  // bodyweight: the bench is 116% of the advanced one-rep-max estimate, and
  // the pair's 1.00x ratio is below the 1.67x minimum anywhere in the
  // standards table. Her Exercise tab then read "Trap Bar Deadlift 152.5 kg
  // — YOU TOLD US", ramping to 140 x 1, off a number she never gave.
  //
  // Her ruling: ask once, and never skip calibration on it. This is the half
  // that does not depend on anyone answering the question. A flagged lift is
  // still RECORDED and still shown — it simply cannot be the thing a day-one
  // load is built from, because "start conservative and prove it over a week"
  // and "anchor to it immediately" are the same decision twice.
  const flaggedLifts = new Set(
    implausibleLifts(profile, resolveBodyBasis(profile).assumed).map(f => f.lift),
  )
  const knownWorkingWeights: KnownWorkingWeights | undefined = profile.skip_calibration_week
    ? {
        squat: flaggedLifts.has('squat') ? undefined : profile.known_squat_kg,
        bench: flaggedLifts.has('bench') ? undefined : profile.known_bench_kg,
        deadlift: flaggedLifts.has('deadlift') ? undefined : profile.known_deadlift_kg,
      }
    : undefined

  // Whether this trainee may skip the calibration week.
  //
  // `skip_calibration_week` is not sufficient on its own, for two independent
  // reasons, both of which produced a plan that started heavy on a number
  // nobody had ever verified:
  //
  //  1. THE FLAG CAN BE TRUE WITH NOTHING BEHIND IT. onboarding-slots.ts sets
  //     it from `knowsWorkingLifts === true` alone, and the three lift-number
  //     slots are in NEVER_BLOCKING_SLOTS — so tapping "I know my numbers"
  //     and then entering none of them skipped calibration with zero anchors.
  //     Measured: that path prescribed a 55kg woman a mean 2.22x her own
  //     week-1 loads, with no calibration damping anywhere in the program.
  //  2. THE BODY CAN BE ASSUMED. Only squat/goblet_squat/bench/deadlift are
  //     anchored by known weights (KNOWN_WEIGHT_FAMILY); the other ~12
  //     standards categories still come from bodyweight/sex/age. If any of
  //     those was never given, those categories are guesses about a stranger
  //     and calibration is exactly what they need.
  //
  // Ashley's ruling: for someone who still declines, force a calibration week
  // and say why. Note `knownWorkingWeights` above is deliberately NOT gated on
  // this — a trainee who gave real lift numbers but declined their weight
  // keeps those numbers on the lifts they anchor, and gets a calibration week
  // for everything else.
  const hasAnyKnownLift = [profile.known_squat_kg, profile.known_bench_kg, profile.known_deadlift_kg]
    .some(v => v != null && v > 0)
  //  3. A NUMBER NOBODY COULD LIFT IS NOT EVIDENCE OF ANYTHING. Skipping
  //     calibration is the app saying "we already know what you can do";
  //     it must not say that on the strength of a figure its own standards
  //     table rules out. Calibration week already says the right thing —
  //     "loads start deliberately light... next week builds from YOUR
  //     numbers" — which is precisely proving the weight rather than
  //     assuming it.
  //  4. A BEGINNER ALWAYS CALIBRATES. Ashley's ruling, 30 Aug 2026. Tapping
  //     "I know my numbers" set skip_calibration_week regardless of
  //     experience, so someone who had just described themselves as a
  //     beginner could start heavy on a figure nobody had verified — and a
  //     beginner is exactly who is least able to judge whether the number
  //     they typed is right, and least able to absorb it if it is wrong.
  //     Their numbers are still recorded and still anchor loads; what they no
  //     longer do is buy a skipped week.
  const canSkipCalibration = profile.skip_calibration_week === true
    && hasAnyKnownLift
    && flaggedLifts.size === 0
    && profile.training_experience !== 'beginner'
    && !resolveBodyBasis(profile).assumed

  // Persists ACROSS blocks (unlike blockBaselineKg/blockWeek3Kg below, which
  // reset every block) — the last loading week's actual resolved load for a
  // still-unverified exercise, keyed by [dayIndex][exerciseIndex]. Stable
  // indexing across blocks since day/slot structure doesn't change (only the
  // variation NAME in a slot rotates). Deload weeks never write to this —
  // the next block's week 1 steps from the last real loading week, not the
  // deload number. See UNVERIFIED_RAMP_STEP_KG's doc comment.
  const lastUnverifiedLoadingWeekKg: (number | null)[][] = baseWeek.map(day => day.exercises.map(() => null))

  // The same history keyed by EXERCISE NAME rather than by slot position.
  //
  // The slot tracker above is indexed by [dayIndex][exerciseIndex], and the
  // variation occupying a slot ROTATES at block boundaries — so a lift
  // returning to a slot it left five weeks ago was stepping up from whatever
  // had been sitting there in the meantime, not from its own last number.
  // Caught end-to-end by test:assumed-body: Romanian Deadlifts ran 8kg in
  // week 3, vanished from the slot for a block, and came back at 16kg in week
  // 9 — a doubling on an unverified lift, inherited from a stranger. That is
  // the same contamination the forceStartingWeightKg path already guards
  // against ("a capped or broken anchor must never propagate through a
  // rotation"); this path had no equivalent, and it breaks the invariant
  // UNVERIFIED_RAMP_STEP_KG is written around: never more than one increment
  // between an unverified lift's own consecutive loading weeks.
  //
  // Not simply REPLACING the slot tracker: a variation appearing for the
  // first time has no history of its own, and discarding the slot's value
  // there would drop it back to a fresh, undamped estimate — precisely the
  // block-boundary snap the ramp exists to prevent. So the slot value stays
  // as the fallback for a genuinely new lift, and a lift with its own history
  // uses that instead.
  const lastUnverifiedLoadingWeekKgByLift = new Map<string, number>()

  // How many extra reps a lift has accumulated while its weight has refused to
  // move, and the weight it has refused to move FROM.
  //
  // UNVERIFIED_RAMP_STEP_KG's ramp is a CEILING APPROACH, not a target: each
  // loading week steps up from the last but is capped by that week's fresh
  // standards estimate (load-prescription.ts:1264). The cap is right — for
  // someone the app has never seen lift, prescribing past the standards
  // estimate would be inventing strength data. But once the ramp converges on
  // the ceiling, Math.min pins it there for good, and these are
  // load-progression lifts, so reps are held flat BECAUSE load was supposed to
  // be the lever. Nothing moves. Ashley's ruling: buy a rep with the week.
  //
  // Both are PRE-coherence figures, and both sides of every comparison below
  // are too. enforceLoadCoherence settles almost everything it touches (4 of
  // 2,406 loaded exercise-weeks still sit above a clamp afterwards), so the
  // two bases barely differ — but mixing them is what broke an earlier
  // attempt, which compared a pre-coherence probe against post-coherence
  // history and pinned loads coherence would otherwise have moved.
  const frozenLoadStreakByLift = new Map<string, number>()
  // The carry equivalent, and outside the week loop for the same reason: it
  // is a STREAK across weeks, not a per-week decision.
  const frozenCarryStepsByLift = new Map<string, number>()
  const previousWeekPreCoherenceKgByLift = new Map<string, number>()

  /**
   * What each unverified lift ACTUALLY DISPLAYED last loading week.
   *
   * Ashley's ruling, 31 Aug 2026: within a block the weight never drops. The
   * standards estimate is recomputed every week against that week's rep
   * target, and more reps means a lower percentage of 1RM, so the estimate
   * FALLS as a block's reps climb. Measured on a real plan: Lateral Raises
   * 12-17 reps @ 6kg in week 9, then 13-18 reps @ 4kg in week 10 — more work
   * for a third less weight, which reads as a demotion nobody explained.
   *
   * Distinct from previousWeekPreCoherenceKgByLift above, which holds the
   * NATURAL, pre-coherence probe the freeze detector needs ("would this
   * weight have moved on its own?"). That one must stay unpinned or freezes
   * self-perpetuate. This one is the opposite: the number on the page, which
   * is the only thing a floor can honestly be measured against.
   *
   * CLEARED EVERY WEEK, so it only ever holds lifts that were present the
   * week before — a variation returning to a slot after a block away has no
   * entry, and gets a fresh estimate rather than a floor from five weeks ago.
   * Deload weeks don't write to it, for the same reason the natural tracker
   * skips them: a deload is supposed to be lighter, and letting it become the
   * floor would pin the next block to a recovery weight.
   */
  const lastWeekDisplayedKgByLift = new Map<string, { kg: number; repLow: number | null }>()

  sequence.forEach((phase, blockIndex) => {
    // MID-BLOCK ONLY — Ashley's wording, and the audit insists on it. A block
    // changes the phase, and with it the rep targets and the intensity the
    // estimate is computed against, so a weight carried across the boundary is
    // a weight the new block never asked for. Measured: without this reset the
    // floor produced 6 block_transition_jump and 4 rotation_relative_load
    // failures against a clean 0 — a rotated-in lift held at the outgoing
    // variation's number is the exact contamination this file guards against
    // in three other places. Each block starts from a fresh estimate and
    // builds its own floor from there.
    lastWeekDisplayedKgByLift.clear()
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
    const rotatedBlockDays = baseWeek.map(day => {
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
        const reps = newEntry ? assignSetsRepsFromConfig(newEntry, styleConfig, expConfig, policy, profile.session_duration_preference).reps : ex.reps
        // The rotated slot is a different movement — its logging identity must
        // follow (a stale id would thread the old lift's history into the new
        // one's ghosts/progression).
        return {
          ...ex,
          id: newEntry?.id ?? getExerciseId(rotated),
          name: rotated,
          reps,
          ramp_up: carryRampUp(ex.ramp_up, ex.name, rotated, newEntry),
          // Block-boundary rotation changes WHICH exercise this slot holds —
          // ex.selection_note (if any) explained the ORIGINAL exercise's win
          // at week-1 generation and says nothing true about `rotated`. Same
          // stale-identity bug as substituteFloorClampedIsolation/
          // rebuildExerciseForSwap.
          selection_note: undefined,
        }
      })
      return { ...day, exercises }
    })

    // Cross-block cause of the trim-magnitude bug: this base structure was
    // only ever validated against neutral (unperiodized) rest at generation
    // time. Sized here, once per block, against THIS block's own real
    // rest_adjust_seconds — not a forecast, since this block's real number
    // is already known — so trimWeekRestForBudget below goes back to being
    // the rare last-resort nudge it was designed as, not the mechanism
    // carrying the whole mesocycle every week.
    const blockDays = sizeBlockToRestBudget(rotatedBlockDays, phaseConfig.rest_adjust_seconds, totalBudgetSeconds, requiredNames, policy, trimLog)

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

    // WHICH EXERCISE each of those numbers belongs to.
    //
    // Both trackers above are indexed by [dayIndex][exerciseIndex] — slot
    // POSITION — but an accessory's variation rotates on a two-week
    // sub-cycle WITHIN the block. So from week 3 the slot can hold a
    // different exercise than the one whose baseline is sitting in it, and
    // weeks 3-4 were being built from a stranger's number.
    //
    // This file already states the rule ("a capped or broken anchor must
    // never propagate through a rotation") and implemented it as a 25%
    // divergence backstop, which turns out to be porous in both directions:
    // its comparison is exclusive, so a value at exactly 125% of a fresh
    // estimate passes, and plate rounding then rounds that value UP after
    // the check. Traced live: a 50kg advanced female carried a 5kg Cable
    // Lateral Raises baseline into Lateral Raises, passed the backstop at
    // exactly 5 vs a 5.0 limit, and rounded to 6kg — 150% of a fresh
    // estimate for the exercise actually in the slot.
    //
    // Name-keying removes the cause rather than bounding the symptom: a slot
    // whose exercise changed simply has no baseline, and weeks 2-3 fall
    // through to a fresh estimate for the exercise that is really there.
    // Exactly the treatment lastUnverifiedLoadingWeekKg needed for the same
    // reason, one tracker over.
    const blockBaselineName: (string | null)[][] = blockDays.map(day => day.exercises.map(() => null))
    const blockWeek3Name: (string | null)[][] = blockDays.map(day => day.exercises.map(() => null))
    const baselineForSlot = (dayIdx: number, exIdx: number, name: string): number | null =>
      blockBaselineName[dayIdx][exIdx] === name ? blockBaselineKg[dayIdx][exIdx] : null
    const week3ForSlot = (dayIdx: number, exIdx: number, name: string): number | null =>
      blockWeek3Name[dayIdx][exIdx] === name ? blockWeek3Kg[dayIdx][exIdx] : null

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
      const isCalibrationWeek = weekCounter === 1 && !canSkipCalibration

      // Each lift's NATURAL load this week — what the ramp resolved to before
      // any rep bump or pin. Recorded even when the displayed weight is
      // pinned, because this is the value next week's "has it moved yet?"
      // probe compares against, and that question has to stay honest about the
      // underlying prescription rather than about a number we held ourselves.
      const thisWeekPreCoherenceKg = new Map<string, number>()
      // The rep bump already decided for a lift THIS week. A lift can hold two
      // slots in a week, and the streak is keyed by name, so without this the
      // second slot incremented the streak a second time and came out one rep
      // above the first — the same exercise, the same weight, "4-6" on Monday
      // and "5-7" on Thursday. Measured: lift-weeks showing more than one rep
      // range at the same weight went from 19 to 108 before this was fixed.
      // The WEIGHT already settled for a lift THIS week, keyed by the whole
      // prescription (name|sets|reps|intensity), not just the name.
      //
      // Third memo of exactly this shape, and the one that was missing. The
      // comment above describes the rep version of this bug — "the same
      // exercise, the same weight, '4-6' on Monday and '5-7' on Thursday" —
      // and carryStepDecidedThisWeek is the carry-distance version. Weight had
      // none, so a lift holding two slots in a week re-derived independently
      // in the second and could land an increment out: MEASURED at 202 of
      // 1,536 lift-weeks across the 4x4x4 sweep, e.g. Calf Raises 3x15-20 at
      // RPE 6-7 prescribed 12.5kg on one day and 20kg on another IN THE SAME
      // WEEK. The audit saw only the 2 of those that happened to coincide
      // with a slot changing hands, which is why it reads as a rotation bug.
      //
      // Keyed on the prescription because two slots of the same lift at
      // DIFFERENT sets/reps/RPE legitimately differ (heavier for lower reps);
      // only identical work must agree. Measured: of 203 same-lift
      // different-weight lift-weeks, 202 are identical work — so this key
      // costs one legitimate case and catches everything else.
      const weightDecidedThisWeek = new Map<string, number>()
      const frozenBumpDecidedThisWeek = new Map<string, number>()
      // The reps a lift SHOWS are decided once per lift per week.
      //
      // Not the same thing as memoising the bump size, which was already done
      // and was not enough. Whether a lift reads as frozen is resolved per
      // SLOT, from that slot's own pre-coherence figure, and two slots of one
      // lift can disagree even when the shipped weight is identical — so the
      // dissenting slot never entered the frozen branch at all and never read
      // the bump memo. Observed directly: Backpack Row, week 11, Monday
      // 16-18 @20 / Tuesday 14-16 @20 / Thursday 16-18 @20 — same weight,
      // same sets, same RPE, one rep bracket apart.
      //
      // MEASURED, THE OBVIOUS FIX MAKES IT WORSE. Memoising the frozen
      // VERDICT (first slot decides, rest follow) took the count from 22 to
      // 37: forcing a later slot into the frozen branch buys reps for lifts
      // whose own figure genuinely moved. So this memoises the OUTCOME — the
      // rep string a trainee reads — and leaves every load decision exactly
      // where it was.
      const repsShownThisWeek = new Map<string, string>()
      // Carry twin of the line above, and per-WEEK for the same reason: one
      // carry can hold two slots in a week and both must show the same
      // distance.
      const carryStepDecidedThisWeek = new Map<string, number>()

      const days: WorkoutDay[] = blockDays.map((day, dayIdx) => {
        // The day's PROMOTED anchor, decided once per day. Undefined whenever
        // the day already has a real tier-1 — those keep the existing floor
        // and nothing here touches them.
        //
        // Read from the day's BASE names, before the weekly accessory
        // rotation below picks substitutes. That is sound because rotation is
        // within-tier (an accessory is only ever replaced by an accessory),
        // so the RANK the anchor is chosen on cannot change — only the name.
        const promotedAnchor = dayAnchorExercise(day.exercises)
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
            ? assignSetsRepsFromConfig(dbEntry, styleConfig, expConfig, policy, profile.session_duration_preference).reps
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
          const week3KgForFloorCheck = isDeload && dbEntry ? week3ForSlot(dayIdx, exIdx, dbEntry.name) : null
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
          // Steady-state cardio is exempt from every path below — one
          // continuous block has no "rounds" for a volume-role floor to
          // apply to. Without this, the 'conditioning' role's 4-round
          // floor (genuinely correct for real interval work) was instead
          // forcing Elliptical's single block up to 4 sets — caught live
          // when the new minute-based cardio reservation (below, in
          // selectExercisesForTrack) kept coming out 2-3x over its own
          // budget: the estimate used at selection time correctly assumed
          // 1 set, but the per-week sets computation was unconditionally
          // overriding it to 4 for every exercise, cardio included.
          const sets = dbEntry?.prescription_type === 'steady_state'
            ? 1
            : isDeload
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
            const affordabilityBaseline = baselineForSlot(dayIdx, exIdx, dbEntry.name)
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

          // Interval and steady-state cardio don't go through the reps-
          // calibrated repShift/restShift machinery above — see
          // stepIntervalSeconds' own doc comment (periodization.ts) for why
          // phaseConfig.rep_shift is the wrong magnitude for a seconds
          // delta (this is where "33s" came from). Work and rest step
          // together by the same amount, so the ratio between them holds
          // across the block instead of silently drifting as the bout
          // lengthens. Steady-state (Elliptical) has nothing to step at
          // all — a single continuous block holds its duration and its
          // (zero) rest completely flat within a block.
          const parseIntervalSeconds = (s: string): number | null => {
            const m = s.match(/^(\d+)s$/)
            return m ? Number(m[1]) : null
          }
          let reps: string
          let restForWeek: string
          if (dbEntry?.prescription_type === 'intervals') {
            const workBase = parseIntervalSeconds(baseReps)
            const restBase = parseIntervalSeconds(ex.rest)
            reps = workBase != null ? `${stepIntervalSeconds(workBase, w, isDeload)}s` : shiftReps(baseReps, repShift, expConfig.min_reps)
            restForWeek = restBase != null ? `${stepIntervalSeconds(restBase, w, isDeload)}s` : adjustRest(ex.rest, restShift)
          } else if (dbEntry?.prescription_type === 'steady_state') {
            reps = baseReps
            restForWeek = ex.rest
          } else {
            reps = shiftReps(baseReps, repShift, expConfig.min_reps)
            restForWeek = adjustRest(ex.rest, restShift)
          }

          // Third and last place the goal's loaded-main-lift rest floor has to
          // hold. The phase's own rest_adjust_seconds is applied AFTER the
          // prescription, so a metabolic block's negative shift took a
          // conditioning squat from 75s to 55s — under the floor, and under
          // the 60s even the trimmer respects. Each of the three paths
          // (prescription, this weekly adjust, trimWeekRestForBudget) sets
          // rest independently, so the floor has to be re-asserted at each;
          // fixing only the first left 288 of 432 loaded main lifts still
          // below it.
          //
          // Not gated on isDeload any more. The loaded floor skipped deloads
          // because a deload deliberately backs OFF, and forcing 90s rest on
          // a light week was reading the goal's density rule as a training
          // rule. The 60s floor is not that: it is "can the trainee finish
          // the next set", which a lighter week does not change. Deloads
          // carry roughly half the sets, so the added rest has slack to come
          // out of — measured, not assumed (see the session-length delta).
          {
            const floor = mainLiftRestFloor(
              dbEntry,
              isDeload ? undefined : policy,
              // Compared by identity against the day's base row, which is
              // what dayAnchorExercise returned. `ex` is that same object
              // here — the rotation above produces `weeklyName`, a string,
              // and leaves this reference alone.
              ex === promotedAnchor,
            )
            const current = parseRestSeconds(restForWeek)
            // A FLOOR, NEVER A CEILING. `current < floor` is what makes that
            // true: 388 of the measured days already rest at or above 60s on
            // their hardest movement, and promotion must not pull any of them
            // DOWN to the floor. Same one-way rule the stated load ceilings
            // follow — new information may raise a prescription, never cut it.
            if (floor > 0 && current > 0 && current < floor) {
              restForWeek = `${floor}s`
            }
          }

          // Primers stay submaximal and un-scaled for the same reason as the
          // base plan — a warm-up movement should never carry a working-set
          // RPE or a load that scales with the block.
          const intensity = isPrimer ? ex.intensity : resolveTargetRpe(phase, experience, w, isDeload)

          let load = null as ReturnType<typeof prescribeLoad> | null
          // Independent of the load branch below — an assistance exercise
          // (today, only Pull-Ups (Assisted)) is bodyweight-classified
          // (isExternallyLoaded false), so it never enters the load branch
          // at all; this is its own, much simpler decrement schedule keyed
          // only on (experience, week-in-block, isDeload). See
          // prescribeAssistance's own doc comment for why it doesn't reuse
          // any of the load engine's baseline-carry/calibration machinery.
          const assistance = dbEntry && !isPrimer ? prescribeAssistance(dbEntry, profile, w, isDeload) : null
          if (dbEntry && !isPrimer) {
            const baselineKg = baselineForSlot(dayIdx, exIdx, dbEntry.name)
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
              const previousInSlot = lastUnverifiedLoadingWeekKg[dayIdx][exIdx]
              const previousForThisLift = dbEntry ? lastUnverifiedLoadingWeekKgByLift.get(dbEntry.name) : undefined
              // Both, when both exist: never step up from a number that was
              // not this lift's, and never step up past what this slot
              // actually displayed last week either. See
              // lastUnverifiedLoadingWeekKgByLift's declaration.
              const previous = previousForThisLift != null && previousInSlot != null
                ? Math.min(previousForThisLift, previousInSlot)
                : previousForThisLift ?? previousInSlot
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
              const week3Kg = week3ForSlot(dayIdx, exIdx, dbEntry.name)
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

            // ---- The weight didn't move: buy a rep with it. ----------------
            //
            // OBSERVE FIRST, THEN PIN. The load above was resolved with BASE
            // reps and no pin, which makes it an honest probe of the
            // underlying prescription: "would this lift's weight have moved
            // on its own this week?" Only if the answer is no does anything
            // change. That ordering is the whole fix. An earlier attempt
            // pinned first, and pinning made the freeze self-perpetuating —
            // this week was set equal to last week, so the lift still read as
            // stuck, so it pinned again, and the weight could never escape
            // even once the estimate had risen enough to afford a real step.
            // It ended up prescribing a stated 55kg profile a 6kg Romanian
            // Deadlift, below an empty bar, and LIGHTER than the same lift for
            // a profile that declined its body metrics entirely.
            //
            // The probe is also why the bump can't poison itself: extra reps
            // lower a standards estimate, so probing with the bumped reps
            // would make a lift look like it had dropped rather than frozen.
            // Base reps every time, whatever we have added on top.
            const naturalKg = load.starting_weight_kg
            if (naturalKg != null) {
              const already = thisWeekPreCoherenceKg.get(dbEntry.name)
              // One lift can hold two slots in a week at two loads; take the
              // lighter, matching lastUnverifiedLoadingWeekKgByLift's own rule.
              thisWeekPreCoherenceKg.set(dbEntry.name, already == null ? naturalKg : Math.min(already, naturalKg))
            }

            const canBuyReps = !isCarry && !isDeload && !isCalibrationWeek
              && dbEntry.prescription_type !== 'intervals'
              && dbEntry.prescription_type !== 'steady_state'

            const previousNaturalKg = previousWeekPreCoherenceKgByLift.get(dbEntry.name)
            if (canBuyReps && naturalKg != null && previousNaturalKg != null && naturalKg === previousNaturalKg) {
              // Decided once per lift per week, then reused by any other slot
              // holding the same lift, so both slots show the same target.
              const alreadyDecided = frozenBumpDecidedThisWeek.get(dbEntry.name)
              const bump = alreadyDecided ?? Math.min((frozenLoadStreakByLift.get(dbEntry.name) ?? 0) + 1, MAX_FROZEN_LOAD_REP_BUMP)
              const bumpedReps = shiftReps(baseReps, repShift + bump, expConfig.min_reps)
              // The pinned weight has to satisfy the same divergence backstop
              // every other forced weight does — a held number that sits too
              // far above a fresh estimate for the exercise actually in this
              // slot is indistinguishable from a contaminated anchor carried
              // through a rotation, and the audit reads it as exactly that.
              // Extra reps LOWER a standards estimate, so the ratio drifts
              // upward precisely because of the rep we are trying to buy:
              // measured, a rotated-in "Walking Lunges" held at 8kg against a
              // 6kg fresh estimate (133%) tripped rotation_relative_load.
              //
              // When it would breach, decline the rep rather than lower the
              // weight. Buying a rep must never cost weight, so the only
              // honest alternative to holding the bar is to leave the week
              // alone.
              //
              // ONCE THE REP IS BOUGHT FOR THIS LIFT THIS WEEK, IT IS BOUGHT.
              // The band check below is evaluated per SLOT, against that
              // slot's own sets/intensity — so a lift holding two slots in a
              // week could pass it on one and fail it on the other, ending up
              // with two different rep targets at the same weight. That is
              // precisely what the comment above claims cannot happen, and
              // memoising only the bump SIZE was not enough to prevent it:
              // the accept/decline outcome has to be memoised too.
              //
              // MEASURED, the 4x4x4 combination sweep: 19 such lift-weeks,
              // concentrated in Backpack Row, Lateral Raises and Walking
              // Lunges — every one a lift that legitimately appears twice in
              // a week. Not introduced by the catalogue additions that
              // surfaced three more of them; the mechanism predates both.
              const alreadyBought = alreadyDecided != null
              const pinnedReference = alreadyBought || bumpedReps === reps ? null : prescribeLoad(dbEntry, profile, {
                targetRpeLabel: intensity, isFirstBlock: blockIndex === 0, sets, phase,
                isCalibrationWeek, knownWorkingWeights, repRangeLabel: bumpedReps, loadIsProgressing: rampLoad,
              })
              const pinWithinBand = alreadyBought || (pinnedReference != null
                && (pinnedReference.starting_weight_kg == null
                  || previousNaturalKg <= pinnedReference.starting_weight_kg * 1.25))
              if (pinWithinBand) {
                reps = bumpedReps
                // Advanced ONLY when the rep is actually bought. Recording the
                // streak on a week where the bump was declined — the band
                // breach above, or a rep range shiftReps could not move — would
                // let next week start from a level this week never reached, and
                // silently skip a rep.
                frozenBumpDecidedThisWeek.set(dbEntry.name, bump)
                frozenLoadStreakByLift.set(dbEntry.name, bump)
                // Pinned to the lift's OWN previous natural figure — never to
                // unverifiedPreviousLoadingWeekKg, which is
                // Math.min(name-keyed, SLOT-keyed) and whose slot half belongs
                // to whatever variation occupied that slot last week. Pinning
                // to it held a rotated-in lift at the outgoing variation's
                // weight and produced 9 rotation_relative_load failures.
                load = prescribeLoad(dbEntry, profile, {
                  targetRpeLabel: intensity,
                  isFirstBlock: blockIndex === 0,
                  sets,
                  phase,
                  isCalibrationWeek,
                  knownWorkingWeights,
                  forceStartingWeightKg: previousNaturalKg,
                  repRangeLabel: reps,
                  loadIsProgressing: rampLoad,
                })
              }
            } else if (canBuyReps && naturalKg != null && previousNaturalKg != null) {
              // It moved. Drop the accumulated reps with it — a weight
              // increase is exactly when double progression resets the range,
              // and carrying the bump forward would tax a lift for having once
              // been stuck.
              frozenLoadStreakByLift.set(dbEntry.name, 0)
            }

            // WALK FURTHER WHEN THE WEIGHT WON'T MOVE — the carry twin of the
            // rep bump above, on the identical trigger (this week's resolved
            // load equals the previous loading week's).
            //
            // Simpler than the rep version, and deliberately so: distance
            // does NOT feed prescribeLoad the way reps do (load-prescription
            // .ts parses a carry by load only — reading '40m' as a rep count
            // "would wildly overshoot"), so there is nothing to re-derive, no
            // weight to pin, and no divergence backstop to satisfy. Adding
            // distance cannot pull the weight down, which is the entire
            // hazard the rep version had to engineer around.
            const canBuyDistance = isCarry && !isDeload && !isCalibrationWeek
              && /^\d+\s*m$/.test(String(reps))
            if (canBuyDistance && naturalKg != null && previousNaturalKg != null && naturalKg === previousNaturalKg) {
              const alreadyStepped = carryStepDecidedThisWeek.get(dbEntry.name)
              const steps = alreadyStepped
                ?? Math.min((frozenCarryStepsByLift.get(dbEntry.name) ?? 0) + 1, MAX_FROZEN_CARRY_DISTANCE_STEPS)
              carryStepDecidedThisWeek.set(dbEntry.name, steps)
              frozenCarryStepsByLift.set(dbEntry.name, steps)
              const baseM = parseInt(String(reps), 10)
              reps = `${baseM + steps * FROZEN_CARRY_DISTANCE_STEP_M}m`
            } else if (canBuyDistance && naturalKg != null && previousNaturalKg != null) {
              // The weight moved, so the distance resets — same reasoning as
              // the rep reset above. A carry that earned a heavier load should
              // not also still be walking the accumulated extra.
              frozenCarryStepsByLift.set(dbEntry.name, 0)
            }

            // ONE REP TARGET PER LIFT PER WEEK. Applied here, after every
            // rep lever has settled (phase shift, frozen-load bump, carry
            // distance), and deliberately AFTER the load is resolved so it
            // cannot change a single weight — it only stops the same lift on
            // two days of one week disagreeing about what to aim for.
            const shownAlready = repsShownThisWeek.get(dbEntry.name)
            if (shownAlready != null && shownAlready !== reps) reps = shownAlready
            else if (shownAlready == null) repsShownThisWeek.set(dbEntry.name, reps)

            if (w === 1) {
              blockBaselineKg[dayIdx][exIdx] = load.starting_weight_kg
              blockBaselineName[dayIdx][exIdx] = dbEntry.name
            }
            if (w === 3) {
              blockWeek3Kg[dayIdx][exIdx] = load.starting_weight_kg
              blockWeek3Name[dayIdx][exIdx] = dbEntry.name
            }
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

          // ONE LIFT, ONE WEIGHT, IN A GIVEN WEEK.
          //
          // Everything above has settled this slot's weight independently. If
          // the same lift already took a weight this week for the SAME
          // sets/reps/intensity, the two must agree, and the LOWER one wins:
          // never tell someone to lift more than the lift has earned
          // elsewhere in the same week. That direction matches the file's
          // other one-way rules — Math.min(name-keyed, SLOT-keyed) for the
          // unverified previous week, and the main-lift floor that is "a
          // FLOOR, never a ceiling".
          //
          // Re-prescribed rather than patched: load.display and load.per_set
          // are derived from the weight, so overwriting starting_weight_kg
          // alone would leave the printed text disagreeing with the number.
          // forceStartingWeightKg is the same door the frozen-lift path uses.
          if (dbEntry && load?.starting_weight_kg != null) {
            const weekWeightKey = `${dbEntry.name}|${sets}|${reps}|${intensity}`
            const settled = weightDecidedThisWeek.get(weekWeightKey)
            if (settled != null && settled < load.starting_weight_kg) {
              load = prescribeLoad(dbEntry, profile, {
                targetRpeLabel: intensity,
                isFirstBlock: blockIndex === 0,
                sets,
                phase,
                isCalibrationWeek,
                knownWorkingWeights,
                repRangeLabel: reps,
                loadIsProgressing: rampLoad,
                forceStartingWeightKg: settled,
              })
            } else if (settled == null) {
              weightDecidedThisWeek.set(weekWeightKey, load.starting_weight_kg)
            }
          }

          // Computed HERE rather than beside prescribeAssistance above,
          // because the rep guard reads the week's FINAL rep target,
          // including the frozen-load rep bump, and reps only settle here.
          // The weight itself keys on the PHASE, so it is constant across a
          // block and cannot fight the within-block rep ramp.
          const addedLoad = dbEntry && !isPrimer
            ? prescribeAddedLoad(dbEntry, profile, {
                repRangeLabel: reps,
                phase: phaseConfig.phase,
                isDeload,
                isCalibrationWeek,
              })
            : null

          return {
            ...ex,
            name: weeklyName,
            sets,
            reps,
            rest: restForWeek,
            intensity,
            load_guidance: deloadAtFloor
              ? (deloadNeedsRepCut
                  ? 'Bar stays the same — reduced reps this week. Recovery comes from doing less, not lifting lighter.'
                  : 'Bar stays the same — reduced sets this week. Recovery comes from doing less, not lifting lighter.')
              : (assistance
                  ? assistanceGuidance(assistance)
                  : addedLoad
                    // Takes precedence over the generic bodyweight guidance:
                    // that copy says "progress by adding reps or slowing the
                    // tempo before adding load", which is the opposite of
                    // what this week is asking for.
                    ? addedLoad.basis
                    : (load ? `${expConfig.load_guidance} ${load.basis}` : ex.load_guidance)),
            suggested_load: load ? load.display : ex.suggested_load,
            suggested_load_kg: load ? load.starting_weight_kg : ex.suggested_load_kg,
            load_source: load ? load.load_source : ex.load_source,
            per_set_load: load ? load.per_set : (ex.per_set_load ?? null),
            // THE FALLBACK USED TO BE A BARE `ex.suggested_assistance_kg`, and
            // it leaked across a rotation. This slot's identity can CHANGE
            // week to week; `ex` is what was here before. Swap Pull-Ups
            // (Assisted) out for a Lat Pulldown and prescribeAssistance
            // correctly returns null (the new entry declares no assistance),
            // but the fallback then carried the old exercise's counterweight
            // onto it. Measured across a 4x3x4x4 sweep: 84 prescriptions —
            // Kneeling Band Lat Pulldown (64), Lat Pulldown (20) — arrived
            // with machine assistance and no machine. Worse than a stray
            // number: AssistanceChip renders it "40kg assist / less over time
            // = stronger", an INVERTED progress cue on a lift where more
            // weight is the progress. Carry it only where the entry that is
            // here NOW can actually be assisted. Note suggested_added_load_kg
            // below already nulls rather than carrying — same rule, and this
            // line was the one that did not follow it.
            suggested_assistance_kg: assistance ? assistance.assistance_kg
              : (dbEntry?.assistance ? ex.suggested_assistance_kg : null),
            suggested_added_load_kg: addedLoad ? addedLoad.added_kg : null,
            assistance_ready_to_graduate: assistance ? assistance.ready_to_graduate
              : (dbEntry?.assistance ? ex.assistance_ready_to_graduate : undefined),
            movement_pattern: dbEntry ? mapMovementPattern(dbEntry.movement_pattern) : undefined,
            tier: dbEntry ? mapTier(dbEntry.mechanics_tier) : undefined,
            fatigue_cost: dbEntry ? deriveFatigueCost(dbEntry) : undefined,
            prescription_type: dbEntry?.prescription_type ?? ex.prescription_type,
            ramp_up: carryRampUp(ex.ramp_up, ex.name, weeklyName, dbEntry),
            // Weekly accessory sub-rotation (fortnightOffset) is a second
            // identity-change point on top of the block-level rotation above
            // — same rule: a note only stays valid if this slot is still the
            // SAME exercise it was, name for name. Not unconditional
            // `undefined` here (unlike the two spread-based reconstructions
            // above) because most weeks DON'T rotate the name, and the
            // original note is still a true statement about this slot when
            // that's the case — only clear it the week identity actually
            // changes.
            selection_note: weeklyName === ex.name ? ex.selection_note : undefined,
          }
        })

        // Per-exercise role clamping bounds each slot independently but
        // can't see its day-mates — a 3-set (floor) main next to a 4-set
        // (ceiling) accessory both pass their own clamp yet still invert the
        // hierarchy. This closes that gap. Skipped on deload weeks, where
        // the main lift itself is deliberately at its lowest point.
        return { ...day, exercises: isDeload ? exercises : enforceSetHierarchy(exercises) }
      })

      // Before enforceLoadCoherence, deliberately — see its doc comment.
      enforceOneWeightPerPrescription(days)
      enforceLoadCoherence(days)

      // Decided ONCE, here, and used by both the tempo pass below and the
      // week's coach note. Splitting the decision would let a week be told
      // "no weight to add" while its lifts were prescribed as if there were.
      const loadlessWeek = isLoadlessWeek(days)
      applyTempoPrescription(days, phaseConfig.phase, isDeload, experience)

      // Roll this week's natural loads forward as next week's comparison
      // basis. Deload weeks are deliberately NOT recorded: a deload is
      // supposed to differ from its neighbours, so letting it become the
      // baseline would make every first week of a block look like it had
      // moved, and no freeze could ever be detected across a block boundary.
      // Skipping it means week 9 compares against week 7 — the last week that
      // was actually trying to progress.
      if (!isDeload) {
        previousWeekPreCoherenceKgByLift.clear()
        for (const [name, kg] of thisWeekPreCoherenceKg) previousWeekPreCoherenceKgByLift.set(name, kg)
      }

      // Anchor to the FINAL, post-coherence displayed number — see
      // unverifiedLoadingFlags's declaration for why this can't be written
      // during the exercises.map above.
      // Collected for the week first, then merged, because one exercise can
      // occupy two slots in the same week (different days) at two different
      // loads — the per-lift history takes the LIGHTER of them rather than
      // whichever happened to be written last.
      // THE WEIGHT NEVER DROPS — applied here, on the FINAL post-coherence
      // number, because that is the number the trainee reads. Applying it
      // earlier let coherence walk it back down again, and applying it to the
      // pre-coherence probe would have broken the freeze detector, which
      // needs that probe unpinned.
      //
      // Deloads are exempt — dropping the weight is what a deload is for — and
      // unverifiedLoadingFlags already carries that: it is only ever set when
      // `!isDeload && unverifiedForCategory`, so on a deload week every flag
      // is false and this loop touches nothing. An extra `if (!isDeload)`
      // wrapper here READ correct and was dead: a live condition that can
      // never decide anything, which is the shape that hides real bugs. It
      // was written, measured (mutating it changed no output at all), and
      // removed. The write side below is NOT redundant in the same way — see
      // its own comment.
      //
      // CARRIES ARE EXCLUDED. Their progression lever is DISTANCE, not weight,
      // and §2-§5 of test:frozen-weeks govern that separately. Flooring them
      // produced 6 block_transition_jump failures ("Trap Bar Carry week 9 load
      // 27.5kg jumps more than one step from week 7's 14kg").
      //
      // The pre-floor number is kept, because the ramp anchors below must not
      // inherit a floored figure: a held weight rolled into the SLOT history
      // and was then handed to whatever variation rotated in next, which is
      // the contamination this file guards against in three other places.
      // Measured: without this split, four rotation_relative_load failures —
      // "rotated Lateral Raises -> Machine Lateral Raise at 7.5kg, 150% of a
      // fresh 5kg estimate".
      const preFloorKg: (number | null)[][] = days.map(d => d.exercises.map(e => e.suggested_load_kg ?? null))
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        const dayExercises = days[dayIdx].exercises
        for (let exIdx = 0; exIdx < dayExercises.length; exIdx++) {
          if (!unverifiedLoadingFlags[dayIdx][exIdx]) continue
          const ex = dayExercises[exIdx]
          if (isCarryByName(ex.name)) continue
          const last = lastWeekDisplayedKgByLift.get(ex.name)
          if (last == null || ex.suggested_load_kg == null) continue
          // ONLY WHEN THE REPS WENT UP. The defect is "a rep bought with a
          // lighter weight" — the estimate falls as the rep target climbs, and
          // the trainee reads more-work-less-weight as a demotion. A drop with
          // the reps unchanged or lower is not that, and flooring it too
          // pushed one lift past the block-transition ceiling (measured: 1
          // block_transition_jump failure against a clean 0). Narrower than
          // "never drops", and it covers every case the rule was chosen for.
          const nowLow = repLowOf(ex.reps)
          if (last.repLow == null || nowLow == null || nowLow <= last.repLow) continue
          if (ex.suggested_load_kg >= last.kg) continue
          // RELABEL, DON'T JUST RAISE THE NUMBER — and this is a regression
          // this floor itself introduced. The first version assigned
          // `suggested_load_kg` alone and left `suggested_load` (the display
          // string every screen renders) and `per_set_load` sitting on the
          // old, lower figure. So the plan held 8kg while the Exercise tab
          // and the coach both said "~7.5kg": three fields, one weight, two
          // answers. Measured over the 19,724-exercise coach sweep — 61
          // loaded exercises disagreed with their own display string, and
          // test:coach-plan-context named two of them (Backpack Curl,
          // Lateral Raises) by lift.
          //
          // rebuildLoadForExercise is the one place that writes all three
          // together, and going through it is the point: a fourth hand-rolled
          // load update is how this happened. It plate-rounds, which is a
          // no-op here (last.kg is already a DISPLAYED number for this same
          // lift, so the same loading mode already rounded it), and it flats
          // any per-set ramp — measured zero occurrences, because a ramped
          // load has never also been a floored one in the sweep.
          const entry = findEntry(ex.name)
          // TYPE NARROWING, NOT A BEHAVIOURAL GUARD, and the honest
          // measurement is that it never fires: 42 floor applications across
          // the 19,724-exercise sweep, 0 of them without a catalogue entry —
          // every flagged exercise came from the catalogue in the first
          // place. rebuildLoadForExercise needs the entry for the loading
          // mode and the label, so the branch has to exist; `continue` rather
          // than a raise because raising a weight that cannot be relabelled
          // would recreate the exact inconsistency this is fixing.
          if (!entry) continue
          rebuildLoadForExercise(ex, entry, last.kg)
        }
      }

      const thisWeekByLift = new Map<string, number>()
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        const dayExercises = days[dayIdx].exercises
        for (let exIdx = 0; exIdx < dayExercises.length; exIdx++) {
          if (!unverifiedLoadingFlags[dayIdx][exIdx]) continue
          // Pre-floor on purpose — see preFloorKg above.
          const finalKg = preFloorKg[dayIdx][exIdx]
          if (finalKg == null) continue
          lastUnverifiedLoadingWeekKg[dayIdx][exIdx] = finalKg
          const name = dayExercises[exIdx].name
          const already = thisWeekByLift.get(name)
          thisWeekByLift.set(name, already == null ? finalKg : Math.min(already, finalKg))
        }
      }
      for (const [name, kg] of thisWeekByLift) lastUnverifiedLoadingWeekKgByLift.set(name, kg)

      // Next week's floor. Cleared first, so only lifts that appeared THIS
      // week can floor next week — see lastWeekDisplayedKgByLift's comment.
      //
      // This `!isDeload` is INTENT, and the honest measurement is that it does
      // not currently change any output. thisWeekByLift is empty on a deload
      // (no flags are set), so without the guard a deload would clear the map
      // and repopulate it with nothing — the floor would be lost across the
      // deload, and week 1 of the next block could drop again. In the 36-
      // profile corpus that costs nothing, because a block boundary rotates
      // the variation anyway and a new variation has no floor to lose. So it
      // is kept as a statement of the rule — a deload must not be able to
      // erase the floor — not as a guard the gate can prove. I first wrote
      // "measured: removing it reintroduces the offenders" here; the mutation
      // left the gate green, and the claim was mine, not the measurement's.
      if (!isDeload) {
        lastWeekDisplayedKgByLift.clear()
        // The DISPLAYED number, floor included — this is the one the next
        // week must not go below, and thisWeekByLift above is deliberately
        // pre-floor for the ramp anchors.
        for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
          const dayExercises = days[dayIdx].exercises
          for (let exIdx = 0; exIdx < dayExercises.length; exIdx++) {
            if (!unverifiedLoadingFlags[dayIdx][exIdx]) continue
            const ex = dayExercises[exIdx]
            if (ex.suggested_load_kg == null || isCarryByName(ex.name)) continue
            const already = lastWeekDisplayedKgByLift.get(ex.name)
            const entry = { kg: ex.suggested_load_kg, repLow: repLowOf(ex.reps) }
            lastWeekDisplayedKgByLift.set(ex.name, already == null || entry.kg < already.kg ? entry : already)
          }
        }
      }

      progressConditioningWeek(days, w, isDeload)

      // THE PROMOTED FLOOR, RE-ASSERTED ON THE FINAL DAY.
      //
      // The per-exercise floor above reads an anchor computed from the day's
      // BASE names, and its comment claimed that was safe because "rotation
      // is within-tier, so the RANK the anchor is chosen on cannot change —
      // only the name". That was true while the anchor ranked on tier alone.
      // It stopped being true the moment difficulty entered the ordering: a
      // weekly rotation swapping Air Squat for Goblet Squats is within-tier
      // AND changes which movement is hardest, so the anchor moves and the
      // floor lands on the wrong exercise. Measured: 97 days.
      //
      // So the floor is re-applied here, over the day as it finally stands,
      // once. trimWeekRestForBudget below re-derives the anchor correctly too
      // but only visits days that are OVER budget, so it cannot cover this.
      //
      // Still a floor, never a ceiling — Math.max, so an anchor already
      // resting longer keeps its rest.
      for (const day of days) {
        const anchor = dayAnchorExercise(day.exercises)
        if (!anchor) continue
        const i = day.exercises.indexOf(anchor)
        if (i === -1) continue
        const current = parseRestSeconds(day.exercises[i].rest)
        if (current > 0 && current < MAIN_LIFT_REST_FLOOR_SECONDS) {
          day.exercises[i] = { ...day.exercises[i], rest: `${MAIN_LIFT_REST_FLOOR_SECONDS}s` }
        }
      }

      // Deload weeks are SUPPOSED to run short (half volume, by design) — a
      // filler there would fight the whole point of the recovery week, so
      // this only applies to loading weeks.
      if (!isDeload) {
        // Must run BEFORE the filler — a day trimmed back under budget here
        // has nothing left for the filler to react to; a day still over
        // after this (rest already at floor) has nothing under-budget for
        // the filler to fill either, so the two never fight over the same
        // day.
        trimWeekRestForBudget(days, totalBudgetSeconds, trimLog, policy.minLoadedMainLiftRestSeconds)
        applyDurationFiller(days, profile, policy, totalBudgetSeconds, getSessionMinimumSeconds(profile.session_duration_preference || '45-60'))
        // Runs last, after rotation, periodization and duration-budget
        // trimming have all had their say — see enforceWeeklyPatternBalance's
        // doc comment. Deload weeks are exempt (like the duration filler
        // above): their volume is deliberately, uniformly cut, and nudging
        // set counts would fight that.
        enforceWeeklyPatternBalance(days)

        // FINAL SAFETY TRIM, against the stated MAXIMUM rather than the
        // midpoint budget the pass above already aimed at.
        //
        // enforceWeeklyPatternBalance is documented as needing to run last —
        // after rotation, periodization and duration trimming have all had
        // their say — and it BUMPS SETS to balance push against pull. It has
        // no idea the duration passes already finished, which is a known and
        // accepted couple-of-minutes drift (BACKLOG). Tempo made those
        // minutes cost more: a 4-1-1 rep is 6s against SECONDS_PER_REP's
        // assumed 3.5, so a bumped 4-set push-up in a Maximal Strength week
        // put two "30-45" sessions at 45.8 minutes — 48 seconds past a
        // ceiling that read 0 before.
        //
        // Deliberately targets the MAXIMUM, not the budget, so it is a
        // backstop and not a second opinion: every day already inside what
        // the trainee asked for is skipped untouched (the trimmer's own
        // first line), and only a day that broke the ceiling gives up rest.
        // Rest is also the one lever this is allowed to pull — trimming sets
        // here would fight the very pass that just set them.
        trimWeekRestForBudget(
          days,
          getSessionMaximumSeconds(profile.session_duration_preference || '45-60'),
          trimLog,
          policy.minLoadedMainLiftRestSeconds,
        )
      }

      // Starting-out weeks progress on DURATION, not load. Everything above
      // has already run and found nothing to do (an activity day carries no
      // exercises, so every per-exercise loop no-ops) — this re-stamps each
      // day's walk with this week's minutes, which is the whole progression.
      if (isStartingOut(profile)) {
        // The whole activity, not just its duration. This used to patch
        // `duration` alone, so every block after the first carried block 1's
        // "Starting where you are — turning up is the whole job for now"
        // beside a number that had moved on twice. startingOutActivity keeps
        // the minutes and the sentence explaining them together.
        const activity = startingOutActivity(blockIndex + 1)
        for (let i = 0; i < days.length; i++) {
          if (!days[i].plannedActivity) continue
          days[i] = { ...days[i], plannedActivity: { ...activity } }
        }
      }

      weeks.push({
        week_number: weekCounter,
        block_number: blockIndex + 1,
        week_in_block: w,
        phase_label: phaseConfig.label,
        phase_focus: phaseConfig.focus,
        is_deload: isDeload,
        isCalibrationWeek,
        coach_note: (() => {
          // A WEEK OF ACTIVITIES HAS NO PHASE COACHING TO GIVE. Making the
          // week loadless swapped "load goes up on the main lifts" for the
          // weightless copy — an improvement, and still untrue: that copy
          // talks about sets close to failure, quality reps and the hardest
          // working sets of the block, none of which exist in a plan that is
          // four walks and three rest days. The walk's own reason IS this
          // week's coaching, and it is already written, already true, and
          // already block-aware. Found by test:says-what-it-contains reading
          // the STORED note rather than the one the browse screen renders —
          // the screen had stopped showing this text, which would have hidden
          // it from every check that only looks at a screen.
          const activityOnly = days.length > 0
            && days.every(d => d.exercises.length === 0)
            && days.some(d => d.plannedActivity)
          if (activityOnly) {
            return days.find(d => d.plannedActivity)?.plannedActivity?.reason ?? ''
          }
          // Decided once per week, from the week that was actually built —
          // see loadlessWeek above, shared with the tempo pass.
          const loadless = loadlessWeek
          const phaseNote = loadless ? phaseConfig.coach_note_loadless : phaseConfig.coach_note
          const goalNote = loadless ? policy.coachNoteLoadless : policy.coachNote
          return [
            // A DELOAD SAYS IT ONCE. This used to open with its own "Deload
            // week — volume is deliberately cut so you arrive at the next
            // block recovered" and then append buildProgressionNote's
            // "Deload week — load and volume both step back so you arrive at
            // the next block recovered" — the same announcement, the same
            // reason, twice in one paragraph. Found on screen (1 Sep 2026)
            // once the browse redesign stopped burying coach_note in a
            // small banner. The progression note is the one that survives:
            // it distinguishes a loadless deload from a loaded one, which
            // the preamble never did.
            isDeload
              ? ''
              // The goal's own framing shows once per block, alongside the
              // phase's — repeating it every week would bury the phase-specific
              // note under the same paragraph four times over.
              : w === 1
                ? `${phaseNote} ${goalNote}`
                : phaseNote,
            buildProgressionNote(w, isDeload, isCalibrationWeek, policy, loadless),
          ].filter(Boolean).join(' ')
        })(),
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
