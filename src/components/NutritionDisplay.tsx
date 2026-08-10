import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calculator, Layers } from 'lucide-react'
import { MealPlan } from '@/components/MealPlan'
import { WeighInCard } from '@/components/WeighInCard'
import { MacroSplitCard } from '@/components/MacroSplitCard'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getTodayLedger } from '@/lib/meal-store'
import { getAllLogs as getAllWaterLogs, logWater, undoLog as undoWaterLog, setWaterTargetMl, type WaterLogRow } from '@/lib/water-store'
import type { MacroTargets, UserProfile, WorkoutDay, MacroCalculationMode } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import { calculateWeeklySchedule, getMacroDerivation } from '@/lib/macro-calculator'

const WATER_QUICK_ADD_ML = [250, 500]

// Tab-restructure handoff — the ring meter moves here from Dashboard.tsx and
// grows a 5th (outermost) water ring, each ring now its own colour instead
// of one hue fading in opacity: water lives on the same tab as the ring
// meter now, so it earns its own visual identity (--chart-3, matching the
// water row/quick-adds below) rather than borrowing the mint accent.
// Calories keeps the hero-number treatment (not a legend row); the other
// three rings + water get a legend row each — four rows, not five, matching
// the design reference's own rendered screen (its prose says "five legend
// rows" but the reference screen itself shows four: water/protein/carbs/fat).
const NUTRITION_RINGS = [
  { key: 'water', r: 50, strokeWidth: 3, color: 'var(--chart-3)' },
  { key: 'calories', r: 40, strokeWidth: 8, color: 'var(--primary)' },
  { key: 'protein', r: 30, strokeWidth: 5, color: 'var(--role-ai)' },
  { key: 'carbs', r: 22, strokeWidth: 5, color: 'var(--role-warn)' },
  { key: 'fat', r: 14, strokeWidth: 5, color: 'var(--text-tertiary)' },
] as const
const NUTRITION_RING_CIRC: Record<string, number> = Object.fromEntries(NUTRITION_RINGS.map(r => [r.key, 2 * Math.PI * r.r]))

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
  /** Surfacing round — a dietary_preferences value the app can't enforce. Distinct from mealRegenerateError: not dismissable, routes to Profile instead of offering a retry. */
  unrecognisedDietaryRestrictions?: string[] | null
  onFixDietaryRestrictions?: () => void
  onSwapMealSlot: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerateMealSlot: (slot: MealSlotName) => Promise<void>
  onRegenerateAllMeals: () => Promise<void>
}

