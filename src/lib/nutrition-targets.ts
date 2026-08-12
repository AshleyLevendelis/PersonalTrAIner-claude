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
import { calculateDailyMacros, getStaticDailyMacros, computeBMR, computeStaticTDEE } from './macro-calculator'
import { getDailyMetrics, upsertNutritionTarget, getNutritionTargets } from './daily-tracking'
import { computeWeightTrend } from './weight-trend'
import { supabase } from './supabase'

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
export function computeTargets(profile: UserProfile, opts: ComputeTargetsOptions = {}): MacroTargets {
  const eff = effectiveProfile(profile, opts.latestWeightKg)

  if ((profile.macro_calculation_mode || 'STANDARD_STATIC') === 'DYNAMIC_CSCS') {
    const day = opts.dayName ?? todayName()
    const result = calculateDailyMacros(eff, day, opts.exercisePlan ?? [])
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

export interface EffectiveTargetWeight {
  /** The weight to feed into computeTargets — either a fresh 7-day average (the anchor moved) or last time's anchor held flat (the move was inside the noise band). */
  weightKg: number
  /** True only when a PRIOR anchor existed and this call moved away from it — the signal a caller uses to decide whether a "your target changed" notice is warranted. False for a first-ever anchor (nothing to compare against) or a within-band move (nothing changed). */
  anchorMoved: boolean
}

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
export async function getEffectiveTargetWeightKg(
  profileId: string,
  fallbackWeightKg: number,
): Promise<EffectiveTargetWeight> {
  const todayStr = new Date().toISOString().split('T')[0]
  const recentWeighIns = await getRecentWeighIns(profileId, 14)
  const trend = computeWeightTrend(
    recentWeighIns.map(w => ({ date: w.date, weightKg: w.weight_kg })),
    todayStr,
    null,
  )
  if (!trend) return { weightKg: fallbackWeightKg, anchorMoved: false }

  const recentTargets = await getNutritionTargets(profileId, '1970-01-01', todayStr).catch(() => [])
  const lastAnchorKg = recentTargets.length > 0
    ? recentTargets[recentTargets.length - 1].calculated_weight_kg ?? null
    : null

  if (lastAnchorKg == null) return { weightKg: trend.rollingAvgKg, anchorMoved: false }
  if (Math.abs(trend.rollingAvgKg - lastAnchorKg) >= TARGET_WEIGHT_ANCHOR_THRESHOLD_KG) {
    return { weightKg: trend.rollingAvgKg, anchorMoved: true }
  }
  return { weightKg: lastAnchorKg, anchorMoved: false }
}

export interface SnapshotResult {
  /** True whenever a new row was written — includes a profile's very first-ever snapshot, which is not "the target changed" (there was nothing to change FROM). */
  snapshotted: boolean
  /** True only when a new row was written AND a prior snapshot existed with genuinely different numbers — the one signal a caller should use to show a "your target changed" notice. */
  changedFromPrior: boolean
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
export async function snapshotTargetsIfChanged(
  profileId: string,
  profile: UserProfile,
  targets: MacroTargets,
  anchorWeightKg?: number | null,
): Promise<SnapshotResult> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const recent = await getNutritionTargets(profileId, '1970-01-01', today)
    const last = recent.length > 0 ? recent[recent.length - 1] : null

    const unchanged =
      last != null &&
      last.target_calories === targets.calories &&
      last.target_protein_g === targets.protein &&
      last.target_carbs_g === targets.carbs &&
      last.target_fats_g === targets.fat

    if (unchanged) return { snapshotted: false, changedFromPrior: false }

    const eff = effectiveProfile(profile, anchorWeightKg)
    const bmr = computeBMR(eff)
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
    return { snapshotted: true, changedFromPrior: last != null }
  } catch (err) {
    console.error('Target snapshot failed (non-blocking):', err)
    return { snapshotted: false, changedFromPrior: false }
  }
}
