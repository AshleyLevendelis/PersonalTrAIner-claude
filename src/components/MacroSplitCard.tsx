// ---------------------------------------------------------------------------
// Macro-accuracy round, Part 2 — lets the user tune the protein-per-kg / fat-
// percentage split that drives their targets (carbs always take the
// remainder), instead of the app's fixed 2.0 g/kg / 25% default. Only
// meaningful for STANDARD_STATIC + a non-conditioning goal (see
// computeStaticMacros/getProfileMacroSplit in macro-calculator.ts) — the
// `applies` prop gates an explained-disabled state for every other case
// rather than silently doing nothing.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import {
  MACRO_SPLIT_PRESET_VALUES, DEFAULT_MACRO_SPLIT, PROTEIN_PER_KG_RANGE, FAT_PERCENT_RANGE,
  getProfileMacroSplit, computeMacroSplitTargets, presetSplitFor,
  type MacroSplitPreset,
} from '@/lib/macro-calculator'
import type { UserProfile } from '@/lib/types'
import { RING_COLOR } from '@/components/nutrition/NutritionRings'

const PRESET_ORDER: MacroSplitPreset[] = ['balanced', 'higher_protein', 'lower_carb', 'higher_carb', 'custom']

export interface MacroSplitCardProps {
  profile: UserProfile
  effectiveWeightKg: number
  calorieTarget: number
  /** False when the active mode/goal doesn't use this split — the card renders explained-disabled instead of controls. */
  applies: boolean
  /** Why the control doesn't apply right now — required when applies is false. */
  disabledReason?: string
  onChange: (patch: Partial<UserProfile>) => void
  isGeneratingMeals: boolean
  onRegenerateAllMeals: () => Promise<void>
}

