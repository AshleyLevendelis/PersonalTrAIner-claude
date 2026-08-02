import type { TrainingExperience, UserProfile } from './types'
import type { ExerciseEntry } from './exercise-db'

// ---------------------------------------------------------------------------
// LOAD PRESCRIPTION
// ---------------------------------------------------------------------------
// An RPE target tells someone how hard a set should feel. It does not tell a
// beginner what to put on the bar, and "just pick something and adjust" is the
// single most common reason people bounce off a program in week one.
//
// This module produces a STARTING ESTIMATE, deliberately conservative. It is
// not a 1RM calculator and must never be presented as one — we have no lifting
// history for a new user, only bodyweight, sex, age and self-reported
// experience. The honest framing is "start here and let the RPE target correct
// you", and every output carries that framing with it.
//
// Once real set logs exist, history should override this entirely.
//
// REBUILD NOTE (capability-model round): the previous version anchored every
// estimate to a flat "% of bodyweight at ~RPE 8" multiplier, then passed it
// through THREE separate compensating clamps (a first-block 0.6x ceiling, a
// calibration-week 0.45x ceiling, and an absolute CATEGORY_CAPS_KG cap) to
// paper over how far off that flat multiplier could land. Stacked together,
// those clamps are what produced "2kg curls" and "4kg shrugs" for real
// working sets — not a rounding error, the compounding of three separate
// safety nets that were each reasonable alone. This version replaces the
// source (a real bodyweight-relative strength-standards table, by sex and
// experience, converted to a working weight via an actual RPE/reps -> %1RM
// relationship) so the clamps are no longer needed to keep numbers sane, and
// deletes them.

export interface PerSetLoad {
  set_number: number
  load_kg: number
  display: string
}

export interface LoadPrescription {
  /** null when the movement is not externally loaded (push-ups, planks). */
  starting_weight_kg: number | null
  display: string
  basis: string
  confidence: 'estimated' | 'from_history'
  /**
   * Per-set breakdown for externally-loaded work — null under the same
   * conditions as starting_weight_kg (bodyweight movement, uncategorizable
   * exercise). The last entry always equals starting_weight_kg.
   */
  per_set: PerSetLoad[] | null
}

/**
 * Working weights the trainee reported during onboarding for the three big
 * barbell lifts. Keyed by movement family, not exact exercise — a Goblet
 * Squat anchors off known_squat_kg the same as a Barbell Squat does, because
 * the point is "here is roughly what this trainee can move in this pattern,"
 * not an exact-exercise lookup.
 */
export interface KnownWorkingWeights {
  squat?: number
  bench?: number
  deadlift?: number
}

export interface LoadPrescriptionOptions {
  /**
   * The RPE/effort label this exercise is actually prescribed at for this
   * specific week, e.g. 'RPE 5-6' or 'RPE 8-9'. Fed into percentOf1RM below
   * along with the actual rep range — a phase asking for RPE 5-6 at 13-17
   * reps and a phase asking for RPE 8-9 at 6-8 reps need very different
   * fractions of the lifter's estimated 1RM, not just "RPE went down so
   * knock a flat percentage off."
   */
  targetRpeLabel?: string
  /**
   * Whether this is the trainee's first block on this program — i.e. we have
   * never seen them lift. No longer clamps the estimate (see REBUILD NOTE
   * above) — kept for API compatibility and because a future safety feature
   * may want it — but the accuracy of the estimate now comes from the
   * standards model itself, not from capping unverified numbers.
   */
  isFirstBlock?: boolean
  /** Number of working sets prescribed, used to build the per-set breakdown. Defaults to 1. */
  sets?: number
  /**
   * The current periodization phase (e.g. 'strength', 'power', 'hypertrophy').
   * Only compounds in a 'strength' or 'power' phase ramp progressively across
   * sets; everything else — other phases, or any accessory/isolation work —
   * gets a flat, straight-set weight. Omit outside the mesocycle (the base,
   * un-periodized plan has no phase and always uses straight sets).
   */
  phase?: string
  /**
   * True for week 1 of a trainee's first block when they told onboarding
   * they don't know their numbers. Applies a mild 0.85x conservatism
   * multiplier on top of the standards-derived estimate — the point is to
   * start a shade under an unverified number, not to override the RPE/reps
   * math with an artificial ceiling the way the old hard clamp did. Skipped
   * for a known working weight, which isn't an unverified guess this exists
   * to protect against.
   */
  isCalibrationWeek?: boolean
  /**
   * Verified working weights from onboarding ("I know my numbers"). When the
   * exercise's movement family has an entry here, it replaces the
   * standards-table estimate as the anchor — real, self-reported data, not
   * a population guess for a stranger. Treated as an approximate 10-rep,
   * RPE-8 working weight and scaled to whatever this week's actual reps/RPE
   * are via the same percentOf1RM relationship used everywhere else.
   */
  knownWorkingWeights?: KnownWorkingWeights
  /**
   * Skips the estimate entirely and uses this number as the top-set weight
   * (still plate-rounded, still run through the per-set ramp builder). Used
   * by the within-block double-progression ramp in generateMesocycle() —
   * week 2/3 are "week 1's baseline + N increments," not a fresh estimate —
   * and by the live logged-history override once real set data exists.
   * `targetRpeLabel` should still be passed alongside this for phase/RPE
   * display purposes even though it no longer affects the number.
   */
  forceStartingWeightKg?: number
  /**
   * The prescribed rep range for this exercise this week, e.g. '8-12'. Now
   * does double duty: it's the actual input to percentOf1RM (not just cosmetic
   * text for the progression-basis message), so an inaccurate or missing
   * value directly affects the load, not just the wording.
   */
  repRangeLabel?: string
  /**
   * Whether THIS exercise's weight is actually the thing climbing week to
   * week within the block, independent of `forceStartingWeightKg` being
   * set. generateMesocycle always forces a number for weeks 2-3 (baseline,
   * possibly plus increments) — but for 'reps'/'maintain' goal policies (and
   * any bodyweight movement) that forced number is the SAME baseline every
   * week; reps are the real lever. Without this, `basis` told every trainee
   * "hit your reps, add load next time" even on exercises the engine will
   * never add load to. Defaults true (the pre-existing behavior) for any
   * caller that doesn't pass it.
   */
  loadIsProgressing?: boolean
}

