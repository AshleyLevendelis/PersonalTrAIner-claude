import { useEffect, useState, lazy, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import {
  UtensilsCrossed,
  RefreshCw,
  Loader2,
  Check,
  ChevronRight,
  ShieldAlert,
  Plus,
} from 'lucide-react'
import { InsightBanner } from '@/components/ui/insight-banner'
import type { FitnessGoal, MacroTargets } from '@/lib/types'
import { getTodayLedger, getLedgerSnapshot, logMealEaten, voidMealEvents, loggedEventsBySlot, type MealSlotName, type MealEventRecord } from '@/lib/meal-store'
import { checkMealAgainstRestrictions, describeEatenBeforeChange, type MealRestrictionVerdict } from '@/lib/meal-restriction-check'
import { methodSafeToShow, type PoolOption } from '@/lib/meal-generation'
import { groceryHash } from '@/lib/app-route'
import { MealFoodEditSheet, type MealFoodEditContext } from '@/components/nutrition/MealFoodEditSheet'
// DEFERRED, NOT BUNDLED. Both sheets only exist once somebody taps Move or
// Add food, so paying for them on first paint is paying for a screen most
// opens never reach. Caught by test:bundle going 11 kB over its ceiling the
// day they were added — the honest fix is to defer them, not to raise the
// budget, which is the one thing that check exists to stop.
import type { MealMoveContext } from './nutrition/MealMoveSheet'
const MealMoveSheet = lazy(() => import('./nutrition/MealMoveSheet').then(m => ({ default: m.MealMoveSheet })))
const MealFoodAddSheet = lazy(() => import('./nutrition/MealFoodAddSheet').then(m => ({ default: m.MealFoodAddSheet })))

/** Exported so NutritionDisplay's shortfall nudge names slots in the same order this list renders them, rather than keeping a second copy that can drift. */
export const SLOT_ORDER: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
export const SLOT_LABEL: Record<MealSlotName, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

interface MealPlanProps {
  profileId: string | undefined
  /** Local-calendar YYYY-MM-DD, dev-clock-aware — same "today" set-log-store/getSessionDateContext use. */
  date: string
  /** Every generated option per slot — what the swap panel offers. */
  pools: Partial<Record<MealSlotName, PoolOption[]>>
  /** Today's assembled pick, one per active slot. */
  chosen: Partial<Record<MealSlotName, PoolOption>>
  /** Sum of the chosen options' macros. */
  totals: MacroTargets
  targets: MacroTargets | null
  /**
   * The goal a change is judged against — JUST the goal, because that is all
   * the trade-off decides anything from. See MealEditContext for why this is
   * not the whole profile.
   */
  fitnessGoal?: FitnessGoal
  isGenerating: boolean
  /**
   * Set when a (re)generate call failed or came back empty for one or more
   * slots. USUALLY the existing plan is left in place when this fires — but
   * not on the first background build after onboarding, where there is no
   * existing plan to preserve. That path writes its own copy accordingly;
   * don't assume the "your plan is unchanged" framing here.
   */
  regenerateError?: string | null
  onDismissRegenerateError?: () => void
  /**
   * Surfacing round — a value in dietary_preferences the app can't enforce.
   * Deliberately separate from regenerateError: not dismissable (the cause
   * doesn't go away until it's fixed), and routes to Profile instead of
   * offering a retry, since every retry fails identically for as long as
   * this is set.
   */
  unrecognisedDietaryRestrictions?: string[] | null
  onFixDietaryRestrictions?: () => void
  /**
   * The CURRENT restrictions, re-checked against every meal shown (audit
   * §2.1). Enforcement used to run only when a meal was created, so a
   * restriction turned on afterwards changed nothing and the food stayed on
   * screen unflagged, permanently.
   */
  dietaryPreferences?: string[]
  avoidFoods?: string[]
  mealsPerDay?: number
  includeSnacks?: boolean
  /**
   * Makes a verified option the slot's meal and says whether it landed. The
   * per-ingredient edits below need the boolean: they roll their own pool
   * write back when the pick fails, rather than leaving a meal in the plan
   * that nothing on screen claims to have added. Absent, the row menu simply
   * doesn't render — a control that cannot finish its job is worse than no
   * control.
   */
  onMealPickApplied?: (slot: MealSlotName, chosenName: string) => Promise<boolean>
  onSwapSlot: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerateSlot: (slot: MealSlotName) => Promise<void>
  onFindMoreOptions?: (slot: MealSlotName) => Promise<{ added: string[]; error?: string }>
  onRegenerateAll: () => Promise<void>
}

/**
 * Turn 7 ("Meals — same structure as the workout day", Density Pass) —
 * applies turn 5's exercise-day system here: no per-meal cards, slot names
 * as section labels, one hero number (today's planned calories), macros as
 * a quiet tabular-mono row, and the per-meal chrome (badges, macro grids,
 * "view ingredients" toggle) cut. Swap and ingredients only render on the
 * one meal the user has open — everything else is a single collapsed line,
 * mirroring ExerciseRow's collapsed/expanded contract.
 */
export function MealPlan({
  fitnessGoal,
  profileId, date, pools, chosen, totals, targets, isGenerating, regenerateError, onDismissRegenerateError,
  unrecognisedDietaryRestrictions, onFixDietaryRestrictions, dietaryPreferences = [], avoidFoods = [],
  mealsPerDay, includeSnacks, onMealPickApplied,
  onSwapSlot, onRegenerateSlot, onFindMoreOptions, onRegenerateAll,
}: MealPlanProps) {
  const activeSlots = SLOT_ORDER.filter(s => (pools[s]?.length ?? 0) > 0)
  // A slot generation requested and asked for (present as a key in `pools`,
  // per generateMealPools always seeding every active slot to []) but came
  // back with zero options must render honestly, never disappear — silently
  // dropping it lets the day's totals quietly absorb its calories elsewhere.
  const emptySlots = SLOT_ORDER.filter(s => s in pools && (pools[s]?.length ?? 0) === 0)
  /**
   * Audit §2.1, second half — the OFFER. A restriction turned on after these
   * meals were generated invalidates some of them, and the app knew and said
   * nothing. It says so now and offers to redo them.
   *
   * Never automatic, on the same reasoning as the weight-basis offer: a
   * silent rebuild throws away a plan someone may be four days into and may
   * already have shopped for. Ashley's ruling there was "ask rather than
   * rebuild silently", and this is the same situation.
   */
  const restrictionBySlot: Partial<Record<MealSlotName, MealRestrictionVerdict>> = {}
  for (const slot of SLOT_ORDER) {
    const option = chosen[slot]
    if (option) restrictionBySlot[slot] = checkMealAgainstRestrictions(option.name, option.ingredients, dietaryPreferences, avoidFoods)
  }
  const [expandedSlot, setExpandedSlot] = useState<MealSlotName | null>(null)

  // Which meals are already logged eaten today, keyed by slot — reuses
  // getTodayLedger's own local-first merge (server rows + pending queue) so
  // a just-tapped "Log this meal" reflects instantly, matching every other
  // confirm-action in this app. targets is only needed for getTodayLedger's
  // remaining-calc, which this screen doesn't use — totals (always present)
  // is a safe stand-in when targets hasn't loaded yet.
  //
  // EVERY event for a slot, not the last one. This used to be a single
  // record per slot built with `next[e.slot] = e`, which meant a slot logged
  // twice showed one entry and hid the other — while the ledger's `eaten`
  // sum, and so the totals ring above, counted both. The undo beside it could
  // only void the copy it could see. loggedEventsBySlot owns the grouping now
  // and keeps all of them; see its comment.
  const [loggedBySlot, setLoggedBySlot] = useState<Partial<Record<MealSlotName, MealEventRecord[]>>>({})
  // RETURNS ITS PROMISE, and that is a fix rather than tidiness. The log
  // button's busy flag cleared as soon as logMealEaten had queued, while this
  // refresh was still in flight — so for the length of one ledger round-trip
  // the button was live again and still reading "Log this meal". A second tap
  // in that window wrote a second event, which is how a slot came to hold two
  // in the first place. Awaiting it means the button is not tappable again
  // until the screen reflects the first tap.
  const reloadLogged = (): Promise<void> => {
    if (!profileId || !date) return Promise.resolve()
    // THE ROW FLIPS BEFORE THE NETWORK ANSWERS. This used to be the awaited
    // read alone, and the await starts with a request — so on a slow
    // connection the meal was already logged locally while its row still
    // said "Log this meal" and the totals above still read the old number
    // (Ashley, 8 Sep 2026). getLedgerSnapshot is the same grouping over what
    // the store already holds, no request; the read below still follows and
    // remains the authority, and the caller still awaits it, which is what
    // keeps the button from being tappable twice.
    const snap = getLedgerSnapshot(profileId, date)
    if (snap) setLoggedBySlot(loggedEventsBySlot(snap.events))
    return getTodayLedger(profileId, date, targets ?? totals)
      .then(ledger => { setLoggedBySlot(loggedEventsBySlot(ledger.events)) })
      .catch(console.error)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reloadLogged() }, [profileId, date])

  // A MEAL ALREADY EATEN IS NOT A WARNING — roadmap item 9. The banner tells
  // you which of today's meals to swap or regenerate; a meal you have already
  // eaten cannot be either, so listing it there asks for something impossible
  // and reads as a telling-off. It still gets a line, quietly, on its own row
  // (describeEatenBeforeChange). Declared here rather than beside
  // restrictionBySlot above because it needs loggedBySlot, which the state
  // hook below it owns.
  const blockedSlots = SLOT_ORDER.filter(
    s => restrictionBySlot[s] && !restrictionBySlot[s]!.ok && (loggedBySlot[s]?.length ?? 0) === 0,
  )

  /**
   * Undo tapped, and the meal stayed logged. Local to this screen because it
   * is about one tap, clears on the next attempt, and needs no plumbing
   * through App — the same reasoning the steps row's own entryError uses.
   */
  const [unlogError, setUnlogError] = useState<string | null>(null)

  const errorBanner = regenerateError && (
    <InsightBanner tone="warning" className="items-start justify-between">
      <span>{regenerateError}</span>
      {onDismissRegenerateError && (
        <button type="button" onClick={onDismissRegenerateError} className="shrink-0 text-xs font-semibold underline">
          Dismiss
        </button>
      )}
    </InsightBanner>
  )

  // Surfacing round — takes priority over errorBanner (App.tsx's handlers
  // return before setting regenerateError once this fires, so in practice
  // they don't overlap). No dismiss action: the cause doesn't go away until
  // Profile is actually fixed, so a dismiss button would just teach the user
  // to hide a problem that's still there next time they regenerate.
  const unrecognisedBanner = unrecognisedDietaryRestrictions && unrecognisedDietaryRestrictions.length > 0 && (
    <InsightBanner tone="warning" className="items-start justify-between">
      <span>
        {unrecognisedDietaryRestrictions.map(v => `"${v}"`).join(' and ')}{' '}
        {unrecognisedDietaryRestrictions.length === 1 ? "isn't a restriction" : "aren't restrictions"} this app can enforce, so it can't generate any meals right now.
        {' '}Remove {unrecognisedDietaryRestrictions.length === 1 ? 'it' : 'them'}, or pick one from the list in Profile.
      </span>
      {onFixDietaryRestrictions && (
        <button type="button" onClick={onFixDietaryRestrictions} className="shrink-0 text-xs font-semibold underline">
          Open Profile
        </button>
      )}
    </InsightBanner>
  )

  // NOTHING TO SHOW YET — two different situations, and telling them apart is
  // the difference between a screen that is working and one that looks broken.
  //
  // Since 6 Sep 2026 onboarding hands the app over BEFORE the meals are built
  // and finishes them in the background, so this branch is now the normal
  // first thing a new user sees on this tab. The old copy is wrong twice over
  // for them: they have just completed onboarding, and "Generate meals" would
  // fire a second concurrent build of the one already running.
  //
  // IT IS KEYED ON `isGenerating`, NOT ON "was this the first build". It was
  // the narrower thing for one day and that was a mistake with a witness:
  // Ashley pressed Generate meals on 7 Sep, generation ran for 34 seconds and
  // wrote thirteen meals — and for all 34 of those seconds this heading still
  // read "No meal plan generated yet" above a button wearing a small spinner,
  // because a user-pressed build was not "the first build". She reported the
  // button as dead. Any build with nothing yet to show says so.
  //
  // `data-tour="meals"` is on this branch as well as the populated one below,
  // and both tags stay in THIS file — the tour gate requires a key to be
  // tagged in exactly one file, and it is the tour's only anchor for its meals
  // stop. Without it here, that stop dims the whole screen and points at
  // nothing whenever the meals are not ready.
  if (activeSlots.length === 0 && emptySlots.length === 0) {
    return (
      <div data-tour="meals" className="flex flex-col items-center justify-center gap-3 py-16">
        {unrecognisedBanner || errorBanner}
        {isGenerating ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary-text" />
            <p className="text-sm text-muted-foreground">Building your meals…</p>
            <p className="text-xs text-muted-foreground/70">They arrive one meal at a time — this takes up to a minute.</p>
          </>
        ) : (
          <>
            <UtensilsCrossed className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No meal plan generated yet.</p>
            {unrecognisedBanner ? (
              <p className="text-xs text-muted-foreground/70">Fix the restriction above, then generate.</p>
            ) : (
              <p className="text-xs text-muted-foreground/70">Complete onboarding to generate your meal pools, or regenerate below.</p>
            )}
            {!unrecognisedBanner && (
              <Button size="sm" onClick={onRegenerateAll} disabled={isGenerating} className="mt-2">
                {isGenerating ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <RefreshCw className="size-3.5 mr-1.5" />}
                Generate meals
              </Button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div data-tour="meals" className="space-y-4">
      {unrecognisedBanner || errorBanner}
      {unlogError && (
        <InsightBanner tone="warning" className="items-start justify-between">
          <span>{unlogError}</span>
          <button type="button" onClick={() => setUnlogError(null)} className="shrink-0 text-xs font-semibold underline">
            Dismiss
          </button>
        </InsightBanner>
      )}
      {blockedSlots.length > 0 && (
        <InsightBanner tone="warning" className="items-start justify-between">
          <span>
            {blockedSlots.length === 1
              ? `Your ${SLOT_LABEL[blockedSlots[0]].toLowerCase()} no longer fits your restrictions.`
              : `${blockedSlots.length} of today's meals no longer fit your restrictions.`}
            {' '}They were built before you changed them.
          </span>
          <button
            type="button"
            onClick={onRegenerateAll}
            disabled={isGenerating}
            className="shrink-0 text-xs font-semibold underline disabled:opacity-50"
          >
            {isGenerating ? 'Redoing…' : 'Redo them'}
          </button>
        </InsightBanner>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="ds-label">Today's meals</span>
        {/* TWO CONTROLS, not one. The handoff specifies "Grocery list ›" on
            this row and shows nothing else; Regenerate all is kept beside it
            because this header is its ONLY call site — dropping it to match
            the frame would delete the one way to redo a day's meals, which
            is a capability change, not a presentation one. Flagged in the
            commit rather than silently resolved either way. */}
        <span className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onRegenerateAll}
            disabled={isGenerating}
            className="hit-slop-44 flex items-center gap-1.5 text-[0.6875rem] font-semibold text-muted-foreground disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Regenerate all
          </button>
          <button
            type="button"
            // THE LIST LEFT TOOLS on 12 Sep 2026 and this link did not follow
            // it — it went on pointing at a tab that no longer has a grocery
            // section on it. Found by test:nutrition-layout's sanity check,
            // which asks whether the destination really holds the list.
            onClick={() => { window.location.hash = groceryHash() }}
            className="hit-slop-44 text-[0.6875rem] font-semibold text-primary-text"
          >
            Grocery list ›
          </button>
        </span>
      </div>
      <p className="text-xs text-muted-foreground/70">
        Ingredients are filtered, not verified. Check labels if you have an allergy.
      </p>

      {targets && <TotalsHero totals={totals} targets={targets} />}

      <div>
        {activeSlots.map((slot, idx) => (
          <MealSlotRow
            key={slot}
            slot={slot}
            isFirst={idx === 0}
            option={chosen[slot] ?? null}
            alternatives={pools[slot] ?? []}
            expanded={expandedSlot === slot}
            onToggle={() => setExpandedSlot(prev => (prev === slot ? null : slot))}
            onSwap={onSwapSlot}
            onMealPickApplied={onMealPickApplied}
            editContextFor={o => (profileId && targets && onMealPickApplied)
              ? {
                  profileId, date, slot, targets, fitnessGoal,
                  mealsPerDay, includeSnacks,
                  dietaryPreferences: dietaryPreferences ?? [],
                  dislikedFoods: avoidFoods ?? [],
                  meal: { name: o.name, ingredients: o.ingredients.map(formatIngredient), macros: o.macros },
                  // WHAT SHE IS ALREADY BEING SERVED, across every slot, so a
                  // removal's swaps lead with foods from her own plan.
                  pantryFoods: SLOT_ORDER.flatMap(sl => (chosen[sl]?.ingredients ?? []).map(formatIngredient)),
                  // THE DAY AS IT STANDS. `totals` is already the sum of the
                  // chosen options' macros — the number this screen renders at
                  // the top — so the sheet judges against exactly what she is
                  // looking at. Recomputing it here would be a second view of
                  // one number, free to drift.
                  dayTotals: totals,
                }
              : null}
            moveContext={(profileId && targets && onMealPickApplied)
              ? {
                  profileId, date, fromSlot: slot, targets,
                  mealsPerDay, includeSnacks,
                  dietaryPreferences: dietaryPreferences ?? [],
                  dislikedFoods: avoidFoods ?? [],
                  // EVERY SLOT'S MEAL, because the destination's is what comes
                  // back the other way — Ashley's ruling that they swap places
                  // rather than one of them vanishing.
                  mealsBySlot: Object.fromEntries(SLOT_ORDER
                    .filter(sl => chosen[sl])
                    .map(sl => [sl, {
                      name: chosen[sl]!.name,
                      ingredients: chosen[sl]!.ingredients.map(formatIngredient),
                      macros: chosen[sl]!.macros,
                    }])),
                }
              : null}
            onRegenerate={onRegenerateSlot}
            onFindMore={onFindMoreOptions}
            checkAlternative={alt => checkMealAgainstRestrictions(alt.name, alt.ingredients, dietaryPreferences, avoidFoods)}
            loggedEvents={loggedBySlot[slot] ?? []}
            restriction={restrictionBySlot[slot] ?? null}
            onLog={async option => {
              if (!profileId) return
              logMealEaten(profileId, date, slot, option.name, {
                kcal: option.macros.calories, protein: option.macros.protein, carbs: option.macros.carbs, fat: option.macros.fat,
              })
              await reloadLogged()
            }}
            onUnlog={async clientIds => {
              const removed = await voidMealEvents(clientIds)
              // The reload runs either way — it is what puts a failed undo's
              // meal back on screen, and the message below is what explains
              // why it came back instead of leaving the user to guess.
              await reloadLogged()
              setUnlogError(removed ? null : "That meal is still logged — we couldn't reach the server. Try again in a moment.")
            }}
          />
        ))}
        {/* Surfacing round — a per-slot Retry is a dead end while a
            restriction is unrecognised (every retry fails identically), and
            showing four of them would restate the false promise the top
            banner already exists to remove. The banner is the only action
            offered in this state. */}
        {!unrecognisedBanner && emptySlots.map(slot => (
          <EmptySlotRow key={slot} slot={slot} isGenerating={isGenerating} onRegenerate={onRegenerateSlot} />
        ))}
      </div>
    </div>
  )
}

/** A slot generation asked for but couldn't fill — rendered honestly instead
 * of vanishing (its calories/protein must never get silently folded into
 * another slot's portions, which is what assembleDay's repair scale used to
 * do). Per-slot retry, matching every other slot row's own regenerate action. */
function EmptySlotRow({ slot, isGenerating, onRegenerate }: { slot: MealSlotName; isGenerating: boolean; onRegenerate: (slot: MealSlotName) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 border-t py-3" style={{ borderColor: 'var(--hairline)' }}>
      <div>
        <p className="ds-label-compact">{SLOT_LABEL[slot]}</p>
        <p className="text-sm text-muted-foreground">Couldn't generate this meal.</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={isGenerating || busy}
        onClick={async () => { setBusy(true); try { await onRegenerate(slot) } finally { setBusy(false) } }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <RefreshCw className="size-3.5 mr-1.5" />}
        Retry
      </Button>
    </div>
  )
}

/** One hero number (today's planned calories) + a 2px progress line + a quiet tabular-mono macro row — replaces the old dual progress-bar TotalsBar. */
function TotalsHero({ totals, targets }: { totals: MacroTargets; targets: MacroTargets }) {
  const calPct = targets.calories > 0 ? Math.min(100, (totals.calories / targets.calories) * 100) : 0
  const calDelta = Math.round(totals.calories - targets.calories)
  const proteinAchieved = targets.protein > 0 && totals.protein >= targets.protein
  // Fix 4.6 (ux-sweep) — this used to say "on the number" purely off the
  // calorie delta, so a day 32% over on protein and 27% under on carbs
  // still read as "on the number" because calories alone happened to land
  // close — an "at or above target" check on protein isn't enough either,
  // since that's true at 32% over too. Now requires calories AND protein
  // AND carbs to each be within a real tolerance of target before making
  // that claim; otherwise it states the actual calorie delta (unchanged,
  // and was always honest on its own — the "on the number" case was the
  // only one overclaiming).
  const withinTolerance = (actual: number, target: number, pct: number) =>
    target <= 0 || Math.abs(actual - target) <= target * pct
  const macrosOnTarget = Math.abs(calDelta) < 30
    && withinTolerance(totals.protein, targets.protein, 0.1)
    && withinTolerance(totals.carbs, targets.carbs, 0.1)
  const deltaLabel = Math.abs(calDelta) < 30
    ? (macrosOnTarget ? 'on the number' : 'kcal on target, macros off')
    : calDelta > 0 ? `${calDelta} over` : `${Math.abs(calDelta)} under`

  return (
    <div>
      <div className="flex items-end gap-3">
        <span className="tabular-mono ds-num-mega glow-mint-lg">{Math.round(totals.calories)}</span>
        <div className="flex flex-col gap-0.5 pb-1.5">
          <span className="text-sm text-foreground">kcal planned</span>
          <span className="ds-label-compact">target {targets.calories} · {deltaLabel}</span>
        </div>
      </div>
      <div className="mt-3 h-[2px] rounded-full" style={{ background: 'var(--hairline)' }}>
        <div className="h-[2px] rounded-full bg-primary glow-mint-box" style={{ width: `${calPct}%` }} />
      </div>
      <div className="mt-3 flex items-baseline gap-4 tabular-mono text-xs">
        <span className={proteinAchieved ? 'text-primary-text glow-mint' : 'text-muted-foreground'}>
          {Math.round(totals.protein)} / {targets.protein} P
        </span>
        <span className="text-muted-foreground">{Math.round(totals.carbs)} / {targets.carbs} C</span>
        <span className="text-muted-foreground">{Math.round(totals.fat)} / {targets.fat} F</span>
      </div>
    </div>
  )
}

function formatIngredient(ing: { name: string; quantity: number; unit: string }): string {
  const qty = Number.isInteger(ing.quantity) ? ing.quantity : Math.round(ing.quantity * 10) / 10
  return `${qty}${ing.unit === 'g' || ing.unit === 'ml' ? ing.unit : ` ${ing.unit}`} ${ing.name}`
}

function MealSlotRow({
  slot,
  isFirst,
  option,
  alternatives,
  expanded,
  onToggle,
  onSwap,
  onRegenerate,
  onFindMore,
  checkAlternative,
  loggedEvents,
  restriction,
  onLog,
  onUnlog,
  editContextFor,
  moveContext,
  onMealPickApplied,
}: {
  slot: MealSlotName
  isFirst: boolean
  option: PoolOption | null
  alternatives: PoolOption[]
  expanded: boolean
  onToggle: () => void
  onSwap: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerate: (slot: MealSlotName) => Promise<void>
  onFindMore?: (slot: MealSlotName) => Promise<{ added: string[]; error?: string }>
  /**
   * The swap panel's own restriction re-check. The CHOSEN meal has been
   * re-checked on display since the almond-butter fix; the ALTERNATIVES
   * offered beside it never were — a restriction recorded after generation
   * could sit tappable in this very list (found by the meal-system
   * investigation, 1 Sep 2026). A blocked option stays visible with the
   * reason, disabled — silently hiding it would make the pool look thinner
   * than it is for no stated cause.
   */
  checkAlternative: (alt: PoolOption) => MealRestrictionVerdict
  /** Every event logged against this slot today, oldest first. More than one means it was logged more than once and is being counted more than once. */
  loggedEvents: MealEventRecord[]
  /** Null when there is no meal to check; ok:true when it passes. */
  restriction: MealRestrictionVerdict | null
  onLog: (option: PoolOption) => Promise<void>
  onUnlog: (clientIds: string[]) => Promise<void>
  /** Null when the screen cannot finish an edit (no profile, no targets, no pick path) — the row menu then doesn't render at all. */
  editContextFor: (option: PoolOption) => MealFoodEditContext | null
  /** Null for the same reasons editContextFor is — the Move control then doesn't render either. */
  moveContext: MealMoveContext | null
  onMealPickApplied?: (slot: MealSlotName, chosenName: string) => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addNote, setAddNote] = useState<string | null>(null)
  const [moveNote, setMoveNote] = useState<string | null>(null)
  /** Which ingredient line has its edit open, by index. One at a time. */
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [editNote, setEditNote] = useState<string | null>(null)
  const [findingMore, setFindingMore] = useState(false)
  const [findMoreNote, setFindMoreNote] = useState<string | null>(null)
  // Fix 4.3 (ux-sweep) — generateMealPools now rejects a same-named
  // proposal at the source, but a pool persisted before that fix can still
  // carry duplicate names; deduping here too means an already-onboarded
  // profile's swap list can't show the chosen meal a second time under a
  // near-identical macro reading, or a count that doesn't match what's
  // actually listed, until their next regenerate flushes the old pool.
  const seenNames = new Set<string>()
  const otherOptions = alternatives.filter(o => {
    const key = o.name.trim().toLowerCase()
    if (key === option?.name.trim().toLowerCase()) return false
    if (seenNames.has(key)) return false
    seenNames.add(key)
    return true
  })

  const handleChoose = async (name: string) => {
    setBusy(true)
    try {
      await onSwap(slot, name)
      setSwapOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const handleRegenerate = async () => {
    setBusy(true)
    try {
      await onRegenerate(slot)
    } finally {
      setBusy(false)
    }
  }

  const blocked = restriction != null && !restriction.ok

  const isLogged = loggedEvents.length > 0
  // WHAT YOU ATE, NOT WHAT THE PLAN NOW SAYS — roadmap item 9. `option` is
  // re-derived from the current pools on every render, so swapping this slot
  // or adding a food to it after logging used to leave the NEW meal's name
  // sitting above the OLD meal's calories. An earlier comment below called
  // that "considered and kept"; Ashley's item 9 overrides it — a record of
  // what was eaten must not be rewritten by a later change of mind. The event
  // carries its own name, copied at log time, and this is the one place the
  // screen reads it.
  const loggedName = loggedEvents[0]?.mealName ?? null
  const displayName = isLogged && loggedName ? loggedName : option?.name ?? ''
  // The plan has moved on from what was eaten. Said once, in the expanded
  // view, so the macros and ingredients below it are attributable.
  const planMovedOn = isLogged && loggedName != null && option != null && loggedName !== option.name
  // Only meaningful when the eaten meal IS still this slot's option: the
  // ledger stores no ingredients, so for anything else there is nothing to
  // check and the honest output is silence rather than a guess.
  const eatenNote = isLogged && !planMovedOn && restriction && !restriction.ok
    ? describeEatenBeforeChange(restriction)
    : null
  // Logged more than once: the ledger counts every one of these, so this is
  // the true contribution of this row to today's totals, not option.macros.
  const duplicated = loggedEvents.length > 1
  const loggedKcal = loggedEvents.reduce((sum, e) => sum + (e.macros?.kcal ?? 0), 0)

  const handleLogToggle = async () => {
    if (!option) return
    // A flagged meal cannot be logged as eaten. This is the half that makes
    // the flag mean something: a warning you can tap straight past teaches
    // the user the warning is decorative. Unlogging is always allowed —
    // whatever is already recorded stays correctable.
    if (blocked && !isLogged) return
    setBusy(true)
    try {
      // ALL of them. Undo here means "this meal is not logged", and leaving
      // a second copy counting while the button flips back to "Log this
      // meal" is the state that made the double-count invisible.
      if (isLogged) await onUnlog(loggedEvents.map(e => e.clientId))
      else await onLog(option)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-4" style={!isFirst ? { borderTop: '1px solid var(--hairline)' } : undefined}>
      <button type="button" onClick={onToggle} disabled={!option} className="flex w-full flex-col gap-1.5 text-left disabled:cursor-default">
        <span className={expanded ? 'ds-label-compact text-primary-text glow-mint' : 'ds-label-compact'}>
          {SLOT_LABEL[slot]}{expanded ? ' · open' : ''}
        </span>
        <div className="flex items-baseline justify-between gap-3">
          {option ? (
            <>
              {/* NOT `truncate` — reported by Ashley, 3 Sep 2026: "Steak with
                  New Potatoes and Asparagus" showed as a clipped single line
                  with no way to read the rest. `truncate` was on BOTH states,
                  so expanding the card did not reveal it either.
                  Expanded: wrap in full, since the card is already the thing
                  the user opened to read. Collapsed: two lines via
                  line-clamp-2 rather than one hard cut, which fits every meal
                  name in the pool while keeping the row compact. `min-w-0`
                  stays either way — without it the flex row refuses to shrink
                  and the macros beside it get pushed off. */}
              {/* data-meal-name: the one stable way to read which meal is in
                  which slot. verify:meal-move used to scrape the rendered text
                  under each slot heading, which broke the moment the Move
                  sheet put the words "Lunch" and "Dinner" inside an expanded
                  row — the driver then read a destination BUTTON as the slot's
                  meal. A test hook beats a text scrape that any layout change
                  can quietly redefine. */}
              <span
                data-meal-name={slot}
                className={expanded ? 'min-w-0 text-[1.1875rem] font-semibold tracking-[-.02em]' : 'min-w-0 line-clamp-2 text-[1rem] font-medium'}
              >
                {displayName}
              </span>
              {!expanded && (
                <span className="flex shrink-0 items-center gap-1">
                  {/* THE NUMBER THAT IS ACTUALLY COUNTING. A duplicated slot
                      showed the meal's own calories with a tick beside it
                      while contributing twice that to the totals above — the
                      one place a user could have caught the discrepancy, and
                      it agreed with the wrong figure.
                      The events carry the macros as they were AT LOG TIME, so
                      swapping the slot after logging leaves this number on the
                      meal that was actually eaten while the name above shows
                      the new pick. Considered and kept: what the day is
                      carrying is the useful truth here, and unlogging and
                      logging again corrects it in two taps. */}
                  <span className={`tabular-mono text-[0.8125rem] ${duplicated ? 'text-[color:var(--role-warn-text)]' : isLogged ? 'text-primary-text glow-mint' : 'text-muted-foreground'}`}>
                    {Math.round(isLogged ? loggedKcal : option.macros.calories)} kcal{isLogged ? ' ✓' : ''}
                    {duplicated ? ` ·×${loggedEvents.length}` : ''}
                  </span>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No option generated</span>
          )}
        </div>
      </button>

      {eatenNote && (
        /* QUIET, AND NOT AN INSTRUCTION — Ashley's ruling, 9 Sep 2026. Muted
           rather than warn-coloured, no icon, no "swap it": the meal is eaten
           and there is nothing left to do about it.
           ON THE ROW, NOT INSIDE THE EXPANDED DETAIL. The first build put it
           behind a tap, which the browser driver caught: someone who has just
           added an allergen tag is exactly the person who should not have to
           go looking for the sentence that says this morning's meal contained
           it. Collapsed and expanded both show it. */
        <p className="mt-1.5 text-[0.71875rem] leading-snug text-muted-foreground">
          {eatenNote}
        </p>
      )}

      {!option && (
        <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={busy} className="mt-2 h-7 px-2 text-xs">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Generate'}
        </Button>
      )}

      {expanded && option && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <span className="tabular-mono ds-num-lg">{Math.round(option.macros.calories)}</span>
            <div className="flex flex-col gap-0.5 pb-0.5">
              <span className="text-xs text-foreground">kcal</span>
              <span className="tabular-mono ds-label-compact">
                {Math.round(option.macros.protein)} P · {Math.round(option.macros.carbs)} C · {Math.round(option.macros.fat)} F
              </span>
            </div>
          </div>

          {option.ingredients.length > 0 && (
            /* EVERY LINE IS A CONTROL, not a readout. Until 12 Sep 2026 the
               coach could take a food out of a meal, swap it or resize it and
               this screen could not — one of the parity gaps CLAUDE.md counts.
               Tapping a line opens the same three verbs the coach has, built
               by the same builders and applied through the same executor.
               The lines are re-rendered from formatIngredient so the string
               handed to the builder is exactly the one on screen. */
            <div className="flex flex-col gap-2">
              <span className="ds-label-compact">{option.ingredients.length} ingredients</span>
              <div className="flex flex-col gap-1.5">
                {option.ingredients.map((ing, i) => {
                  const line = formatIngredient(ing)
                  const editable = editContextFor(option) !== null
                  return (
                    <div key={i}>
                      {editable ? (
                        <button
                          type="button"
                          className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
                          data-ingredient-row={line}
                          aria-expanded={editingLine === i}
                          onClick={() => { setEditNote(null); setEditingLine(prev => (prev === i ? null : i)) }}
                        >
                          <span className="tabular-mono text-xs text-[color:var(--text-tertiary)]">{line}</span>
                          <span className="shrink-0 text-[0.625rem] text-muted-foreground">Change</span>
                        </button>
                      ) : (
                        <span className="tabular-mono text-xs text-[color:var(--text-tertiary)]">{line}</span>
                      )}
                      {editingLine === i && (() => {
                        const ctx = editContextFor(option)
                        if (!ctx || !onMealPickApplied) return null
                        return (
                          <MealFoodEditSheet
                            ctx={ctx}
                            line={line}
                            onPick={onMealPickApplied}
                            onDone={summary => { setEditingLine(null); setEditNote(summary) }}
                            onCancel={() => setEditingLine(null)}
                          />
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
              {editNote && <p className="text-[0.71875rem] text-muted-foreground">{editNote}. Your day has been re-fitted around it.</p>}
            </div>
          )}

          {/* HOW TO COOK IT. The generator has always written a method and the
              app has always thrown it away — no field on the option, no column
              in the table — so a meal arrived as a name and a list of weighed
              ingredients with no instructions. Rendered UNDER the ingredients
              on purpose: the amounts are the ingredients' job, and the method
              never carries any.

              RE-CHECKED ON DISPLAY, not only at generation. Verification is
              where a method naming an amount is supposed to be dropped, but
              that is a check at the write boundary and this is the surface
              where being wrong actually costs something — the same reason the
              dietary re-check runs here rather than trusting what was stored.
              A row written by any future path, or by hand, cannot put an
              unverified number on the screen.
              Absent on every pool generated before the column existed, and on
              custom meals and edited meals, which genuinely have no method. */}
          {methodSafeToShow(option.prep).length > 0 && (
            <div className="flex flex-col gap-1.5" data-meal-method={option.name}>
              <span className="ds-label-compact">Method</span>
              <p className="whitespace-pre-line text-xs leading-relaxed text-[color:var(--text-tertiary)]">
                {methodSafeToShow(option.prep)}
              </p>
            </div>
          )}

          {/* Fix 4.5 (ux-sweep) — generateMealPools now only ever writes
              [cuisine, prepBand] going forward, but a pool persisted before
              that fix can still carry the old internal 'slot_appropriate'
              marker and a raw ingredient name as if they were display tags.
              Defensive filter here too, so an already-onboarded profile
              stops seeing the leak immediately rather than waiting on its
              next regenerate. */}
          {option.tags.filter(t => t !== 'slot_appropriate').slice(0, 2).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {option.tags.filter(t => t !== 'slot_appropriate').slice(0, 2).map(t => (
                <span key={t} className="rounded-full bg-[color:var(--surface-raised)] px-2 py-0.5 text-[0.625rem] text-muted-foreground">{t}</span>
              ))}
            </div>
          )}

          {planMovedOn && (
            /* The heading above is what was EATEN; everything in this block —
               calories, ingredients, tags — is the slot's CURRENT option.
               Without this line the two silently disagree. */
            <p className="text-[0.71875rem] leading-snug text-muted-foreground">
              Your plan now shows {option.name} here. The details below are that meal, not the one you logged.
            </p>
          )}

          {blocked && !isLogged && restriction?.message && (
            /* Above the buttons, not below: it explains why the one beside
               it is greyed out, and a reason that arrives after the action
               has already been refused is not an explanation.
               NOT for an eaten meal (item 9) — that gets eatenNote above. */
            <p className="flex items-start gap-1.5 rounded-xl bg-[color:var(--role-warn-bg)] px-3 py-2 text-[0.71875rem] leading-snug text-[color:var(--role-warn-text)]">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {restriction.message} Swap it, or regenerate this meal.
              </span>
            </p>
          )}

          {duplicated && (
            /* SAID OUT LOUD, in the number that is wrong. The totals ring at
               the top of this screen has been counting this meal more than
               once; until this said so, the only visible symptom was a day's
               calories that didn't add up and no row admitting why. Sits
               above the button, like the restriction banner, because it
               explains what that button is about to do. */
            <p className="flex items-start gap-1.5 rounded-xl bg-[color:var(--role-warn-bg)] px-3 py-2 text-[0.71875rem] leading-snug text-[color:var(--role-warn-text)]">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Logged {loggedEvents.length} times, so today&apos;s totals are counting {Math.round(loggedKcal)} kcal
                for it instead of {Math.round(option.macros.calories)}.
                {' '}Clear {loggedEvents.length === 2 ? 'both' : 'them'} below, then log it once.
              </span>
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogToggle}
              disabled={busy || (blocked && !isLogged)}
              className={
                isLogged
                  ? 'flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary/15 px-3.5 text-xs font-semibold text-primary-text'
                  : blocked
                    ? 'flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[color:var(--surface-raised)] px-3.5 text-xs font-semibold text-muted-foreground'
                    : 'flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground glow-mint-box'
              }
            >
              {isLogged
                ? <><Check className="size-3.5" /> {duplicated ? `Clear ${loggedEvents.length} logs` : 'Logged'}</>
                : 'Log this meal'}
            </button>
            <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={busy} className="h-8 px-2.5 text-xs" title="Regenerate this slot's pool">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
            {/* MOVE — beside Swap because they are the same kind of change to
                the same meal, and because this is where she is already
                looking when she decides she wants dinner as a snack. Hidden
                when the screen cannot finish the job (no profile, no targets,
                no pick path), on the same rule the food edits follow: a
                control that cannot finish is worse than no control. */}
            {moveContext && onMealPickApplied && (
              <button
                type="button"
                onClick={() => { setMoveOpen(prev => !prev); setMoveNote(null) }}
                className="text-xs text-muted-foreground"
                data-testid="meal-move-open"
              >
                Move
              </button>
            )}
            {/* ADD A FOOD — the last thing on this row the coach could do and
                the screen could not. Same builder, same verifier, same
                executor as the coach's path; the only difference is that the
                screen picks from the food list rather than taking free text,
                which is strictly more honest — a food the app cannot cost is
                never offered rather than typed and then refused. */}
            {editContextFor(option) && onMealPickApplied && (
              <button
                type="button"
                onClick={() => { setAddOpen(prev => !prev); setAddNote(null) }}
                className="text-xs text-muted-foreground"
                data-testid="meal-food-add-open"
              >
                Add food
              </button>
            )}
            {(otherOptions.length > 0 || onFindMore) && (
              <button
                type="button"
                onClick={() => setSwapOpen(prev => !prev)}
                className="text-xs text-muted-foreground"
              >
                {otherOptions.length > 0
                  ? `Swap · ${otherOptions.length} option${otherOptions.length === 1 ? '' : 's'}`
                  : 'More options'}
              </button>
            )}
          </div>

          {addOpen && onMealPickApplied && (() => {
            const ctx = editContextFor(option)
            if (!ctx) return null
            return (
              <Suspense fallback={null}><MealFoodAddSheet
                ctx={{
                  profileId: ctx.profileId, date: ctx.date, slot: ctx.slot, targets: ctx.targets,
                  mealsPerDay: ctx.mealsPerDay, includeSnacks: ctx.includeSnacks,
                  dietaryPreferences: ctx.dietaryPreferences, dislikedFoods: ctx.dislikedFoods,
                  meal: ctx.meal,
                }}
                onPick={onMealPickApplied}
                onDone={summary => { setAddOpen(false); setAddNote(summary) }}
                onCancel={() => setAddOpen(false)}
              /></Suspense>
            )
          })()}
          {addNote && <p className="text-[0.71875rem] text-muted-foreground">{addNote}. The rest of the meal is unchanged.</p>}

          {moveOpen && moveContext && onMealPickApplied && (
            <Suspense fallback={null}>
              <MealMoveSheet
                ctx={moveContext}
                onPick={onMealPickApplied}
                onDone={summary => { setMoveOpen(false); setMoveNote(summary) }}
                onCancel={() => setMoveOpen(false)}
              />
            </Suspense>
          )}
          {moveNote && <p className="text-[0.71875rem] text-muted-foreground">{moveNote}. Both were resized to fit where they landed.</p>}

          {swapOpen && (
            <div className="flex flex-col gap-1">
              {otherOptions.map(alt => {
                const calDelta = Math.round(alt.macros.calories - option.macros.calories)
                const proteinDelta = Math.round(alt.macros.protein - option.macros.protein)
                const verdict = checkAlternative(alt)
                return (
                  <button
                    key={alt.name}
                    type="button"
                    onClick={() => handleChoose(alt.name)}
                    disabled={busy || !verdict.ok}
                    className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${verdict.ok ? 'hover:bg-[color:var(--surface-raised)]' : 'opacity-60'}`}
                  >
                    <div className="min-w-0">
                      {/* Same fix as the slot name above: two lines, not one
                          clipped one. An alternative you cannot read is one
                          you cannot choose. */}
                      <p className="line-clamp-2 text-xs font-medium">{alt.name}</p>
                      {verdict.ok ? (
                        <p className="tabular-mono text-[0.65625rem] text-muted-foreground">{Math.round(alt.macros.calories)} kcal · P {Math.round(alt.macros.protein)}g</p>
                      ) : (
                        <p className="text-[0.65625rem] text-[color:var(--role-warn)]">{verdict.message ?? "Clashes with what you've said you avoid"}</p>
                      )}
                    </div>
                    {verdict.ok && (
                      <span className={`tabular-mono shrink-0 text-[0.65625rem] ${Math.abs(calDelta) < 20 ? 'text-muted-foreground' : calDelta > 0 ? 'text-[color:var(--role-warn)]' : 'text-primary-text'}`}>
                        {calDelta > 0 ? '+' : ''}{calDelta} kcal, {proteinDelta > 0 ? '+' : ''}{proteinDelta}g P
                      </span>
                    )}
                  </button>
                )
              })}
              {onFindMore && (
                <button
                  type="button"
                  disabled={findingMore}
                  onClick={async () => {
                    setFindingMore(true)
                    setFindMoreNote(null)
                    try {
                      const result = await onFindMore(slot)
                      setFindMoreNote(result.error ?? (result.added.length > 0
                        ? `Added ${result.added.length} new option${result.added.length === 1 ? '' : 's'}.`
                        : 'Nothing new fitted your targets.'))
                    } finally {
                      setFindingMore(false)
                    }
                  }}
                  className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-[color:var(--hairline)] px-3 text-xs text-muted-foreground"
                >
                  {findingMore ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  {findingMore ? 'Finding more options…' : 'More options'}
                </button>
              )}
              {findMoreNote && <p className="px-1 text-[0.65625rem] text-muted-foreground">{findMoreNote}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
