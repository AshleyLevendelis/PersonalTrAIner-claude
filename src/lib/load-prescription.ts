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

/**
 * Provenance of a load prescribed by this module. The UI adds 'logged' on
 * top once real session history exists — see LoadChip's LoadSource.
 */
export type PrescribedLoadSource = 'estimate' | 'known_weight' | 'assumed_body'

/**
 * "Is this number still a guess?" — the question every UI and derivation
 * call site was really asking when it compared against 'estimate'. Adding
 * 'assumed_body' silently broke each of those comparisons in the direction
 * that matters (the LEAST trustworthy state would have read as the most),
 * so the test lives here once rather than in five string equalities.
 *
 * `undefined` counts as unverified: legacy rows written before load_source
 * existed are estimates, and rows are JSONB inside mesocycle_weeks.days, so
 * old ones are still out there.
 */
export function isUnverifiedLoadSource(source: string | undefined): boolean {
  return source == null || source === 'estimate' || source === 'assumed_body'
}

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
  /**
   * Where starting_weight_kg came from:
   *
   *   'known_weight'  anchored to a working weight the trainee reported at
   *                   onboarding — real, verified data about THIS person.
   *   'estimate'      a population standards-table guess built from body
   *                   metrics they actually gave us (however it was
   *                   subsequently ramped/capped/dampened — calibration, the
   *                   unverified per-week step and a plain fresh estimate are
   *                   all still unverified, but they are about their body).
   *   'assumed_body'  the same standards guess, except one or more of the
   *                   body metrics behind it was never given and had to be
   *                   substituted (see resolveBodyBasis). Held under the
   *                   standards number for as long as that stays true.
   *
   * The third state exists because 'estimate' was being used for both of the
   * last two, which is how a woman who declined her weight was handed a man's
   * squat under the word "suggested".
   *
   * UI layers that also know about logged history (the live progression
   * engine) layer a fourth 'logged' state on top of this; prescribeLoad has
   * no visibility into that.
   */
  load_source: PrescribedLoadSource
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
   * they don't know their numbers. Applies an experience-tiered conservatism
   * multiplier on top of the standards-derived estimate (see
   * CALIBRATION_WEEK_CONSERVATISM_BY_EXPERIENCE) — the point is to start
   * meaningfully under an unverified number, not to override the RPE/reps
   * math with an artificial ceiling the way the old hard clamp did. Skipped
   * for a known working weight, which isn't an unverified guess this exists
   * to protect against.
   */
  isCalibrationWeek?: boolean
  /**
   * Every loading week after calibration, for an exercise with no known
   * working weight — the load this same exercise resolved to on its last
   * loading week (deload weeks excluded). The result is that value plus one
   * unverifiedRampStepKg step, capped by this week's fresh standards
   * estimate (see UNVERIFIED_RAMP_STEP_KG's doc comment) — never a re-snap
   * to the full estimate. Mutually exclusive with forceStartingWeightKg in
   * practice (the caller picks one path per exercise per week) and, like
   * isCalibrationWeek, ignored when the load comes from a verified known
   * working weight.
   */
  unverifiedPreviousLoadingWeekKg?: number
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

/**
 * The highest weight a given loading mode can realistically put in
 * someone's hands or on a machine — the ceiling counterpart to
 * LOADING_FLOOR_KG. Same units as whatever prescribeLoad's `rounded`
 * already holds for that mode: for 'dumbbell' that is PER HAND (after the
 * per-side halving prescribeLoad applies, matching the "~Nkg per hand"
 * display) — NEVER the total weight of the pair. Everything else is total.
 *
 * This is a safety NET, not a fix — see the console.warn at its one call
 * site in prescribeLoad. A clamp that silently makes a wrong number look
 * plausible is worse than no clamp: the "88kg Kettlebell Swings" bug was
 * only found because 88kg was obviously absurd for that exercise; clipped
 * quietly to 48kg it would have looked like a real prescription and the
 * actual defect (a missing primer guard in the swap path) would have
 * shipped invisibly. If this ceiling is ever actually hit in a real plan,
 * that means something upstream is still wrong, not that the ceiling did
 * its job — scripts/run-constraint-audit.ts's 'loading_ceiling' check
 * fails the whole audit if it ever fires across the standard combo grid.
 *
 * Values are full-gym ceilings and do not scale down by equipment tier —
 * a home_gym/minimalist trainee's actual adjustable dumbbells realistically
 * top out well below 50kg. Tracked in BACKLOG.md as a follow-up, not
 * addressed here.
 *
 * - dumbbell 50kg per hand — commercial fixed-dumbbell racks commonly top out around there
 * - single_implement (kettlebell / single dumbbell) 48kg — top of commercial kettlebell ranges
 * - ez_bar 60kg — a curl/skullcrusher bar, not a pressing bar; far fewer plates fit than an Olympic bar
 * - barbell 300kg — bar + realistic plate loading, clears an advanced deadlift with room
 * - stack 100kg — most cable/machine stacks top out there (leg press is the one exception — see LEG_PRESS_CEILING_KG)
 */