// ---------------------------------------------------------------------------
// Strength standards — 1RM as a multiple of bodyweight
// ---------------------------------------------------------------------------
// Approximate population strength standards in the shape published strength-
// standards sites (strengthlevel.com, symmetricstrength.com) use — an
// Untrained/Novice/Intermediate/Advanced ladder of 1RM-to-bodyweight ratios,
// collapsed onto this app's four experience tiers, split by sex. These are
// population averages for a genuine 1-rep max, not a working weight — the
// working weight for an actual prescribed set is derived from these via
// percentOf1RM() below, using the exercise's real rep range and RPE target.
//
// Values are directional approximations of commonly-cited standards, not a
// scrape of any single source: squat/deadlift/bench are the three most
// consistently published lifts and anchor the shape of the table; overhead
// press and row are sized relative to bench using their typical published
// ratios (OHP ~60-65% of bench, row ~100-110% of bench at every tier).

type LiftFamily = 'squat' | 'bench' | 'deadlift' | 'overhead' | 'row'

const STRENGTH_STANDARDS_1RM_PER_BW: Record<LiftFamily, Record<'male' | 'female', Record<TrainingExperience, number>>> = {
  squat: {
    male: { beginner: 0.75, novice: 1.25, intermediate: 1.5, advanced: 2.0 },
    female: { beginner: 0.5, novice: 0.75, intermediate: 1.0, advanced: 1.5 },
  },
  bench: {
    male: { beginner: 0.5, novice: 0.75, intermediate: 1.0, advanced: 1.5 },
    female: { beginner: 0.27, novice: 0.45, intermediate: 0.6, advanced: 0.85 },
  },
  deadlift: {
    male: { beginner: 1.0, novice: 1.5, intermediate: 2.0, advanced: 2.5 },
    female: { beginner: 0.65, novice: 1.0, intermediate: 1.35, advanced: 1.75 },
  },
  overhead: {
    male: { beginner: 0.35, novice: 0.5, intermediate: 0.65, advanced: 0.9 },
    female: { beginner: 0.2, novice: 0.3, intermediate: 0.4, advanced: 0.55 },
  },
  row: {
    male: { beginner: 0.5, novice: 0.75, intermediate: 1.0, advanced: 1.25 },
    female: { beginner: 0.3, novice: 0.45, intermediate: 0.6, advanced: 0.8 },
  },
}

/**
 * "Derived family" compounds — real working lifts, but not one of the five
 * standards lifts above. Each is a fixed scale of a parent lift's 1RM: a
 * goblet squat (single dumbbell/kettlebell at the chest) is nowhere near a
 * barbell back squat's load; a leg press moves far MORE than a back squat
 * (seated, partial ROM, no stabilizer demand); a lat pulldown tracks a row;
 * an RDL/good-morning/heavy kettlebell swing sits under a full deadlift.
 */
const DERIVED_COMPOUND_SCALE: Record<string, { parent: LiftFamily; scale: number }> = {
  pulldown: { parent: 'row', scale: 1.0 },
  leg_press: { parent: 'squat', scale: 2.2 },
  goblet_squat: { parent: 'squat', scale: 0.35 },
  hinge_accessory: { parent: 'deadlift', scale: 0.55 },
  // Two-dumbbell unilateral leg work (walking lunge, step-up, split squat,
  // Bulgarian split squat) was falling through to the generic 'squat'
  // category via movement_pattern 'single_leg' — anchoring a per-hand
  // dumbbell number to the SAME 1RM a barbell back squat uses, then only
  // halving it for "per hand". An advanced lifter with a 180kg squat got
  // ~55kg per hand for 15-rep walking lunges (a review-flagged "88kg of
  // dumbbells for a 30-rep unilateral set... grip and mid-back fail long
  // before the legs"). These lifts are stability- and grip-limited, not
  // leg-strength-limited the way a bilateral back squat is — a real working
  // pair tops out well under half of squat 1RM, total.
  single_leg_dumbbell: { parent: 'squat', scale: 0.4 },
}

/**
 * Isolation/accessory loads are NOT bodyweight-relative on their own — a
 * coach sizes a curl as "start around a quarter of your bench," not as a
 * fraction of bodyweight. Each entry is a fixed fraction of a related
 * compound's 1RM — but unlike the compound categories, that fraction is
 * calibrated to represent a REFERENCE WORKING WEIGHT (an achievable ~10-rep,
 * RPE-8 set), not a theoretical 1RM. Isolation movements are technique- and
 * joint-position-limited, not truly limited by a testable 1-rep max the way
 * a squat is — treating the fraction as a 1RM and then ALSO discounting it
 * through percentOf1RM (which itself already encodes an ~77% discount at
 * the 10-rep/RPE-8 reference point) double-discounts the number. That
 * double-discount is exactly what produced "2kg curls" and "2kg lateral
 * raises" even after raising these fractions once — the fraction was
 * correct for a 1RM interpretation, but was being treated as one and THEN
 * cut again. See resolveIsolationReferenceKg below for how this is applied.
 */
