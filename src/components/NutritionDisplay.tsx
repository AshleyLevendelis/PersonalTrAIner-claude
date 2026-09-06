import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calculator, Layers } from 'lucide-react'
import { MealPlan, SLOT_ORDER, SLOT_LABEL } from '@/components/MealPlan'
import { MacroSplitCard } from '@/components/MacroSplitCard'
import { TrainerNudge } from '@/components/TrainerNudge'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getTodayLedger, subscribeMealStore, loggedEventsBySlot } from '@/lib/meal-store'
import { getAllLogs as getAllWaterLogs, setWaterTargetMl, type WaterLogRow } from '@/lib/water-store'
import type { MacroTargets, UserProfile, WorkoutDay, MacroCalculationMode } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import { calculateWeeklySchedule, getMacroDerivation } from '@/lib/macro-calculator'
import { macroShortfallLine } from '@/lib/macro-shortfall'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MissingBodyMetricsNotice } from '@/components/MissingBodyMetricsNotice'
import { InsightBanner } from '@/components/ui/insight-banner'

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

// ---------------------------------------------------------------------------
// Water-target sparkle
// ---------------------------------------------------------------------------
// Three stars placed ON the water ring's own arc (r=50, centre 56,56) rather
// than scattered around the meter, so the effect reads as "this ring
// completed" and not "something happened near the rings". Angles are measured
// the same way the ring fills — from 12 o'clock, clockwise — and spread across
// the upper arc where the ring isn't overlapped by the legend column.
//
// The stagger is deliberately long (~1.45s between plays, ~4s total): three
// quick pops in succession reads as a loading state, three slow ones read as
// a small celebration and then stop.
const WATER_RING_R = 50
const SPARKLES = [
  { angleDeg: 312, size: 9, delayMs: 0 },
  { angleDeg: 28, size: 6.5, delayMs: 1450 },
  // Not pushed further clockwise than this: at ~3 o'clock the star's own
  // drop-shadow reaches the 112-wide viewBox edge and gets clipped by the
  // svg's default overflow, which reads as a rendering glitch rather than a
  // sparkle. Verified numerically — bbox stays ~14px clear here.
  { angleDeg: 140, size: 7.5, delayMs: 2900 },
] as const
/** How long after the crossing the nodes are torn out — last delay + one play + a frame of slack. */
const SPARKLE_TEARDOWN_MS = 4100

/** Four-point star as a path, centred on (cx, cy). Concave control points at 38% give the pinched arms a "sparkle" reads as; a plain rotated square does not. */
function starPath(cx: number, cy: number, size: number): string {
  const o = size / 2
  const i = o * 0.38
  return [
    `M ${cx} ${cy - o}`,
    `Q ${cx + i} ${cy - i} ${cx + o} ${cy}`,
    `Q ${cx + i} ${cy + i} ${cx} ${cy + o}`,
    `Q ${cx - i} ${cy + i} ${cx - o} ${cy}`,
    `Q ${cx - i} ${cy - i} ${cx} ${cy - o}`,
    'Z',
  ].join(' ')
}

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
  /** The compiled avoid-list — the same value generation is given, so the meals shown are judged by the rule that produced them. */
  avoidFoods?: string[]
  /** Surfacing round — a dietary_preferences value the app can't enforce. Distinct from mealRegenerateError: not dismissable, routes to Profile instead of offering a retry. */
  unrecognisedDietaryRestrictions?: string[] | null
  onFixDietaryRestrictions?: () => void
  onSwapMealSlot: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerateMealSlot: (slot: MealSlotName) => Promise<void>
  /** "More options" in the swap panel — the same append-only generator the chat's pool-refresh offer uses. Ashley's depth ruling holds: it only ever runs when SHE taps it. */
  onFindMoreOptions?: (slot: MealSlotName) => Promise<{ added: string[]; error?: string }>
  onRegenerateAllMeals: () => Promise<void>
}

