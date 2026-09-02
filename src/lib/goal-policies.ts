import type { ConditioningPreference, FitnessGoal, RecoveryCapacity } from './types'
import type { TrainingPhase } from './periodization'

// ---------------------------------------------------------------------------
// GOAL POLICIES
// ---------------------------------------------------------------------------
// Every fitness_goal shares the same generation engine — same 5-stage
// filter, same phase sequencing, same double-progression system — but should
// come out the other end feeling like a genuinely different program, not the
// same plan with a different label on it. This is the single place those
// differences are declared, so "why does fat_loss look basically identical
// to hypertrophy" has one file to check instead of a dozen scattered
// `if (goal === 'fat_loss')` branches.
//
// Mapping note: this codebase's FitnessGoal enum has exactly four values —
// fat_loss, hypertrophy, functional, conditioning — which line up with the
// four categories this policy set was designed around: fat loss,
// hypertrophy/muscle gain, maintain/general health, and endurance/
// conditioning, respectively. 'functional' is used here as the maintain/
// general-health bucket; there is no separate "endurance" goal distinct from
// 'conditioning' in this app today.

export type ProgressionEmphasis = 'load' | 'reps' | 'maintain'

export interface GoalPolicy {
  goal: FitnessGoal
  label: string
  /**
   * Multiplies every working set count on top of the existing per-phase
   * sets_multiplier in generateMesocycle(). 1.0 is the hypertrophy baseline;
   * everything else is relative to it.
   */
  setVolumeMultiplier: number
  /** Target conditioning sessions per week (dedicated day, post-session, or independent block — see assignConditioningNotes). Fractional values round at the call site. */
  conditioningFrequencyPerWeek: number
  /**
   * How many weeks a MAIN lift holds its variation before rotating. Declared
   * for completeness/documentation, but NOT currently wired to a behavior
   * difference: Part 2 established "main lifts rotate only at block
   * boundaries" as an unconditional rule, because the whole double-
   * progression system depends on a main lift staying put long enough to
   * track a baseline against. Every policy below is 4 (one full block) for
   * that reason — this field exists so a future change to that rule has a
   * declared home, not so it can be tuned today.
   */
  mainRotationWeeks: number
  /** How many weeks an ACCESSORY holds its variation before rotating within a block (2 = the Part 2 default). */
  accessoryRotationWeeks: number
  /** Training phases this goal may ever enter. Phases outside this list get remapped to the nearest allowed one before intensity/load are computed. */
  allowedPhases: TrainingPhase[]
  /**
   * What double progression ramps within a block for externally loaded
   * exercises: 'load' climbs the weight (the Part 1 default), 'reps' holds
   * the weight and climbs the rep target instead, 'maintain' does neither —
   * flat weight, flat reps, RPE alone drives week-to-week feel. True
   * bodyweight/uncategorizable movements always ramp reps regardless of this
   * setting, since there's no weight to ramp in the first place.
   */
  progressionEmphasis: ProgressionEmphasis
  coachNote: string
  /**
   * The goal's framing for a trainee with nothing to add weight to. See
   * PhaseConfig.coach_note_loadless — a bodyweight-only trainee was being
   * told "load climbing week to week" about a session of Box Squats and
   * Push-Ups. Required rather than optional so a new goal cannot ship
   * without someone deciding what it says to that trainee.
   */
  coachNoteLoadless: string
  /**
   * Differentiation round (VISION-ARCHITECTURE differentiation audit):
   * signed rep-count shift applied to STYLE_CONFIGS' base rep range for
   * each tier, before the experience floor. This is what makes fat_loss's
   * main lifts read as "lower reps, quality over accumulation" and
   * conditioning's read as "strength-endurance ranges" without touching
   * training_style's own numbers — the two axes stay independent and
   * multiply together instead of one silently overriding the other.
   */
  repRangeShift: { tier1: number; tier2: number; tier3: number }
  /**
   * Multiplies STYLE_CONFIGS' base rest-seconds per tier. Below 1.0 = denser
   * (shorter rest); above 1.0 = fuller recovery. fat_loss/conditioning use
   * this on accessories for density; functional lengthens tier1 rest
   * slightly (fuller recovery between main lifts supports power/strength
   * work); hypertrophy leaves rest untouched (rep-range/isolation-count are
   * hypertrophy's differentiators, not rest).
   */
  restSecondsMultiplier: { tier1: number; tier2: number; tier3: number }
  /**
   * Floor, in seconds, under a tier1 main lift that carries EXTERNAL LOAD —
   * a bar or dumbbells, not a chin-up. Absent means no floor.
   *
   * Exists for conditioning, and only conditioning. Its 0.8 tier1 multiplier
   * on top of a short session's base rest produced Barbell Squats and Bench
   * Press at 42 SECONDS between sets. Short rest is the whole point of the
   * goal, and it keeps it everywhere else — accessories, machines,
   * bodyweight, carries — but a loaded bar recovered for 42 seconds is how
   * form fails, and the cost is asymmetric: too much rest on one lift is a
   * slightly easier session, too little is a rep failing under load.
   *
   * MEASURED before this existed: 91% of conditioning's loaded main lifts
   * rested under 90s, against 17-27% for every other goal — and conditioning
   * was the ONLY goal that ever went below 60s at all. So this is scoped to
   * the goal rather than applied globally: a hypertrophy bench at 75s is a
   * deliberate, normal prescription, and a blanket floor would have quietly
   * rewritten a fifth of every other goal's main lifts too.
   *
   * This is the LOADED floor and it still is. It sits ON TOP of
   * MAIN_LIFT_REST_FLOOR_SECONDS below, which applies to every main lift
   * including bodyweight ones — see that constant for why the
   * "it's about a bar, not a tier" scoping stops at 60 seconds.
   */
  minLoadedMainLiftRestSeconds?: number
  /**
   * Signed shift in isolation (tier3) slot count; the same magnitude moves
   * the OPPOSITE way for tier2 (compound-accessory) slots, so total
   * accessory count is unchanged — only the isolation:compound-accessory
   * ratio shifts. Never touches tier1 (main-lift) count, which is what the
   * "fat_loss never has fewer main-compound slots than hypertrophy" audit
   * guards. Positive = more isolation/variety (hypertrophy); negative =
   * fewer isolation slots in favor of compound/multi-joint accessories
   * (fat_loss's "accessory selection favouring compound over isolation",
   * functional's "fewer machine-based isolations", conditioning's
   * full-body/circuit-adjacent structure).
   */
  isolationSlotShift: number
  /**
   * When true, accessory/isolation candidate selection prefers exercises
   * tagged unilateral, carry, or rotational (angle_vector) before falling
   * back to the full eligible pool — functional's "more unilateral, carry,
   * rotational and multi-planar work." No goal turns this off entirely for
   * OTHER movement types; it only reorders which candidates are tried
   * first within an already-eligible pool, so pattern-coverage/required-
   * slot guarantees are untouched.
   */
  preferUnilateralCarry: boolean
}