const ISOLATION_FRACTION_OF_COMPOUND: Record<string, { parent: LiftFamily; fraction: number }> = {
  isolation_bicep: { parent: 'bench', fraction: 0.28 }, // curls: a solid 10-rep working set is roughly a quarter of a bench working weight
  isolation_tricep: { parent: 'bench', fraction: 0.32 }, // pushdowns/extensions — triceps are the smaller presser muscle but the movement is more mechanically efficient than a curl
  isolation_chest: { parent: 'bench', fraction: 0.38 }, // flyes/pec deck — a real working weight, not a curl-sized number
  isolation_shoulder: { parent: 'bench', fraction: 0.19 }, // lateral raises, per hand — small lever arm, genuinely light relative to pressing strength, but not a 2kg toy
  shrug: { parent: 'deadlift', fraction: 0.42 }, // shrugs, per hand (DB) or total (barbell) — traps are strong but this is a short-ROM isolation move, not a hinge
  isolation_quad: { parent: 'squat', fraction: 0.4 }, // leg extension — single-joint but quads are a large muscle group
  isolation_hamstring: { parent: 'deadlift', fraction: 0.3 }, // leg curl
  isolation_calf: { parent: 'squat', fraction: 0.65 }, // calves are strong relative to most isolation work
  carry: { parent: 'deadlift', fraction: 0.35 }, // farmer's/suitcase carry per hand — grip/bracing limited, not a true hinge 1RM
  // An overhead carry is a loaded static hold overhead — pressing-capacity
  // limited, not grip/hinge limited like a farmer's or suitcase carry. It
  // was falling into the generic 'carry' bucket above (name match on
  // "carry"), anchoring it to DEADLIFT — a review caught a "36kg overhead
  // carry" prescribed to a client whose Arnold Press was 10kg per hand:
  // "if you can't press 10kg overhead for reps, you cannot hold 36kg
  // overhead and walk." A held overhead load can exceed a strict-press
  // working weight somewhat (no concentric rep to complete), but it must
  // still track pressing strength, not hinge strength.
  overhead_carry: { parent: 'overhead', fraction: 0.85 },
}

/**
 * Extracts a numeric effort value from an RPE label like 'RPE 6-7' or a bare
 * 'RPE 7'. Falls back to a conservative mid-range guess if unparseable —
 * defaulting light is the safe failure mode here, not defaulting heavy.
 */
function parseRpeMidpoint(label: string | undefined): number {
  if (!label) return 6
  const range = label.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/)
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2
  const single = label.match(/(\d+(?:\.\d+)?)/)
  if (single) return parseFloat(single[1])
  return 6
}

/** Midpoint of a rep range like '9-13' or a bare '9' — null when it isn't a rep count (time/distance prescriptions). */
function parseRepsMidpoint(label: string | undefined): number | null {
  if (!label) return null
  const range = label.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2
  const single = label.match(/^(\d+)$/)
  if (single) return parseInt(single[1], 10)
  return null
}

/**
 * %1RM for a given rep count performed at a given RPE, using the standard
 * reps-in-reserve model: RPE R with N reps performed is equivalent in
 * intensity to a set of N + (10 - R) reps taken to true failure. Converted
 * to %1RM via an Epley-derived reps-to-%1RM relationship
 * (%1RM = 100 / (1 + (repsToFailure - 1) / 30)), which is the same family of
 * formula most RPE charts (Tuchscherer-style) are built from.
 *
 * This REPLACES the old rpeEffortFraction, which only looked at RPE and
 * applied a flat 12%-per-point discount off an assumed "reference RPE 8"
 * working weight — it had no way to tell a 5-rep RPE-8 set from a 20-rep
 * RPE-8 set, which is exactly how a high-rep anatomical-adaptation phase and
 * a low-rep strength phase ended up prescribed the same load for the same
 * RPE label.
 */
function percentOf1RM(reps: number, rpe: number): number {
  const repsToFailure = Math.max(1, reps + (10 - rpe))
  return 100 / (1 + (repsToFailure - 1) / 30)
}

// The reference point a self-reported "known working weight" is assumed to
// represent — a working set the trainee can currently do for real, not a
// tested 1RM. Used only to scale a known weight to whatever THIS week's
// actual reps/RPE are, relative to that baseline.
const KNOWN_WEIGHT_REFERENCE_REPS = 10
const KNOWN_WEIGHT_REFERENCE_RPE = 8

