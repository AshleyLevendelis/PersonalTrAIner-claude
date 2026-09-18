import type { EquipmentAccess, TrainingExperience } from './types'
import type { ExerciseEntry, MovementPattern } from './exercise-db'
import {
  isExternallyLoaded, primerCarriesWeight, roundToPlate, loadingMode,
  formatLoad, labelModeForEntry,
  type PrescribedLoadSource, type LoadPrescription,
} from './load-prescription'
import { getExerciseEntry } from './exercise-db'
import { getDurationBudgetSeconds } from './session-duration'
import type { UserProfile, WorkoutDay } from './types'

// ---------------------------------------------------------------------------
// WARM-UPS
// ---------------------------------------------------------------------------
// A certified trainer never sends someone straight into a heavy compound from
// cold. A proper warm-up has three distinct jobs, and collapsing them into one
// generic "5 minutes of cardio" block loses most of the benefit:
//
//   1. GENERAL   — raise core temperature and heart rate. Non-specific.
//   2. MOBILITY  — prepare the specific joints this session is about to load.
//                  A squat day and a bench day need different preparation.
//   3. RAMP-UP   — progressively loaded sets of the main lift itself, so the
//                  nervous system and the tissue see the movement pattern
//                  before they see the working weight.
//
// Point 3 is the one most commonly missing from generated programs, and it is
// the one that most directly prevents injury on the first working set.

export interface WarmupItem {
  name: string
  prescription: string
  purpose: string
  duration_seconds: number
}

export interface RampSet {
  set_number: number
  load_percent: number
  reps: number
  note: string
}

export interface RampBlock {
  exercise: string
  sets: RampSet[]
  /** True for every ramp after the session's first heavy lift — a shorter build-up since the lifter is already warm, never a full cold-start scheme. */
  abbreviated: boolean
  /**
   * Provenance of the WORKING weight these ramp percentages are relative to
   * (see WarmupContext.compounds) — 'estimate' or 'assumed_body' when the
   * day's working set is itself still an unverified guess, so the UI can
   * apply the same muted styling to the ramp percentages as it does to the
   * working-set chip they're building toward. undefined when unknown (e.g. a
   * bodyweight compound has no load provenance to inherit).
   */
  loadSource?: PrescribedLoadSource
}

export interface WarmupBlock {
  general: WarmupItem[]
  mobility: WarmupItem[]
  /**
   * One entry per qualifying heavy compound in the session (C0 calibration
   * round, Fix 2) — every tier1_compound, plus any tier2_compound loaded past
   * RAMP_TIER2_THRESHOLD_KG. A day with two main lifts (e.g. Squats then
   * Deadlifts) used to ramp only whichever came first in exercise order,
   * sending the second heavy compound in cold. In session order; the first
   * entry is always the full, experience-scaled scheme, everything after is
   * abbreviated. Empty array, never null, when nothing in the session qualifies.
   */
  ramp_ups: RampBlock[]
  total_seconds: number
  coach_note: string
}

// ---------------------------------------------------------------------------
// General temperature-raising work
// ---------------------------------------------------------------------------
// Chosen by what the trainee actually has access to. Someone training in a
// bedroom cannot "spend 5 minutes on the rower", and prescribing it anyway is
// how a plan loses credibility on day one.

