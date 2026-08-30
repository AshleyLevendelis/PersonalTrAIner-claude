import type { FitnessGoal, TrainingExperience, WorkoutDay, Exercise, UserProfile } from './types'
import { EXERCISE_DATABASE, getMovementFamily, meetsCapabilityRequirement, type ExerciseEntry } from './exercise-db'
import { getExperienceConfig, isSkillAppropriate } from './experience-config'
import { isExternallyLoaded, preservesRelativeLoad } from './load-prescription'

// ---------------------------------------------------------------------------
// PERIODIZATION
// ---------------------------------------------------------------------------
// Training organised into distinct phases, each with its own adaptation target,
// rather than one repeated 4-week block.
//
// The central design rule: MOVEMENT PATTERNS persist across the whole
// macrocycle, but the specific VARIATION rotates between blocks. Horizontal
// push appears in every block — as Barbell Bench, then Incline Dumbbell, then
// Machine Press. That keeps progress trackable at the pattern level (the point
// of progressive overload) while changing the stimulus enough to avoid both
// physical plateau and the boredom that makes people quit.
//
// Rotating the pattern itself would destroy progression tracking. Rotating
// nothing at all is what Ashley correctly identified as monotonous. The
// variation is the right layer to change.

export type TrainingPhase =
  | 'anatomical_adaptation'
  | 'hypertrophy'
  | 'strength'
  | 'power'
  | 'metabolic'

export interface PhaseConfig {
  phase: TrainingPhase
  label: string
  /** What this block is actually trying to achieve, shown to the user. */
  focus: string
  sets_multiplier: number
  /** Shift applied to the base rep range: negative = heavier/lower reps. */
  rep_shift: number
  rest_adjust_seconds: number
  /** Upper bound before the experience cap is applied. */
  target_rpe: number
  coach_note: string
  /**
   * The same note for a trainee with nothing to add weight to.
   *
   * MEASURED defect: someone whose equipment answer was "bodyweight" — no
   * gym, no dumbbells — was told every week to add load, find the weight,
   * and drop the load if needed, on a session of Box Squats, Deficit
   * Push-Ups and Table Rows. Every one of those instructions is about a
   * weight she does not have, which puts the app in the position of
   * asserting something untrue about her own session.
   *
   * Present on EVERY phase, including the two a bodyweight trainee cannot
   * currently reach (BODYWEIGHT_ALLOWED_PHASES excludes strength and power),
   * so relaxing that restriction can never silently reintroduce the defect.
   */
  coach_note_loadless: string
}

const PHASE_CONFIGS: Record<TrainingPhase, PhaseConfig> = {
  anatomical_adaptation: {
    phase: 'anatomical_adaptation',
    label: 'Anatomical Adaptation',
    focus: 'Build a base — connective tissue, movement quality, work capacity',
    sets_multiplier: 0.8,
    rep_shift: 3,
    rest_adjust_seconds: -15,
    target_rpe: 6.5,
    coach_note:
      'Higher reps, lighter loads, shorter rest. This phase prepares tendons and ligaments, which adapt more slowly than muscle. Do not rush it.',
    coach_note_loadless:
      'Higher reps, easier variations, shorter rest. This phase prepares tendons and ligaments, which adapt more slowly than muscle. Do not rush it.',
  },
  hypertrophy: {
    phase: 'hypertrophy',
    label: 'Hypertrophy',
    focus: 'Build muscle — moderate loads, higher volume, controlled tempo',
    sets_multiplier: 1.1,
    rep_shift: 0,
    rest_adjust_seconds: 0,
    target_rpe: 8,
    coach_note:
      'The volume phase. Take most sets close to failure but keep form clean — quality reps drive growth, not grinding.',
    // Already says nothing about weight, so the two are identical on purpose
    // rather than by omission — the field is required so a future edit to
    // one has to consider the other.
    coach_note_loadless:
      'The volume phase. Take most sets close to failure but keep form clean — quality reps drive growth, not grinding.',
  },
  strength: {
    phase: 'strength',
    label: 'Maximal Strength',
    focus: 'Move heavier loads — lower reps, longer rest, high intensity',
    sets_multiplier: 1.0,
    rep_shift: -3,
    rest_adjust_seconds: 45,
    target_rpe: 8.5,
    coach_note:
      'Heavier and lower rep. Rest fully between sets — cutting rest here undermines the whole point of the phase.',
    coach_note_loadless:
      'Fewer reps, taken harder. With no weight to add, the difficulty comes from how you move: about three seconds lowering, a pause at the bottom, no bounce. Rest fully between sets — cutting rest here undermines the whole point of the phase.',
  },
  power: {
    phase: 'power',
    label: 'Power & Expression',
    focus: 'Express strength quickly — explosive intent, full recovery',
    sets_multiplier: 0.85,
    rep_shift: -4,
    rest_adjust_seconds: 60,
    target_rpe: 7.5,
    coach_note:
      'Move the weight fast. Stop the set the moment bar speed drops — this phase is about speed, not fatigue.',
    coach_note_loadless:
      'Move fast and with intent — jump, push or pull as explosively as you can. Stop the set the moment your speed drops; this phase is about speed, not fatigue.',
  },
  metabolic: {
    phase: 'metabolic',
    label: 'Metabolic Conditioning',
    focus: 'Work capacity and conditioning — short rest, sustained output',
    sets_multiplier: 1.0,
    rep_shift: 4,
    rest_adjust_seconds: -20,
    target_rpe: 7.5,
    coach_note:
      'Short rest is the stimulus here. Drop the load if you need to in order to keep the pace.',
    coach_note_loadless:
      'Short rest is the stimulus here. Cut a rep or two if you need to in order to keep the pace.',
  },
}