/** Maps an exercise onto a standards category. */
export function categorize(entry: ExerciseEntry): string | null {
  const n = entry.name.toLowerCase()

  // Isolation work is checked FIRST, before any pattern matching. A Cable Fly
  // and a Pec Deck share the `horizontal_push` pattern with the bench press,
  // and falling through to the bench standard would prescribe them the same
  // load as an actual bench press — a load that would put a shoulder at
  // real risk. Mechanics tier is the reliable signal here, not pattern.
  if (entry.mechanics_tier === 'tier3_isolation' || n.includes('fly') || n.includes('pec deck')) {
    // Shrugs and lateral raises share movement_pattern 'isolation_shoulder'
    // in the exercise DB but need very different anchors (shrugs track
    // deadlift; lateral raises track bench) — name is the only signal that
    // distinguishes them.
    if (n.includes('shrug')) return 'shrug'
    switch (entry.movement_pattern) {
      case 'isolation_bicep': return 'isolation_bicep'
      case 'isolation_tricep': return 'isolation_tricep'
      case 'isolation_shoulder': return 'isolation_shoulder'
      case 'isolation_quad': return 'isolation_quad'
      case 'isolation_hamstring': return 'isolation_hamstring'
      case 'isolation_calf': return 'isolation_calf'
      default: return 'isolation_chest' // Cable Flyes / Pec Deck: horizontal_push pattern, chest isolation in practice
    }
  }

  // Checked before the generic 'squat' match below — a goblet squat is a
  // single dumbbell/kettlebell held at the chest, not a barbell back squat,
  // and must not inherit the much heavier 'squat' standard.
  if (n.includes('goblet')) return 'goblet_squat'
  if (n.includes('leg press') || n.includes('hack squat')) return 'leg_press'
  if (n.includes('deadlift')) return 'deadlift'
  if (n.includes('squat')) return 'squat'
  if (n.includes('good morning') || n.includes('romanian') || n.includes('swing')) return 'hinge_accessory'
  if (n.includes('overhead press') || n.includes('shoulder press') || n.includes('arnold')) return 'overhead'
  if (n.includes('bench') || n.includes('chest press') || n.includes('machine press')) return 'bench'
  if (n.includes('pulldown')) return 'pulldown'
  if (n.includes('row')) return 'row'
  // Checked before the generic carry match below — an overhead carry is
  // pressing-limited, not grip/hinge-limited (see overhead_carry's doc
  // comment above).
  if (n.includes('overhead') && n.includes('carry')) return 'overhead_carry'
  if (n.includes('carry') || n.includes('farmer')) return 'carry'
  // Two-dumbbell unilateral leg work — see single_leg_dumbbell's doc comment
  // above for why this can't share the bilateral 'squat' standard.
  if (n.includes('lunge') || n.includes('step-up') || n.includes('step up') || n.includes('split squat') || n.includes('bulgarian')) {
    return 'single_leg_dumbbell'
  }

  switch (entry.movement_pattern) {
    case 'horizontal_push':
    case 'vertical_push':
      return 'bench'
    case 'horizontal_pull':
    case 'vertical_pull':
      return 'row'
    case 'hip_hinge':
      return 'hinge_accessory'
    case 'knee_dominant':
      return 'squat'
    case 'single_leg':
      return 'single_leg_dumbbell'
    case 'carry':
      return 'carry'
    case 'isolation_bicep':
      return 'isolation_bicep'
    case 'isolation_tricep':
      return 'isolation_tricep'
    case 'isolation_shoulder':
      return 'isolation_shoulder'
    case 'isolation_quad':
      return 'isolation_quad'
    case 'isolation_hamstring':
      return 'isolation_hamstring'
    case 'isolation_calf':
      return 'isolation_calf'
    default:
      return null
  }
}

/**
 * Strength declines gradually past roughly 40. This is a gentle taper, not a
 * cliff — a well-trained 55-year-old will out-lift most 25-year-olds, and the
 * RPE target will correct the estimate either way.
 */
function ageAdjustment(age: number): number {
  if (age <= 40) return 1
  return Math.max(0.7, 1 - (age - 40) * 0.007)
}

export type LoadingMode = 'barbell' | 'ez_bar' | 'dumbbell' | 'single_implement' | 'stack'

/**
 * The exercise database distinguishes plural 'dumbbells' (two implements, one
 * per hand — bench press, rows, curls) from singular 'dumbbell' or
 * 'kettlebell' (ONE implement, held centrally or in one hand — goblet squats,
 * carries, swings). Treating both as the same "halve it and label it per
 * hand" case is what produced a goblet squat prescribed "~60kg per hand": a
 * single-implement lift got the two-implement halving and label anyway.
 */
export function loadingMode(entry: ExerciseEntry): LoadingMode {
  if (entry.equipment.includes('dumbbells')) return 'dumbbell'
  if (entry.equipment.includes('dumbbell') || entry.equipment.includes('kettlebell')) return 'single_implement'
  // An EZ bar is roughly 10kg, not 20kg. Flooring it at bar weight like an
  // Olympic bar prescribed 20kg skull crushers to every user regardless of
  // size — too heavy for a lighter or newer lifter on an elbow-sensitive lift.
  if (entry.equipment.some(e => e === 'EZ bar')) return 'ez_bar'
  if (entry.equipment.some(e => e === 'barbell' || e === 'trap bar' || e === 't-bar')) return 'barbell'
  return 'stack'
}

/**
 * The lowest weight a given loading mode can actually put in someone's
 * hands — an empty 20kg bar, a 10kg EZ bar, the lightest dumbbell pair a gym
 * stocks (2kg), a cable stack's bottom pin (5kg). `roundToPlate` enforces
 * this as a floor; anything (deload math, calibration-week clamps) that needs
 * to know "is this exercise already as light as it can go" reads the same
 * table rather than re-deriving it.
 */
const LOADING_FLOOR_KG: Record<LoadingMode, number> = {
  dumbbell: 2,
  single_implement: 2,
  barbell: 20,
  ez_bar: 10,
  stack: 5,
}

export function getEquipmentFloorKg(entry: ExerciseEntry): number {
  return LOADING_FLOOR_KG[loadingMode(entry)]
}