const HYPERTROPHY_POLICY: GoalPolicy = {
  goal: 'hypertrophy',
  label: 'Muscle Growth',
  setVolumeMultiplier: 1.0,
  conditioningFrequencyPerWeek: 1,
  mainRotationWeeks: 4,
  accessoryRotationWeeks: 2,
  allowedPhases: ['anatomical_adaptation', 'hypertrophy', 'strength', 'power', 'consolidation'],
  progressionEmphasis: 'load',
  coachNote: 'Volume drives growth here — the program is built around moderate-rep working sets taken close to failure, with load climbing week to week within each block.',
  coachNoteLoadless: 'Volume drives growth here — the program is built around moderate-rep working sets taken close to failure, with the work climbing week to week within each block through reps and harder variations.',
  // Higher accessory/isolation reps (more time under tension), untouched
  // rest (rep-range and isolation count are the differentiators, not
  // density), and more isolation slots for wider per-muscle-group variety.
  repRangeShift: { tier1: 0, tier2: 1, tier3: 2 },
  restSecondsMultiplier: { tier1: 1.0, tier2: 1.0, tier3: 1.0 },
  isolationSlotShift: 1,
  preferUnilateralCarry: false,
}

const FAT_LOSS_POLICY: GoalPolicy = {
  goal: 'fat_loss',
  label: 'Fat Loss',
  // ~10-15% below the hypertrophy baseline — a calorie deficit blunts
  // recovery, so full hypertrophy-level volume isn't recoverable here.
  setVolumeMultiplier: 0.875,
  conditioningFrequencyPerWeek: 2.5,
  mainRotationWeeks: 4,
  accessoryRotationWeeks: 2,
  allowedPhases: ['anatomical_adaptation', 'hypertrophy', 'strength', 'metabolic'],
  // Deliberately 'load', not 'reps' or 'maintain' — the point is to keep
  // pushing the main lifts so muscle has a reason to stick around in a
  // deficit, not to turn the session into circuits.
  progressionEmphasis: 'load',
  coachNote:
    "Diet drives the fat loss here, not the workout — this program is built to protect the muscle you already have while you're in a deficit. Weights stay real weights and progression keeps climbing; conditioning is appended on top, never substituted for lifting.",
  coachNoteLoadless:
    "Diet drives the fat loss here, not the workout — this program is built to protect the muscle you already have while you're in a deficit. The strength work stays real strength work and keeps getting harder; conditioning is appended on top, never substituted for it.",
  // Lower main-lift reps (quality over accumulation — deliberately NOT
  // lighter/higher-rep, which would be the circuit-conversion myth this
  // goal exists to avoid), shorter accessory rest for density, fewer
  // isolation slots in favor of compound/multi-joint accessories. Tier1
  // rest and tier1 slot count are untouched — the main lifts stay exactly
  // as heavy and as present as hypertrophy's.
  repRangeShift: { tier1: -2, tier2: -1, tier3: 0 },
  restSecondsMultiplier: { tier1: 1.0, tier2: 0.75, tier3: 0.7 },
  isolationSlotShift: -1,
  preferUnilateralCarry: false,
}