// ---------------------------------------------------------------------------
// Phase sequencing
// ---------------------------------------------------------------------------
// Order matters. Every sequence opens with anatomical adaptation, because
// loading heavy on unprepared connective tissue is how people get hurt. Power
// work only appears once there is strength worth expressing, so it never leads.

const PHASE_SEQUENCES: Record<FitnessGoal, TrainingPhase[]> = {
  hypertrophy: ['anatomical_adaptation', 'hypertrophy', 'strength', 'hypertrophy'],
  functional: ['anatomical_adaptation', 'hypertrophy', 'strength', 'power'],
  fat_loss: ['anatomical_adaptation', 'hypertrophy', 'metabolic', 'hypertrophy'],
  conditioning: ['anatomical_adaptation', 'metabolic', 'hypertrophy', 'metabolic'],
}

/**
 * Beginners do not need — and should not get — a strength or power block in
 * their first few months. They are still adding load every session from
 * technique alone, and near-maximal work is where form breaks down. So their
 * sequence stays in the base-building and hypertrophy range for longer.
 */
export function getPhaseSequence(
  goal: FitnessGoal,
  experience: TrainingExperience,
): TrainingPhase[] {
  const base = PHASE_SEQUENCES[goal] ?? PHASE_SEQUENCES.hypertrophy

  if (experience === 'beginner') {
    // The conditioning goal's OWN sequence (below) already has zero
    // strength/power phases and two dedicated metabolic blocks — using the
    // generic beginner sequence here replaced one of those two metabolic
    // blocks with a plain hypertrophy block, leaving a beginner conditioning
    // trainee with "conditioning exactly one block out of four" (a direct
    // review finding). Keep the goal's own sequence for conditioning; every
    // other goal still gets the generic, deliberately-varied beginner path.
    if (goal === 'conditioning') return base
    // Mapping strength and power onto hypertrophy produced three consecutive
    // blocks all labelled "Hypertrophy" — technically safe, but monotonous in
    // exactly the way that makes people stop using an app. Beginners get
    // their own sequence instead: still no power/explosive work, but four
    // distinct phases with different stimulus and different names.
    //
    // The third block used to be unconditionally 'metabolic' — fine for
    // fat_loss (which allows it), but hypertrophy/functional goals don't
    // allow 'metabolic' at all, so restrictPhaseSequence silently rejected
    // it and fell back through 'hypertrophy', creating an adjacent
    // hypertrophy/hypertrophy run that dedupeAdjacentPhases then "fixed" by
    // reintroducing anatomical_adaptation at block 3 — reproducing, one
    // step removed, the exact "Block 3 repeats Anatomical Adaptation"
    // defect a review round kept citing. 'strength' is beginner-safe here:
    // resolveTargetRpe independently caps intensity at RPE 7 for beginners
    // regardless of the phase's own target, so a "Maximal Strength"-labeled
    // block for a beginner is still dosed at the same ceiling every other
    // phase already respects — only the label and rep range differ.
    return ['anatomical_adaptation', 'hypertrophy', goal === 'fat_loss' ? 'metabolic' : 'strength', 'hypertrophy']
  }
  if (experience === 'novice') {
    // Novices can handle a strength block, but not true power work yet.
    return base.map(p => (p === 'power' ? 'strength' : p))
  }
  return base
}