/** Round to something actually loadable rather than a number like 43.7kg. */
export function roundToPlate(kg: number, mode: LoadingMode): number {
  const floor = LOADING_FLOOR_KG[mode]
  switch (mode) {
    case 'dumbbell':
    case 'single_implement':
      // Dumbbells and kettlebells commonly step in 2kg increments at the light end.
      return Math.max(floor, Math.round(kg / 2) * 2)
    case 'barbell':
    case 'ez_bar':
      // Bar plus plate pairs. Below bar weight, prescribe the bar itself.
      return kg <= floor ? floor : Math.round(kg / 2.5) * 2.5
    case 'stack':
      // Cable and machine stacks have no bar to floor against — applying the
      // barbell's 20kg minimum here inflated light isolation work.
      return Math.max(floor, Math.round(kg / 2.5) * 2.5)
  }
}

// Target percentage step for one "notch" of overload. A flat per-mode kg
// increment (the previous design) is fine on a heavy main lift but is a
// disaster on a light accessory: +2kg on a 6kg dumbbell curl is a 33% jump,
// which an LLM coach review flagged outright as "not physiological... an
// algorithm applying a percentage, not a coach reading a logbook." Main
// compounds (the day's one tier1_compound flagship lift) step ~2.5-5%;
// everything else — secondary compounds and isolation alike — steps
// ~5-10%. Both bands use their midpoint rather than a range because the
// real granularity comes from snapping to the loading mode's actual plate/
// dumbbell/stack step below, not from this rate directly.
const MAIN_LIFT_STEP_RATE = 0.035
const ACCESSORY_STEP_RATE = 0.075

// The real step size a loading mode actually offers, in TOTAL kg moved per
// notch — not "per hand." A two-implement dumbbell pair changes both
// dumbbells together (2kg/hand = 4kg total), and physiological stress
// scales with total mass moved, not the per-hand number alone; sizing the
// percentage check off the per-hand figure would let a per-hand increment
// silently represent double the intended relative jump.
function realStepTotalKg(mode: LoadingMode, category: string | null): number {
  switch (mode) {
    case 'barbell':
    case 'ez_bar':
      return 2.5
    case 'dumbbell':
      return 4
    case 'single_implement':
      return 2
    case 'stack':
      return category === 'leg_press' ? 5 : 2.5
  }
}

/**
 * The double-progression increment for one "notch" of overload — how much
 * gets added once a trainee has earned it (hit the top of their rep range on
 * every set). `currentWeightKg` must be in the SAME units the caller tracks
 * as "the current weight" (the per-hand number for a two-implement dumbbell
 * pair, the total for everything else) — the return value is in those same
 * units, so callers can add it directly to their baseline.
 *
 * The raw percentage target is snapped to the loading mode's real step
 * granularity and floored at one real step (you can't add half a plate
 * pair). That snapped step can still be a large PERCENTAGE on a light
 * baseline — callers are expected to compare the returned increment against
 * the baseline themselves and, when it exceeds roughly 12%, hold load flat
 * and progress reps instead until the baseline has grown enough to afford a
 * real step (see the loadStepUnaffordable logic in generateMesocycle).
 *
 * Bodyweight movements have no numeric increment — see isExternallyLoaded()
 * callers, which progress those via reps instead and should never call this.
 */
export function getLoadIncrementKg(entry: ExerciseEntry, category: string | null, currentWeightKg: number): number {
  const mode = loadingMode(entry)
  const isDumbbellPair = mode === 'dumbbell'
  const totalCurrentKg = Math.max(0, isDumbbellPair ? currentWeightKg * 2 : currentWeightKg)
  const isMain = entry.mechanics_tier === 'tier1_compound'
  const rate = isMain ? MAIN_LIFT_STEP_RATE : ACCESSORY_STEP_RATE
  const rawStepTotalKg = totalCurrentKg * rate
  const stepGranularity = realStepTotalKg(mode, category)
  const snappedTotalKg = Math.max(stepGranularity, Math.round(rawStepTotalKg / stepGranularity) * stepGranularity)
  return isDumbbellPair ? snappedTotalKg / 2 : snappedTotalKg
}

// Equipment that carries a selectable external load in kilograms. Note the
// exclusions: an assisted pull-up machine REDUCES load rather than adding it,
// resistance bands have no meaningful kg value, and cardio machines are not
// loaded at all. Matching on a loose substring like 'machine' would wrongly
// sweep all of those in.
const LOADED_EQUIPMENT = new Set([
  'barbell', 'dumbbell', 'dumbbells', 'EZ bar', 'kettlebell', 'trap bar',
  't-bar', 'cable machine', 'machine', 'leg press machine',
  'hack squat machine', 'farmer handles', 'medicine ball', 'weighted backpack',
])

export function isExternallyLoaded(entry: ExerciseEntry): boolean {
  return entry.equipment.some(e => LOADED_EQUIPMENT.has(e))
}

// SAFETY: a backpack (or other improvised carry implement) is not a
// farmer's handle — there's no rigid frame, the load rides on straps and
// shifts with stride, and failure modes are strap tearing or the wearer
// losing control of a suddenly-shifting load, not just "too heavy to hold."
// A review caught a bodyweight-only NOVICE, in their very first calibration
// week, prescribed a 35-40kg Loaded Backpack Walk with "no assessment, no
// bodyweight-relative anchor, no note on how to build the load" — flagged
// as "the one line in the plan that could actually hurt someone." The
// carry-fraction-of-deadlift model that produces that number is otherwise
// correct for a real farmer's/suitcase carry (rigid handles, two hands or
// braced posture) — the fix here is a hard, absolute ceiling specific to
// IMPROVISED implements, applied after every other calculation, that
// nothing else in this file may exceed regardless of how the estimate was
// derived (standards table, known weight, or a forced within-block ramp
// value). These numbers are deliberately conservative absolutes, not
// bodyweight-relative — a heavier novice doesn't get a heavier backpack
// ceiling, because the strap/posture failure mode doesn't scale with the
// carrier's own strength the way a barbell lift does.
export const IMPROVISED_CARRY_CEILING_KG: Record<TrainingExperience, number> = {
  beginner: 8,
  novice: 12,
  intermediate: 20,
  advanced: 25,
}

