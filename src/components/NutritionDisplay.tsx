import { Field, FieldLabel } from '@/components/field/Field'
import { FieldRing } from '@/components/field/FieldRing'
import { ink } from '@/lib/field-ink'
import { buildNutritionField } from '@/lib/nutrition-field'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calculator, Layers } from 'lucide-react'
import { MealPlan } from '@/components/MealPlan'
import { MacroSplitCard } from '@/components/MacroSplitCard'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getTodayLedger } from '@/lib/meal-store'
import { getAllLogs as getAllWaterLogs, logWater, undoLog as undoWaterLog, setWaterTargetMl, type WaterLogRow } from '@/lib/water-store'
import type { MacroTargets, UserProfile, WorkoutDay, MacroCalculationMode } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import { calculateWeeklySchedule, getMacroDerivation } from '@/lib/macro-calculator'
import { MissingBodyMetricsNotice } from '@/components/MissingBodyMetricsNotice'
import { getStepsForDate, logStepsManual, type DailyStepsRow } from '@/lib/steps-store'
import { stepsTargetFor } from '@/lib/steps-target'

const WATER_QUICK_ADD_ML = [250, 500]

// Tab-restructure handoff — the ring meter moves here from Dashboard.tsx and
// grows a 5th (outermost) water ring, each ring now its own colour instead
// of one hue fading in opacity: water lives on the same tab as the ring
// meter now, so it earns its own visual identity (--chart-3, matching the
// water row/quick-adds below) rather than borrowing the mint accent.
// The calorie tile's ring geometry, kept identical so the steps ring and the
// calorie ring read as one system rather than two people's work.
const STEP_RING_R = 14
const STEP_RING_CIRC = 2 * Math.PI * STEP_RING_R

/** How long after the crossing the nodes are torn out — last delay + one play + a frame of slack. */

/** Four-point star as a path, centred on (cx, cy). Concave control points at 38% give the pinched arms a "sparkle" reads as; a plain rotated square does not. */

export interface NutritionDisplayProps {
  profile: UserProfile
  /** Null when a body metric is missing — see MissingBodyMetricsNotice, which this component renders in that case instead of a ring meter reading 0/0. */
  macros: MacroTargets | null
  exercisePlan?: WorkoutDay[]
  /** Latest daily_metrics weigh-in — overrides the immutable onboarding weight in every displayed number (living targets, M0). */
  latestWeightKg?: number | null
  onMacroModeChange?: (mode: MacroCalculationMode) => void
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
  profile, macros, exercisePlan = [], latestWeightKg, onMacroModeChange, onMacroSplitChange,
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
  // Steps moved here from Home — Nutrition owns what you accumulate through
  // the day. The target is derived, not stored, by the same function Home
  // used, so both tabs read one rule.
  const [stepsRow, setStepsRow] = useState<DailyStepsRow | null>(null)
  const [stepsInput, setStepsInput] = useState('')
  const stepTarget = stepsTargetFor(profile)
  const todaySteps = stepsRow?.steps ?? 0

  useEffect(() => {
    if (!profileId || !date) return
    void getStepsForDate(profileId, date).then(setStepsRow).catch(() => setStepsRow(null))
  }, [profileId, date])

  const handleLogSteps = async () => {
    const n = Number(stepsInput)
    if (!profileId || !Number.isFinite(n) || n < 0) return
    setStepsRow(await logStepsManual(profileId, date, Math.round(n)))
    setStepsInput('')
  }

  useEffect(() => {
    if (!profileId || !date || !macros) return
    getTodayLedger(profileId, date, macros).then(l => setEaten(l.eaten)).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, date, macros, mealTotals])

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

  // Fires on the CROSSING, not on the state. `wasComplete` starts as null and
  // is seeded on the first pass with whatever the day already is, so opening
  // the screen on an already-hit target is not a crossing and shows nothing —
  // the sparkle marks the moment it happened, and re-showing it on every
  // mount would turn a reward into wallpaper. Ref, not state: seeding it must
  // not itself cause a render.
  const wasWaterComplete = useRef<boolean | null>(null)


  const nutritionField = buildNutritionField({
    caloriesEaten: eaten.kcal, caloriesTarget: macros?.calories ?? 0,
    proteinEaten: eaten.protein, proteinTarget: macros?.protein ?? 0,
    carbsEaten: eaten.carbs, carbsTarget: macros?.carbs ?? 0,
    fatEaten: eaten.fat, fatTarget: macros?.fat ?? 0,
    waterMl: todayWaterMl, waterTargetMl: waterTarget,
    hasTargets: macros != null,
  })


