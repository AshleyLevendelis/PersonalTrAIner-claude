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
 * Version today's effective targets into daily_nutrition_targets when they
 * differ from the most recent snapshot (or none exists). Fire-and-forget
 * from the caller's perspective — a failed snapshot must never block
 * rendering targets. Returns whether a snapshot was written.
 */
export async function snapshotTargetsIfChanged(
  profileId: string,
  profile: UserProfile,
  targets: MacroTargets,
  latestWeightKg?: number | null,
): Promise<boolean> {
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

    if (unchanged) return false

    const eff = effectiveProfile(profile, latestWeightKg)
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
    })
    return true
  } catch (err) {
    console.error('Target snapshot failed (non-blocking):', err)
    return false
  }
}