/** A carry-type exercise loaded with an improvised implement (a weighted backpack, not a real farmer's handle/trap bar) — see IMPROVISED_CARRY_CEILING_KG's doc comment for why this needs its own hard ceiling. */
export function isImprovisedCarry(entry: ExerciseEntry): boolean {
  return entry.prescription_type === 'distance_load' && entry.equipment.includes('weighted backpack')
}

// A calibration week (no verified numbers yet) starts a shade under the
// standards-derived estimate rather than trusting it outright — the point is
// to find the real number quickly, not to hand over a confident-looking one.
// This is a MULTIPLIER on the estimate, not a ceiling clamp: the RPE/reps
// math still drives the number, this just nudges the whole thing down a bit
// for the one week where "unverified" matters most.
const CALIBRATION_WEEK_CONSERVATISM = 0.85

// Maps a standards category onto the onboarding "known working weight" field
// that anchors it. Only the categories a trainee would actually self-report
// against the big three lifts are included — leg press or hinge-accessory
// work still falls back to the standards-table estimate, since a squat
// number is not a reliable stand-in for those.
const KNOWN_WEIGHT_FAMILY: Partial<Record<string, keyof KnownWorkingWeights>> = {
  squat: 'squat',
  goblet_squat: 'squat',
  bench: 'bench',
  deadlift: 'deadlift',
}

// ---------------------------------------------------------------------------
// Per-set load breakdown
// ---------------------------------------------------------------------------
// Same idea as the warm-up ramp-up in warmup.ts (RAMP_SCHEMES / buildRampSets)
// — a percentage-of-target ladder rather than one flat number — but applied to
// the WORKING sets themselves rather than the lead-in to them. A strength or
// power top set is only meaningful relative to lighter build-up sets; jumping
// straight to it cold is a different (worse) prescription than the same
// number arrived at progressively.

// Ascending percent-of-top-set ladder, keyed by set count. The last entry is
// always 100 — the top set is exactly the RPE/reps-adjusted estimate computed
// above, never higher.
const RAMP_PERCENT_TABLE: Record<number, number[]> = {
  1: [100],
  2: [90, 100],
  3: [85, 92, 100],
  4: [80, 88, 94, 100],
  5: [75, 85, 92, 96, 100],
}

function getSetPercents(sets: number, ramping: boolean): number[] {
  const count = Math.max(1, sets)
  if (!ramping || count === 1) return Array(count).fill(100)
  const table = RAMP_PERCENT_TABLE[count]
  if (table) return table
  // Beyond the table: linear ramp from 75% up to the top set.
  return Array.from({ length: count }, (_, i) => Math.round(75 + (25 * i) / (count - 1)))
}

/**
 * How a load number should be labeled. 'per_hand' is for genuine
 * two-implement pairs (Dumbbell Bench Press — both dumbbells move together,
 * each hand holds the SAME number). 'single_side' is for a single implement
 * carried/pressed unilaterally (Suitcase Carry, Overhead Carry — ONE
 * kettlebell, ONE side working at a time) — a review caught "Suitcase Carry
 * ~24kg per hand" and correctly called it "a contradiction in terms — a
 * suitcase carry is one-sided by definition." Driven off implement count
 * (loadingMode) and entry.unilateral, not a per-exercise name list, so any
 * future single-implement unilateral movement gets the right label for
 * free. 'total' is everything else (barbells, bilateral single-implement
 * work like goblet squats, stacks).
 */
export type LoadLabelMode = 'per_hand' | 'single_side' | 'total'

export function loadLabelMode(isDumbbell: boolean, isUnilateralSingleImplement: boolean): LoadLabelMode {
  if (isDumbbell) return 'per_hand'
  if (isUnilateralSingleImplement) return 'single_side'
  return 'total'
}

/** Any exercise's `entry.unilateral && loadingMode(entry) === 'single_implement'` case — the correct, general test for "single implement worked one side at a time" that every display-label call site should use instead of re-deriving it. */
export function labelModeForEntry(entry: ExerciseEntry): LoadLabelMode {
  const mode = loadingMode(entry)
  return loadLabelMode(mode === 'dumbbell', mode === 'single_implement' && entry.unilateral)
}

export function formatLoad(kg: number, labelMode: LoadLabelMode): string {
  switch (labelMode) {
    case 'per_hand': return `~${kg}kg per hand`
    case 'single_side': return `~${kg}kg (single side)`
    case 'total': return `~${kg}kg`
  }
}

/**
 * Builds the per-set display array. `topSetKg` is the same fully-adjusted
 * (standards-derived, RPE/reps-scaled) number used for starting_weight_kg —
 * ramping sets are lighter fractions of it, never a separately-derived
 * number, so the top set always matches what the rest of the UI shows.
 */
function buildPerSetLoads(
  topSetKg: number,
  sets: number,
  mode: LoadingMode,
  labelMode: LoadLabelMode,
  ramping: boolean,
): PerSetLoad[] {
  const percents = getSetPercents(sets, ramping)
  return percents.map((percent, i) => {
    const kg = percent >= 100 ? topSetKg : roundToPlate((topSetKg * percent) / 100, mode)
    return {
      set_number: i + 1,
      load_kg: kg,
      display: formatLoad(kg, labelMode),
    }
  })
}