export function NutritionDisplay({
  profile, macros, exercisePlan = [], latestWeightKg, onMacroModeChange, onWeightLogged, onMacroSplitChange,
  profileId, date, pools, chosen, mealTotals, isGeneratingMeals, mealRegenerateError, onDismissRegenerateError,
  unrecognisedDietaryRestrictions, onFixDietaryRestrictions,
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

  // Tab-restructure handoff — "one owner per fact": Nutrition now owns the
  // macro ring meter and water logging (moved off Dashboard.tsx). Both are
  // self-contained reads, mirroring how MealPlan.tsx already independently
  // fetches getTodayLedger for its own logged-state — not threaded through
  // App.tsx, since nothing else in the tree needs this data.
  const { dayName } = useActiveSession()
  const [eaten, setEaten] = useState({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const [waterLogs, setWaterLogs] = useState<WaterLogRow[]>([])
  const [waterTarget, setWaterTarget] = useState(profile.water_target_ml ?? 2000)
  const [editingWaterTarget, setEditingWaterTarget] = useState(false)
  const [waterTargetInput, setWaterTargetInput] = useState(String(profile.water_target_ml ?? 2000))
  const [lastWaterLog, setLastWaterLog] = useState<WaterLogRow | null>(null)

  useEffect(() => {
    if (!profileId || !date) return
    getTodayLedger(profileId, date, macros).then(l => setEaten(l.eaten)).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, date, mealTotals])

  useEffect(() => {
    if (!profileId) return
    void getAllWaterLogs(profileId).then(setWaterLogs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, date])

  useEffect(() => { setWaterTarget(profile.water_target_ml ?? 2000) }, [profile.water_target_ml])

  const todayWaterMl = waterLogs.filter(l => l.date === date).reduce((s, l) => s + l.amount_ml, 0)

  const handleAddWater = (amountMl: number) => {
    if (!profileId || !date) return
    const row = logWater({ profileId, date, amountMl, source: 'manual' })
    setWaterLogs(prev => [...prev, row])
    setLastWaterLog(row)
  }
  const handleUndoWater = () => {
    if (!lastWaterLog) return
    undoWaterLog(lastWaterLog)
    setWaterLogs(prev => prev.filter(l => l.id !== lastWaterLog.id))
    setLastWaterLog(null)
  }
  const handleSaveWaterTarget = async () => {
    const n = Number(waterTargetInput)
    if (!profileId || !Number.isFinite(n) || n <= 0) { setEditingWaterTarget(false); return }
    setWaterTarget(n)
    setEditingWaterTarget(false)
    await setWaterTargetMl(profileId, n)
  }

  const ringValues: Record<string, { eaten: number; target: number }> = {
    water: { eaten: todayWaterMl, target: waterTarget },
    calories: { eaten: eaten.kcal, target: macros.calories },
    protein: { eaten: eaten.protein, target: macros.protein },
    carbs: { eaten: eaten.carbs, target: macros.carbs },
    fat: { eaten: eaten.fat, target: macros.fat },
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="ds-label">Nutrition · {dayName}</p>

        <div className="mt-3.5 flex items-center gap-[18px]">
          <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0">
            {NUTRITION_RINGS.map(r => (
              <circle key={`track-${r.key}`} cx="56" cy="56" r={r.r} fill="none" stroke="var(--surface-raised)" strokeWidth={r.strokeWidth} />
            ))}
            {NUTRITION_RINGS.map(r => {
              const { eaten: e, target: t } = ringValues[r.key]
              const circ = NUTRITION_RING_CIRC[r.key]
              const frac = t > 0 ? Math.min(1, e / t) : 0
              return (
                <circle
                  key={`fill-${r.key}`}
                  cx="56" cy="56" r={r.r} fill="none" strokeWidth={r.strokeWidth} strokeLinecap="round"
                  stroke={r.color}
                  strokeDasharray={`${circ * frac} ${circ}`}
                  transform="rotate(-90 56 56)"
                  className={r.key === 'calories' ? 'glow-icon' : undefined}
                  style={{ transition: 'stroke-dasharray 400ms ease' }}
                />
              )
            })}
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="ds-num-mega tabular-mono text-[#E4FCF4] glow-mint-lg">{Math.round(eaten.kcal)}</p>
              <p className="mt-1 text-[10.5px] uppercase tracking-[.16em] text-muted-foreground">
                kcal · of <span className="tabular-mono">{Math.round(macros.calories)}</span>
              </p>
            </div>
            <div className="flex flex-col gap-[6px]">
              {([
                { key: 'water', label: 'Water', unit: 'ml' },
                { key: 'protein', label: 'Protein', unit: 'g' },
                { key: 'carbs', label: 'Carbs', unit: 'g' },
                { key: 'fat', label: 'Fat', unit: 'g' },
              ] as const).map(row => {
                const ring = NUTRITION_RINGS.find(r => r.key === row.key)!
                const { eaten: e, target: t } = ringValues[row.key]
                return (
                  <div key={row.key} className="flex items-baseline gap-[9px]">
                    <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: ring.color }} />
                    <span className="flex-1 text-[10px] uppercase tracking-[.16em] text-muted-foreground">{row.label}</span>
                    <span className="tabular-mono text-[12.5px]">
                      {Math.round(e)}<span className="text-muted-foreground"> / {Math.round(t)}{row.unit}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Water logging row — moved off Dashboard.tsx. Quick-adds and the
            progress bar use --chart-3 (blue) to match the water ring above,
            deliberately not the mint accent — this is the one place on the
            app where the mint "on-track" colour doesn't apply, since water
            isn't a macro target the split card governs. */}
        <div className="flex items-baseline justify-between pt-3.5 pb-2.5" style={{ borderTop: '1px solid var(--hairline)' }}>
          <span className="text-[13px] text-text-tertiary">Water</span>
          {editingWaterTarget ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={waterTargetInput}
                onChange={e => setWaterTargetInput(e.target.value)}
                className="h-7 w-16 min-w-0 rounded-md bg-[color:var(--surface-raised)] px-1.5 text-xs"
              />
              <Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-[10px]" onClick={handleSaveWaterTarget}>Save</Button>
            </div>
          ) : (
            <span className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
              <span className="tabular-mono text-[13px]">{todayWaterMl} / {waterTarget} ml</span>
              {WATER_QUICK_ADD_ML.map(ml => (
                <button key={ml} className="text-xs font-semibold" style={{ color: 'var(--chart-3)' }} onClick={() => handleAddWater(ml)}>+{ml}</button>
              ))}
              <button className="text-xs text-muted-foreground" onClick={() => { setWaterTargetInput(String(waterTarget)); setEditingWaterTarget(true) }}>edit</button>
              {lastWaterLog && (
                <button className="text-xs text-muted-foreground" onClick={handleUndoWater}>undo</button>
              )}
            </span>
          )}
        </div>
        <div className="mt-0 h-[3px] rounded-full" style={{ background: 'var(--hairline)' }}>
          <div
            className="h-[3px] rounded-full"
            style={{
              width: `${waterTarget > 0 ? Math.min(100, (todayWaterMl / waterTarget) * 100) : 0}%`,
              background: 'var(--chart-3)',
              boxShadow: '0 0 10px rgba(111,183,255,.7)',
            }}
          />
        </div>
      </div>

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
        unrecognisedDietaryRestrictions={unrecognisedDietaryRestrictions}
        onFixDietaryRestrictions={onFixDietaryRestrictions}
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
