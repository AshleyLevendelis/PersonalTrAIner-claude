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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import {
  MACRO_SPLIT_PRESET_VALUES, DEFAULT_MACRO_SPLIT, PROTEIN_PER_KG_RANGE, FAT_PERCENT_RANGE,
  getProfileMacroSplit, computeMacroSplitTargets,
  type MacroSplitPreset,
} from '@/lib/macro-calculator'
import type { UserProfile } from '@/lib/types'

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
      const values = MACRO_SPLIT_PRESET_VALUES[preset]
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

  if (!applies) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Macro Split</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Macro Split</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {PRESET_ORDER.map(preset => {
            const active = split.preset === preset
            const label = preset === 'custom' ? 'Custom' : MACRO_SPLIT_PRESET_VALUES[preset].label
            return (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                aria-pressed={active}
                className={`hit-slop-44 rounded-md border px-2 py-2 text-[0.6875rem] font-medium text-center transition-colors ${
                  active ? 'border-primary bg-primary/5 ring-1 ring-primary text-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {split.preset === 'custom' && (
          <div className="space-y-3 rounded-md bg-muted/30 p-3">
            <label className="block space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Protein</span>
                <span className="tabular-mono font-medium">{split.proteinPerKg.toFixed(1)} g/kg{split.proteinPerKg === DEFAULT_MACRO_SPLIT.proteinPerKg ? ' (default)' : ''}</span>
              </div>
              <input
                type="range"
                min={PROTEIN_PER_KG_RANGE.min}
                max={PROTEIN_PER_KG_RANGE.max}
                step={PROTEIN_PER_KG_RANGE.step}
                value={split.proteinPerKg}
                onChange={e => setCustomProtein(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </label>
            <label className="block space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fat</span>
                <span className="tabular-mono font-medium">{Math.round(split.fatPercent * 100)}%{split.fatPercent === DEFAULT_MACRO_SPLIT.fatPercent ? ' (default)' : ''}</span>
              </div>
              <input
                type="range"
                min={FAT_PERCENT_RANGE.min}
                max={FAT_PERCENT_RANGE.max}
                step={FAT_PERCENT_RANGE.step}
                value={split.fatPercent}
                onChange={e => setCustomFat(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </label>
            <p className="text-[0.625rem] text-muted-foreground">Carbs always fill the remainder of your calorie target.</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="tabular-mono text-[0.9375rem] font-bold">{preview.protein}g</p>
            <p className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground">Protein · {pct(preview.protein * 4)}%</p>
          </div>
          <div>
            <p className="tabular-mono text-[0.9375rem] font-bold">{preview.carbs}g</p>
            <p className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground">Carbs · {pct(preview.carbs * 4)}%</p>
          </div>
          <div>
            <p className="tabular-mono text-[0.9375rem] font-bold">{preview.fat}g</p>
            <p className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground">Fat · {pct(preview.fat * 9)}%</p>
          </div>
        </div>

        {(preview.clampedCarbFloor || preview.clampedFatFloor) && (
          <p className="text-[0.6875rem] text-[color:var(--role-warn-text)]">
            {preview.clampedFatFloor && 'Fat was raised to the 0.6g/kg floor — your requested percentage would have gone too low. '}
            {preview.clampedCarbFloor && 'Carbs were raised to the 50g floor — the remaining calories after protein and fat left less than that.'}
          </p>
        )}

        {preview.calories !== calorieTarget && (
          <p className="text-[0.6875rem] text-muted-foreground">
            Lands at {preview.calories} kcal ({preview.calories > calorieTarget ? '+' : ''}{preview.calories - calorieTarget} vs your {calorieTarget} kcal target) because of the floor above.
          </p>
        )}

        {dirty && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-[color:var(--role-ai-bg)] px-3 py-2">
            <p className="text-[0.6875rem] text-[color:var(--role-ai-text)]">Your meals were generated for the old split.</p>
            <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={isGeneratingMeals} className="h-7 text-xs shrink-0">
              {isGeneratingMeals ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
              Regenerate meals
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
