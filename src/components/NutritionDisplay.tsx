import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calculator, Layers } from 'lucide-react'
import { MealPlan } from '@/components/MealPlan'
import { WeighInCard } from '@/components/WeighInCard'
import { MacroSplitCard } from '@/components/MacroSplitCard'
import type { MacroTargets, UserProfile, WorkoutDay, MacroCalculationMode } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import { calculateWeeklySchedule, getMacroDerivation } from '@/lib/macro-calculator'

export interface NutritionDisplayProps {
  profile: UserProfile
  macros: MacroTargets
  exercisePlan?: WorkoutDay[]
  /** Latest daily_metrics weigh-in — overrides the immutable onboarding weight in every displayed number (living targets, M0). */
  latestWeightKg?: number | null
  onMacroModeChange?: (mode: MacroCalculationMode) => void
  /** Fired after WeighInCard saves so App.tsx can recompute targets + latestWeightKg. */
  onWeightLogged?: () => void | Promise<void>
  /** Macro-accuracy round, Part 2 — fired on any macro-split edit (preset tap or a Custom-mode slider). */
  onMacroSplitChange?: (patch: Partial<UserProfile>) => void
  // Turn 12 ("one owner per fact") — meals moved here from the retired
  // Meals tab: Nutrition answers "what am I eating and where do my numbers
  // come from", so the meal list belongs beside its own targets, not on a
  // separate tab. Props below are MealPlan's own, threaded through
  // unchanged from App.tsx (same values it passed to <MealPlan> before).
  profileId: string | undefined
  date: string
  pools: Partial<Record<MealSlotName, PoolOption[]>>
  chosen: Partial<Record<MealSlotName, PoolOption>>
  mealTotals: MacroTargets
  isGeneratingMeals: boolean
  mealRegenerateError?: string | null
  onDismissRegenerateError?: () => void
  onSwapMealSlot: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerateMealSlot: (slot: MealSlotName) => Promise<void>
  onRegenerateAllMeals: () => Promise<void>
}

export function NutritionDisplay({
  profile, macros, exercisePlan = [], latestWeightKg, onMacroModeChange, onWeightLogged, onMacroSplitChange,
  profileId, date, pools, chosen, mealTotals, isGeneratingMeals, mealRegenerateError, onDismissRegenerateError,
  onSwapMealSlot, onRegenerateMealSlot, onRegenerateAllMeals,
}: NutritionDisplayProps) {
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

  return (
    <div className="space-y-6">
      <MealPlan
        profileId={profileId}
        date={date}
        pools={pools}
        chosen={chosen}
        totals={mealTotals}
        targets={macros}
        isGenerating={isGeneratingMeals}
        regenerateError={mealRegenerateError}
        onDismissRegenerateError={onDismissRegenerateError}
        onSwapSlot={onSwapMealSlot}
        onRegenerateSlot={onRegenerateMealSlot}
        onRegenerateAll={onRegenerateAllMeals}
      />

      {/* Turn 12: the stacked rows-with-sub-explanation layout (turn 10)
          compresses into a single always-visible 4-column strip — BMR/TDEE/
          adjustment/target, no expand needed. The "how it's derived" prose
          moves to the caption below; the numbers themselves are the whole
          point of this card now that meals sit above it. */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">How your targets are set</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <p className="tabular-mono text-[17px] font-bold tracking-[-.03em]">{derivation.bmr}</p>
              <p className="mt-0.5 text-[8.5px] uppercase tracking-[.14em] text-muted-foreground">BMR</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="tabular-mono text-[17px] font-bold tracking-[-.03em]">{derivation.tdee}</p>
              <p className="mt-0.5 text-[8.5px] uppercase tracking-[.14em] text-muted-foreground">TDEE</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="tabular-mono text-[17px] font-bold tracking-[-.03em]">{derivation.surplusKcal > 0 ? '+' : ''}{derivation.surplusKcal}</p>
              <p className="mt-0.5 text-[8.5px] uppercase tracking-[.14em] text-muted-foreground">{derivation.surplusLabel.split(' ')[0]}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="tabular-mono text-[17px] font-bold tracking-[-.03em] text-primary glow-mint">{derivation.target.calories}</p>
              <p className="mt-0.5 text-[8.5px] uppercase tracking-[.14em] text-muted-foreground">Target</p>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] leading-normal text-muted-foreground">
            {derivation.splitApplies
              ? `From ${effectiveProfile.weight_kg} kg, ${effectiveProfile.height_cm} cm, ${effectiveProfile.age} y · protein ${derivation.split.proteinPerKg.toFixed(1)} g/kg · fat ${Math.round(derivation.split.fatPercent * 100)}% · carbs the remainder.`
              : `From ${effectiveProfile.weight_kg} kg, ${effectiveProfile.height_cm} cm, ${effectiveProfile.age} y · a fixed 20% protein / 25% fat / 55% carb split for conditioning goals.`}
          </p>
        </CardContent>
      </Card>

      <div>
        <p className="ds-label">Weigh-in</p>
        <div className="mt-2.5">
          {profile.id && <WeighInCard profileId={profile.id} onWeightLogged={onWeightLogged} />}
        </div>
      </div>

      <MacroSplitCard
        profile={profile}
        effectiveWeightKg={effectiveProfile.weight_kg}
        calorieTarget={macros.calories}
        applies={mode === 'STANDARD_STATIC' && profile.fitness_goal !== 'conditioning'}
        disabledReason={
          profile.fitness_goal === 'conditioning'
            ? 'Not available for the conditioning goal, which uses its own fixed 20% protein / 25% fat / 55% carb split rather than a bodyweight-anchored one.'
            : 'Not available in Dynamic CSCS mode, which varies protein and carbs by training day using its own periodization — switch to Standard Static (below) to use this control.'
        }
        onChange={patch => onMacroSplitChange?.(patch)}
        isGeneratingMeals={isGeneratingMeals}
        onRegenerateAllMeals={onRegenerateAllMeals}
      />

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