/**
 * Collapses back-to-back identical phases into something differentiated.
 * A novice's power->strength remap (just above) can land two 'strength'
 * blocks in a row when block 3 was ALREADY strength — "Blocks 3 and 4 are
 * both 'Maximal Strength'... an identical, duplicated block with no
 * differentiation" was a direct LLM coach review finding.
 *
 * `allowedPhases`, when passed (Final Generator round, Fix 4), is the
 * EFFECTIVE allowed set for this profile (goal policy intersected with the
 * bodyweight equipment restriction, if any) — used to pick a genuinely safe
 * substitute rather than guessing. Without it, this falls back to the old
 * hypertrophy<->anatomical_adaptation alternation.
 *
 * Critically, this now refuses to reintroduce anatomical_adaptation once it
 * has already opened the sequence (position 0), except as an absolute last
 * resort. The old unconditional "swap for AA" behavior is exactly what
 * caused "Block 3 repeats Anatomical Adaptation after a completed
 * hypertrophy block" — a beginner's ['AA','hypertrophy','metabolic',
 * 'hypertrophy'] sequence, restricted for a goal that doesn't allow
 * 'metabolic' (hypertrophy, functional), fell back to 'hypertrophy' at
 * position 2, creating an adjacent hypertrophy/hypertrophy run that this
 * function then "fixed" by reintroducing AA — reproducing the exact defect
 * it exists to prevent, just one step removed from the original cause.
 */
export function dedupeAdjacentPhases(sequence: TrainingPhase[], allowedPhases?: TrainingPhase[]): TrainingPhase[] {
  const allowed = allowedPhases ? new Set(allowedPhases) : null
  const result: TrainingPhase[] = []
  for (let i = 0; i < sequence.length; i++) {
    const phase = sequence[i]
    // Compared against the ALREADY-FIXED previous entry, not the original
    // array — a naive sequence.map comparing against the original would
    // flag every phase in a run of 3+ identical phases as "a duplicate of
    // the first," collapsing all of them to the same replacement instead of
    // alternating.
    if (i === 0 || phase !== result[i - 1]) {
      result.push(phase)
      continue
    }

    const priorAA = result.includes('anatomical_adaptation')
    // Priority: (1) a phase already used elsewhere in the sequence at a
    // non-adjacent spot — it's already known-safe for this profile, since
    // it survived whatever restriction produced `sequence` — excluding the
    // one that's currently repeating and excluding AA once it's already
    // opened the cycle; (2) hypertrophy, universally allowed and safe,
    // unless IT is what's repeating; (3) any OTHER phase from the allowed
    // set not yet tried (covers cases where the intended differentiator —
    // e.g. 'metabolic' or 'strength' — was stripped out by an earlier
    // restriction step before ever reaching `sequence`, so it can't be
    // found in `result` at all); (4) anatomical_adaptation, but only if it
    // has never appeared yet.
    const usedElsewhere = [...new Set(result)].filter(p => p !== phase)
    const ALL_PHASES: TrainingPhase[] = ['anatomical_adaptation', 'hypertrophy', 'strength', 'power', 'metabolic']
    const candidates: TrainingPhase[] = [
      ...usedElsewhere.filter(p => p !== 'anatomical_adaptation' || !priorAA),
      ...(phase !== 'hypertrophy' ? (['hypertrophy'] as TrainingPhase[]) : []),
      ...ALL_PHASES.filter(p => p !== phase && p !== 'hypertrophy' && (p !== 'anatomical_adaptation' || !priorAA)),
      ...(priorAA ? [] : (['anatomical_adaptation'] as TrainingPhase[])),
    ]
    // Absolute last resort, when the allowed set is so narrow that nothing
    // in `candidates` clears it (e.g. a bodyweight hypertrophy trainee,
    // where the goal-policy allowed set intersected with the equipment
    // restriction leaves only {anatomical_adaptation, hypertrophy}): accept
    // the repeat rather than reintroduce AA once it's already opened the
    // sequence. A macrocycle with two hypertrophy-labeled blocks back to
    // back is a minor, forgivable monotony; being sent back to tendon-prep
    // after two months of real training is the specific, sharply-worded
    // defect this function exists to prevent.
    const pick = candidates.find(p => !allowed || allowed.has(p))
      ?? (priorAA ? phase : (phase === 'hypertrophy' ? 'anatomical_adaptation' : 'hypertrophy'))
    result.push(pick)
  }
  return result
}