const CONDITIONING_POLICY: GoalPolicy = {
  goal: 'conditioning',
  label: 'Endurance / Conditioning',
  setVolumeMultiplier: 0.85,
  conditioningFrequencyPerWeek: 4,
  mainRotationWeeks: 4,
  accessoryRotationWeeks: 2,
  // No strength or power block — capped at hypertrophy/metabolic work.
  allowedPhases: ['anatomical_adaptation', 'hypertrophy', 'metabolic'],
  progressionEmphasis: 'reps',
  coachNote: 'Lifting supports the engine work here, not the other way around — two to three full-body sessions keep you strong enough to train hard, while dedicated conditioning is the main driver of this goal.',
  // Says nothing about weight either way; kept identical deliberately.
  coachNoteLoadless: 'Strength work supports the engine work here, not the other way around — two to three full-body sessions keep you strong enough to train hard, while dedicated conditioning is the main driver of this goal.',
  // Strength-endurance rep ranges across every tier (including main lifts —
  // this goal's lifting is real support work, not a heavy-strength focus),
  // circuit-adjacent density via shortened rest everywhere, fewer isolation
  // slots in favor of full-body/compound accessories.
  repRangeShift: { tier1: 2, tier2: 3, tier3: 4 },
  restSecondsMultiplier: { tier1: 0.8, tier2: 0.7, tier3: 0.65 },
  // Ashley's ruling: the session still conditions, the part with a bar on
  // your back does not. See minLoadedMainLiftRestSeconds' doc comment.
  minLoadedMainLiftRestSeconds: 90,
  isolationSlotShift: -1,
  preferUnilateralCarry: false,
}

const FUNCTIONAL_POLICY: GoalPolicy = {
  goal: 'functional',
  label: 'General Health / Maintenance',
  setVolumeMultiplier: 0.9,
  conditioningFrequencyPerWeek: 1.5,
  mainRotationWeeks: 4,
  // Faster accessory rotation than every other goal — variety over strict
  // overload. (Main lifts still hold for the block; see mainRotationWeeks.)
  accessoryRotationWeeks: 1,
  allowedPhases: ['anatomical_adaptation', 'hypertrophy', 'strength', 'power', 'consolidation'],
  progressionEmphasis: 'maintain',
  coachNote: 'This program favors variety and movement quality over chasing a number on the bar — exercises rotate faster, and the aim is consistent, sustainable training rather than maximal overload.',
  coachNoteLoadless: 'This program favors variety and movement quality over chasing a number — exercises rotate faster, and the aim is consistent, sustainable training rather than maximal overload.',
  // Standard rep ranges (variety is the differentiator here, not rep
  // scheme), slightly fuller tier1 recovery (supports power/explosive work
  // where experience allows), fewer isolation slots in favor of unilateral/
  // carry/rotational multi-planar accessories — this goal's whole point.
  repRangeShift: { tier1: 0, tier2: 0, tier3: 0 },
  restSecondsMultiplier: { tier1: 1.05, tier2: 1.0, tier3: 1.0 },
  isolationSlotShift: -1,
  preferUnilateralCarry: true,
}

