// ---------------------------------------------------------------------------
// THE MACRO SPLIT, FROM THE CHAT (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (b) 9; the lead's order).
//
// Nutrition → "How your targets are set" picks Balanced / Higher protein / Lower carb / Higher carb (MacroSplitCard).
// The coach could not ("can I have more protein?" got advice and no change). This plans the same change the card makes:
//
//   - PRESETS ONLY. The card writes a preset's own values through presetSplitFor (a beginner's protein 0.4 g/kg lower,
//     macro-calculator.ts); the coach does the same. A custom gram figure is the screen's slider, and a number typed by
//     the coach would be a nutrition prescription nobody checked, so "exactly 180 g" is pointed at the custom slider.
//   - THE NUMBERS ARE THE APP'S: before and after are getMacroDerivation on the profile as it is and as it would be, the
//     derivation the Nutrition tab draws, so the card cannot show grams the screen would not.
//   - THE CONDITIONING GOAL has its own fixed split and ignores this one: the card says so in the screen's own words
//     (NutritionDisplay's disabledReason) and changes nothing.
//   - CALORIES DO NOT MOVE; only how they divide. The card says it, and that the meals were sized to the old numbers.
// ---------------------------------------------------------------------------
import { getMacroDerivation, presetSplitFor, MACRO_SPLIT_PRESET_VALUES, type MacroSplitPreset } from '../macro-calculator'
import type { UserProfile } from '../types'

type Preset = Exclude<MacroSplitPreset, 'custom'>

export type MacroSplitPlan =
  | { ok: true; preset: Preset; patch: Pick<UserProfile, 'macro_split_preset' | 'macro_protein_per_kg' | 'macro_fat_percent'>; lead: string; rows: { field: string; before: string; after: string }[]; note: string }
  | { ok: false; reason: string }

/** NutritionDisplay's own words for the conditioning goal. */
export const CONDITIONING_SPLIT_REASON = 'Not used for the conditioning goal, which has its own fixed 20% protein / 25% fat / 55% carb split.'

export const MACRO_SPLIT_REFUSALS = {
  which: 'Which split: balanced, higher protein, lower carb or higher carb?',
  custom: 'Exact grams are set with the custom split on Nutrition, under how your targets are set. The coach sets the four presets only.',
  same: (label: string) => `You're already on ${label}.`,
  noTargets: "I can't work out your targets yet: your weight and height are needed first.",
}

/** The preset his words name, or 'custom' for an exact figure, or null. Never a guess between two. */
export function readMacroPreset(said: string): Preset | 'custom' | null {
  const s = said.trim().toLowerCase()
  if (/\d/.test(s)) return 'custom'
  if (/^(balanced|default|normal|standard|even)( split)?$/.test(s)) return 'balanced'
  if (/^(higher|more|high) protein$/.test(s)) return 'higher_protein'
  if (/^(lower|less|low) carbs?$|^(higher|more) fat$/.test(s)) return 'lower_carb'
  if (/^(higher|more|high) carbs?$/.test(s)) return 'higher_carb'
  return null
}

export function planMacroSplit(profile: UserProfile, said: string): MacroSplitPlan {
  const preset = readMacroPreset(said)
  if (preset === null) return { ok: false, reason: MACRO_SPLIT_REFUSALS.which }
  if (preset === 'custom') return { ok: false, reason: MACRO_SPLIT_REFUSALS.custom }
  const before = getMacroDerivation(profile)
  if (!before) return { ok: false, reason: MACRO_SPLIT_REFUSALS.noTargets }
  if (!before.splitApplies) return { ok: false, reason: CONDITIONING_SPLIT_REASON }
  const label = MACRO_SPLIT_PRESET_VALUES[preset].label
  if (before.split.preset === preset) return { ok: false, reason: MACRO_SPLIT_REFUSALS.same(label) }

  const values = presetSplitFor(preset, profile)
  const patch = { macro_split_preset: preset, macro_protein_per_kg: values.proteinPerKg, macro_fat_percent: values.fatPercent }
  const after = getMacroDerivation({ ...profile, ...patch })
  if (!after) return { ok: false, reason: MACRO_SPLIT_REFUSALS.noTargets }
  const g = (n: number) => `${Math.round(n)} g`
  const rows = (['protein', 'carbs', 'fat'] as const)
    .filter(k => before.target[k] !== after.target[k])
    .map(k => ({ field: k.charAt(0).toUpperCase() + k.slice(1), before: g(before.target[k]), after: g(after.target[k]) }))
  return {
    ok: true, preset, patch, rows,
    lead: `Want me to switch your split to ${label}? ${MACRO_SPLIT_PRESET_VALUES[preset].description}`,
    note: `Calories stay at about ${Math.round(after.target.calories).toLocaleString('en-GB')} a day; only how they divide changes. Your meals were sized to the old numbers.`,
  }
}