const LOADING_CEILING_KG_PER_HAND_OR_TOTAL: Record<LoadingMode, number> = {
  dumbbell: 50, // PER HAND — never the total pair load
  single_implement: 48,
  barbell: 300,
  ez_bar: 60,
  stack: 100,
}

// Leg press sits on the 'stack' loading mode but is a fundamentally
// different machine — a real leg press sled routinely loads well past a
// cable stack's pin-selected weight (DERIVED_COMPOUND_SCALE already scales
// it 2.2x squat 1RM for exactly this reason — see that table's doc
// comment). Using the generic stack ceiling here would clip a genuinely
// achievable advanced leg press number.
const LEG_PRESS_CEILING_KG = 400

/** The realistic implement ceiling for this exercise, in the same units prescribeLoad's `rounded` already uses for its loading mode (per hand for a dumbbell pair, total otherwise). */
export function getLoadingCeilingKg(entry: ExerciseEntry, category: string | null): number {
  if (category === 'leg_press') return LEG_PRESS_CEILING_KG
  return LOADING_CEILING_KG_PER_HAND_OR_TOTAL[loadingMode(entry)]
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

// SAFETY: a backpack (or other improvised implement) is not a farmer's
// handle or a dumbbell — there's no rigid frame, the load rides on straps
// and shifts with movement, and failure modes are strap tearing or the
// wearer losing control of a suddenly-shifting load, not just "too heavy to
// hold." A review caught a bodyweight-only NOVICE, in their very first
// calibration week, prescribed a 35-40kg Loaded Backpack Walk with "no
// assessment, no bodyweight-relative anchor, no note on how to build the
// load" — flagged as "the one line in the plan that could actually hurt
// someone." The carry-fraction-of-deadlift model that produces that number
// is otherwise correct for a real farmer's/suitcase carry (rigid handles,
// two hands or braced posture) — the fix here is a hard, absolute ceiling
// specific to IMPROVISED implements, applied after every other calculation,
// that nothing else in this file may exceed regardless of how the estimate
// was derived (standards table, known weight, or a forced within-block ramp
// value). These numbers are deliberately conservative absolutes, not
// bodyweight-relative — a heavier novice doesn't get a heavier backpack
// ceiling, because the strap/posture failure mode doesn't scale with the
// carrier's own strength the way a barbell lift does.
//
// Originally scoped to carries only (isImprovisedCarry) — a follow-up
// review round found Backpack Row prescribed at 45-65kg (a "row" category
// estimate anchored to the full row strength standard, completely
// unrelated to what a backpack can actually deliver) sitting right next to
// a correctly-capped ~25kg Loaded Backpack Walk in the SAME plan, which a
// reviewer called out as internally incoherent on top of being
// individually absurd. Any exercise using the 'weighted backpack' equipment
// tag needs this ceiling, not just carry-prescribed ones — the strap/
// posture failure mode doesn't care whether the movement is a walk or a
// row.
export const IMPROVISED_IMPLEMENT_CEILING_KG: Record<TrainingExperience, number> = {
  beginner: 8,
  novice: 12,
  intermediate: 20,
  advanced: 25,
}

/** Any exercise loaded via an improvised implement (a weighted backpack, not a real farmer's handle/dumbbell/barbell) — regardless of whether it's a carry, a row, or anything else. See IMPROVISED_IMPLEMENT_CEILING_KG's doc comment for why this needs its own hard ceiling. */
export function isImprovisedLoadImplement(entry: ExerciseEntry): boolean {
  return entry.equipment.includes('weighted backpack')
}

// A calibration week (no verified numbers yet) starts under the standards-
// derived estimate rather than trusting it outright — the point is to find
// the real number quickly, not to hand over a confident-looking one. This is
// a MULTIPLIER on the estimate, not a ceiling clamp: the RPE/reps math still
// drives the number, this just nudges the whole thing down for the one week
// where "unverified" matters most.
//
// Tiered by experience, not flat — a flat 0.85 (this file's prior value)
// treats every tier's standards-table claim as equally trustworthy, but they
// are not equally RISKY when wrong. The self-report this multiplier exists
// to protect against ("advanced", "I don't know my numbers") is completely
// unverified either way, and the standards table's spread across tiers is
// large (deadlift: 1.0x bodyweight at beginner, 2.5x at advanced) — an
// overconfident "advanced" claim carries the largest absolute-kg downside
// precisely because the table takes it at face value. Trust decreases as
// that downside grows: a beginner overclaiming novice-level numbers is off
// by a modest margin; an intermediate overclaiming advanced is off by a
// dangerous one on a 217kg-estimated deadlift. A real calibration-week
// reproduction (37yo/87kg male, advanced, unknown lifts) landed a first-ever
// deadlift working set at 130kg under the old flat 0.85 — these values bring
// that same profile to ~70-72.5kg instead.
const CALIBRATION_WEEK_CONSERVATISM_BY_EXPERIENCE: Record<TrainingExperience, number> = {
  beginner: 0.55,
  novice: 0.55,
  intermediate: 0.50,
  advanced: 0.45,
}

// Every loading week after a trainee's calibration week, for as long as an
// exercise stays unverified (no known working weight, no logged history) —
// not just the first block. A percentage-of-standards schedule (this file
// previously used 65%/75% of the fresh estimate for block 1 weeks 2-3 only)
// still converges toward the full estimate on a timetable; block 2 week 1
// then re-ran the normal estimate pipeline with no discount at all and
// snapped straight to 100% of standards — for a real calibration-week
// reproduction (37yo/87kg male, advanced, unknown lifts) that meant squats
// 55kg -> 135kg and trap-bar deadlift -> 167.5kg at the block boundary, the
// same near-max-unverified-load defect this file's calibration multiplier
// exists to prevent, just deferred four weeks.
//
// The actual invariant: an unverified lift can never move by more than one
// loading-mode increment between consecutive LOADING weeks (deload weeks are
// not a reference point — the next block's week 1 steps from the last real
// loading week). The standards estimate is consulted only as a ceiling in
// case the step would overshoot it (near the equipment floor, or a light
// standards estimate), never as a target to close in on. This runs
// indefinitely — it only stops once the exercise gets a known/logged weight
// and the live progression engine (getDoubleProgressionRecommendation in
// progression-engine.ts) takes over, as today.
const UNVERIFIED_RAMP_STEP_KG: Record<LoadingMode, number> = {
  barbell: 5,
  ez_bar: 5,
  dumbbell: 2,
  single_implement: 2,
  stack: 5,
}

export function unverifiedRampStepKg(entry: ExerciseEntry): number {
  return UNVERIFIED_RAMP_STEP_KG[loadingMode(entry)]
}

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

/**
 * Same "is this exercise anchored to a real, verified number" check
 * prescribeLoad runs internally (as `fromKnownWeight`) — exposed so callers
 * building forceStartingWeightKg / unverifiedPreviousLoadingWeekKg
 * (exercise-plan.ts) can decide whether an exercise is still eligible for
 * the unverified per-week step ramp (UNVERIFIED_RAMP_STEP_KG) without
 * duplicating the category -> known-weight-field mapping.
 */
export function hasKnownWorkingWeight(category: string | null, knownWorkingWeights: KnownWorkingWeights | undefined): boolean {
  if (!category) return false
  const family = KNOWN_WEIGHT_FAMILY[category]
  const anchor = family ? knownWorkingWeights?.[family] : undefined
  return anchor != null && anchor > 0
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

/**
 * The body the standards model is about to use, and whether any of it is
 * ours rather than theirs.
 *
 * types.ts states the policy for these fields: "undefined means 'the user
 * has not told us', never 'assume something sensible' … NEVER substitute a
 * default when one of these is missing." The nutrition side honours it
 * (resolveBodyMetrics -> null -> MissingBodyMetricsNotice). This file did
 * not. Three `||`s turned a refusal into a 30-year-old 75kg man, silently,
 * and every prescribed kilo in the app came out of them — including for
 * the ~12 standards categories the onboarding "I know my numbers" answer
 * never anchors.
 *
 * Measured before this change (scripts/run-assumed-body-report.ts): a 55kg
 * 52-year-old woman who declined all three was prescribed a mean 2.01x her
 * own week-1 loads, rising to 2.09x by week 5, with 18 of 18 shared lifts
 * more than 15% too heavy and a worst case of 3.00x. Every one of those
 * numbers was labelled "suggested" — the same word used for an estimate
 * built from a real body. Sex is the larger half of the error: female
 * standards are 0.53-0.67x male, and the old check was
 * `=== 'female' ? … : 'male'`, so *unknown* fell to male rather than being
 * treated as unknown.
 *
 * Why this does NOT return null the way resolveBodyMetrics does: a refusal
 * must still produce a plan, and Ashley's ruling was to keep a real number
 * on screen and make it start low and self-correct. So it returns the
 * substituted body AND the fact that it is substituted — no consumer can
 * read the number without also being handed the caveat.
 */
export interface BodyBasis {
  weightKg: number
  gender: 'male' | 'female'
  ageYears: number
  /** True when ANY of the three below was invented rather than reported. */
  assumed: boolean
  /** Which ones, in the same user-facing words missingBodyMetrics() uses. */
  missing: ('weight' | 'sex' | 'age')[]
}

/**
 * The body used when we have nothing.
 *
 * Named, and in one place, so it can never again be three anonymous literals
 * inside an expression — the form the defect took for its whole life.
 *
 * DELIBERATELY NOT AN AVERAGE PERSON. The old values (75kg, male, 30) were
 * the middle of the population, which sounds neutral and is not: it makes the
 * error symmetric when the CONSEQUENCES of the error are not. Prescribing a
 * light trainee twice what they can lift is a squat that can hurt them on
 * their first ever session. Prescribing a heavy trainee half what they can
 * lift is one boring set, which they then correct by logging what they
 * actually did — the app's whole self-correction path, and the exact thing a
 * calibration week asks them to do.
 *
 * So: the light end of the adult range, and the lower of the two standards
 * tables. Not a guess at who they are — a floor to start from until they tell
 * us or lift something. It is released per-field: someone who gives a weight
 * but declines their age keeps their real weight.
 *
 * Age 60 rather than 30 for the same reason — ageAdjustment() is flat to 40
 * and only falls after, so an assumed 30 was the single most aggressive
 * choice available.
 */
const ASSUMED_BODY = { weightKg: 50, gender: 'female' as const, ageYears: 60 }

export function resolveBodyBasis(profile: UserProfile): BodyBasis {
  const missing: BodyBasis['missing'] = []
  if (!profile.weight_kg) missing.push('weight')
  if (!profile.gender) missing.push('sex')
  if (!profile.age) missing.push('age')
  return {
    weightKg: profile.weight_kg || ASSUMED_BODY.weightKg,
    // Explicit on both real values, so only genuine absence falls through to
    // the assumed default — the old ternary silently sorted "unknown" into
    // the heavier of the two standards tables.
    gender: profile.gender === 'female' ? 'female' : profile.gender === 'male' ? 'male' : ASSUMED_BODY.gender,
    ageYears: profile.age || ASSUMED_BODY.ageYears,
    assumed: missing.length > 0,
    missing,
  }
}

/**
 * What we say about a number we could not build from this person's body.
 *
 * House style is MissingBodyMetricsNotice's: name the gap, say what still
 * works, give one action, stop. No apology, no nagging, and above all no
 * placeholder dressed up as a measurement — the number on screen is real,
 * it is just deliberately low, and the copy says so rather than letting
 * "suggested" imply it was derived from them.
 */
function bodyGapPhrase(missing: BodyBasis['missing']): string {
  if (missing.length === 1) return `your ${missing[0]}`
  if (missing.length === 2) return `your ${missing[0]} or ${missing[1]}`
  return `your ${missing.slice(0, -1).join(', ')} or ${missing[missing.length - 1]}`
}

function buildAssumedBodyBasis(profile: UserProfile, isCalibrationWeek: boolean): string {
  const gap = bodyGapPhrase(resolveBodyBasis(profile).missing)
  const opener = `We don't know ${gap}, so this can't be worked out from your body — it starts low on purpose instead of guessing.`
  return isCalibrationWeek
    ? `${opener} Find the weight where the last rep feels like RPE 6 and log it; next week builds from YOUR number.`
    : `${opener} Log what you actually lift and the plan rebuilds from it — or add ${gap === 'your weight' ? 'it' : 'them'} in Profile.`
}

function resolveParentOneRepMaxKg(lift: LiftFamily, profile: UserProfile): number {
  const experience = profile.training_experience || 'novice'
  const body = resolveBodyBasis(profile)
  return body.weightKg * STRENGTH_STANDARDS_1RM_PER_BW[lift][body.gender][experience] * ageAdjustment(body.ageYears)
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

/**
 * Whether this isolation exercise's reference working weight — the same
 * baseline resolveIsolationReferenceKg computes, before any per-week RPE/
 * rep scaling — would round below the exercise's OWN equipment floor (an
 * empty 20kg bar, a 10kg EZ bar). Only barbell/EZ-bar modes have a floor
 * high enough for this to matter — dumbbell (2kg), single_implement (2kg)
 * and stack (5kg) floors are low enough that a genuinely light target
 * still displays close to its real value. Used by exercise selection to
 * prefer a lower-floor same-substitution_group sibling instead of
 * silently clamping a lighter trainee's true target up to a bar weight
 * the number never actually represented — the exact "Barbell Curls=20kg,
 * Dumbbell Curls=5kg" incoherence a real trainee would see as two
 * unrelated numbers for the same muscle, when both are really just this
 * one gap wearing two different implements.
 */
export function isolationTargetBelowFloor(entry: ExerciseEntry, profile: UserProfile): boolean {
  const mode = loadingMode(entry)
  if (mode !== 'barbell' && mode !== 'ez_bar') return false
  const category = categorize(entry)
  if (!category) return false
  const reference = resolveIsolationReferenceKg(category, profile)
  if (reference == null) return false
  // Fed by resolveParentOneRepMaxKg, so an assumed body flows through here
  // for free — which is the point. Exercise SELECTION was contaminated by the
  // same substitution as load: with the old 75kg male stand-in, a 50kg woman
  // never got the lower-floor dumbbell sibling and was handed a 20kg barbell
  // curl. Nothing to add here; it just had to be true at the chokepoint.
  return reference < LOADING_FLOOR_KG[mode]
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
      load_source: 'estimate',
      per_set: null,
    }
  }

  const category = categorize(entry)
  if (!category) {
    return {
      starting_weight_kg: null,
      display: 'Choose by feel',
      basis: 'Pick a load that matches the target effort and note what you used.',
      load_source: 'estimate',
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
  // Hoisted above the forceStartingWeightKg branch — that path short-circuits
  // to a caller-supplied number (a within-block baseline+increment carry-
  // forward) without re-deriving anything, but the underlying baseline can
  // still trace back to a known working weight from week 1. load_source
  // needs to reflect that regardless of which branch actually computed the
  // number, so this can't live inside the estimate-only else branch below.
  const knownFamily = KNOWN_WEIGHT_FAMILY[category]
  const knownAnchor = knownFamily ? options.knownWorkingWeights?.[knownFamily] : undefined
  const fromKnownWeight = knownAnchor != null && knownAnchor > 0

  // Hoisted for the same reason fromKnownWeight is: the forceStartingWeightKg
  // branch below short-circuits without re-deriving anything, but the number
  // it carries forward still traces back to a baseline built on an assumed
  // body, so the provenance has to be decided outside that branch. A
  // known-weight anchor is exempt — no body metric enters that path at all,
  // so a trainee who reported their squat but declined their weight gets an
  // honest 'known_weight' on squats and 'assumed_body' on everything else.
  const bodyAssumed = !fromKnownWeight && resolveBodyBasis(profile).assumed

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
      // Week 1 with no known numbers: start meaningfully under the estimate
      // while it gets verified. A multiplier on the real number, not a
      // ceiling that overrides the RPE/reps math (see
      // CALIBRATION_WEEK_CONSERVATISM_BY_EXPERIENCE's doc comment for why
      // this is tiered rather than flat).
      //
      // No SECOND multiplier for an assumed body. That was tried and measured:
      // because a real profile's week 1 is also a calibration week, damping
      // both sides left the declined/stated ratio at 2.01x, exactly where it
      // started — the discount cancelled out and only made everyone's numbers
      // smaller. The fix for an unknown body has to be the body (see
      // ASSUMED_BODY), which moves the estimate AND the ceiling the
      // unverified ramp climbs toward. Stacking a discount on top of a
      // conservative body compounds to absurdity (a 100kg man on 2kg
      // dumbbells) without adding safety.
      const experienceTier = profile.training_experience || 'novice'
      estimate *= CALIBRATION_WEEK_CONSERVATISM_BY_EXPERIENCE[experienceTier]
    }

    // A per-side prescription is half the standard's total — two-implement
    // dumbbell lifts (plural 'dumbbells') AND single-implement unilateral
    // carries (one kettlebell, one side working). A single dumbbell or
    // kettlebell used BILATERALLY (goblet squats, two-handed swings) is not
    // halved and is not labeled "per hand" — see loadingMode() and
    // isUnilateralSingleImplement above.
    if (perSideLoad) estimate = estimate / 2

    if (options.unverifiedPreviousLoadingWeekKg != null && !fromKnownWeight) {
      // Every loading week after calibration, still no verified number for
      // this exercise — see UNVERIFIED_RAMP_STEP_KG's doc comment. Applied
      // post per-side-halving so the previous value and the step are in the
      // same units (per-hand for dumbbells, total otherwise) as what's
      // actually stored and displayed.
      estimate = Math.min(options.unverifiedPreviousLoadingWeekKg + unverifiedRampStepKg(entry), estimate)
    }

    rounded = roundToPlate(estimate, mode)
  }

  // SAFETY ceiling — general per-implement cap, checked before the
  // improvised-implement override below so a genuine implement-ceiling hit
  // is never silently absorbed by that separate, much tighter clamp. Logs
  // rather than clamping quietly — see LOADING_CEILING_KG_PER_HAND_OR_TOTAL's
  // doc comment for why a clip that looks plausible afterward is worse than
  // no clip at all.
  const loadingCeiling = getLoadingCeilingKg(entry, category)
  if (rounded > loadingCeiling) {
    console.warn(
      `[Load Prescription] "${entry.name}" computed ${rounded}kg, above the ${loadingCeiling}kg realistic ` +
      `ceiling for its implement — clamping. This is a safety net, not a fix: something upstream produced ` +
      `a wrong number and should be traced, not just the clamp trusted.`
    )
    rounded = Math.min(rounded, loadingCeiling)
  }

  // SAFETY ceiling — applied last, after both the estimate path and the
  // forced-ramp/deload path above, so nothing (a within-block double-
  // progression increment, a known-weight anchor, a deload back-off) can
  // push an improvised-implement prescription past it. See
  // IMPROVISED_IMPLEMENT_CEILING_KG's doc comment.
  if (isImprovisedLoadImplement(entry)) {
    rounded = Math.min(rounded, IMPROVISED_IMPLEMENT_CEILING_KG[profile.training_experience || 'novice'])
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
    // Ordered ABOVE the calibration and ramp branches: both of those say
    // "the standards estimate" as though it described this person, and for
    // an assumed body that is the specific sentence that isn't true. The
    // old final branch was worse still — "from strength standards for your
    // bodyweight, sex and experience" printed verbatim to someone who gave
    // us none of the three.
    : bodyAssumed
      ? buildAssumedBodyBasis(profile, options.isCalibrationWeek === true)
      : options.isCalibrationWeek && !fromKnownWeight
        ? 'Loads start deliberately light — find the weight where the last rep feels like RPE 6, log it, and next week builds from YOUR numbers.'
        : options.unverifiedPreviousLoadingWeekKg != null && !fromKnownWeight
          ? 'Still no logged number for this lift, so this week goes up by one small step from last time, capped by the standards estimate. Log it and let the effort target correct it.'
          : fromKnownWeight
            ? 'Seeded from the working weight you reported for this lift. Let the effort target correct it if it has changed.'
            : 'Starting estimate from strength standards for your bodyweight, sex and experience — not a tested max. ' +
              'Let the effort target correct it: too easy, add load next set; too hard, drop it.'

  return {
    starting_weight_kg: rounded,
    display: formatLoad(rounded, labelMode),
    basis,
    load_source: fromKnownWeight ? 'known_weight' : bodyAssumed ? 'assumed_body' : 'estimate',
    per_set,
  }
}

// ---------------------------------------------------------------------------
// Relative-load rotation guard (Final Generator round, Fix 3)
// ---------------------------------------------------------------------------
// The loading-class guard (Calibration round) stops a loaded exercise from
// rotating to a bodyweight one, but a review caught the adjacent failure
// mode it can't see: "Dumbbell Rows @28kg/hand becomes Backpack Row
// @27.5kg total" is loaded -> loaded, so it passes the class check cleanly,
// but 56kg total (28 x2) collapsing to 27.5kg is still a stealth ~50%
// regression. This estimates each side's TOTAL effective load at a fixed,
// consistent reference point (10 reps @ RPE 7 — not any specific week's
// real prescription, just an apples-to-apples yardstick) so rotation
// candidates can be filtered by "does this preserve roughly the same
// loading demand" independent of whichever week happens to be rotating.

const RELATIVE_LOAD_REFERENCE_REPS = 10
const RELATIVE_LOAD_REFERENCE_RPE = 7

/**
 * A consistent, week-independent estimate of the TOTAL (not per-hand) load
 * a profile would be prescribed on this exercise — used only to compare two
 * exercises' relative demand for rotation purposes, never shown to a user.
 * Returns null for bodyweight/uncategorizable movements, which have no load
 * to compare.
 */
export function estimateEffectiveTotalKg(entry: ExerciseEntry, profile: UserProfile): number | null {
  const load = prescribeLoad(entry, profile, {
    targetRpeLabel: `RPE ${RELATIVE_LOAD_REFERENCE_RPE}`,
    repRangeLabel: String(RELATIVE_LOAD_REFERENCE_REPS),
    sets: 1,
  })
  if (load.starting_weight_kg == null) return null
  // A two-implement dumbbell pair's starting_weight_kg is already the
  // per-hand number — double it back to total load moved, the quantity
  // that actually matters for "did this rotation preserve the demand."
  return loadingMode(entry) === 'dumbbell' ? load.starting_weight_kg * 2 : load.starting_weight_kg
}

/**
 * True when `candidate` preserves roughly the same loading demand as
 * `current` for this profile — within +-40% of current's effective total
 * load. Exercises with no comparable load (bodyweight either side) always
 * pass this check; the loading-class guard elsewhere is what governs
 * bodyweight <-> loaded transitions, this only judges loaded <-> loaded.
 */
export function preservesRelativeLoad(current: ExerciseEntry, candidate: ExerciseEntry, profile: UserProfile): boolean {
  const currentKg = estimateEffectiveTotalKg(current, profile)
  if (currentKg == null || currentKg <= 0) return true
  const candidateKg = estimateEffectiveTotalKg(candidate, profile)
  if (candidateKg == null) return true
  const ratio = candidateKg / currentKg
  return ratio >= 0.6 && ratio <= 1.4
}

// ---------------------------------------------------------------------------
// ASSISTANCE PRESCRIPTION — the inverse of load
// ---------------------------------------------------------------------------
// An assistance-loaded exercise (ExerciseEntry.assistance — today, only
// Pull-Ups (Assisted), machine counterweight) removes resistance rather than
// adding it, so "stronger" means the number goes DOWN, floored at 0kg (full
// bodyweight range — the trainee is doing the real movement on the assisted
// rig, no help left to give). This deliberately does NOT reuse prescribeLoad's
// machinery (starting-weight standards table, known-working-weight anchors,
// unverified-ramp carry-forward, calibration-week clamps): none of that has
// an assistance equivalent — there is no "known assisted-pull-up weight" a
// trainee reports at onboarding, no logged history to anchor to (see this
// function's own doc comment on why the live post-session double-progression
// engine is intentionally NOT wired to this — that's a set-logging schema
// question, not a load-prescription one). This is a plain, stateless,
// experience-scaled decrement table instead — always 'estimate' class,
// recomputed fresh from (experience, weekInBlock) every call, nothing to
// carry forward or contaminate on a rotation.

/** Starting assistance for someone who has never done an unassisted rep — deliberately generous (more help) for a beginner, less for someone who has plainly trained pulling strength before. */
const ASSISTANCE_START_KG: Record<TrainingExperience, number> = {
  beginner: 40,
  novice: 35,
  intermediate: 20,
  advanced: 10,
}

/** Assistance removed per loading week (weeks 2 and 3 of a block) — same "two real steps per block" cadence prescribeLoad's own forceStartingWeightKg logic uses for load. */
const ASSISTANCE_STEP_KG = 5

export interface AssistancePrescription {
  assistance_kg: number
  display: string
  /** True once assistance_kg has hit 0 — full bodyweight range, the cue to try the real (unassisted) exercise next. */
  ready_to_graduate: boolean
}

/**
 * Returns null for any exercise without an `assistance` field — the normal
 * (non-assistance) case, so callers can unconditionally call this alongside
 * prescribeLoad and just check for null.
 *
 * weekInBlock is 1-3 (loading weeks only); pass 1 for any "first build /
 * swapped in" context that has no real week-in-block concept yet (mirrors
 * how those same call sites already pass isFirstBlock: true to prescribeLoad).
 * isDeload holds assistance flat at whatever week 3 resolved to — matching
 * this codebase's established deload philosophy elsewhere ("recovery comes
 * from doing less, not lifting lighter"): sets/reps carry the deload's
 * recovery reduction, not a change in either direction on the assistance/load
 * axis itself.
 */
export function prescribeAssistance(
  entry: ExerciseEntry,
  profile: UserProfile,
  weekInBlock: number,
  isDeload: boolean,
): AssistancePrescription | null {
  if (!entry.assistance) return null
  const experience = profile.training_experience || 'novice'
  const startKg = ASSISTANCE_START_KG[experience] ?? ASSISTANCE_START_KG.novice
  const effectiveWeek = isDeload ? 3 : Math.min(Math.max(1, weekInBlock), 3)
  const assistanceKg = Math.max(0, startKg - (effectiveWeek - 1) * ASSISTANCE_STEP_KG)
  const readyToGraduate = assistanceKg === 0
  return {
    assistance_kg: assistanceKg,
    display: readyToGraduate ? 'Bodyweight (no assist)' : `${assistanceKg}kg assist`,
    ready_to_graduate: readyToGraduate,
  }
}

/** The load_guidance-equivalent copy for an assistance exercise — parallels ExperienceConfig.load_guidance's role for prescribeLoad, but framed around removing help rather than adding weight. */
export function assistanceGuidance(prescription: AssistancePrescription): string {
  if (prescription.ready_to_graduate) {
    return "You're at full bodyweight range on the assisted rig now — try the real, unassisted version next session."
  }
  return 'Less machine assistance each week as you get stronger — the number should go DOWN over time, not up.'
}
