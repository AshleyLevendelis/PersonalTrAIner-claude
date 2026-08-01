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
   * specific week, e.g. 'RPE 5-6' or 'RPE 8-9'. The bodyweight-multiplier
   * standards below assume a firm, close-to-the-set working weight — a week
   * that targets RPE 5-6 must not get that same weight.
   */
  targetRpeLabel?: string
  /**
   * Whether this is the trainee's first block on this program — i.e. we have
   * never seen them lift. Defaults to true, because "unverified" is the safe
   * assumption when the caller doesn't say otherwise: a guess that's too
   * light costs a rep in reserve, a guess that's too heavy costs an injury.
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
   * they don't know their numbers. Overrides the RPE-derived fraction with a
   * hard, conservative cap — the goal that week is finding the weight where
   * RPE 6 actually lands, not confirming a guess.
   */
  isCalibrationWeek?: boolean
  /**
   * Verified working weights from onboarding ("I know my numbers"). When the
   * exercise's movement family has an entry here, it replaces the
   * bodyweight-multiplier estimate as the anchor and the first-block safety
   * clamp is skipped — this is real, self-reported data, not a population
   * guess for a stranger.
   */
  knownWorkingWeights?: KnownWorkingWeights
  /**
   * Skips the bodyweight/known-weight estimate entirely and uses this number
   * as the top-set weight (still plate-rounded, still capped through the
   * per-set ramp builder). Used by the within-block double-progression ramp
   * in generateMesocycle() — week 2/3 are "week 1's baseline + N increments,"
   * not a fresh RPE-derived estimate — and by the live logged-history
   * override once real set data exists. `targetRpeLabel` should still be
   * passed alongside this for phase/RPE display purposes even though it no
   * longer affects the number.
   */
  forceStartingWeightKg?: number
  /**
   * The prescribed rep range for this exercise this week, e.g. '8-12' — used
   * only to phrase the double-progression rule in `basis` ("hit 12 on all
   * sets → add Xkg next session"). Purely cosmetic; does not affect the load.
   */
  repRangeLabel?: string
}

// ---------------------------------------------------------------------------
// Strength standards
// ---------------------------------------------------------------------------
// Multiples of bodyweight for a working set in the 8-10 rep range, drawn from
// commonly used training standards. These are population averages: individual
// variation is enormous, which is exactly why the RPE target does the real
// work and this only sets a starting point.

const BODYWEIGHT_MULTIPLIERS: Record<string, Record<TrainingExperience, number>> = {
  // Lower body pressing and hinging support the most load.
  squat: { beginner: 0.45, novice: 0.75, intermediate: 1.05, advanced: 1.4 },
  deadlift: { beginner: 0.55, novice: 0.9, intermediate: 1.3, advanced: 1.75 },
  hinge_accessory: { beginner: 0.35, novice: 0.6, intermediate: 0.85, advanced: 1.15 },
  leg_press: { beginner: 0.9, novice: 1.5, intermediate: 2.1, advanced: 2.8 },
  // Upper body pressing.
  bench: { beginner: 0.35, novice: 0.6, intermediate: 0.85, advanced: 1.15 },
  overhead: { beginner: 0.22, novice: 0.4, intermediate: 0.55, advanced: 0.75 },
  // Pulling.
  row: { beginner: 0.3, novice: 0.55, intermediate: 0.75, advanced: 1.0 },
  pulldown: { beginner: 0.35, novice: 0.6, intermediate: 0.8, advanced: 1.05 },
  // Isolation work is a small fraction of bodyweight.
  isolation_upper: { beginner: 0.08, novice: 0.13, intermediate: 0.18, advanced: 0.24 },
  isolation_lower: { beginner: 0.15, novice: 0.25, intermediate: 0.35, advanced: 0.5 },
  carry: { beginner: 0.25, novice: 0.4, intermediate: 0.6, advanced: 0.85 },
  // A goblet squat is loaded with a single dumbbell or kettlebell held at the
  // chest, not a barbell on the back — it does not scale with bodyweight the
  // way a back squat does. Sized to land roughly 12-24kg for most users
  // rather than inheriting the full 'squat' standard (which produced the
  // "~60kg per hand" bug: a barbell-squat estimate, halved and mislabeled).
  goblet_squat: { beginner: 0.15, novice: 0.2, intermediate: 0.25, advanced: 0.32 },
}

