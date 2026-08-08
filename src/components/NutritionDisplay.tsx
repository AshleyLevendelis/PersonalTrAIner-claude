import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calculator, Layers } from 'lucide-react'
import type { MacroTargets, UserProfile, WorkoutDay, MacroCalculationMode } from '@/lib/types'
import { calculateWeeklySchedule, getMacroDerivation } from '@/lib/macro-calculator'

export interface NutritionDisplayProps {
  profile: UserProfile
  macros: MacroTargets
  exercisePlan?: WorkoutDay[]
  /** Latest daily_metrics weigh-in — overrides the immutable onboarding weight in every displayed number (living targets, M0). */
  latestWeightKg?: number | null
  onMacroModeChange?: (mode: MacroCalculationMode) => void
}

export function NutritionDisplay({ profile, exercisePlan = [], latestWeightKg, onMacroModeChange }: NutritionDisplayProps) {
  // Living targets (M0): BMR/TDEE were previously read from the frozen
  // fitness_profiles columns (computed once at onboarding); they're now
  // derived live from the same effective-weight profile the macros use, so
  // a new weigh-in updates every number on this tab together.
  const effectiveProfile = latestWeightKg != null && latestWeightKg > 0
    ? { ...profile, weight_kg: latestWeightKg }
    : profile
  const mode = profile.macro_calculation_mode || 'STANDARD_STATIC'
  // Turn 10: the derivation always explains the STATIC baseline (BMR → TDEE
  // → goal adjustment → target) regardless of which method is active below —
  // "where your numbers come from" is a fixed chain of math, not a
  // restatement of whichever schedule happens to be selected.
  const derivation = getMacroDerivation(effectiveProfile)

  const weeklySchedule = mode === 'DYNAMIC_CSCS'
    ? calculateWeeklySchedule(effectiveProfile, exercisePlan)
    : null

  const derivationRows = [
    { label: 'Basal metabolic rate', sub: `From ${effectiveProfile.weight_kg} kg, ${effectiveProfile.height_cm} cm, ${effectiveProfile.age} y`, value: `${derivation.bmr}` },
    { label: 'Daily expenditure', sub: `BMR × activity level`, value: `${derivation.tdee}` },
    { label: derivation.surplusLabel, sub: derivation.surplusKcal === 0 ? 'No adjustment at maintenance' : 'Applied for your current goal', value: `${derivation.surplusKcal > 0 ? '+' : ''}${derivation.surplusKcal}` },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">How your targets are set</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col">
            {derivationRows.map(row => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-3.5" style={{ borderTop: '1px solid var(--hairline, var(--border))' }}>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{row.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.sub}</p>
                </div>
                <span className="tabular-mono shrink-0 text-sm">{row.value}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 py-3.5" style={{ borderTop: '1px solid var(--hairline, var(--border))' }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Daily target</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Protein 2 g/kg · fat 25% · carbs the remainder</p>
              </div>
              <span className="ds-num-tile tabular-mono glow-mint-lg shrink-0 text-[18px]">{derivation.target.calories}</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Every figure here recomputes from your latest weigh-in. Today's progress against this target is the ring on Home.
          </p>
        </CardContent>
      </Card>

      {mode === 'DYNAMIC_CSCS' && weeklySchedule && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Weekly Dynamic Targets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => {
                const d = weeklySchedule[day]
                return (
                  <div
                    key={day}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      d.dayType === 'training' ? 'bg-[color:var(--role-warn-bg)]' : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize w-20">{day.slice(0, 3)}</span>
                      <Badge variant={d.dayType === 'training' ? 'warning' : 'outline'} className="text-[10px]">
                        {d.dayType === 'training' ? 'Train' : 'Rest'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span>{d.calories} kcal</span>
                      <span className="text-[color:var(--chart-2)]">P{d.protein}g</span>
                      <span className="text-[color:var(--role-warn)]">C{d.carbs}g</span>
                      <span className="text-text-tertiary">F{d.fat}g</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/*
        Fix — Nutrition Method demoted to the bottom of the tab. It's a
        set-once decision (how the numbers above get computed), not daily
        reading, so it was competing for prime position with numbers the
        user actually checks every day. Kept IN this tab rather than moved
        into ProfileScreen/Settings: it's the toggle that directly controls
        the two target cards immediately above it on this same screen —
        burying it in a separate settings surface would put the control and
        the numbers it governs in two different places for what is a
        genuinely rare edit, with no offsetting benefit (there's no daily-use
        cost to it sitting at the bottom of an already-short tab).
      */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Nutrition Method</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {mode === 'STANDARD_STATIC' ? 'Standard' : 'Dynamic CSCS'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onMacroModeChange?.('STANDARD_STATIC')}
              className={`w-full rounded-lg border p-3 text-left transition-all cursor-pointer ${
                mode === 'STANDARD_STATIC'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                  mode === 'STANDARD_STATIC' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  <Calculator className="size-3.5" />
                </div>
                <div>
                  <p className="font-medium text-xs text-foreground">Standard Static</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Same macros every day</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onMacroModeChange?.('DYNAMIC_CSCS')}
              className={`w-full rounded-lg border p-3 text-left transition-all cursor-pointer ${
                mode === 'DYNAMIC_CSCS'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                  mode === 'DYNAMIC_CSCS' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  <Layers className="size-3.5" />
                </div>
                <div>
                  <p className="font-medium text-xs text-foreground">Dynamic CSCS</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Carb-cycles by training day</p>
                </div>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
