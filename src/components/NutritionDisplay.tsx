import { useEffect, useRef, useState } from 'react'
import type { HeldAround } from '@/lib/meal-generation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calculator, Layers, ShoppingBasket, SlidersHorizontal, ChevronRight } from 'lucide-react'
import type * as React from 'react'
import { groceryHash } from '@/lib/app-route'
import { MealPlan, SLOT_ORDER, SLOT_LABEL, type UpcomingMealDay } from '@/components/MealPlan'
import { MealDayStrip } from '@/components/nutrition/MealDayStrip'
import { MacroSplitCard } from '@/components/MacroSplitCard'
import { TrainerNudge } from '@/components/TrainerNudge'
import { mealsDrifted, kcalLeftOrOver, MORE_MEALS } from '@/lib/coach-voice'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getTodayLedger, getLedgerSnapshot, subscribeMealStore, loggedEventsBySlot } from '@/lib/meal-store'
import { getLogsForDate as getWaterLogsForDate, setWaterTargetMl, logWater, undoLog, type WaterLogRow } from '@/lib/water-store'
import { ringShare } from '@/lib/one-page'
import type { MacroTargets, UserProfile, WorkoutDay, MacroCalculationMode } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import type { MealDayMoveController } from '@/lib/meal-day-move'
import { calculateWeeklySchedule, getMacroDerivation } from '@/lib/macro-calculator'
import { macroShortfallLine } from '@/lib/macro-shortfall'
import { paceClock } from '@/lib/pace'
import { getAppNow } from '@/lib/dev-clock'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MissingBodyMetricsNotice } from '@/components/MissingBodyMetricsNotice'
import { InsightBanner } from '@/components/ui/insight-banner'