/**
 * Phrases the double-progression rule against the actual rep range and
 * increment size, so "the rep range must be meaningful" isn't just a number
 * — the trainee is told exactly what triggers the next bump.
 */
function buildProgressionBasis(repRangeLabel: string | undefined, incrementKg: number, labelMode: LoadLabelMode): string {
  const topOfRange = repRangeLabel?.match(/(\d+)\s*$/)?.[1]
  const incrementText = formatLoad(incrementKg, labelMode).replace(/^~/, '')
  const target = topOfRange ? `${topOfRange} reps` : 'the top of your rep range'
  return `Hit ${target} on every set this session? Add ${incrementText} next time. Otherwise hold this weight and chase more reps first.`
}

/** For 'reps'/'maintain'-emphasis goals (and any bodyweight movement): the weight is intentionally NOT the progression lever this block, so the basis says what actually IS — the climbing rep target — instead of a load-progression rule that will never fire. */
function buildRepsProgressionBasis(repRangeLabel: string | undefined): string {
  return repRangeLabel
    ? `Weight holds here by design — the rep target (${repRangeLabel} this week) is what's climbing through the block. Add reps, not load.`
    : `Weight holds here by design this block — reps are the lever climbing week to week, not load.`
}

function resolveParentOneRepMaxKg(lift: LiftFamily, profile: UserProfile): number {
  const experience = profile.training_experience || 'novice'
  const bodyweight = profile.weight_kg || 75
  const gender = profile.gender === 'female' ? 'female' : 'male'
  const age = ageAdjustment(profile.age || 30)
  return bodyweight * STRENGTH_STANDARDS_1RM_PER_BW[lift][gender][experience] * age
}

/**
 * Resolves a COMPOUND standards category (a real lift, or a derived-family
 * scale of one) to the 1RM the standards model implies for this profile.
 * percentOf1RM() then converts that into an actual working weight for the
 * reps/RPE this set is prescribed at. Returns null for isolation categories
 * — see resolveIsolationReferenceKg, which is NOT a 1RM and must not be
 * run through this same path (see that function's doc comment for why).
 */
function resolveCompoundOneRepMaxKg(category: string, profile: UserProfile): number | null {
  if (category in STRENGTH_STANDARDS_1RM_PER_BW) {
    return resolveParentOneRepMaxKg(category as LiftFamily, profile)
  }
  const derived = DERIVED_COMPOUND_SCALE[category]
  if (derived) {
    return resolveParentOneRepMaxKg(derived.parent, profile) * derived.scale
  }
  return null
}

/**
 * Resolves an ISOLATION category to a REFERENCE WORKING WEIGHT (achievable
 * for ~10 reps at RPE 8) — not a 1RM. Isolation loads scale off this
 * reference by the RATIO of percentOf1RM at the actual reps/RPE to
 * percentOf1RM at the reference point, rather than being multiplied by a
 * fresh percentOf1RM(actual)/100 the way a true 1RM would be. Multiplying a
 * reference-working-weight by %1RM(actual)/100 would discount it as if it
 * WERE a 1RM (which already has its own ~77% discount baked into the
 * reference point) and cut the number twice.
 */
function resolveIsolationReferenceKg(category: string, profile: UserProfile): number | null {
  const isolation = ISOLATION_FRACTION_OF_COMPOUND[category]
  if (!isolation) return null
  return resolveParentOneRepMaxKg(isolation.parent, profile) * isolation.fraction
}