export function NutritionDisplay({
  profile, macros, exercisePlan = [], latestWeightKg, onMacroModeChange, onMacroSplitChange,
  profileId, date, pools, chosen, mealTotals, isGeneratingMeals, mealRegenerateError, onDismissRegenerateError, avoidFoods = [],
  unrecognisedDietaryRestrictions, onFixDietaryRestrictions,
  onSwapMealSlot, onRegenerateMealSlot, onFindMoreOptions, onRegenerateAllMeals,
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
  const [loggedSlots, setLoggedSlots] = useState<MealSlotName[]>([])
  const [waterLogs, setWaterLogs] = useState<WaterLogRow[]>([])
  const [waterTarget, setWaterTarget] = useState(profile.water_target_ml ?? 2000)
  const [editingWaterTarget, setEditingWaterTarget] = useState(false)
  const [howItsSetOpen, setHowItsSetOpen] = useState(false)
  const [waterTargetInput, setWaterTargetInput] = useState(String(profile.water_target_ml ?? 2000))
  /**
   * Shared by the water-target editor below. It stayed when the steps row
   * moved to the Exercise tab (Ashley's ruling, 5 Sep 2026): the steps half
   * took its own copy, because one piece of state serving two unrelated
   * writes is how one failure comes to describe the other.
   */
  const [entryError, setEntryError] = useState<string | null>(null)

  /**
   * THE RINGS FOLLOW THE MEAL LIST BELOW THEM.
   *
   * MealPlan renders inside this same tab and writes meal events through
   * meal-store. Until 5 Sep 2026 that store published nothing, so tapping Log
   * on a meal moved the row's own state and left the ring directly above it on
   * the same screen showing the day's totals from before the meal — the two
   * halves of one screen disagreeing about what had been eaten. `ledgerVersion`
   * is the re-read trigger. The effect also lifts the ledger's logged-by-slot
   * grouping out, so the shortfall nudge below names a meal off the same
   * read — one fetch, one truth about the day.
   */
  const [ledgerVersion, setLedgerVersion] = useState(0)
  useEffect(() => subscribeMealStore(() => setLedgerVersion(v => v + 1)), [])

  useEffect(() => {
    if (!profileId || !date || !macros) return
    getTodayLedger(profileId, date, macros)
      .then(l => {
        setEaten(l.eaten)
        // Which slots are already eaten, read off the SAME ledger the rings
        // are drawn from rather than a second fetch — the shortfall nudge
        // below can then only ever name a meal the list underneath still
        // shows as unlogged. loggedEventsBySlot is MealPlan's own grouping,
        // reused so the two halves of this tab agree on what "logged" means.
        setLoggedSlots(Object.keys(loggedEventsBySlot(l.events)) as MealSlotName[])
      })
      .catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, date, macros, mealTotals, ledgerVersion])

  useEffect(() => {
    if (!profileId) return
    void getAllWaterLogs(profileId).then(setWaterLogs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, date])

  useEffect(() => { setWaterTarget(profile.water_target_ml ?? 2000) }, [profile.water_target_ml])

  // READ ONLY, since 6 Sep 2026. The quick-adds and the undo beside them
  // moved to Home's "Today so far" grid with the rest of the day's logging
  // (design_handoff_app_polish, "Home becomes the day"); water is the H2O
  // ring and its legend entry here, and the TARGET is still set here, inside
  // "How it's set". What is left is the total the ring is drawn from.
  const todayWaterMl = waterLogs.filter(l => l.date === date).reduce((s, l) => s + l.amount_ml, 0)
  const handleSaveWaterTarget = async () => {
    const n = Number(waterTargetInput)
    if (!profileId || !Number.isFinite(n) || n <= 0) { setEditingWaterTarget(false); return }
    const previous = waterTarget
    setWaterTarget(n)
    setEditingWaterTarget(false)
    try {
      await setWaterTargetMl(profileId, n)
      setEntryError(null)
    } catch (err) {
      // Optimistic on screen, but put back and said out loud when the write
      // doesn't land, rather than leaving a target that looks set and is
      // gone on the next load. (This used to say "same shape as the steps
      // entry above"; the steps entry moved to the Exercise tab.)
      console.error('Saving the water target failed:', err)
      setWaterTarget(previous)
      setEntryError("Couldn't save that target — check your connection and try again.")
    }
  }

  // Fires on the CROSSING, not on the state. `wasComplete` starts as null and
  // is seeded on the first pass with whatever the day already is, so opening
  // the screen on an already-hit target is not a crossing and shows nothing —
  // the sparkle marks the moment it happened, and re-showing it on every
  // mount would turn a reward into wallpaper. Ref, not state: seeding it must
  // not itself cause a render.
  const wasWaterComplete = useRef<boolean | null>(null)
  const [waterJustCompleted, setWaterJustCompleted] = useState(false)
  const waterComplete = waterTarget > 0 && todayWaterMl >= waterTarget

  useEffect(() => {
    const previous = wasWaterComplete.current
    wasWaterComplete.current = waterComplete
    if (previous !== false || !waterComplete) return
    setWaterJustCompleted(true)
    const timer = setTimeout(() => setWaterJustCompleted(false), SPARKLE_TEARDOWN_MS)
    // Clearing on unmount matters: leaving the timer live would call
    // setState on a gone component if the trainee switches tabs mid-sparkle.
    return () => clearTimeout(timer)
  }, [waterComplete])

  // THE TRAINER'S ONE LINE about the macro furthest behind, derived from the
  // same eaten/target pairs the rings above are drawn from — no second
  // source, no extra call. The rule for when it stays silent lives in
  // macro-shortfall.ts so a gate can assert it; this only supplies today.
  const macroNudge = macroShortfallLine({
    targets: macros,
    eaten,
    waterTargetMl: waterTarget,
    waterMl: todayWaterMl,
    meals: SLOT_ORDER.filter(slot => chosen[slot]).map(slot => ({
      label: SLOT_LABEL[slot],
      logged: loggedSlots.includes(slot),
      macros: chosen[slot]!.macros,
    })),
  })

  const ringValues: Record<string, { eaten: number; target: number }> = {
    water: { eaten: todayWaterMl, target: waterTarget },
    calories: { eaten: eaten.kcal, target: macros?.calories ?? 0 },
    protein: { eaten: eaten.protein, target: macros?.protein ?? 0 },
    carbs: { eaten: eaten.carbs, target: macros?.carbs ?? 0 },
    fat: { eaten: eaten.fat, target: macros?.fat ?? 0 },
  }

  return (
    <div className="space-y-6">
      {/* data-tour: the app tour spotlights the rings AND the water row as one
          unit — its copy names both, and water is the only quick-add the tour
          promises ("+250 / +500 log water in one tap"). */}
      <div data-tour="rings">
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
            {waterJustCompleted && SPARKLES.map(s => {
              // -90 puts 0deg at 12 o'clock, matching the ring fill's own
              // rotate(-90) so an angle here means the same thing it does there.
              const rad = ((s.angleDeg - 90) * Math.PI) / 180
              return (
                <path
                  key={`sparkle-${s.angleDeg}`}
                  className="ds-sparkle"
                  d={starPath(56 + WATER_RING_R * Math.cos(rad), 56 + WATER_RING_R * Math.sin(rad), s.size)}
                  fill="var(--chart-3)"
                  style={{
                    animationDelay: `${s.delayMs}ms`,
                    filter: 'drop-shadow(0 0 3px var(--chart-3))',
                  }}
                />
              )
            })}
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="ds-num-mega tabular-mono text-[color:var(--num-hero)] glow-mint-lg">{macros ? Math.round(eaten.kcal) : '—'}</p>
              <p className="mt-1 text-[0.65625rem] uppercase tracking-[.16em] text-muted-foreground">
                {macros
                  ? <>kcal · <span className="tabular-mono">{Math.max(0, Math.round(macros.calories - eaten.kcal))}</span> left</>
                  : 'kcal · add your weight for a target'}
              </p>
            </div>
            {/* 2x2, not four stacked rows: the four values fit beside a
                112px meter without wrapping, and stacked they pushed the
                block taller than the rings it labels. Letters rather than
                words for the same reason — the swatch carries the identity
                and the colour is the same one the ring is drawn in. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {([
                { key: 'protein', label: 'P', unit: 'g' },
                { key: 'carbs', label: 'C', unit: 'g' },
                { key: 'fat', label: 'F', unit: 'g' },
                { key: 'water', label: 'H\u2082O', unit: 'ml' },
              ] as const).map(row => {
                const ring = NUTRITION_RINGS.find(r => r.key === row.key)!
                const { eaten: e, target: t } = ringValues[row.key]
                return (
                  <div key={row.key} className="flex items-baseline gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: ring.color }} />
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{row.label}</span>
                    <span className="tabular-mono text-[0.6875rem]">
                      {Math.round(e)}<span className="text-muted-foreground">/{Math.round(t)}{row.unit}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* THE WATER ROW LEFT THIS SCROLL, 6 Sep 2026. Water is the H2O ring
            and its legend entry here; the quick-adds are on Home's "Today so
            far" grid, which is the one screen that logs the day. The TARGET
            editor is not gone — it moved into "How it's set", with the other
            numbers that are set once and read rarely. */}
        {entryError && (
          <InsightBanner tone="warning" className="items-start justify-between">
            <span>{entryError}</span>
            <button
              type="button"
              onClick={() => setEntryError(null)}
              className="shrink-0 text-xs font-semibold underline opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </InsightBanner>
        )}
      </div>

      {/* THE TRAINER'S LINE. One sentence about the macro furthest behind,
          and only when something is. Derived here from the same eaten/target
          pairs the rings are drawn from — no second source, no new call. */}
      {macroNudge && <TrainerNudge text={macroNudge} openChat />}

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
        dietaryPreferences={profile.dietary_preferences}
        avoidFoods={avoidFoods}
        onSwapSlot={onSwapMealSlot}
        onRegenerateSlot={onRegenerateMealSlot}
        onFindMoreOptions={onFindMoreOptions}
        onRegenerateAll={onRegenerateAllMeals}
      />

      {/* THE TARGET, AS ONE ROW. Until 6 Sep 2026 this tab ended in four
          stacked Cards — the BMR/TDEE strip, the macro-split control, the
          weekly dynamic table and the method picker — roughly two screens of
          numbers that are set once and read rarely, sitting under the meals
          somebody opens this tab to check. They are all still here, behind
          "How it's set"; what stays in the scroll is the one line that
          answers "what am I aiming at, and why that number".
          (design_handoff_app_polish, Nutrition §5.) */}
      {derivation ? (
        <div className="border-t border-[color:var(--hairline)] pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="ds-label">Target</p>
            <button
              type="button"
              onClick={() => setHowItsSetOpen(true)}
              className="hit-slop-44 shrink-0 text-[0.6875rem] font-semibold text-primary-text"
            >
              How it's set ›
            </button>
          </div>
          <p className="mt-1 text-[0.8125rem]">
            <span className="tabular-mono">{derivation.target.calories}</span> kcal
            {' · '}
            <span className="text-muted-foreground">
              TDEE <span className="tabular-mono">{derivation.tdee}</span>
              {' '}{derivation.surplusKcal === 0 ? 'held at' : derivation.surplusKcal > 0 ? '+' : '−'}
              {derivation.surplusKcal !== 0 && <span className="tabular-mono">{Math.abs(derivation.surplusKcal)}</span>}
              {' · '}{derivation.surplusLabel.toLowerCase()}
            </span>
          </p>
        </div>
      ) : (
        // No body metrics means no target to explain — and a Target row with
        // a blank number reads as a loading bug, not as a deliberate absence.
        <MissingBodyMetricsNotice profile={profile} />
      )}

      {/* Everything that used to be in the scroll, unchanged in behaviour and
          moved bodily into one sheet: the derivation strip, the water target,
          the split control, the dynamic week table and the method picker. */}
      <Dialog open={howItsSetOpen} onOpenChange={setHowItsSetOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">How your targets are set</DialogTitle>
          </DialogHeader>

          {derivation && (
            <div>
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <p className="tabular-mono text-[1.0625rem] font-bold tracking-[-.03em]">{derivation.bmr}</p>
                  <p className="mt-0.5 text-[0.53125rem] uppercase tracking-[.14em] text-muted-foreground">BMR</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="tabular-mono text-[1.0625rem] font-bold tracking-[-.03em]">{derivation.tdee}</p>
                  <p className="mt-0.5 text-[0.53125rem] uppercase tracking-[.14em] text-muted-foreground">TDEE</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="tabular-mono text-[1.0625rem] font-bold tracking-[-.03em]">{derivation.surplusKcal > 0 ? '+' : ''}{derivation.surplusKcal}</p>
                  <p className="mt-0.5 text-[0.53125rem] uppercase tracking-[.14em] text-muted-foreground">{derivation.surplusLabel.split(' ')[0]}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="tabular-mono text-[1.0625rem] font-bold tracking-[-.03em] text-primary-text glow-mint">{derivation.target.calories}</p>
                  <p className="mt-0.5 text-[0.53125rem] uppercase tracking-[.14em] text-muted-foreground">Target</p>
                </div>
              </div>
              <p className="mt-2.5 text-[0.6875rem] leading-normal text-muted-foreground">
                {derivation.splitApplies
                  ? `From ${effectiveProfile.weight_kg} kg, ${effectiveProfile.height_cm} cm, ${effectiveProfile.age} y · protein ${derivation.split.proteinPerKg.toFixed(1)} g/kg · fat ${Math.round(derivation.split.fatPercent * 100)}% · carbs the remainder.`
                  : `From ${effectiveProfile.weight_kg} kg, ${effectiveProfile.height_cm} cm, ${effectiveProfile.age} y · a fixed 20% protein / 25% fat / 55% carb split for conditioning goals.`}
              </p>
            </div>
          )}

          {/* THE WATER TARGET STAYS ON THIS TAB even though the quick-adds
              left it: Home logs the day, Nutrition sets what the day is
              measured against. Same editor, same optimistic-then-put-back
              failure handling it had in the scroll. */}
          <div className="border-t border-[color:var(--hairline)] pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="ds-label">Water target</p>
              {editingWaterTarget ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={waterTargetInput}
                    onChange={e => setWaterTargetInput(e.target.value)}
                    className="h-9 w-24 rounded-md border border-border bg-transparent px-2 text-right tabular-mono text-[0.8125rem]"
                    aria-label="Daily water target in millilitres"
                  />
                  <Button size="sm" className="hit-slop-44" onClick={() => void handleSaveWaterTarget()}>Save</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setWaterTargetInput(String(waterTarget)); setEditingWaterTarget(true) }}
                  className="hit-slop-44 text-[0.8125rem]"
                >
                  <span className="tabular-mono">{waterTarget}</span> ml <span className="text-primary-text">Edit</span>
                </button>
              )}
            </div>
          </div>

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
            <div>
              <p className="ds-label mb-2">Weekly dynamic targets</p>
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
                        <Badge variant={d.dayType === 'training' ? 'warning' : 'outline'} className="text-[0.625rem]">
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
            </div>
          )}

          {/* The method picker — the toggle that governs every number above
              it in this sheet, so it sits with them rather than in Settings. */}
          <div>
            <div className="flex items-center justify-between">
              <p className="ds-label">Method</p>
              <Badge variant="secondary" className="text-xs">
                {mode === 'STANDARD_STATIC' ? 'Standard' : 'Dynamic CSCS'}
              </Badge>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    <p className="text-[0.625rem] text-muted-foreground mt-0.5">Same macros every day</p>
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
                    <p className="text-[0.625rem] text-muted-foreground mt-0.5">Carb-cycles by training day</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