export function MacroSplitCard({
  profile, effectiveWeightKg, calorieTarget, applies, disabledReason, onChange, isGeneratingMeals, onRegenerateAllMeals,
}: MacroSplitCardProps) {
  const split = getProfileMacroSplit(profile)
  const [dirty, setDirty] = useState(false)

  const preview = computeMacroSplitTargets(effectiveWeightKg, calorieTarget, split)
  const pct = (kcal: number) => (preview.calories > 0 ? Math.round((kcal / preview.calories) * 100) : 0)

  const applyPreset = (preset: MacroSplitPreset) => {
    if (preset === 'custom') {
      onChange({ macro_split_preset: 'custom', macro_protein_per_kg: split.proteinPerKg, macro_fat_percent: split.fatPercent })
    } else {
      const values = presetSplitFor(preset, profile)
      onChange({ macro_split_preset: preset, macro_protein_per_kg: values.proteinPerKg, macro_fat_percent: values.fatPercent })
    }
    setDirty(true)
  }

  const setCustomProtein = (proteinPerKg: number) => {
    onChange({ macro_split_preset: 'custom', macro_protein_per_kg: proteinPerKg, macro_fat_percent: split.fatPercent })
    setDirty(true)
  }
  const setCustomFat = (fatPercent: number) => {
    onChange({ macro_split_preset: 'custom', macro_protein_per_kg: split.proteinPerKg, macro_fat_percent: fatPercent })
    setDirty(true)
  }

  const handleRegenerate = async () => {
    await onRegenerateAllMeals()
    setDirty(false)
  }

  // THE SHEET'S OWN LOOK (25 Nov 2026, his "doesn't fit the aesthetics of the rest of the app anymore"): a section under a
  // label, never a card inside the sheet; the choices are the app's pills; each macro carries its ring's swatch.
  if (!applies) {
    return (
      <section className="border-t border-[color:var(--hairline)] pt-4" data-testid="macro-split">
        <p className="ds-label">Macro split</p>
        <p className="mt-2 text-[0.8125rem] leading-normal text-muted-foreground">{disabledReason}</p>
      </section>
    )
  }

  const rows: { key: 'protein' | 'carbs' | 'fat'; label: string; grams: number; share: number }[] = [
    { key: 'protein', label: 'Protein', grams: preview.protein, share: pct(preview.protein * 4) },
    { key: 'carbs', label: 'Carbs', grams: preview.carbs, share: pct(preview.carbs * 4) },
    { key: 'fat', label: 'Fat', grams: preview.fat, share: pct(preview.fat * 9) },
  ]

  return (
    <section className="border-t border-[color:var(--hairline)] pt-4" data-testid="macro-split">
      <p className="ds-label">Macro split</p>
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Macro split">
        {PRESET_ORDER.map(preset => {
          const active = split.preset === preset
          const label = preset === 'custom' ? 'Custom' : MACRO_SPLIT_PRESET_VALUES[preset].label
          return (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              aria-pressed={active}
              data-testid="macro-split-preset"
              className="min-h-11 rounded-full border px-4 text-[0.8125rem] font-semibold transition-colors"
              style={active
                ? { background: 'rgba(var(--glow-rgb), .14)', borderColor: 'rgba(var(--glow-rgb), .55)', color: 'var(--foreground)' }
                : { borderColor: 'var(--hairline)', color: 'var(--muted-foreground)' }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {split.preset === 'custom' && (
        <div className="mt-3 space-y-3">
          <label className="block space-y-1">
            <div className="flex items-center justify-between text-[0.8125rem]">
              <span className="text-muted-foreground">Protein</span>
              <span className="tabular-mono font-semibold">{split.proteinPerKg.toFixed(1)} g/kg{split.proteinPerKg === presetSplitFor('balanced', profile).proteinPerKg ? ' (default)' : ''}</span>
            </div>
            <input
              type="range"
              min={PROTEIN_PER_KG_RANGE.min}
              max={PROTEIN_PER_KG_RANGE.max}
              step={PROTEIN_PER_KG_RANGE.step}
              value={split.proteinPerKg}
              onChange={e => setCustomProtein(Number(e.target.value))}
              aria-label="Protein, grams per kilo"
              className="h-11 w-full accent-primary"
            />
          </label>
          <label className="block space-y-1">
            <div className="flex items-center justify-between text-[0.8125rem]">
              <span className="text-muted-foreground">Fat</span>
              <span className="tabular-mono font-semibold">{Math.round(split.fatPercent * 100)}%{split.fatPercent === DEFAULT_MACRO_SPLIT.fatPercent ? ' (default)' : ''}</span>
            </div>
            <input
              type="range"
              min={FAT_PERCENT_RANGE.min}
              max={FAT_PERCENT_RANGE.max}
              step={FAT_PERCENT_RANGE.step}
              value={split.fatPercent}
              onChange={e => setCustomFat(Number(e.target.value))}
              aria-label="Fat, share of calories"
              className="h-11 w-full accent-primary"
            />
          </label>
          <p className="text-[0.75rem] text-muted-foreground">Carbs always fill the rest of your calories.</p>
        </div>
      )}

      <div className="mt-3">
        {rows.map(r => (
          <div key={r.key} className="flex min-h-[40px] items-center gap-2.5" style={{ borderTop: '1px solid var(--hairline)' }} data-testid="macro-split-row" data-macro={r.key}>
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: RING_COLOR[r.key] }} />
            <span className="flex-1 text-[0.875rem] font-semibold">{r.label}</span>
            <span className="tabular-mono text-[0.875rem] font-bold">{r.grams} g</span>
            <span className="tabular-mono w-11 text-right text-[0.8125rem] text-muted-foreground">{r.share}%</span>
          </div>
        ))}
      </div>

      {(preview.clampedCarbFloor || preview.clampedFatFloor) && (
        <p className="mt-2 text-[0.75rem] text-[color:var(--role-warn-text)]">
          {preview.clampedFatFloor && 'Fat was raised to the 0.6g/kg floor — your requested percentage would have gone too low. '}
          {preview.clampedCarbFloor && 'Carbs were raised to the 50g floor — the remaining calories after protein and fat left less than that.'}
        </p>
      )}

      {preview.calories !== calorieTarget && (
        <p className="mt-2 text-[0.75rem] text-muted-foreground">
          Lands at {preview.calories} kcal ({preview.calories > calorieTarget ? '+' : ''}{preview.calories - calorieTarget} vs your {calorieTarget} kcal target) because of the floor above.
        </p>
      )}

      {dirty && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[color:var(--role-ai-bg)] px-3 py-2">
          <p className="text-[0.75rem] text-[color:var(--role-ai-text)]">Your meals were made for the old split.</p>
          <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={isGeneratingMeals} className="min-h-11 text-xs shrink-0">
            {isGeneratingMeals ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
            Regenerate meals
          </Button>
        </div>
      )}
    </section>
  )
}
