// ---------------------------------------------------------------------------
// LIVING TARGETS (M0)
// ---------------------------------------------------------------------------
// Before this module, macro targets were computed exactly once at onboarding
// and frozen into fitness_profiles columns (calorie_target/protein_g/...),
// which nothing could ever update — and the chat was fed those frozen static
// numbers even when the user had switched to DYNAMIC_CSCS mode. Targets are
// now computed ON READ, every time, from:
//
//   - the profile's inputs (age/sex/height/goal/activity/mode), where
//     profile.weight_kg is formally "onboarding weight, immutable", and
//   - the latest daily_metrics weigh-in when one exists, which overrides
//     the onboarding weight — so logging a new weight changes targets
//     everywhere at once (Nutrition tab, chat context, meal budgets).
//
// The frozen columns are still WRITTEN at onboarding for back-compat, but
// nothing reads them anymore. Whenever today's computed targets differ from
// the last snapshot, they're versioned into the daily_nutrition_targets
// table (dormant since its migration; it has the BMR/TDEE audit columns) —
// that history is what the M3 weight-trend loop reads.
// ---------------------------------------------------------------------------

import type { UserProfile, MacroTargets, WorkoutDay } from './types'
import { calculateDailyMacros, getStaticDailyMacros, computeBMR, computeStaticTDEE, resolveBodyMetrics } from './macro-calculator'
import { getDailyMetrics, upsertNutritionTarget, getNutritionTargets } from './daily-tracking'
import { computeWeightTrend } from './weight-trend'
import { supabase } from './supabase'
import { getAppNow, getLocalDateString } from './dev-clock'

export interface ComputeTargetsOptions {
  /** Latest daily_metrics weigh-in, if any — overrides profile.weight_kg. */
  latestWeightKg?: number | null
  /** For DYNAMIC_CSCS mode: which day's targets. Defaults to today's weekday. */
  dayName?: string
  /** For DYNAMIC_CSCS mode: the plan whose focus drives the day's EEE estimate. */
  exercisePlan?: WorkoutDay[]
}

function effectiveProfile(profile: UserProfile, latestWeightKg?: number | null): UserProfile {
  if (latestWeightKg != null && latestWeightKg > 0 && latestWeightKg !== profile.weight_kg) {
    return { ...profile, weight_kg: latestWeightKg }
  }
  return profile
}

function todayName(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' })
}

/**
 * The one way to get macro targets. Respects the profile's selected
 * macro_calculation_mode (the chat used to receive frozen static numbers
 * regardless of mode) and prefers the latest weigh-in over onboarding
 * weight.
 */
/**
 * Null when the profile has no weight/height/age/sex — targets are ABSENT,
 * not estimated. Callers render the absence line and a way to add the
 * missing value; none of them substitute a figure.
 */
export function computeTargets(profile: UserProfile, opts: ComputeTargetsOptions = {}): MacroTargets | null {
  const eff = effectiveProfile(profile, opts.latestWeightKg)

  if ((profile.macro_calculation_mode || 'STANDARD_STATIC') === 'DYNAMIC_CSCS') {
    const day = opts.dayName ?? todayName()
    const result = calculateDailyMacros(eff, day, opts.exercisePlan ?? [])
    if (!result) return null
    return { calories: result.calories, protein: result.protein, carbs: result.carbs, fat: result.fat }
  }

  return getStaticDailyMacros(eff)
}