// ---------------------------------------------------------------------------
// Absolute safety ceilings for a FIRST prescription
// ---------------------------------------------------------------------------
// These are unverified estimates for someone we have never seen lift. No
// combination of bodyweight, sex, and age adjustments should be able to push
// a first-block suggestion past what's safe to hand a stranger, regardless of
// how the formula above computes out.
export const CATEGORY_CAPS_KG: Partial<Record<string, number>> = {
  squat: 80,
  goblet_squat: 32,
  deadlift: 80,
  hinge_accessory: 60,
  leg_press: 120,
  bench: 60,
  overhead: 45,
  row: 60,
  pulldown: 65,
  isolation_upper: 20,
  isolation_lower: 30,
  carry: 40,
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

const REFERENCE_RPE = 8

/**
 * The bodyweight-multiplier standards above assume a firm, close-to-the-set
 * working weight — roughly RPE 8. A phase asking for RPE 5-6 is asking for a
 * genuinely easier set, so the suggested load must come down to match, not
 * stay at the RPE-8 weight with an instruction to leave more reps in the
 * tank. ~12% of the estimate per RPE point below the reference, floored so a
 * light target never approaches zero and capped so a peak week doesn't
 * balloon far past the reference estimate.
 */
function rpeEffortFraction(targetRpeLabel: string | undefined): number {
  const rpe = parseRpeMidpoint(targetRpeLabel)
  const fraction = 1 - (REFERENCE_RPE - rpe) * 0.12
  return Math.max(0.55, Math.min(1.05, fraction))
}

/** Maps an exercise onto a standards category. */
export function categorize(entry: ExerciseEntry): string | null {
  const n = entry.name.toLowerCase()

  // Isolation work is checked FIRST, before any pattern matching. A Cable Fly
  // and a Pec Deck share the `horizontal_push` pattern with the bench press,
  // and falling through to the bench standard prescribed ~67kg for a fly —
  // a load that would put a shoulder at real risk. Mechanics tier is the
  // reliable signal here, not movement pattern.
  if (entry.mechanics_tier === 'tier3_isolation' || n.includes('fly') || n.includes('pec deck')) {
    const lower = ['isolation_quad', 'isolation_hamstring', 'isolation_calf', 'knee_dominant', 'hip_hinge']
    return lower.includes(entry.movement_pattern) ? 'isolation_lower' : 'isolation_upper'
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
  if (n.includes('carry') || n.includes('farmer')) return 'carry'

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
    case 'single_leg':
      return 'squat'
    case 'carry':
      return 'carry'
    case 'isolation_bicep':
    case 'isolation_tricep':
    case 'isolation_shoulder':
      return 'isolation_upper'
    case 'isolation_quad':
    case 'isolation_hamstring':
    case 'isolation_calf':
      return 'isolation_lower'
    default:
      return null
  }
}

/**
 * Women's absolute upper-body strength relative to bodyweight is meaningfully
 * lower than men's, while lower-body differences are much smaller. Applying a
 * single multiplier to both sexes systematically over-prescribes upper-body
 * starting loads for women. Adjusting is more accurate and, more importantly,
 * safer than not adjusting.
 */
function sexAdjustment(category: string, gender: 'male' | 'female'): number {
  if (gender === 'male') return 1
  const upperBody = ['bench', 'overhead', 'row', 'pulldown', 'isolation_upper']
  return upperBody.includes(category) ? 0.6 : 0.75
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

/** Round to something actually loadable rather than a number like 43.7kg. */
function roundToPlate(kg: number, mode: LoadingMode): number {
  switch (mode) {
    case 'dumbbell':
    case 'single_implement':
      // Dumbbells and kettlebells commonly step in 2kg increments at the light end.
      return Math.max(2, Math.round(kg / 2) * 2)
    case 'barbell':
      // 20kg bar plus plate pairs. Below bar weight, prescribe the bar itself.
      return kg <= 20 ? 20 : Math.round(kg / 2.5) * 2.5
    case 'ez_bar':
      return kg <= 10 ? 10 : Math.round(kg / 2.5) * 2.5
    case 'stack':
      // Cable and machine stacks have no bar to floor against — applying the
      // barbell's 20kg minimum here inflated light isolation work.
      return Math.max(5, Math.round(kg / 2.5) * 2.5)
  }
}

/**
 * The double-progression increment for one "notch" of overload — how much
 * gets added once a trainee has earned it (hit the top of their rep range on
 * every set). Sized by how finely each loading mode actually steps in a real
 * gym: barbell plates jump in 2.5kg pairs, dumbbell racks commonly step in
 * 2kg per hand, stacks/machines vary but 2.5kg is the safe common case except
 * for heavy leg-press-style stacks which usually step in bigger increments.
 * Bodyweight movements have no numeric increment — see isExternallyLoaded()
 * callers, which progress those via reps instead and should never call this.
 */
export function getLoadIncrementKg(entry: ExerciseEntry, category: string | null): number {
  const mode = loadingMode(entry)
  switch (mode) {
    case 'barbell':
    case 'ez_bar':
      return 2.5
    case 'dumbbell':
    case 'single_implement':
      return 2
    case 'stack':
      return category === 'leg_press' ? 5 : 2.5
  }
}

// Equipment that carries a selectable external load in kilograms. Note the
// exclusions: an assisted pull-up machine REDUCES load rather than adding it,
// resistance bands have no meaningful kg value, and cardio machines are not
// loaded at all. Matching on a loose substring like 'machine' would wrongly
// sweep all of those in.
const LOADED_EQUIPMENT = new Set([
  'barbell', 'dumbbell', 'dumbbells', 'EZ bar', 'kettlebell', 'trap bar',
  't-bar', 'cable machine', 'machine', 'leg press machine',
  'hack squat machine', 'farmer handles', 'medicine ball',
])

export function isExternallyLoaded(entry: ExerciseEntry): boolean {
  return entry.equipment.some(e => LOADED_EQUIPMENT.has(e))
}

// Upper bound of the "50-60% of the calculated working weight" first-block
// range. Applied as a ceiling on the RPE-derived fraction below (not a
// separate multiplier stacked on top of it) so a first block that legitimately
// targets a lower RPE still tracks that RPE — it just can never exceed this.
const FIRST_BLOCK_MAX_FRACTION = 0.6

// Midpoint of the "40-50% of the calculated standard" calibration-week range.
// Applied the same way as FIRST_BLOCK_MAX_FRACTION — a ceiling on the
// RPE-derived fraction, not a separate multiplier — so calibration week stays
// deliberately light regardless of what RPE label that week happens to carry.
const CALIBRATION_MAX_FRACTION = 0.45

// Maps a standards category onto the onboarding "known working weight" field
// that anchors it. Only the categories a trainee would actually self-report
// against the big three lifts are included — leg press or hinge-accessory
// work still falls back to the bodyweight-multiplier estimate, since a
// squat number is not a reliable stand-in for those.
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
// always 100 — the top set is exactly the RPE/first-block-adjusted estimate
// computed above, never higher.
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
 * Builds the per-set display array. `topSetKg` is the same fully-adjusted
 * (RPE-scaled, first-block-clamped, capped) number used for
 * starting_weight_kg — ramping sets are lighter fractions of it, never a
 * separately-derived number, so the top set always matches what the rest of
 * the UI shows.
 */
function buildPerSetLoads(
  topSetKg: number,
  sets: number,
  mode: LoadingMode,
  isDumbbell: boolean,
  ramping: boolean,
): PerSetLoad[] {
  const percents = getSetPercents(sets, ramping)
  return percents.map((percent, i) => {
    const kg = percent >= 100 ? topSetKg : roundToPlate((topSetKg * percent) / 100, mode)
    return {
      set_number: i + 1,
      load_kg: kg,
      display: isDumbbell ? `~${kg}kg per hand` : `~${kg}kg`,
    }
  })
}

/**
 * Phrases the double-progression rule against the actual rep range and
 * increment size, so "the rep range must be meaningful" isn't just a number
 * — the trainee is told exactly what triggers the next bump.
 */
function buildProgressionBasis(repRangeLabel: string | undefined, incrementKg: number, isDumbbell: boolean): string {
  const topOfRange = repRangeLabel?.match(/(\d+)\s*$/)?.[1]
  const incrementText = isDumbbell ? `${incrementKg}kg per hand` : `${incrementKg}kg`
  const target = topOfRange ? `${topOfRange} reps` : 'the top of your rep range'
  return `Hit ${target} on every set this session? Add ${incrementText} next time. Otherwise hold this weight and chase more reps first.`
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
    const experience = profile.training_experience || 'novice'
    const bodyweight = profile.weight_kg || 75

    // A trainee-reported working weight replaces the population estimate
    // entirely when it's available for this exercise's family — it's real,
    // verified data rather than a guess from bodyweight/sex/age.
    const knownFamily = KNOWN_WEIGHT_FAMILY[category]
    const knownAnchor = knownFamily ? options.knownWorkingWeights?.[knownFamily] : undefined
    fromKnownWeight = knownAnchor != null && knownAnchor > 0

    let estimate = fromKnownWeight
      ? knownAnchor!
      : bodyweight *
        BODYWEIGHT_MULTIPLIERS[category][experience] *
        sexAdjustment(category, profile.gender) *
        ageAdjustment(profile.age || 30)

    // Reconcile the estimate against the actual effort this week is asking
    // for — the standards above assume a firm ~RPE 8 working set, not
    // whatever this particular phase/week targets.
    let fraction = rpeEffortFraction(options.targetRpeLabel)

    const isFirstBlock = options.isFirstBlock !== false
    if (isFirstBlock && !fromKnownWeight) {
      // No verified lifting history yet. Regardless of what the RPE math
      // alone would allow, the very first block stays capped at 50-60% of
      // the reference working weight — the user corrects upward via RPE
      // feedback, not by trusting an untested number. A known, self-reported
      // working weight skips this clamp — it isn't an untested number.
      fraction = Math.min(fraction, FIRST_BLOCK_MAX_FRACTION)
    }

    if (options.isCalibrationWeek) {
      // Week 1 with no known numbers: the point is to FIND the weight where
      // RPE 6 lands, not to hand over a confident-looking number. Overrides
      // whatever the RPE label alone would allow, same mechanism as the
      // first-block clamp above.
      fraction = Math.min(fraction, CALIBRATION_MAX_FRACTION)
    }

    estimate *= fraction

    // A per-hand dumbbell prescription is half the standard's total — but
    // only for TWO-implement lifts (plural 'dumbbells'). A single dumbbell
    // or kettlebell (goblet squats, carries, swings) is not halved and is
    // not labeled "per hand" — see loadingMode().
    if (isDumbbell) estimate = estimate / 2

    rounded = roundToPlate(estimate, mode)

    // Absolute ceiling regardless of profile. This is a hard safety net, not
    // the primary mechanism — the RPE/first-block scaling above should
    // already land well under it — but it guarantees a bad multiplier or an
    // unusually heavy profile can never hand a first, unverified
    // prescription a dangerous number. Skipped for a known working weight —
    // that's not an unverified guess this cap exists to catch.
    if (isFirstBlock && !fromKnownWeight) {
      const cap = CATEGORY_CAPS_KG[category]
      if (cap != null) rounded = Math.min(rounded, cap)
    }
  }

  // Only compounds in a strength/power phase ramp; hypertrophy-phase work and
  // any accessory/isolation exercise (any phase) is a straight, flat weight
  // across all sets.
  const isCompoundTier = entry.mechanics_tier === 'tier1_compound' || entry.mechanics_tier === 'tier2_compound'
  const ramping = isCompoundTier && (options.phase === 'strength' || options.phase === 'power')
  const per_set = buildPerSetLoads(rounded, options.sets ?? 1, mode, isDumbbell, ramping)

  const basis = options.forceStartingWeightKg != null
    ? buildProgressionBasis(options.repRangeLabel, getLoadIncrementKg(entry, category), isDumbbell)
    : options.isCalibrationWeek
      ? 'Calibration week — deliberately light. Find the weight where your last rep feels like the target RPE, then log it.'
      : fromKnownWeight
        ? 'Seeded from the working weight you reported for this lift. Let the effort target correct it if it has changed.'
        : 'Starting estimate from your bodyweight and experience — not a tested max. ' +
          'Let the effort target correct it: too easy, add load next set; too hard, drop it.'

  return {
    starting_weight_kg: rounded,
    display: isDumbbell ? `~${rounded}kg per hand` : `~${rounded}kg`,
    basis,
    confidence: 'estimated',
    per_set,
  }
}
