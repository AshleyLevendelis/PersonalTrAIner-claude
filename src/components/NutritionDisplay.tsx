import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Flame, Beef, Wheat, Droplets, Calculator, Layers } from 'lucide-react'
import type { MacroTargets, UserProfile, WorkoutDay, MacroCalculationMode } from '@/lib/types'
import { calculateWeeklySchedule, computeBMR, computeStaticTDEE } from '@/lib/macro-calculator'

export interface NutritionDisplayProps {
  profile: UserProfile
  macros: MacroTargets
  exercisePlan?: WorkoutDay[]
  /** Latest daily_metrics weigh-in — overrides the immutable onboarding weight in every displayed number (living targets, M0). */
  latestWeightKg?: number | null
  onMacroModeChange?: (mode: MacroCalculationMode) => void
}

export function NutritionDisplay({ profile, macros, exercisePlan = [], latestWeightKg, onMacroModeChange }: NutritionDisplayProps) {
  // Living targets (M0): BMR/TDEE were previously read from the frozen
  // fitness_profiles columns (computed once at onboarding); they're now
  // derived live from the same effective-weight profile the macros use, so
  // a new weigh-in updates every number on this tab together.
  const effectiveProfile = latestWeightKg != null && latestWeightKg > 0
    ? { ...profile, weight_kg: latestWeightKg }
    : profile
  const bmr = computeBMR(effectiveProfile)
  const tdee = computeStaticTDEE(bmr, effectiveProfile.activity_level)
  const mode = profile.macro_calculation_mode || 'STANDARD_STATIC'

  const weeklySchedule = mode === 'DYNAMIC_CSCS'
    ? calculateWeeklySchedule(effectiveProfile, exercisePlan)
    : null

  return (
    <div className="space-y-6">
      {mode === 'STANDARD_STATIC' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Daily Macronutrient Targets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Flame className="size-5 text-chart-1 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Calories</p>
                  <p className="text-xl font-semibold">{macros.calories}</p>
                  <p className="text-xs text-muted-foreground">kcal/day</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Beef className="size-5 text-chart-2 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Protein</p>
                  <p className="text-xl font-semibold">{macros.protein}g</p>
                  <p className="text-xs text-muted-foreground">{Math.round(macros.protein * 4 / macros.calories * 100)}%</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Wheat className="size-5 text-chart-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Carbs</p>
                  <p className="text-xl font-semibold">{macros.carbs}g</p>
                  <p className="text-xs text-muted-foreground">{Math.round(macros.carbs * 4 / macros.calories * 100)}%</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Droplets className="size-5 text-chart-5 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Fat</p>
                  <p className="text-xl font-semibold">{macros.fat}g</p>
                  <p className="text-xs text-muted-foreground">{Math.round(macros.fat * 9 / macros.calories * 100)}%</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Energy Expenditure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="ds-label">Basal Metabolic Rate (BMR)</p>
            <p className="ds-num-hero">{bmr} <span className="text-sm font-normal text-muted-foreground">kcal/day</span></p>
          </div>
          <Separator />
          <div>
            <p className="ds-label">Total Daily Energy Expenditure (TDEE)</p>
            <p className="ds-num-hero">{tdee} <span className="text-sm font-normal text-muted-foreground">kcal/day</span></p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