/** Most recent body-weight entry, or null when the user has never weighed in. */
export async function getLatestWeightKg(profileId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('weight_kg, date')
    .eq('profile_id', profileId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const kg = Number(data.weight_kg)
  return Number.isFinite(kg) && kg > 0 ? kg : null
}

/**
 * The first weigh-in ever recorded — the starting weight for someone who gave
 * none at sign-up. `select('*')` so no column list can break on a migration.
 */
export async function getEarliestWeightKg(profileId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('profile_id', profileId)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const kg = Number(data.weight_kg)
  return Number.isFinite(kg) && kg > 0 ? kg : null
}

/** Recent weigh-ins for the Nutrition tab's history list (newest first). */
export async function getRecentWeighIns(profileId: string, limit = 7): Promise<{ date: string; weight_kg: number }[]> {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('date, weight_kg')
    .eq('profile_id', profileId)
    .order('date', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data.map(row => ({ date: row.date, weight_kg: Number(row.weight_kg) }))
}

/**
 * A rolling-average move smaller than this is treated as day-to-day water/
 * food/sodium noise (commonly 1-2% of bodyweight), not a real enough trend
 * shift to retune calorie/macro targets over. Flat kg rather than a percent
 * of bodyweight — simpler to reason about and close enough across the
 * app's realistic bodyweight range that a percent-based band wasn't worth
 * the extra complexity.
 */
export const TARGET_WEIGHT_ANCHOR_THRESHOLD_KG = 1

/**
 * "TODAY", ONCE, for everything about weigh-ins and the targets they drive:
 * the person's own calendar date, on the app's clock.
 *
 * The weigh-in card has always saved a weigh-in on this date. The two
 * functions below read "today" as `new Date().toISOString()` — the UTC date —
 * until 9 Oct 2026, so between midnight and 1 am in British summer time
 * today's weigh-in was dated tomorrow as far as the 7-day window was
 * concerned, and under the developer clock the window sat on the machine's
 * date while the rows sat on the app's. One definition, used by all three.
 */
export function targetsToday(profileId: string | undefined): string {
  return getLocalDateString(getAppNow(profileId))
}

export interface EffectiveTargetWeight {
  /** The weight to feed into computeTargets — either a fresh 7-day average (the anchor moved) or last time's anchor held flat (the move was inside the noise band). Undefined when the user never gave a weight and has no weigh-ins: there is no anchor, and callers must not invent one. */
  weightKg: number | undefined
}

/*
 * `anchorMoved` WAS HERE AND IS GONE, 16 Sep 2026. It claimed in its own doc
 * comment to be "the signal a caller uses to decide whether a 'your target
 * changed' notice is warranted" — and it was read by nothing, ever, because
 * that job belongs to snapshotTargetsIfChanged's changedFromPrior and always
 * did. A moved ANCHOR does not always move a TARGET (rounding, a macro mode
 * that ignores the change), so acting on it would have announced changes that
 * did not happen.
 *
 * Recorded rather than silently deleted because it cost a wrong conclusion:
 * grepping for this name and finding no readers, I reported the whole notice
 * as missing. It exists. One identifier is not a feature.
 */

/**
 * The weight figure that should drive calorie/macro TARGETS — distinct from
 * getLatestWeightKg, which stays a single day's reading for DISPLAY purposes
 * ("your current weight is X") and is untouched by this. Reuses weight-
 * trend.ts's computeWeightTrend (the same 7-day rolling average already
 * driving the Dashboard chart) rather than a second averaging
 * implementation, and only moves the "anchor" once that average has shifted
 * at least TARGET_WEIGHT_ANCHOR_THRESHOLD_KG from whatever average last set
 * the standing target — see that constant's doc comment for why. The
 * anchor is read from/written to daily_nutrition_targets.calculated_weight_kg
 * (the same versioned snapshot table that already tracks BMR/TDEE per
 * change) so it stays consistent across devices rather than drifting per
 * client, the way a localStorage-only tracker would.
 */
/** fallbackWeightKg may be undefined when the user never gave a weight; callers then get whatever the weigh-in series holds, or nothing. */
export async function getEffectiveTargetWeightKg(
  profileId: string,
  fallbackWeightKg?: number,
): Promise<EffectiveTargetWeight> {
  const todayStr = targetsToday(profileId)
  const recentWeighIns = await getRecentWeighIns(profileId, 14)
  const trend = computeWeightTrend(
    recentWeighIns.map(w => ({ date: w.date, weightKg: w.weight_kg })),
    todayStr,
    null,
  )
  if (!trend) return { weightKg: fallbackWeightKg }

  const recentTargets = await getNutritionTargets(profileId, '1970-01-01', todayStr).catch(() => [])
  const lastAnchorKg = recentTargets.length > 0
    ? recentTargets[recentTargets.length - 1].calculated_weight_kg ?? null
    : null

  if (lastAnchorKg == null) return { weightKg: trend.rollingAvgKg }
  if (Math.abs(trend.rollingAvgKg - lastAnchorKg) >= TARGET_WEIGHT_ANCHOR_THRESHOLD_KG) {
    return { weightKg: trend.rollingAvgKg }
  }
  return { weightKg: lastAnchorKg }
}

export interface SnapshotResult {
  /** True whenever a new row was written — includes a profile's very first-ever snapshot, which is not "the target changed" (there was nothing to change FROM). */
  snapshotted: boolean
  /** True only when a new row was written AND a prior snapshot existed with genuinely different numbers — the one signal a caller should use to show a "your target changed" notice. */
  changedFromPrior: boolean
  /**
   * The targets this replaced — present exactly when changedFromPrior is true.
   *
   * ADDED 16 Sep 2026 because the notice could not say what it changed FROM.
   * "Your calorie target updated to 2,400 kcal" is a number with nothing to
   * measure it against, and CLAUDE.md's standing rule from the implement
   * ceilings is that when the app quotes a number it says where that number
   * sits, or the person cannot go and check it.
   */
  previous: MacroTargets | null
}

/**
 * Version today's effective targets into daily_nutrition_targets when they
 * differ from the most recent snapshot (or none exists). Fire-and-forget
 * from the caller's perspective — a failed snapshot must never block
 * rendering targets. `anchorWeightKg` should be the SAME weight that
 * produced `targets` (getEffectiveTargetWeightKg's result for the living-
 * targets path, or plain profile.weight_kg at onboarding) — persisted into
 * calculated_weight_kg so the next call can read it back as "the anchor
 * targets last moved from."
 */
/**
 * targets may be null — no body metrics means there is no target to record.
 * Accepting null here rather than at each of the four call sites keeps the
 * rule in ONE place: a fabricated figure must never reach the database,
 * where nothing downstream could tell it from a measured one.
 */
export async function snapshotTargetsIfChanged(
  profileId: string,
  profile: UserProfile,
  targets: MacroTargets | null,
  anchorWeightKg?: number | null,
): Promise<SnapshotResult> {
  if (!targets) return { snapshotted: false, changedFromPrior: false, previous: null }
  try {
    const today = targetsToday(profileId)
    const recent = await getNutritionTargets(profileId, '1970-01-01', today)
    const last = recent.length > 0 ? recent[recent.length - 1] : null

    const unchanged =
      last != null &&
      last.target_calories === targets.calories &&
      last.target_protein_g === targets.protein &&
      last.target_carbs_g === targets.carbs &&
      last.target_fats_g === targets.fat

    if (unchanged) return { snapshotted: false, changedFromPrior: false, previous: null }

    const eff = effectiveProfile(profile, anchorWeightKg)
    // No body metrics means no target to snapshot — persisting a computed
    // row here would recreate the fabricated number this change removes.
    const metrics = resolveBodyMetrics(eff)
    if (!metrics) return { snapshotted: false, changedFromPrior: false, previous: null }
    const bmr = computeBMR(metrics)
    await upsertNutritionTarget({
      profile_id: profileId,
      date: today,
      workout_split: 'REST',
      target_calories: targets.calories,
      target_protein_g: targets.protein,
      target_carbs_g: targets.carbs,
      target_fats_g: targets.fat,
      calculated_bmr: bmr,
      calculated_tdee: computeStaticTDEE(bmr, eff.activity_level),
      calculated_weight_kg: anchorWeightKg ?? eff.weight_kg,
    })
    return {
      snapshotted: true,
      changedFromPrior: last != null,
      previous: last == null ? null : {
        calories: last.target_calories,
        protein: last.target_protein_g,
        carbs: last.target_carbs_g,
        fat: last.target_fats_g,
      },
    }
  } catch (err) {
    console.error('Target snapshot failed (non-blocking):', err)
    return { snapshotted: false, changedFromPrior: false, previous: null }
  }
}

/**
 * THE FIRST ANCHOR, written the moment the plan is made.
 *
 * Ashley's ruling: targets follow a 7-day average and only move once it has
 * shifted 1 kg from the average that last set them. Until 9 Oct 2026 nothing
 * recorded what "last set them" was at sign-up — onboarding set the targets
 * and never wrote a snapshot — so for the whole first session there was no
 * anchor, and the first weigh-in BECAME it. Sign up at 82 kg, weigh in at
 * 81.2 the same day, and the calorie target moved from 1,697 to 1,689 with no
 * notice (test log H10): a 0.8 kg move the rule exists to ignore.
 *
 * Returns the anchor it wrote, or null when there is no weight or no target
 * to anchor to — nothing is invented.
 */
export async function anchorTargetsAtSignUp(
  profileId: string,
  profile: UserProfile,
  targets: MacroTargets | null,
): Promise<number | null> {
  const startKg = profile.weight_kg
  if (!targets || startKg == null || !(startKg > 0)) return null
  await snapshotTargetsIfChanged(profileId, profile, targets, startKg)
  return startKg
}

export interface WeighInRetarget {
  /** The newest weigh-in — for display ("your current weight is X"). */
  latestWeightKg: number | null
  /** The weight the targets are computed from now: the anchor, held or moved. */
  anchorKg: number | null
  targets: MacroTargets | null
  /** Settles when the change, if there was one, has been recorded — and says what it replaced, for the notice. */
  recorded: Promise<SnapshotResult>
}

/**
 * Everything a new weigh-in does to the targets, in the one order it has to
 * happen: read the newest weight, ask whether the 7-day average has moved the
 * anchor, compute the targets from the anchor, record them if they changed.
 *
 * It lived inline in App's weigh-in handler. It is here so the ruling it
 * carries can be RUN by a gate (test:weigh-in-targets) instead of read.
 */
export async function retargetAfterWeighIn(
  profileId: string,
  profile: UserProfile,
  exercisePlan?: WorkoutDay[],
): Promise<WeighInRetarget> {
  const latestWeightKg = await getLatestWeightKg(profileId).catch(() => null)
  // A fresh weigh-in is exactly the case the anchor threshold exists for —
  // recompute it (it may or may not actually move) rather than assuming this
  // new reading itself is the new anchor.
  const effective = await getEffectiveTargetWeightKg(profileId, latestWeightKg ?? profile.weight_kg)
  const anchorKg = effective.weightKg ?? null
  const targets = computeTargets(profile, { latestWeightKg: anchorKg, exercisePlan })
  return { latestWeightKg, anchorKg, targets, recorded: snapshotTargetsIfChanged(profileId, profile, targets, anchorKg) }
}