// ---------------------------------------------------------------------------
// Water-target sparkle
// ---------------------------------------------------------------------------
// THREE STARS AROUND THE WATER CELL'S BAR when the day's water target is crossed. They sat on the water
// ring until the one-page layout (17 Oct 2026) took the rings off this screen; the moment still marks the
// crossing and never the state. The stagger is deliberately long (~1.45s between plays, ~4s total): three
// quick pops read as a loading state, three slow ones as a small celebration that then stops.
const SPARKLES = [
  { x: 10, y: 8, size: 9, delayMs: 0 },
  { x: 26, y: 4, size: 6.5, delayMs: 1450 },
  { x: 38, y: 11, size: 7.5, delayMs: 2900 },
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
  /**
   * THE WEIGHT THE TARGETS ARE WORKED OUT FROM (runs 7-10, M58): App's anchored 7-day weight, the same input
   * `macros` was computed from. The "how it's set" row and sheet read it, so the target they print is the one at the
   * top of the screen. The raw latest weigh-in stays a display fact; it never feeds a second target.
   */
  targetWeightKg?: number | null
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
  /** When the current plan was made. With the account's own date it decides "is this their first day?", when no pace line is said (pace.ts). */
  planCreatedAt?: string
  pools: Partial<Record<MealSlotName, PoolOption[]>>
  chosen: Partial<Record<MealSlotName, PoolOption>>
  mealTotals: MacroTargets
  isGeneratingMeals: boolean
  /** "Regenerate all" is running: the meal list shows a working state over the whole list (MealPlan). */
  mealsRegeneratingAll?: boolean
  mealRegenerateError?: string | null
  onDismissRegenerateError?: () => void
  /** The compiled avoid-list — the same value generation is given, so the meals shown are judged by the rule that produced them. */
  avoidFoods?: string[]
  /** Makes a verified option the slot's meal and says whether it landed — the one pick path, shared with the coach. */
  onMealPickApplied?: (slot: MealSlotName, chosenName: string) => Promise<boolean>
  /** Surfacing round — a dietary_preferences value the app can't enforce. Distinct from mealRegenerateError: not dismissable, routes to Profile instead of offering a retry. */
  unrecognisedDietaryRestrictions?: string[] | null
  onFixDietaryRestrictions?: () => void
  onSwapMealSlot: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerateMealSlot: (slot: MealSlotName) => Promise<void>
  /** "More options" in the swap panel — the same append-only generator the chat's pool-refresh offer uses. Ashley's depth ruling holds: it only ever runs when SHE taps it. */
  onFindMoreOptions?: (slot: MealSlotName) => Promise<{ added: string[]; error?: string }>
  onRegenerateAllMeals: () => Promise<void>
  /**
   * The drift offer, or null when the day fits / she already said no.
   * App owns the decision; this component only renders it, so the rule for
   * WHEN to offer stays in one place a gate can read (meal-refit.ts).
   */
  mealRefit?: MealRefitOffer | null
  /**
   * The strip of days across the top (Ashley, 27 Sep 2026). Absent, the tab
   * is today only, exactly as it was.
   */
  mealStrip?: { dates: string[]; today: string; selected: string; onSelect: (date: string) => void }
  /**
   * Swapping a meal with another day's (Ashley, 29 Sep 2026: they swap
   * places). One controller from App, the same one the coach's card uses.
   * Absent, the Move control offers only the meal slots, as it did.
   */
  dayMove?: MealDayMoveController
  /** What a swap did to today's other meals (runs 3-4, M34), and its Undo. */
  heldAround?: HeldAround
  onKeepHeldSizes?: (date: string, keep: boolean) => void
  /**
   * The day open on the strip, when it is not today: that date's meals, its
   * swap, and putting it on the shopping list. Null means today is open.
   */
  upcomingDay?: {
    date: string
    chosen: Partial<Record<MealSlotName, PoolOption>>
    totals: MacroTargets
    heldAround?: HeldAround
    onSwap: (slot: MealSlotName, chooseName: string) => Promise<void>
  } & UpcomingMealDay | null
  mealRefitBusy?: boolean
  mealRefitError?: string | null
  onMealRefitConfirm?: () => void
  onMealRefitDecline?: () => void
  /**
   * MORE MEALS TO CHOOSE FROM (Ashley, 28 Sep 2026, "Button, keep today"):
   * the offer's sentence, or null when there is nothing to offer. WHEN to
   * offer lives in App and meal-top-up.ts; this only shows it.
   */
  mealTopUp?: string | null
  mealTopUpBusy?: boolean
  /** What happened after the tap, from the phrasebook; `failed` when nothing changed. */
  mealTopUpNote?: { text: string; failed: boolean } | null
  onMealTopUp?: (startTomorrow?: boolean) => void
  /** When the new meals would start, read before the tap (M62); `beyondStrip` adds the sooner button. */
  mealTopUpStart?: { label: string; beyondStrip: boolean } | null
  onMealTopUpDecline?: () => void
  onDismissMealTopUpNote?: () => void
}

/** Only the parts of a refit this screen shows. Narrower than MealRefit on purpose: a component that cannot see the resized pools cannot accidentally render one as if it were saved. */
export interface MealRefitOffer {
  before: { totals: MacroTargets }
  after: { totals: MacroTargets }
  resized: { slot: MealSlotName; name: string; before: MacroTargets; after: MacroTargets }[]
  couldNotFix: string | null
}