// ---------------------------------------------------------------------------
// Intensity, capped by experience
// ---------------------------------------------------------------------------

const EXPERIENCE_RPE_CEILING: Record<TrainingExperience, number> = {
  beginner: 7,
  novice: 8,
  intermediate: 9,
  advanced: 9.5,
}

/**
 * The phase says how hard this block should be; the trainee's experience says
 * how hard they should ever go. The lower of the two wins.
 *
 * This exists because the previous mesocycle hard-coded "RPE 8-9 — Peak
 * overload week" for everyone, which silently overrode the beginner cap and
 * told a first-time lifter to grind near failure.
 */
export function resolveTargetRpe(
  phase: TrainingPhase,
  experience: TrainingExperience,
  weekInBlock: number,
  isDeload: boolean,
): string {
  if (isDeload) return 'RPE 5-6 — deload, move well and recover'

  const ceiling = EXPERIENCE_RPE_CEILING[experience]
  // Ramp within the block: week 1 easier, building to the phase target.
  const ramp = [-1, -0.5, 0][Math.min(weekInBlock - 1, 2)]
  const target = Math.min(PHASE_CONFIGS[phase].target_rpe + ramp, ceiling)

  // Whole numbers only. "RPE 5-5.5" is not a cue anyone can act on.
  const high = Math.round(target)
  const low = Math.max(5, high - 1)
  return `RPE ${low}-${high}`
}

// ---------------------------------------------------------------------------
// Variation rotation
// ---------------------------------------------------------------------------

/**
 * Swaps an exercise for a different variation of the SAME movement pattern.
 *
 * Constraints that must survive the swap: the replacement has to be in the
 * available pool (so equipment and injury filtering still hold) and has to be
 * skill-appropriate. A rotation that hands a beginner a Nordic curl in block 3
 * would undo the skill gating entirely.
 */
/**
 * Variations that exist as easier on-ramps. They are the right answer for
 * someone building up to the full movement and the wrong answer for someone
 * who has already outgrown them.
 */
// Audited against every tier2_compound bodyweight/unloaded entry whose
// movement_pattern also has a tier1_compound or loaded-tier2 sibling (the
// exact shape all of these share). Deliberately excludes Spanish Squat and
// Low Box Step-Up despite matching that shape: both carry indicated_joints
// (knee-rehab additions), and adding them here would block a knee-injured
// advanced lifter from reaching their only safe swap, which defeats the
// reason they exist. Also excludes Deficit Push-Ups, Archer Push-Ups,
// Chest Dips, Pistol Squat Progression — each already carries its own
// capability_requirement and its own `regression` field pointing at
// something easier than itself, so they're progressions in an existing
// chain, not undocumented easy downgrades.
const REGRESSION_VARIATIONS = new Set([
  'Pull-Ups (Assisted)',
  'Goblet Squats',
  'Push-Ups',
  'Incline Push-Ups',
  'Loaded Backpack Walk',
  'Farmer Squat Hold (Isometric Carry)',
  'Air Squat',
  'Inverted Row',
  'Towel Row',
  'Glute Bridge',
  'Single-Leg RDL (Bodyweight)',
  'Bodyweight Good Morning',
  'Split Squat (Bodyweight)',
  'Step-Ups (Bodyweight)',
  // §6.2's additions: the two that are genuinely EASIER versions of something
  // already in the catalogue, rather than peers. Without these an intermediate
  // asking to swap their push-ups would be offered knee push-ups as a
  // sideways step, which is the regression this list exists to refuse.
  'Knee Push-Ups',
  'Pull-Up Negatives',
])

export function isRegressionFor(name: string, experience: TrainingExperience): boolean {
  if (experience === 'beginner' || experience === 'novice') return false
  return REGRESSION_VARIATIONS.has(name)
}

