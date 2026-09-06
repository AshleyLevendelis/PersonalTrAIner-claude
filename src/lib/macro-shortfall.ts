import type { MacroTargets } from '@/lib/types'

/**
 * The one sentence the Personal TrAIner says at the top of the Nutrition tab.
 *
 * Extracted from NutritionDisplay rather than left inline, for the reason
 * every other derivation in this repo lives in src/lib: a rule that decides
 * WHEN TO STAY SILENT cannot be checked by reading JSX. The two thresholds
 * below are the whole behaviour — say nothing when the day is on track, say
 * nothing when the gap is small enough that the next meal closes it anyway —
 * and both are now assertable (test:nutrition-layout §2).
 *
 * Calories are deliberately not a candidate. The kcal number is the hero
 * number six lines above this sentence; repeating it as prose would be the
 * screen telling you the same fact twice and calling one of them coaching.
 */

/** One planned meal for today, in the order the meal list renders them. */
export interface PlannedMeal {
  /** As the meal list labels it — "Dinner", not "dinner" or "DINNER". */
  label: string
  logged: boolean
  macros: MacroTargets
}

export interface ShortfallInput {
  /** Today's macro targets, or null when there is no body weight to compute them from. */
  targets: Pick<MacroTargets, 'protein' | 'carbs' | 'fat'> | null
  eaten: { protein: number; carbs: number; fat: number }
  waterTargetMl: number
  waterMl: number
  meals: PlannedMeal[]
}

/**
 * Under this share of the target still outstanding, nothing is said. Being a
 * little under at 4pm is the normal shape of a day, and a line that fires on
 * it is wallpaper by Wednesday.
 */
export const SHORTFALL_SPEAK_FRACTION = 0.34
/**
 * A planned meal is only named if it covers at least this much of what is
 * left. Naming one that barely dents the gap makes it look handled.
 */
export const COVERING_MIN_FRACTION = 0.2

type MacroKey = 'protein' | 'carbs' | 'fat'

export function macroShortfallLine(input: ShortfallInput): string | null {
  const { targets, eaten, waterTargetMl, waterMl, meals } = input
  const gaps: { label: string; key: MacroKey | 'water'; left: number; target: number; unit: string }[] = []
  if (targets) {
    gaps.push(
      { label: 'Protein', key: 'protein', left: targets.protein - eaten.protein, target: targets.protein, unit: 'g' },
      { label: 'Carbs', key: 'carbs', left: targets.carbs - eaten.carbs, target: targets.carbs, unit: 'g' },
      { label: 'Fat', key: 'fat', left: targets.fat - eaten.fat, target: targets.fat, unit: 'g' },
    )
  }
  gaps.push({ label: 'Water', key: 'water', left: waterTargetMl - waterMl, target: waterTargetMl, unit: 'ml' })

  // A target of zero is not a gap of 100% — it is a number nobody set.
  const behind = gaps.filter(g => g.target > 0 && g.left > 0)
  if (behind.length === 0) return null
  // ONLY THE WIDEST. Four "you're a bit under" lines is a list, and a list is
  // not a nudge.
  const worst = behind.reduce((a, b) => (b.left / b.target > a.left / a.target ? b : a))
  if (worst.left / worst.target < SHORTFALL_SPEAK_FRACTION) return null

  const left = `${Math.round(worst.left)}${worst.unit}`
  const bare = `${worst.label} is behind — ${left} to go.`
  // Water has no planned meal behind it (the app plans food, not drinks), so
  // that gap always gets the bare line rather than a meal that happens to
  // contain some liquid.
  if (worst.key === 'water') return bare

  const macroKey = worst.key
  const covering = meals
    .filter(m => !m.logged)
    .map(m => ({ label: m.label, amount: m.macros[macroKey] }))
    .sort((a, b) => b.amount - a.amount)[0]
  if (!covering || covering.amount < worst.left * COVERING_MIN_FRACTION) return bare

  // Capped at the gap: a 60g dinner against a 40g shortfall covers 40 of it,
  // not 60. The sentence is about what is missing, not about the meal.
  const covered = Math.round(Math.min(covering.amount, worst.left))
  return `${bare} Your ${covering.label.toLowerCase()} has ${covered}${worst.unit} of it, still to log.`
}