export function prescribeLoad(
  entry: ExerciseEntry,
  profile: UserProfile,
  options: LoadPrescriptionOptions = {},
): LoadPrescription {
  // Bodyweight movements: the load is the person. Prescribing kilos here would
  // be nonsense, so the progression lever is reps and leverage instead.
  if (!isExternallyLoaded(entry)) {
    return {
      starting_weight_kg: null,
      display: 'Bodyweight',
      basis: 'Progress by adding reps or slowing the tempo before adding load.',
      confidence: 'estimated',
      per_set: null,
    }
  }

  const category = categorize(entry)
  if (!category) {
    return {
      starting_weight_kg: null,
      display: 'Choose by feel',
      basis: 'Pick a load that matches the target effort and note what you used.',
      confidence: 'estimated',
      per_set: null,
    }
  }

  const mode = loadingMode(entry)
  const isDumbbell = mode === 'dumbbell'
  // A two-implement dumbbell pair (Farmer's Walk) is halved and labeled "per
  // hand" via isDumbbell above. But a SINGLE implement carried unilaterally
  // (Suitcase Carry, Overhead Carry — one kettlebell, one side working) was
  // getting the single_implement mode's "no halving" treatment meant for
  // BILATERAL single-implement lifts like a goblet squat (held centrally,
  // both sides loading it). That treated a one-arm overhead carry as if the
  // whole body were pressing it, producing "hold 66kg overhead in one hand"
  // for a lifter who presses 42.5kg overhead with a barbell — a review
  // flagged exactly this ("if you can't press 10kg overhead for reps, you
  // cannot hold 36kg overhead and walk"). `entry.unilateral` is the correct
  // signal: single implement + unilateral means only one side is ever
  // loaded at a time, same as a per-hand dumbbell number.
  const isUnilateralSingleImplement = mode === 'single_implement' && entry.unilateral
  const perSideLoad = isDumbbell || isUnilateralSingleImplement
  const labelMode = loadLabelMode(isDumbbell, isUnilateralSingleImplement)

  let rounded: number
  let fromKnownWeight = false

  if (options.forceStartingWeightKg != null) {
    // Within-block double-progression ramp (or a live logged-history
    // override) — the caller has already worked out the exact top-set
    // number (baseline + N increments, or last session's weight ± an
    // increment). Nothing here should re-derive or re-scale it; only round
    // it to something loadable.
    rounded = roundToPlate(options.forceStartingWeightKg, mode)
  } else {
    // Carries are dosed by distance ("40m"), not reps — parsing that label
    // as a rep count would read "40m" as 40 reps and wildly overshoot the
    // %1RM curve. A fixed moderate reference (8) keeps the RPE label doing
    // real work without the (mis-parsed) distance leaking into the formula.
    const repsMidpoint = (category === 'carry' || category === 'overhead_carry')
      ? 8
      : parseRepsMidpoint(options.repRangeLabel) ?? 10
    const rpeMidpoint = parseRpeMidpoint(options.targetRpeLabel)

    // A trainee-reported working weight replaces the population estimate
    // entirely when it's available for this exercise's family — it's real,
    // verified data rather than a guess from bodyweight/sex/age.
    const knownFamily = KNOWN_WEIGHT_FAMILY[category]
    const knownAnchor = knownFamily ? options.knownWorkingWeights?.[knownFamily] : undefined
    fromKnownWeight = knownAnchor != null && knownAnchor > 0

    let estimate: number
    if (fromKnownWeight) {
      // Treat the reported number as an approximate 10-rep/RPE-8 working
      // weight, then scale it to whatever THIS set's actual reps/RPE are —
      // the same relationship used for the population estimate below, just
      // anchored to a real number instead of a standards table.
      const baselinePercent = percentOf1RM(KNOWN_WEIGHT_REFERENCE_REPS, KNOWN_WEIGHT_REFERENCE_RPE)
      const targetPercent = percentOf1RM(repsMidpoint, rpeMidpoint)
      estimate = knownAnchor! * (targetPercent / baselinePercent)
    } else {
      const oneRepMax = resolveCompoundOneRepMaxKg(category, profile)
      if (oneRepMax != null) {
        estimate = (oneRepMax * percentOf1RM(repsMidpoint, rpeMidpoint)) / 100
      } else {
        const referenceKg = resolveIsolationReferenceKg(category, profile)
        const referencePercent = percentOf1RM(KNOWN_WEIGHT_REFERENCE_REPS, KNOWN_WEIGHT_REFERENCE_RPE)
        const targetPercent = percentOf1RM(repsMidpoint, rpeMidpoint)
        estimate = referenceKg != null ? referenceKg * (targetPercent / referencePercent) : 0
      }
    }

    if (options.isCalibrationWeek && !fromKnownWeight) {
      // Week 1 with no known numbers: start a shade under the estimate
      // while it gets verified. A multiplier on the real number, not a
      // ceiling that overrides the RPE/reps math (see CALIBRATION_WEEK_
      // CONSERVATISM's doc comment).
      estimate *= CALIBRATION_WEEK_CONSERVATISM
    }

    // A per-side prescription is half the standard's total — two-implement
    // dumbbell lifts (plural 'dumbbells') AND single-implement unilateral
    // carries (one kettlebell, one side working). A single dumbbell or
    // kettlebell used BILATERALLY (goblet squats, two-handed swings) is not
    // halved and is not labeled "per hand" — see loadingMode() and
    // isUnilateralSingleImplement above.
    if (perSideLoad) estimate = estimate / 2

    rounded = roundToPlate(estimate, mode)
  }

  // SAFETY ceiling — applied last, after both the estimate path and the
  // forced-ramp/deload path above, so nothing (a within-block double-
  // progression increment, a known-weight anchor, a deload back-off) can
  // push an improvised-carry prescription past it. See
  // IMPROVISED_CARRY_CEILING_KG's doc comment.
  if (isImprovisedCarry(entry)) {
    rounded = Math.min(rounded, IMPROVISED_CARRY_CEILING_KG[profile.training_experience || 'novice'])
  }

  // Only compounds in a strength/power phase ramp; hypertrophy-phase work and
  // any accessory/isolation exercise (any phase) is a straight, flat weight
  // across all sets.
  const isCompoundTier = entry.mechanics_tier === 'tier1_compound' || entry.mechanics_tier === 'tier2_compound'
  const ramping = isCompoundTier && (options.phase === 'strength' || options.phase === 'power')
  const per_set = buildPerSetLoads(rounded, options.sets ?? 1, mode, labelMode, ramping)

  const basis = options.forceStartingWeightKg != null
    ? (options.loadIsProgressing === false
        ? buildRepsProgressionBasis(options.repRangeLabel)
        : buildProgressionBasis(options.repRangeLabel, getLoadIncrementKg(entry, category, rounded), labelMode))
    : options.isCalibrationWeek
      ? 'Calibration week — a shade under your estimated working weight. Find where your last rep feels like the target RPE, then log it.'
      : fromKnownWeight
        ? 'Seeded from the working weight you reported for this lift. Let the effort target correct it if it has changed.'
        : 'Starting estimate from strength standards for your bodyweight, sex and experience — not a tested max. ' +
          'Let the effort target correct it: too easy, add load next set; too hard, drop it.'

  return {
    starting_weight_kg: rounded,
    display: formatLoad(rounded, labelMode),
    basis,
    confidence: 'estimated',
    per_set,
  }
}