export function rotateVariation(
  exerciseName: string,
  blockIndex: number,
  pool: ExerciseEntry[],
  experience: TrainingExperience,
  /**
   * Needed for the relative-load guard below (preservesRelativeLoad) — the
   * loading-class guard alone lets a 28kg dumbbell row rotate to a 27.5kg
   * backpack row (both "loaded"), which is still a stealth ~50% regression.
   */
  profile: UserProfile,
  /**
   * Names already spoken for elsewhere in the SAME session this week — e.g.
   * another exercise on the same day, or the day's own main lift. When the
   * naturally-computed rotation would collide with one of these, the
   * function tries the next candidate in the same list instead of handing
   * back a name that's already in use.
   */
  avoidNames?: Set<string>,
  /**
   * Movement FAMILIES already spoken for elsewhere in the same day (see
   * getMovementFamily) — broader than avoidNames: two different exercises
   * can collide by family (Deficit Push-Ups and Archer Push-Ups are
   * different names, same 'bench_press' family) and rotation landing on
   * one while another slot already holds the other is the same duplicate
   * bug avoidNames exists to prevent, just missed by an exact-name check.
   */
  avoidFamilies?: Set<string>,
): string {
  const current = EXERCISE_DATABASE.find(
    e => e.name.toLowerCase() === exerciseName.toLowerCase()
  )
  if (!current) return exerciseName

  // Loading class must never regress on rotation: an externally-loaded
  // exercise (Dumbbell Rows, Kettlebell Swings) may only rotate to another
  // externally-loaded variation — never to a bodyweight one — even when
  // that bodyweight variation shares substitution group/pattern/tier and
  // isn't on the hardcoded REGRESSION_VARIATIONS list below. A review round
  // caught this repeatedly: "Dumbbell Rows @28kg/hand becomes bodyweight
  // Inverted Row," "48kg Kettlebell Swing becomes bodyweight Single-Leg
  // RDL" — both destroy trackable overload and read as the plan "protecting
  // muscle in a deficit" while literally deleting the load. Bodyweight ->
  // loaded is fine (an upgrade); bodyweight -> bodyweight is fine (lateral).
  const currentIsLoaded = isExternallyLoaded(current)

  const variations = pool
    .filter(
      e =>
        e.substitution_group === current.substitution_group &&
        e.movement_pattern === current.movement_pattern &&
        isSkillAppropriate(e.name, experience) &&
        meetsCapabilityRequirement(e, experience) &&
        // Rotation must not become a downgrade. Without this, an advanced
        // lifter got rotated from Barbell Squats to Goblet Squats and from
        // Pull-Ups to Pull-Ups (Assisted) — variations that cannot be loaded
        // heavily enough to drive adaptation at that level.
        e.mechanics_tier === current.mechanics_tier &&
        !isRegressionFor(e.name, experience) &&
        (!currentIsLoaded || isExternallyLoaded(e)) &&
        // Fix 3: loaded -> loaded rotation must also preserve roughly the
        // same loading demand, not just clear the "is it loaded at all" bar.
        preservesRelativeLoad(current, e, profile)
    )
    // Stable ordering so rotation is deterministic rather than random —
    // the user should be able to see the same plan twice.
    .sort((a, b) => a.name.localeCompare(b.name))

  // Nothing to rotate between — same behavior with or without avoidNames,
  // since there is no second candidate to fall back to.
  if (variations.length <= 1) return current.name

  // `current` can be legitimately absent from its own candidate list — e.g.
  // it's flagged as a regression for this trainee's experience level
  // (isRegressionFor), so the filter above excludes it from being a
  // candidate to rotate BACK to. Falling back to index 0 in that case used
  // to silently swap to an unrelated exercise (alphabetically first in the
  // group) with no regard for what else was already selected that day —
  // that's how "Dumbbell Bench Press" ended up picked twice for one session.
  // Walking the list from a stable start and skipping anything in
  // `avoidNames` fixes both: a genuinely absent `current` still rotates
  // sensibly, and a collision with a sibling exercise gets skipped rather
  // than silently accepted.
  const currentIndex = variations.findIndex(v => v.name === current.name)
  const start = currentIndex >= 0 ? currentIndex : 0

  for (let attempt = 0; attempt < variations.length; attempt++) {
    const candidate = variations[(start + blockIndex + attempt) % variations.length]
    if (avoidNames?.has(candidate.name)) continue
    if (avoidFamilies?.has(getMovementFamily(candidate)) && candidate.name !== current.name) continue
    return candidate.name
  }
  // Every variation collides with something already on the day — hand back
  // the original name rather than force a duplicate.
  return current.name
}