export function NutritionDisplay({
  profile, macros, exercisePlan = [], latestWeightKg, targetWeightKg, onMacroModeChange, onMacroSplitChange,
  profileId, date, planCreatedAt, pools, chosen, mealTotals, isGeneratingMeals, mealsRegeneratingAll = false, mealRegenerateError, onDismissRegenerateError, avoidFoods = [], onMealPickApplied,
  unrecognisedDietaryRestrictions, onFixDietaryRestrictions,
  onSwapMealSlot, onRegenerateMealSlot, onFindMoreOptions, onRegenerateAllMeals,
  mealRefit = null, mealRefitBusy = false, mealRefitError = null, onMealRefitConfirm, onMealRefitDecline,
  mealTopUp = null, mealTopUpBusy = false, mealTopUpNote = null, onMealTopUp, onMealTopUpDecline, onDismissMealTopUpNote, mealTopUpStart = null,
  mealStrip, upcomingDay = null, dayMove, heldAround, onKeepHeldSizes,
}: NutritionDisplayProps) {
  // Living targets (M0): BMR/TDEE were previously read from the frozen
  // fitness_profiles columns (computed once at onboarding); they're now
  // derived live from the same effective-weight profile the macros use, so
  // a new weigh-in updates every number on this tab together.
  // ONE TARGET ON THE SCREEN (M58): the derivation reads the weight `macros` was worked out from (targetWeightKg),
  // never the raw latest weigh-in, which once printed 1,684 at the bottom under 1,689 at the top.
  const derivationWeightKg = targetWeightKg != null && targetWeightKg > 0 ? targetWeightKg : latestWeightKg
  const effectiveProfile = derivationWeightKg != null && derivationWeightKg > 0
    ? { ...profile, weight_kg: derivationWeightKg }
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
  // WATER IS LOGGED HERE AGAIN (one-page Nutrition, her 17 Oct ruling): the water cell opens the
  // quick-add Home used to carry. The store owns the number; its synchronous row is what moves the cell,
  // so a tap never waits on the network. Undo for six seconds, as before.
  const [waterOpen, setWaterOpen] = useState(false)
  const [lastWaterLog, setLastWaterLog] = useState<WaterLogRow | null>(null)
  const handleAddWater = (amountMl: number) => {
    if (!profileId || !date) return
    try {
      const row = logWater({ profileId, date, amountMl, source: 'manual' })
      setWaterLogs(logs => [...logs, row])
      setLastWaterLog(row)
      setEntryError(null)
      window.setTimeout(() => setLastWaterLog(cur => (cur === row ? null : cur)), 6000)
    } catch (err) {
      console.error('Logging water failed:', err)
      setEntryError("That didn't save — check your connection and tap again.")
    }
  }
  const handleUndoWater = () => {
    if (!lastWaterLog) return
    undoLog(lastWaterLog)
    setWaterLogs(logs => logs.filter(l => l !== lastWaterLog))
    setLastWaterLog(null)
  }

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
  // TWO STEPS ON PURPOSE, and the first one is the fix Ashley asked for on
  // 8 Sep 2026. Bumping the version alone re-runs the effect below, which
  // begins by awaiting the network — so on a slow or hanging connection the
  // ring above the meal list stayed on its old figure for as long as that
  // took, which on her phone meant until she restarted the app. The snapshot
  // is the same arithmetic over what the store already holds, with no request
  // at all, so the number moves in the same tick as the tap. The re-read
  // still runs behind it and remains the authority.
  const [ledgerVersion, setLedgerVersion] = useState(0)
  useEffect(() => subscribeMealStore(() => {
    const snap = profileId && date ? getLedgerSnapshot(profileId, date) : null
    if (snap) {
      setEaten(snap.eaten)
      setLoggedSlots(Object.keys(loggedEventsBySlot(snap.events)) as MealSlotName[])
    }
    setLedgerVersion(v => v + 1)
  }), [profileId, date])

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
    void getWaterLogsForDate(profileId, date).then(setWaterLogs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, date])

  useEffect(() => { setWaterTarget(profile.water_target_ml ?? 2000) }, [profile.water_target_ml])

  // The day's water, from the logs read for `date` above plus anything logged here since.
  const todayWaterMl = waterLogs.reduce((s, l) => s + l.amount_ml, 0)
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
      slot,
      label: SLOT_LABEL[slot],
      logged: loggedSlots.includes(slot),
      macros: chosen[slot]!.macros,
    })),
    // The APP's clock, never `new Date()`: the harness has one fixed today.
    clock: paceClock(getAppNow(profile.id), [profile.created_at, planCreatedAt]),
  })

  const ringValues: Record<string, { eaten: number; target: number }> = {
    water: { eaten: todayWaterMl, target: waterTarget },
    calories: { eaten: eaten.kcal, target: macros?.calories ?? 0 },
    protein: { eaten: eaten.protein, target: macros?.protein ?? 0 },
    carbs: { eaten: eaten.carbs, target: macros?.carbs ?? 0 },
    fat: { eaten: eaten.fat, target: macros?.fat ?? 0 },
  }

  return (
    <div className="space-y-[18px]">
      {/* HEADER (5c·6): the day over "Nutrition", and the shopping list one round tap away. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ds-label" data-testid="meal-day-heading">{upcomingDay?.dayName ?? dayName}</p>
          <h2 className="mt-1 text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]">Nutrition</h2>
        </div>
        <button
          type="button"
          onClick={() => { window.location.hash = groceryHash() }}
          className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--surface-raised)' }}
          aria-label="Grocery list"
          data-grocery-pill
        >
          <ShoppingBasket className="size-[18px]" aria-hidden />
        </button>
      </div>
      {/* THE DAY STRIP STAYS ON TOP — her 17 Oct ruling, over the one-page design, which had none. */}
      {mealStrip && (
        <MealDayStrip dates={mealStrip.dates} today={mealStrip.today} selected={mealStrip.selected} onSelect={mealStrip.onSelect} />
      )}
      {/* TODAY'S PARTS ARE TODAY'S. The calories, the trainer's line and the
          resize offer are about what has been eaten today and today's meals,
          so with another day open they step aside rather than sit above a
          list they do not describe. */}
      {!upcomingDay && (<>
      {/* CALORIES, THEN THE FOUR MACROS (5c·6): no rings on this screen. The tour spotlights the block. */}
      <div data-tour="rings" className="flex flex-col gap-[18px]">
        <div data-nutrition-hero>
          {macros ? (() => {
            // THE PHRASEBOOK DECIDES left or over (and the rounding), so the hero
            // and every other "left" in the app say it one way. OVER IS SAID AS OVER (M33).
            const [amount, word] = kcalLeftOrOver(macros.calories - eaten.kcal).split(' ')
            return (
              <>
                <div className="flex items-end justify-between gap-3">
                  {/* LESS IS MORE (30 Oct 2026): the number and its words on one line, smaller. */}
                  <p className="flex items-baseline gap-2">
                    <span className="ds-num-mega tabular-mono glow-mint-lg text-[2.5rem] font-bold leading-none tracking-[-.04em]" style={{ color: 'var(--num-hero)' }} data-testid="kcal-left-number">
                      {Number(amount).toLocaleString()}
                    </span>
                    <span className="text-[0.875rem] text-muted-foreground" data-testid="kcal-left">kcal {word}</span>
                  </p>
                  <p className="pb-0.5 text-[0.75rem] text-muted-foreground">
                    <span className="tabular-mono text-foreground" data-testid="kcal-eaten">{Math.round(eaten.kcal).toLocaleString()}</span> of <span className="tabular-mono text-foreground" data-testid="kcal-target">{Math.round(macros.calories).toLocaleString()}</span>
                  </p>
                </div>
                <MacroBar share={ringShare(eaten.kcal, macros.calories)} color="var(--primary)" height={6} glow className="mt-3" testid="kcal-bar" />
              </>
            )
          })() : (
            <>
              <p className="ds-num-mega tabular-mono text-[3.75rem] leading-[.88]" style={{ color: 'var(--num-hero)' }}>—</p>
              <p className="mt-2 text-[0.75rem] text-text-tertiary">
                <span className="tabular-mono" data-testid="kcal-eaten">{Math.round(eaten.kcal).toLocaleString()}</span> kcal eaten · add your weight for a target
              </p>
            </>
          )}
        </div>

        {/* THE MACROS, ONE ROW OF FOUR (30 Oct 2026, was a 2×2 grid with icons). Water's cell is the water log
            (her 17 Oct ruling): tapping it opens the quick-add that used to sit on Home. */}
        <div className="grid grid-cols-4 gap-3" data-ring-key>
          <MacroCell k="protein" label="Protein" color="var(--chart-2)" value={String(Math.round(eaten.protein))} target={macros?.protein} unit="g" share={ringShare(eaten.protein, macros?.protein)} />
          <MacroCell k="carbs" label="Carbs" color="var(--chart-4)" value={String(Math.round(eaten.carbs))} target={macros?.carbs} unit="g" share={ringShare(eaten.carbs, macros?.carbs)} />
          <MacroCell k="fat" label="Fat" color="var(--text-tertiary)" value={String(Math.round(eaten.fat))} target={macros?.fat} unit="g" share={ringShare(eaten.fat, macros?.fat)} />
          <MacroCell
            k="water" label="Water" color="var(--chart-3)"
            value={(todayWaterMl / 1000).toFixed(1)} target={waterTarget / 1000} unit="L" fixed={1}
            share={ringShare(todayWaterMl, waterTarget)}
            onClick={() => setWaterOpen(o => !o)}
            ariaLabel={`Water: ${(todayWaterMl / 1000).toFixed(1)} of ${(waterTarget / 1000).toFixed(1)} litres. Tap to log water.`}
            expanded={waterOpen}
            celebrate={waterJustCompleted}
          />
        </div>
        {waterOpen && (
          <div className="flex flex-wrap items-center gap-2" data-water-quick-add>
            {[250, 500].map(ml => (
              <button
                key={ml}
                type="button"
                onClick={() => handleAddWater(ml)}
                className="inline-flex h-10 items-center rounded-full px-4 text-[0.8125rem] font-semibold"
                style={{ background: 'color-mix(in oklab, var(--chart-3) 15%, transparent)', color: 'var(--chart-3)' }}
              >
                +{ml} ml
              </button>
            ))}
            {lastWaterLog && (
              <button type="button" onClick={handleUndoWater} className="inline-flex h-10 items-center rounded-full px-3 text-[0.8125rem] text-muted-foreground" data-water-undo>
                Undo
              </button>
            )}
          </div>
        )}

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
      {macroNudge && !mealRefit && !(mealTopUp && !mealTopUpNote) && <TrainerNudge slim text={macroNudge} tag="Nutrition" openChat askPrefill={`Tell me more about this: "${macroNudge}"`} />}

      {/* THE DRIFT OFFER. Ashley's ruling, 17 Sep 2026: tell her, and offer to
          refit. It sits ABOVE the meal list because it is about that list, and
          it states every meal it would change before she taps anything — the
          same before/after discipline every other edit card in the app keeps.
          The lead comes from the phrasebook, so it is one voice with the rest. */}
      {mealRefit && (
        <div data-testid="meal-refit-offer">
          <TrainerNudge
            text={mealsDrifted(mealRefit.before.totals.calories, macros?.calories ?? 0)}
            actions={[
              { label: mealRefitBusy ? 'Resizing…' : 'Resize them', onClick: () => onMealRefitConfirm?.(), disabled: mealRefitBusy },
              { label: 'Leave them', onClick: () => onMealRefitDecline?.(), disabled: mealRefitBusy, secondary: true },
            ]}
          />
          <ul className="mt-2 space-y-1 px-1" data-testid="meal-refit-rows">
            {mealRefit.resized.map(r => (
              <li key={r.slot} className="flex items-baseline justify-between gap-3 text-[0.6875rem] text-muted-foreground">
                <span className="truncate">{SLOT_LABEL[r.slot]} · {r.name}</span>
                <span className="shrink-0 tabular-nums">{Math.round(r.before.calories)} → {Math.round(r.after.calories)} kcal</span>
              </li>
            ))}
          </ul>
          {/* THE HONEST HALF, and never suppressed. A resize has rails, so
              some days cannot be made to fit by portions alone; saying so is
              the difference between this and a card claiming a success it did
              not achieve. */}
          {mealRefit.couldNotFix && (
            <p className="mt-1.5 px-1 text-[0.6875rem] leading-[1.35] text-muted-foreground/80" data-testid="meal-refit-residue">
              {mealRefit.couldNotFix}
            </p>
          )}
        </div>
      )}
      {mealRefitError && (
        <InsightBanner tone="warning" data-testid="meal-refit-error">
          <span className="min-w-0 flex-1">{mealRefitError}</span>
        </InsightBanner>
      )}

      {/* MORE MEALS TO CHOOSE FROM. Offered, never done unasked, and it says
          before the tap what it will not touch: today and the days already on
          the shopping list. The receipt replaces it and says what changed. */}
      {mealTopUp && !mealTopUpNote && (
        <div data-testid="meal-top-up-offer">
          <TrainerNudge
            text={mealTopUpStart
              ? `${mealTopUp} ${mealTopUpStart.beyondStrip ? MORE_MEALS.startsLate(mealTopUpStart.label) : MORE_MEALS.starts(mealTopUpStart.label)}`
              : mealTopUp}
            actions={[
              { label: mealTopUpBusy ? 'Finding meals…' : 'Get more options', onClick: () => onMealTopUp?.(false), disabled: mealTopUpBusy },
              ...(mealTopUpStart?.beyondStrip ? [{ label: MORE_MEALS.sooner, onClick: () => onMealTopUp?.(true), disabled: mealTopUpBusy, secondary: true }] : []),
              { label: 'Not now', onClick: () => onMealTopUpDecline?.(), disabled: mealTopUpBusy, secondary: true },
            ]}
          />
        </div>
      )}
      {mealTopUpNote && (
        <InsightBanner tone={mealTopUpNote.failed ? 'warning' : 'ai'} data-testid="meal-top-up-note" data-failed={mealTopUpNote.failed ? 'true' : 'false'}>
          <span className="min-w-0 flex-1">{mealTopUpNote.text}</span>
          <button
            type="button"
            onClick={() => onDismissMealTopUpNote?.()}
            className="shrink-0 text-xs font-semibold underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </InsightBanner>
      )}
      </>)}

      {upcomingDay ? (
        <MealPlan
          key={upcomingDay.date}
          fitnessGoal={profile.fitness_goal}
          profileId={profileId}
          date={upcomingDay.date}
          pools={pools}
          chosen={upcomingDay.chosen}
          totals={upcomingDay.totals}
          targets={macros}
          isGenerating={isGeneratingMeals}
          regenerateError={mealRegenerateError}
          onDismissRegenerateError={onDismissRegenerateError}
          unrecognisedDietaryRestrictions={unrecognisedDietaryRestrictions}
          onFixDietaryRestrictions={onFixDietaryRestrictions}
          dietaryPreferences={profile.dietary_preferences}
          avoidFoods={avoidFoods}
          mealsPerDay={profile.meals_per_day}
          includeSnacks={profile.include_snacks}
          onSwapSlot={upcomingDay.onSwap}
          onRegenerateSlot={onRegenerateMealSlot}
          onRegenerateAll={onRegenerateAllMeals}
          upcoming={upcomingDay}
          dayMove={dayMove}
          heldAround={upcomingDay.heldAround}
          onKeepHeldSizes={onKeepHeldSizes}
          regeneratingAll={mealsRegeneratingAll}
        />
      ) : (
      <MealPlan
        fitnessGoal={profile.fitness_goal}
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
        mealsPerDay={profile.meals_per_day}
        includeSnacks={profile.include_snacks}
        onMealPickApplied={onMealPickApplied}
        onSwapSlot={onSwapMealSlot}
        onRegenerateSlot={onRegenerateMealSlot}
        onFindMoreOptions={onFindMoreOptions}
        onRegenerateAll={onRegenerateAllMeals}
        dayMove={dayMove}
        heldAround={heldAround}
        onKeepHeldSizes={onKeepHeldSizes}
        regeneratingAll={mealsRegeneratingAll}
      />
      )}

      {/* THE TARGET, AS ONE ROW. Until 6 Sep 2026 this tab ended in four
          stacked Cards — the BMR/TDEE strip, the macro-split control, the
          weekly dynamic table and the method picker — roughly two screens of
          numbers that are set once and read rarely, sitting under the meals
          somebody opens this tab to check. They are all still here, behind
          "How it's set"; what stays in the scroll is the one line that
          answers "what am I aiming at, and why that number".
          (design_handoff_app_polish, Nutrition §5.) */}
      {derivation ? (
        // TARGETS & PLAN SETTINGS (5c·6): one raised row, the day's calorie target on it, and everything
        // that is set once and read rarely behind it — the derivation, the water target, the split, the
        // weekly table and the method.
        <button
          type="button"
          onClick={() => setHowItsSetOpen(true)}
          className="flex min-h-[52px] w-full items-center gap-3 border-y border-[color:var(--hairline)] text-left"
          data-targets-row
        >
          <SlidersHorizontal aria-hidden className="size-4 shrink-0 text-text-tertiary" />
          <span className="min-w-0 flex-1 truncate text-[0.875rem]">Targets &amp; plan settings</span>
          <span className="tabular-mono shrink-0 text-[0.75rem] text-muted-foreground" data-testid="target-kcal">{macros?.calories ?? derivation.target.calories} kcal</span>
          <ChevronRight aria-hidden className="size-4 shrink-0" style={{ color: 'var(--text-dim)' }} />
        </button>
      ) : (
        // No body metrics means no target to explain — and a Target row with
        // a blank number reads as a loading bug, not as a deliberate absence.
        <MissingBodyMetricsNotice profile={profile} />
      )}

      {/* Everything that used to be in the scroll, unchanged in behaviour and
          moved bodily into one sheet: the derivation strip, the water target,
          the split control, the dynamic week table and the method picker. */}
      <Dialog open={howItsSetOpen} onOpenChange={setHowItsSetOpen}>
        <DialogContent className="max-h-[85vh] sm:max-w-md">
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

// ---------------------------------------------------------------------------
// The one-page Nutrition blocks (design 5c·6, 17 Oct 2026).
// ---------------------------------------------------------------------------

/** A bar on a raised track, its fill glowing in its own colour. */
function MacroBar({ share, color, height = 4, glow, className, testid }: { share: number | null; color: string; height?: number; glow?: boolean; className?: string; testid?: string }) {
  const pctWidth = Math.round((share ?? 0) * 100)
  return (
    <span className={`block w-full rounded-full ${className ?? ''}`} style={{ height, background: 'var(--surface-raised)' }} data-testid={testid} data-share={share == null ? 'none' : share.toFixed(3)}>
      <span
        className={`block rounded-full ${glow ? 'glow-mint-box' : ''}`}
        style={{ height, width: `${pctWidth}%`, background: color, boxShadow: glow ? undefined : `0 0 calc(6px * var(--glow-strength, 1)) color-mix(in srgb, ${color} 50%, transparent)`, transition: 'width 400ms ease' }}
      />
    </span>
  )
}

/**
 * One cell of the 2×2 grid: a 22px icon circle and the label, the value in mono with its target, the bar.
 * Inner edges carry the hairlines; the outer edge has no padding. A button only where it does something
 * (water), so nothing else looks tappable.
 */
function MacroCell({ k, label, color, value, target, unit, fixed = 0, share, onClick, ariaLabel, expanded, celebrate }: {
  k: string
  label: string
  color: string
  value: string
  target: number | null | undefined
  unit: string
  fixed?: number
  share: number | null
  onClick?: () => void
  ariaLabel?: string
  expanded?: boolean
  celebrate?: boolean
}) {
  const style: React.CSSProperties = { minHeight: 44 }
  const body = (
    <>
      <span className="block text-[0.6875rem] text-muted-foreground">{label}{onClick ? ' +' : ''}</span>
      <span className="mt-1 block tabular-mono text-[0.875rem] font-semibold leading-none">
        {value}
        <span className="text-[0.6875rem] font-medium text-muted-foreground">/{target != null && target > 0 ? target.toFixed(fixed) : '—'}{unit}</span>
      </span>
      <span className="relative mt-2 block">
        <MacroBar share={share} color={color} />
        {celebrate && (
          <svg aria-hidden width="48" height="16" viewBox="0 0 48 16" className="pointer-events-none absolute -top-3 right-0 overflow-visible">
            {SPARKLES.map(sp => (
              <path key={sp.delayMs} className="ds-sparkle" d={starPath(sp.x, sp.y, sp.size)} fill={color}
                style={{ animationDelay: `${sp.delayMs}ms`, filter: `drop-shadow(0 0 3px ${color})` }} />
            ))}
          </svg>
        )}
      </span>
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} aria-label={ariaLabel} aria-expanded={expanded} className="block text-left" style={style} data-ring-key-row={k}>{body}</button>
    : <div style={style} data-ring-key-row={k}>{body}</div>
}