const GENERAL_WARMUPS: Record<EquipmentAccess, WarmupItem> = {
  full_gym: {
    name: 'Bike, Rower, or Treadmill',
    prescription: '5 min, easy pace',
    purpose: 'Raise core temperature and blood flow before loading anything',
    duration_seconds: 300,
  },
  home_gym: {
    name: 'Jump Rope or Brisk Walk',
    prescription: '4-5 min, conversational effort',
    purpose: 'Raise core temperature and blood flow before loading anything',
    duration_seconds: 270,
  },
  minimalist: {
    name: 'Jumping Jacks & High Knees',
    prescription: '3 rounds: 30s each, 30s easy',
    purpose: 'Raise core temperature with no equipment needed',
    duration_seconds: 240,
  },
  bodyweight: {
    name: 'Jumping Jacks & High Knees',
    prescription: '3 rounds: 30s each, 30s easy',
    purpose: 'Raise core temperature with no equipment needed',
    duration_seconds: 240,
  },
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// DRILLS THAT EXIST ONLY FOR A TIGHTNESS ANSWER.
//
// SEPARATE FROM MOBILITY_DRILLS ON PURPOSE, and the separation was bought the
// hard way. These two were added to the shared catalogue first, because the
// tightness question offers eight areas and nothing in the app prepared the
// neck or the elbow — tapping either would have looked exactly like tapping
// hips and produced nothing.
//
// Putting them in the shared list also let the PLAN pick them, which it did:
// test:audit came back with six sessions estimated at 43 minutes against a
// 37-minute budget, because a generated warm-up now had another drill to
// choose and the session had to pay for it. That is a change to everybody's
// plan, made as a side effect of answering a different question.
//
// So they live here. `drillsPreparing` sees both lists; buildWarmup sees only
// the catalogue. A tightness answer can reach these; a generated session
// cannot, and its duration budget is untouched.
// ---------------------------------------------------------------------------
const TIGHTNESS_ONLY_DRILLS: MobilityDrill[] = [
  {
    name: 'Chin Tucks and Neck Rotations',
    prescription: '8 tucks, then 5 slow rotations each way',
    purpose: 'Eases a stiff neck before anything overhead or braced',
    duration_seconds: 45,
    prepares_joints: ['neck'],
    contraindicated_for: ['neck'],
    needs_equipment: [],
  },
  {
    name: 'Elbow Circles and Wrist Rolls',
    prescription: '10 circles each way, then 10 wrist rolls',
    purpose: 'Warms the elbow and wrist before pressing or gripping heavy',
    duration_seconds: 40,
    prepares_joints: ['elbow', 'wrist'],
    contraindicated_for: ['elbows'],
    needs_equipment: [],
  },
]

// Targeted mobility
// ---------------------------------------------------------------------------
// Each drill declares which joints it prepares and which injuries it is
// inappropriate for. Selection is driven by the movement patterns actually
// scheduled that day — this is what makes the warm-up specific rather than
// decorative.

interface MobilityDrill extends WarmupItem {
  prepares_joints: string[]
  contraindicated_for: string[]
  needs_equipment: string[]
}

const MOBILITY_DRILLS: MobilityDrill[] = [
  {
    name: 'Cat-Cow',
    prescription: '10 slow reps',
    purpose: 'Segmental spine mobility before any loaded hinge or squat',
    duration_seconds: 45,
    prepares_joints: ['spine', 'lower_back_axial'],
    contraindicated_for: [],
    needs_equipment: [],
  },
  {
    name: 'World\'s Greatest Stretch',
    prescription: '5 each side',
    purpose: 'Opens hips, thoracic spine and hamstrings in one movement',
    duration_seconds: 90,
    prepares_joints: ['hip', 'spine', 'knee'],
    contraindicated_for: ['knees'],
    needs_equipment: [],
  },
  {
    name: 'Hip Airplanes',
    prescription: '6 each side, slow',
    purpose: 'Hip rotation control and single-leg stability',
    duration_seconds: 75,
    prepares_joints: ['hip'],
    contraindicated_for: ['hips'],
    needs_equipment: [],
  },
  {
    name: 'Bodyweight Squat to Stand',
    prescription: '10 reps',
    purpose: 'Grooves the squat pattern through full range before loading',
    duration_seconds: 60,
    prepares_joints: ['hip', 'knee', 'ankle'],
    contraindicated_for: ['knees'],
    needs_equipment: [],
  },
  {
    name: 'Glute Bridge',
    prescription: '12 reps, 2s squeeze',
    purpose: 'Wakes up the glutes so the lower back does not take over',
    duration_seconds: 60,
    prepares_joints: ['hip', 'lower_back_axial'],
    contraindicated_for: [],
    needs_equipment: [],
  },
  {
    name: 'Ankle Rocks Against Wall',
    prescription: '10 each side',
    purpose: 'Ankle dorsiflexion — the usual limiter in squat depth',
    duration_seconds: 60,
    prepares_joints: ['ankle'],
    contraindicated_for: ['ankles'],
    needs_equipment: [],
  },
  {
    name: 'Band Pull-Aparts',
    prescription: '15 reps',
    purpose: 'Upper back and rear delts before pressing or pulling',
    duration_seconds: 45,
    prepares_joints: ['shoulder'],
    contraindicated_for: [],
    needs_equipment: ['resistance band'],
  },
  {
    name: 'Shoulder Dislocates (broomstick or band)',
    prescription: '10 slow reps',
    purpose: 'Shoulder flexion and external rotation through full range',
    duration_seconds: 60,
    prepares_joints: ['shoulder'],
    contraindicated_for: ['shoulders'],
    needs_equipment: [],
  },
  {
    name: 'Scapular Push-Ups',
    prescription: '12 reps',
    purpose: 'Scapular control before horizontal pressing',
    duration_seconds: 45,
    prepares_joints: ['shoulder', 'scapula'],
    contraindicated_for: ['wrists'],
    needs_equipment: [],
  },
  {
    name: 'Dead Hang',
    prescription: '2 x 20s',
    purpose: 'Decompresses the shoulders before overhead or vertical pulling',
    duration_seconds: 70,
    prepares_joints: ['shoulder'],
    contraindicated_for: ['shoulders', 'wrists', 'elbows'],
    needs_equipment: ['pull-up bar'],
  },
  {
    name: 'Wrist Circles & Prayer Stretch',
    prescription: '30s each',
    purpose: 'Wrist prep for any front-rack, plank or pressing position',
    duration_seconds: 60,
    prepares_joints: ['wrist'],
    contraindicated_for: [],
    needs_equipment: [],
  },
  {
    name: 'Thoracic Rotations (quadruped)',
    prescription: '8 each side',
    purpose: 'Upper back rotation before pressing or rotational work',
    duration_seconds: 70,
    prepares_joints: ['spine', 'shoulder'],
    contraindicated_for: ['wrists'],
    needs_equipment: [],
  },
  {
    name: 'Leg Swings (front-back & lateral)',
    prescription: '10 each direction, each leg',
    purpose: 'Dynamic hip range before hinging or single-leg work',
    duration_seconds: 75,
    prepares_joints: ['hip'],
    contraindicated_for: [],
    needs_equipment: [],
  },
]

// Which joints each movement pattern actually loads. Drives drill selection.
const PATTERN_JOINTS: Record<string, string[]> = {
  horizontal_push: ['shoulder', 'scapula', 'wrist'],
  vertical_push: ['shoulder', 'scapula', 'spine'],
  horizontal_pull: ['shoulder', 'scapula'],
  vertical_pull: ['shoulder', 'scapula'],
  hip_hinge: ['hip', 'lower_back_axial', 'spine'],
  knee_dominant: ['hip', 'knee', 'ankle'],
  single_leg: ['hip', 'knee', 'ankle'],
  carry: ['spine', 'shoulder'],
  core: ['spine'],
  rotation: ['spine', 'hip'],
  isolation_bicep: ['elbow'],
  isolation_tricep: ['elbow'],
  isolation_shoulder: ['shoulder'],
  isolation_quad: ['knee'],
  isolation_hamstring: ['hip', 'knee'],
  isolation_calf: ['ankle'],
  activation: [],
  cardio: [],
}

const EQUIPMENT_AVAILABLE: Record<EquipmentAccess, string[]> = {
  full_gym: ['resistance band', 'pull-up bar'],
  home_gym: ['resistance band', 'pull-up bar'],
  minimalist: ['resistance band'],
  bodyweight: [],
}

// ---------------------------------------------------------------------------
// Ramp-up sets
// ---------------------------------------------------------------------------
// Percentages are of the trainee's working weight for that exercise, not of a
// tested 1RM — most people using this app do not have a tested max, and asking
// for one is a barrier. "60% of what you'll work with today" is something
// anyone can act on immediately.

const RAMP_SCHEMES: Record<TrainingExperience, { load_percent: number; reps: number }[]> = {
  // Beginners are lifting light enough that a long ramp is wasted time, but
  // they benefit most from practice reps of the pattern.
  beginner: [
    { load_percent: 0, reps: 10 },
    { load_percent: 50, reps: 8 },
  ],
  novice: [
    { load_percent: 0, reps: 10 },
    { load_percent: 50, reps: 6 },
    { load_percent: 75, reps: 3 },
  ],
  intermediate: [
    { load_percent: 0, reps: 10 },
    { load_percent: 50, reps: 5 },
    { load_percent: 70, reps: 3 },
    { load_percent: 85, reps: 2 },
  ],
  // Heavier working loads mean more ramp steps — jumping from 85% to a top set
  // is a much bigger ask at advanced loads than at novice loads.
  advanced: [
    { load_percent: 0, reps: 10 },
    { load_percent: 50, reps: 5 },
    { load_percent: 70, reps: 3 },
    { load_percent: 85, reps: 2 },
    { load_percent: 92, reps: 1 },
  ],
}

const SECONDS_PER_RAMP_SET = 50

// A later heavy compound in the same session isn't starting cold — the
// lifter's already raised core temperature and moved load on the first one.
// A shorter build-up (no empty-bar rehearsal set) is standard practice for a
// second main lift; a full 5-step cold-start scheme for every heavy compound
// in a session would eat an unreasonable amount of session time for no real
// safety benefit past the first one.
const ABBREVIATED_RAMP_SCHEME: { load_percent: number; reps: number }[] = [
  { load_percent: 50, reps: 5 },
  { load_percent: 70, reps: 3 },
  { load_percent: 85, reps: 2 },
]

/**
 * HOW HEAVY A PREP MOVE IS, when it needs an implement at all.
 *
 * Ashley ruled on 17 Sep that a prep move needing a bell shows a starting
 * weight, kept light. This is the "kept light" half, and it was left open that
 * day with the residue named: the app was printing the movement's own WORKING
 * weight under the word "Light", which is fine for a swing and wrong for
 * anything heavy.
 *
 * Decided 18 Sep 2026 under Ashley's standing delegation of training questions
 * rather than asked: a specific warm-up set is submaximal by definition, and
 * the conventional first rung of a build-up is about half the working load.
 *
 * DERIVED, NOT WRITTEN DOWN AGAIN. The app already commits to that number in
 * the tables right above this one — every RAMP_SCHEME's first loaded rung is
 * 50%, and the abbreviated scheme agrees. Reading the lowest non-zero rung off
 * those tables means changing the ladder moves the prep weight with it, and
 * means no constant here can silently disagree with the build-up printed on
 * the very same card. Inventing a fraction instead is the thing
 * load-prescription.ts's own header forbids.
 */
export const PREP_LOAD_PERCENT: number = Math.min(
  ...Object.values(RAMP_SCHEMES).flat().map(step => step.load_percent).filter(pct => pct > 0),
  ...ABBREVIATED_RAMP_SCHEME.map(step => step.load_percent).filter(pct => pct > 0),
)

/**
 * The prep weight itself: the ladder's first rung of the working load, put
 * through the same plate rounding every other prescription goes through.
 *
 * NO FLOOR IS APPLIED HERE, deliberately, and this is worth a sentence because
 * the obvious reading is that one is missing. Half of a light bell can land
 * below the lightest implement that exists — but `roundToPlate` already floors
 * on every one of its five modes (`Math.max(floor, ...)` for dumbbell,
 * single_implement and stack; "below bar weight, prescribe the bar" for
 * barbell and ez_bar), against the very same LOADING_FLOOR_KG table
 * `getEquipmentFloorKg` reads. A second Math.max here was written first and
 * was UNKILLABLE BY MUTATION — removing it changed no value, which is how it
 * was found. The property is still asserted by the gate, one layer down on
 * roundToPlate, where it actually lives.
 */
export function prepLoadKg(entry: ExerciseEntry, workingKg: number | null | undefined): number | null {
  if (workingKg == null || !(workingKg > 0)) return null
  return roundToPlate(workingKg * (PREP_LOAD_PERCENT / 100), loadingMode(entry))
}

/**
 * THE ONE PLACE THAT DECIDES WHAT LOAD FIELDS AN EXERCISE CARRIES.
 *
 * Four call sites — three in generation, one in the swap path — each held
 * their own copy of a four-way ternary over the same two questions. That is
 * precisely the shape that produced the personal-best defect the day before
 * ("three call sites each re-derived the value with their own ternary and two
 * got the same case wrong"), and it is also how the original 64-of-64 primer
 * bug survived: the rule was written three times and each copy discarded the
 * weight independently.
 *
 * Returning the whole set from one function makes the weight and the words
 * printed beside it impossible to disagree about.
 */
export interface ResolvedLoadFields {
  suggested_load: string
  suggested_load_kg: number | null
  load_source: PrescribedLoadSource | undefined
  per_set_load: LoadPrescription['per_set'] | null
}

export function resolveLoadFields(
  entry: ExerciseEntry,
  isPrimer: boolean,
  load: LoadPrescription,
): ResolvedLoadFields {
  if (!isPrimer) {
    return {
      suggested_load: load.display,
      suggested_load_kg: load.starting_weight_kg,
      load_source: load.load_source,
      per_set_load: load.per_set,
    }
  }
  if (!primerCarriesWeight(entry)) {
    return { suggested_load: 'Light', suggested_load_kg: null, load_source: undefined, per_set_load: null }
  }
  const kg = prepLoadKg(entry, load.starting_weight_kg)
  if (kg == null) {
    return { suggested_load: 'Light', suggested_load_kg: null, load_source: undefined, per_set_load: null }
  }
  return {
    suggested_load: formatLoad(kg, labelModeForEntry(entry)),
    suggested_load_kg: kg,
    load_source: load.load_source,
    // A prep move does not ramp within itself — it IS the ramp. One light
    // weight for every set, so the per-set strip has nothing to say.
    per_set_load: null,
  }
}


// A tier2_compound (secondary/accessory compound work — Dumbbell Rows,
// Arnold Press, single-leg dumbbell work) doesn't automatically need a ramp
// the way a tier1 main lift does, but a HEAVY one does — a 90kg Hack Squat
// or 80kg Dumbbell Row is not meaningfully different from a main lift's
// working weight and deserves the same lead-in. Kept separate from
// mechanics_tier so a genuinely light tier2 accessory isn't force-ramped.
const RAMP_TIER2_THRESHOLD_KG = 60

/**
 * Ramp-up sets only make sense on externally loaded movements. You cannot do a
 * 50% push-up, and ramping an isolation exercise is not standard practice.
 * `suggestedLoadKg` gates tier2_compound specifically — see
 * RAMP_TIER2_THRESHOLD_KG's doc comment; tier1_compound always qualifies
 * regardless of load, since ANY main lift benefits from a progressive lead-in.
 */
function needsRampUp(entry: ExerciseEntry, suggestedLoadKg: number | null): boolean {
  if (!isExternallyLoaded(entry)) return false
  if (entry.mechanics_tier === 'tier1_compound') return true
  if (entry.mechanics_tier === 'tier2_compound') return (suggestedLoadKg ?? 0) > RAMP_TIER2_THRESHOLD_KG
  return false
}

function buildRampSetsFor(
  entry: ExerciseEntry,
  scheme: { load_percent: number; reps: number }[],
  abbreviated: boolean,
  loadSource: PrescribedLoadSource | undefined,
): RampBlock {
  const sets: RampSet[] = scheme.map((s, i) => ({
    set_number: i + 1,
    load_percent: s.load_percent,
    reps: s.reps,
    note:
      s.load_percent === 0
        ? 'Empty bar or lightest option — focus on the movement, not the weight'
        : `${s.load_percent}% of today's working weight`,
  }))

  return { exercise: entry.name, sets, abbreviated, loadSource }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface WarmupContext {
  patterns: MovementPattern[]
  /**
   * Every compound exercise in today's session, in session order, alongside
   * its prescribed working weight — needsRampUp decides which actually
   * qualify (every tier1_compound; a tier2_compound only past
   * RAMP_TIER2_THRESHOLD_KG). Replaces a single `mainLift` (C0 calibration
   * round, Fix 2): a day with two main lifts used to ramp only whichever
   * came first, sending the second in cold.
   */
  compounds: { entry: ExerciseEntry; suggestedLoadKg: number | null; loadSource?: PrescribedLoadSource }[]
  equipment: EquipmentAccess
  injuries: string[]
  experience: TrainingExperience
  /** Hard ceiling. Warm-up must fit inside the session, not extend it. */
  budgetSeconds: number
}

export function buildWarmup(ctx: WarmupContext): WarmupBlock {
  const baseGeneral = GENERAL_WARMUPS[ctx.equipment] ?? GENERAL_WARMUPS.bodyweight

  // Every qualifying compound gets a ramp — the first, full scheme; every
  // later one, abbreviated. Built before general/mobility sizing because
  // ramps are the one part of a warm-up that must NEVER be dropped for
  // budget: if a multi-main-lift day's ramps don't fit, general/mobility are
  // what shrink (see below), not the ramp coverage itself.
  const rampTargets = ctx.compounds.filter(c => needsRampUp(c.entry, c.suggestedLoadKg))
  const rampUps: RampBlock[] = rampTargets.map((c, i) =>
    buildRampSetsFor(c.entry, i === 0 ? RAMP_SCHEMES[ctx.experience] : ABBREVIATED_RAMP_SCHEME, i !== 0, c.loadSource)
  )
  const rampSeconds = rampUps.reduce((n, r) => n + r.sets.length * SECONDS_PER_RAMP_SET, 0)

  // On a short session, or whenever the ramps alone leave little/no room for
  // general temperature-raising work, general is what gets compressed first
  // — not the joint-specific mobility prep, and never a ramp. Five minutes on
  // a bike is disproportionate when the whole session is 35 minutes; it's
  // even more clearly the thing to cut when two heavy compounds already need
  // 8 ramp sets between them.
  const generalWouldOverrun = baseGeneral.duration_seconds + rampSeconds > ctx.budgetSeconds
  const general: WarmupItem[] = (ctx.budgetSeconds < 480 || generalWouldOverrun)
    ? [{
        ...baseGeneral,
        prescription: baseGeneral.prescription.replace(/^\d+(-\d+)?\s*min/, '3 min'),
        duration_seconds: Math.min(baseGeneral.duration_seconds, 180),
      }]
    : [baseGeneral]

  // Which joints is this session actually going to load?
  const targetJoints = new Set<string>()
  for (const p of ctx.patterns) {
    for (const j of PATTERN_JOINTS[p] ?? []) targetJoints.add(j)
  }

  const haveEquipment = new Set(EQUIPMENT_AVAILABLE[ctx.equipment] ?? [])

  const candidates = MOBILITY_DRILLS.filter(d =>
    d.prepares_joints.some(j => targetJoints.has(j)) &&
    !d.contraindicated_for.some(c => ctx.injuries.includes(c)) &&
    d.needs_equipment.every(e => haveEquipment.has(e))
  )

  // Prefer drills covering the most target joints, so a short warm-up still
  // touches everything the session will load.
  const ranked = [...candidates].sort((a, b) => {
    const score = (d: MobilityDrill) => d.prepares_joints.filter(j => targetJoints.has(j)).length
    return score(b) - score(a)
  })

  let spent = general.reduce((n, g) => n + g.duration_seconds, 0) + rampSeconds
  const mobility: WarmupItem[] = []
  const coveredJoints = new Set<string>()

  // Mobility is not normally the discretionary part of a warm-up — two
  // highest-value drills are usually guaranteed regardless of budget, same
  // as before multi-lift ramps existed. But when the ramps alone have
  // already consumed the whole reserve (a real possibility now that a
  // squat+deadlift day can need 8 ramp sets), mobility is what yields —
  // ramps are never cut to make room for it.
  const GUARANTEED_DRILLS = spent >= ctx.budgetSeconds ? 0 : 2

  for (const drill of ranked) {
    const guaranteed = mobility.length < GUARANTEED_DRILLS
    if (!guaranteed && spent + drill.duration_seconds > ctx.budgetSeconds) continue

    // Skip a drill whose target joints are already covered, unless we have
    // barely any mobility work yet.
    const adds = drill.prepares_joints.some(j => targetJoints.has(j) && !coveredJoints.has(j))
    if (!adds && mobility.length >= GUARANTEED_DRILLS) continue

    mobility.push({
      name: drill.name,
      prescription: drill.prescription,
      purpose: drill.purpose,
      duration_seconds: drill.duration_seconds,
    })
    for (const j of drill.prepares_joints) coveredJoints.add(j)
    spent += drill.duration_seconds
    if (mobility.length >= 4) break
  }

  const uncovered = [...targetJoints].filter(j => !coveredJoints.has(j))
  const coachNote = rampUps.length > 0
    ? `Ramp up on ${rampUps.map(r => r.exercise).join(', then ')} before your working sets — these do not count toward your working volume.`
    : 'No loaded ramp-up needed today. Move through the mobility work deliberately rather than rushing it.'

  return {
    general,
    mobility,
    ramp_ups: rampUps,
    total_seconds: spent,
    coach_note:
      uncovered.length > 0 && ctx.injuries.length > 0
        ? `${coachNote} Some prep was skipped to work around your injury flags — ease into the first working set.`
        : coachNote,
  }
}

/**
 * How much of the session budget to hold back for warming up, before any
 * exercises are allocated. Reserving up front is what keeps the total session
 * inside the time the user said they have — bolting a warm-up on afterwards
 * would silently overrun it.
 */
export function getWarmupReserveSeconds(budgetSeconds: number): number {
  // Roughly 15% of the session, floored at 5 minutes and capped at 12 — a
  // 30-minute session cannot afford a 12-minute warm-up, and a 100-minute
  // session does not need proportionally more.
  return Math.max(390, Math.min(840, Math.round(budgetSeconds * 0.20)))
}

// ---------------------------------------------------------------------------
// RE-DERIVING A DAY'S WARM-UP FROM THE DAY IT ACTUALLY IS
//
// Lives here, next to buildWarmup, rather than in the edit tail, because both
// generation and every edit path need it and neither can import the other.
//
// MEASURED 13 Sep 2026, and this is why generation calls it too: across 64
// generated plans and 4,096 training days, **7.0% of days shipped a warm-up
// that ramps an exercise the session no longer contains**. The warm-up is
// built once, and the weekly accessory rotation swaps exercises afterwards
// with nothing re-deriving it — so a Tuesday whose Deadlifts had rotated to a
// Trap Bar Deadlift still told the trainee to ramp up on Deadlifts. Nothing
// caught it because no check ever compared the warm-up against the exercise
// list it was supposed to describe.
// ---------------------------------------------------------------------------

/** The day's warm-up, re-derived from the exercises it now actually contains. */
export function rebuildWarmup(day: WorkoutDay, profile: UserProfile): WorkoutDay {
  const entries = day.exercises
    .map(ex => ({ ex, entry: getExerciseEntry(ex.name) }))
    .filter((p): p is { ex: typeof day.exercises[number]; entry: NonNullable<ReturnType<typeof getExerciseEntry>> } => !!p.entry)
  // An unresolvable exercise list means the warm-up would be derived from
  // less than the session really holds. Leaving the old one is the honest
  // failure: it is stale, but it was built from a real session.
  if (entries.length === 0 || entries.length !== day.exercises.length) return day

  const budgetSeconds = getDurationBudgetSeconds(profile.session_duration_preference)
  try {
    const warmup = buildWarmup({
      patterns: entries.map(p => p.entry.movement_pattern),
      compounds: entries.map(p => ({
        entry: p.entry,
        suggestedLoadKg: p.ex.suggested_load_kg ?? null,
        loadSource: p.ex.load_source,
      })),
      equipment: profile.equipment_access || 'full_gym',
      injuries: profile.injuries || [],
      experience: profile.training_experience || 'novice',
      budgetSeconds: getWarmupReserveSeconds(budgetSeconds),
    })
    const rampByName = new Map(warmup.ramp_ups.map(r => [r.exercise, r]))
    return {
      ...day,
      warmup,
      exercises: day.exercises.map(ex =>
        rampByName.has(ex.name) ? { ...ex, ramp_up: rampByName.get(ex.name) } : { ...ex, ramp_up: undefined },
      ),
    }
  } catch (err) {
    console.error('[settle-week] warm-up rebuild failed; keeping the previous one', err)
    return day
  }
}



// ---------------------------------------------------------------------------
// DRILLS FOR A JOINT SOMEBODY SAID IS TIGHT.
//
// Separate from buildWarmup on purpose. What the plan holds is the warm-up the
// SESSION needs, scored and budgeted with the rest of the week; "my hips feel
// tight this morning" is a fact about today and nothing else. Making it an
// addition computed at render time means it cannot leak into tomorrow, cannot
// touch the stored plan, and disappears the moment she clears it.
//
// KIT-FREE ONLY. A drill offered for tightness must never be the one she
// hasn't got the band for — an answer that produces nothing is worse than not
// asking.
// ---------------------------------------------------------------------------
export function drillsPreparing(joints: string[], injuries: string[] = []): WarmupItem[] {
  const want = new Set(joints)
  if (want.size === 0) return []
  // BOTH LISTS — the catalogue the plan uses, plus the two that exist only for
  // this question. See TIGHTNESS_ONLY_DRILLS for why the second list exists.
  return [...MOBILITY_DRILLS, ...TIGHTNESS_ONLY_DRILLS]
    .filter(d => d.needs_equipment.length === 0)
    // AN INJURY STILL VETOES A DRILL. Tight and hurt are different answers to
    // different questions, and the hurt one is triaged elsewhere — but if the
    // profile already carries an injury there, the drill is off regardless of
    // which question put it on screen.
    .filter(d => !d.contraindicated_for.some(c => injuries.includes(c)))
    .filter(d => d.prepares_joints.some(j => want.has(j)))
    .sort((a, b) =>
      b.prepares_joints.filter(j => want.has(j)).length -
      a.prepares_joints.filter(j => want.has(j)).length)
    .map(d => ({ name: d.name, prescription: d.prescription, purpose: d.purpose, duration_seconds: d.duration_seconds }))
}