// ---------------------------------------------------------------------------
// Tempo — the phase's voice for a lift that cannot take weight
// ---------------------------------------------------------------------------
//
// For a loaded lift the phase expresses itself through the weight: a strength
// block means heavier. For a WEIGHTLESS lift there is nothing for it to
// express itself through, and that is the root of the defect this exists to
// fix — the reps fall (rep_shift is negative in a strength block) and nothing
// else on screen changes, so a bodyweight trainee watches their numbers go
// down for sixteen weeks with no explanation. MEASURED: 84.7% of bodyweight
// lifts end a plan on fewer reps than they started.
//
// The loadless coach note shipped in 074ad9d already TELLS them the answer —
// "the difficulty comes from how you move: about three seconds lowering, a
// pause at the bottom" — but that was prose. Nothing prescribed it, nothing
// tracked it, nothing progressed it. A promise with no delivery, which is the
// same shape as update_workout_schedule and the Muay Thai swap.
//
// ONE LEVER AT A TIME, following loadStepUnaffordable's precedent: tempo is
// set by the BLOCK and constant within it, while reps stay the within-block
// lever exactly as before. That also makes the falling reps legible — they
// fall BECAUSE each rep got slower.
//
// Notation is the standard eccentric-pause-concentric triple. Two phases get
// none, deliberately: 'power' wants explosive intent and a slow eccentric
// fights it, and 'metabolic' wants short rest as the stimulus, which a long
// time-under-tension set undercuts. Absent means "no tempo instruction",
// never "we forgot".
export interface Tempo {
  /** Seconds lowering (the eccentric) — where the difficulty actually lives. */
  eccentric: number
  /** Seconds paused at the hard position. */
  pause: number
  /** Seconds lifting (the concentric). */
  concentric: number
}

const PHASE_TEMPO: Record<TrainingPhase, Tempo | null> = {
  anatomical_adaptation: { eccentric: 2, pause: 0, concentric: 1 },
  hypertrophy: { eccentric: 3, pause: 0, concentric: 1 },
  strength: { eccentric: 4, pause: 1, concentric: 1 },
  power: null,
  metabolic: null,
}

export function getPhaseTempo(phase: TrainingPhase): Tempo | null {
  return PHASE_TEMPO[phase]
}

/** Canonical notation, e.g. '4-1-1'. This is what is stored on the exercise. */
export function formatTempo(t: Tempo): string {
  return `${t.eccentric}-${t.pause}-${t.concentric}`
}

/** Parses the stored notation back. Returns null for anything unrecognised. */
export function parseTempo(tempo: string | undefined | null): Tempo | null {
  if (!tempo) return null
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(tempo.trim())
  if (!m) return null
  return { eccentric: Number(m[1]), pause: Number(m[2]), concentric: Number(m[3]) }
}

/**
 * Plain English for the trainee. '4-1-1' is standard coaching notation and
 * completely opaque to someone who has never seen it, so the stored value is
 * canonical and this is what actually goes on screen.
 */
export function describeTempo(tempo: string | undefined | null): string | null {
  const t = parseTempo(tempo)
  if (!t) return null
  const parts = [`${t.eccentric}s down`]
  if (t.pause > 0) parts.push(`${t.pause}s pause`)
  parts.push(t.concentric <= 1 ? 'drive up' : `${t.concentric}s up`)
  return parts.join(' · ')
}

/** Seconds one rep takes at this tempo. No fudge factor: the tempo IS the rep time. */
export function tempoSecondsPerRep(t: Tempo): number {
  return t.eccentric + t.pause + t.concentric
}

// ---------------------------------------------------------------------------
// Block assembly
// ---------------------------------------------------------------------------

export interface PeriodizedWeek {
  week_number: number
  block_number: number
  week_in_block: number
  phase: TrainingPhase
  phase_label: string
  phase_focus: string
  label: string
  is_deload: boolean
  coach_note: string
  days: WorkoutDay[]
}