  return (
    <div className="space-y-6">
      {/* data-tour: the app tour spotlights the rings AND the water row as one
          unit — its copy names both, and water is the only quick-add the tour
          promises ("+250 / +500 log water in one tap"). */}
      <div data-tour="rings">
        {/* THE FIELD (handoff v2 §3). The ring is INLINE at 130px here,
            not ambient, "because it's an instrument you read" — on Home and
            Exercise it is atmosphere that happens to be true; here it is the
            point. No action in the field: meal logging lives on the canvas.

            REMOVED WITH THE OLD 112px METER: the water-completion sparkle.
            The handoff's field has no such flourish and porting it would push
            a one-tab celebration into the shared ring component. Flagged in
            BACKLOG rather than deleted quietly — it was a deliberate delight
            and it is Ashley's to ask back. */}
        <Field ringPlacement="inline">
          <FieldLabel>Nutrition · {dayName}</FieldLabel>
          <div className="mt-3 flex items-center gap-[18px]">
            <FieldRing arcs={nutritionField.arcs} placement="inline" size={130} />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div>
                <p className="tabular-mono text-[44px] leading-none font-bold">
                  {nutritionField.kcal ? nutritionField.kcal.eaten : '—'}
                </p>
                <p className="mt-1 text-[11px] font-bold" style={{ color: ink('textSmall') }}>
                  {nutritionField.kcal
                    ? <>of <span className="tabular-mono">{nutritionField.kcal.target}</span> kcal</>
                    : 'add your weight for a target'}
                </p>
              </div>
              {/* The 2x2 macro grid. "The letters are load-bearing" — colour
                  alone failed and ink alone failed; colour + letter works, so
                  the letter is never decorative and never dropped. */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {nutritionField.cells.map(c => (
                  <div key={c.key} className="flex items-baseline gap-1.5">
                    <span aria-hidden className="size-[9px] shrink-0 rounded-[3px]" style={{ background: c.swatch }} />
                    <span className="text-[11px] font-bold" style={{ color: ink('textSmall') }}>{c.letter}</span>
                    <span className="tabular-mono text-[12.5px] font-semibold">
                      {c.eaten}<span style={{ color: ink('textSmall') }}>/{c.target}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Field>

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
                <button key={ml} className="hit-slop-44 text-xs font-semibold" style={{ color: 'var(--chart-3)' }} onClick={() => handleAddWater(ml)}>+{ml}</button>
              ))}
              <button className="hit-slop-44 text-xs text-muted-foreground" onClick={() => { setWaterTargetInput(String(waterTarget)); setEditingWaterTarget(true) }}>edit</button>
              {lastWaterLog && (
                <button className="hit-slop-44 text-xs text-muted-foreground" onClick={handleUndoWater}>undo</button>
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

        {/* STEPS — moved here from Home. steps-target.ts already decided this:
            the step target is derived from the same activity_level that
            drives the calorie target's PAL multipliers, deliberately, "so the
            step target and the calorie target never disagree about who is
            more active". Two numbers from one input belong on one tab, and
            this is the tab that owns what you accumulate through the day.

            Same row shape as Water above, and the ring is the calorie ring's
            radius, stroke and rotate(-90) start so the two read as one system
            rather than two people's work. */}
        <div className="flex items-baseline justify-between pt-3.5 pb-1" style={{ borderTop: '1px solid var(--hairline)' }}>
          <span className="text-[13px] text-text-tertiary">Steps</span>
          <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <svg viewBox="0 0 34 34" className="size-[24px] shrink-0" aria-hidden>
              <circle cx="17" cy="17" r={STEP_RING_R} fill="none" stroke="var(--surface-raised)" strokeWidth="4" />
              <circle
                cx="17" cy="17" r={STEP_RING_R} fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${STEP_RING_CIRC * Math.min(1, stepTarget > 0 ? todaySteps / stepTarget : 0)} ${STEP_RING_CIRC}`}
                transform="rotate(-90 17 17)"
              />
            </svg>
            <span className="tabular-mono text-[13px]">{todaySteps.toLocaleString()} / {stepTarget.toLocaleString()}</span>
            <input
              type="number"
              placeholder="Log"
              value={stepsInput}
              onChange={e => setStepsInput(e.target.value)}
              className="h-7 w-16 min-w-0 rounded-md bg-[color:var(--surface-raised)] px-2 text-xs"
            />
            <button className="hit-slop-44 text-xs font-semibold text-primary" onClick={handleLogSteps}>Log</button>
          </span>
        </div>
        {/* NO INLINE TARGET EDITOR, deliberately. The handoff sketches an
            "edit" affordance here, but daily_step_target is a profile column
            with no setter in this path, and adding a second place to change
            it is how two surfaces come to disagree about one number. The
            override behaviour is unchanged, as the handoff also requires —
            this line says where it lives instead. */}
        <p className="text-[11px] leading-[1.4] text-muted-foreground">
          Target from the activity level your calorie target uses — override it in your profile.
        </p>
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
      {/* No body metrics means no target to explain. The notice replaces the
          whole derivation card rather than showing it with holes in it — a
          BMR row with a blank number reads as a loading bug, not as a
          deliberate absence. */}
      {derivation ? (
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
      ) : (
        <MissingBodyMetricsNotice profile={profile} />
      )}

      {/* The split control edits protein-per-KG and shows the resulting
          grams — both meaningless without a bodyweight, and a 0 here
          would render "0 g protein" all over again. Hidden entirely
          rather than shown with a stand-in; derivation is non-null
          exactly when the weight exists, so the assertion is safe. */}
      {derivation && (
      <MacroSplitCard
        profile={profile}
        effectiveWeightKg={effectiveProfile.weight_kg!}
        calorieTarget={derivation.target.calories}
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