/**
 * Hard floor, in seconds, under the day's main lift — ANY main lift, loaded
 * or bodyweight. Nothing may take a tier1 compound below this: not the
 * selection-time time-cap trim, not the phase's own rest_adjust_seconds, not
 * the final per-week budget trim.
 *
 * Distinct from minLoadedMainLiftRestSeconds above, and deliberately a
 * different question. That floor asks "is there a bar on your back", and
 * Ashley's ruling was that a bodyweight main lift keeps the goal's density
 * because the risk being guarded is a loaded bar. That ruling still holds
 * ABOVE this number — conditioning's 90s floor stays loaded-only, and a
 * bodyweight chin-up in a conditioning block still rests less than a squat
 * does. It stops holding below 60, because at that point the constraint is
 * no longer about load management, it is about whether the trainee can
 * physically complete the next set.
 *
 * MEASURED before this existed: 553 of 9,216 profile combinations (6.0%)
 * had the day's main lift resting under a minute — every observed instance
 * a bodyweight pull-up, at 42s or 57s. Traced: a hybrid tier1 base of 90s,
 * times conditioning's 0.8 multiplier (72s), minus stageTimeCap's blanket
 * -15s (57s), minus anatomical adaptation's -15s rest_adjust (42s). Two of
 * those three paths had no main-lift gate at all.
 *
 * 60 is not a new number — it is the floor trimWeekRestForBudget already
 * used and the line quality-score's own main_lift_short_rest check already
 * drew. Before this, the rule and the check disagreed.
 */
export const MAIN_LIFT_REST_FLOOR_SECONDS = 60

export const GOAL_POLICIES: Record<FitnessGoal, GoalPolicy> = {
  hypertrophy: HYPERTROPHY_POLICY,
  fat_loss: FAT_LOSS_POLICY,
  conditioning: CONDITIONING_POLICY,
  functional: FUNCTIONAL_POLICY,
}

export function getGoalPolicy(goal: FitnessGoal): GoalPolicy {
  return GOAL_POLICIES[goal] ?? HYPERTROPHY_POLICY
}

// Fallback order when a phase the base sequence wants to use isn't in a
// goal's allowedPhases — walk down in intensity until something's allowed.
// Never walks UP (a restricted goal should never be handed a harder phase
// than the one it lost), so anatomical_adaptation is always the floor.
const PHASE_FALLBACK: Record<TrainingPhase, TrainingPhase[]> = {
  power: ['strength', 'hypertrophy', 'anatomical_adaptation'],
  strength: ['hypertrophy', 'anatomical_adaptation'],
  // A beginner's third block (periodization.ts) — falls the same way strength does.
  consolidation: ['hypertrophy', 'anatomical_adaptation'],
  metabolic: ['hypertrophy', 'anatomical_adaptation'],
  hypertrophy: ['anatomical_adaptation'],
  anatomical_adaptation: [],
}

/**
 * Restricts a phase sequence (already adjusted for experience by
 * getPhaseSequence) to a goal's allowed phases — e.g. conditioning never
 * sees 'strength' or 'power' regardless of how experienced the trainee is.
 */
export function restrictPhaseSequence(sequence: TrainingPhase[], allowedPhases: TrainingPhase[]): TrainingPhase[] {
  const allowed = new Set(allowedPhases)
  return sequence.map(phase => {
    if (allowed.has(phase)) return phase
    const fallback = PHASE_FALLBACK[phase].find(p => allowed.has(p))
    return fallback ?? 'anatomical_adaptation'
  })
}

// ---------------------------------------------------------------------------
// Onboarding-driven modifiers (Part 5)
// ---------------------------------------------------------------------------

/** Weekly set-volume multiplier from self-reported recovery capacity — stacks with (multiplies on top of) the goal's own setVolumeMultiplier. */
export const RECOVERY_SET_MULTIPLIER: Record<RecoveryCapacity, number> = {
  low: 0.75,
  moderate: 0.9,
  high: 1.0,
}

/**
 * Applies conditioning_preference on top of a goal's base conditioning
 * frequency. 'avoid' doesn't zero it out unconditionally — fat_loss and
 * conditioning goals still need SOME conditioning to actually hit the goal,
 * so they drop to a minimum viable dose instead of nothing; hypertrophy and
 * functional, where conditioning is optional/supplementary to begin with,
 * drop all the way to zero appended cardio.
 */
export function resolveConditioningFrequency(policy: GoalPolicy, preference: ConditioningPreference | undefined): number {
  if (preference === 'avoid') {
    const stillNeedsSome = policy.goal === 'fat_loss' || policy.goal === 'conditioning'
    return stillNeedsSome ? 1 : 0
  }
  if (preference === 'love') return policy.conditioningFrequencyPerWeek + 1
  return policy.conditioningFrequencyPerWeek
}