export function getPhaseConfig(phase: TrainingPhase): PhaseConfig {
  return PHASE_CONFIGS[phase]
}

/** Shifts a rep range up or down while keeping its spread. */
// Seconds floor for a time-based hold/interval shift — deliberately NOT
// `minReps` (calibrated for rep counts like 3-8; using it as a seconds
// floor would be a unit mismatch), just a sane lower bound so a shrinking
// deload/AA shift can't push a hold to something silly like 2 seconds.
const MIN_HOLD_SECONDS = 10

export function shiftReps(reps: string, delta: number, minReps: number): string {
  const range = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) {
    const low = Math.max(minReps, Number(range[1]) + delta)
    const spread = Number(range[2]) - Number(range[1])
    return `${low}-${low + spread}`
  }
  const single = reps.match(/^(\d+)$/)
  if (single) return String(Math.max(minReps, Number(single[1]) + delta))

  // Time-based holds/intervals ('30-45s', '30s') shift the SECONDS the same
  // way a rep range shifts reps — without this, an isometric hold (plank,
  // dead bug, side plank) or an interval's work duration NEVER changes
  // week to week, since a plain rep-range shift can't touch them. That's a
  // real "nothing is progressing" gap: bodyweight holds otherwise have no
  // load to ramp AND no reps to ramp.
  const timeRange = reps.match(/^(\d+)\s*-\s*(\d+)\s*s$/)
  if (timeRange) {
    const low = Math.max(MIN_HOLD_SECONDS, Number(timeRange[1]) + delta)
    const spread = Number(timeRange[2]) - Number(timeRange[1])
    return `${low}-${low + spread}s`
  }
  const timeSingle = reps.match(/^(\d+)\s*s$/)
  if (timeSingle) return `${Math.max(MIN_HOLD_SECONDS, Number(timeSingle[1]) + delta)}s`

  // Distance prescriptions ('40m') pass through untouched — see the isCarry
  // handling in exercise-plan.ts, which routes carries to ramp LOAD instead
  // since distance is the wrong lever for a loaded carry.
  return reps
}

/**
 * Per-week step for an interval exercise's work bout and rest period —
 * deliberately its own small constant rather than reusing PHASE_CONFIGS'
 * rep_shift, which is calibrated for rep-count magnitudes (~3-4) and
 * produces un-coached numbers ("33s") when borrowed directly as a seconds
 * delta. Applied identically to work AND rest (see stepIntervalSeconds'
 * call sites in exercise-plan.ts) so the work:rest ratio holds across a
 * block instead of silently drifting as the bout lengthens.
 */
const INTERVAL_STEP_SECONDS = 5

/**
 * Steps an interval's work (or rest) duration for the given week-in-block:
 * week 1 is the category base, week 2 is +5s, week 3 is +10s. Deload holds
 * at the base — no step — matching how deload already treats every other
 * progression lever (load holds, sets cut). Kept separate from shiftReps:
 * that function's `w-1` term compounds through the goal's phase-level
 * rep_shift, which is exactly the reps/seconds unit mismatch this exists
 * to avoid.
 */
export function stepIntervalSeconds(baseSeconds: number, weekInBlock: number, isDeload: boolean): number {
  if (isDeload) return baseSeconds
  const week = Math.min(Math.max(1, weekInBlock), 3)
  return baseSeconds + (week - 1) * INTERVAL_STEP_SECONDS
}

export function adjustRest(rest: string, deltaSeconds: number): string {
  const m = rest.match(/^(\d+)s$/)
  if (!m) return rest
  return `${Math.max(20, Number(m[1]) + deltaSeconds)}s`
}

export function describeMacrocycle(
  sequence: TrainingPhase[],
  experience: TrainingExperience,
): string {
  const names = sequence.map(p => PHASE_CONFIGS[p].label)
  const weeks = sequence.length * 4
  return (
    `${weeks}-week plan across ${sequence.length} blocks: ${names.join(' → ')}. ` +
    `Movement patterns stay consistent so progress is measurable; ` +
    `exercise variations rotate each block to keep the stimulus fresh. ` +
    `Intensity is capped at what suits a ${experience} trainee.`
  )
}

/** Exported so the mesocycle can rotate within the same constrained pool. */
export { EXPERIENCE_RPE_CEILING }
