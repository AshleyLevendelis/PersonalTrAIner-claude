import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  UtensilsCrossed,
  RefreshCw,
  Loader2,
  Check,
  ChevronDown,
  ShieldAlert,
  Plus,
} from 'lucide-react'
import { InsightBanner } from '@/components/ui/insight-banner'
import type { MacroTargets } from '@/lib/types'
import { getTodayLedger, logMealEaten, voidMealEvents, loggedEventsBySlot, type MealSlotName, type MealEventRecord } from '@/lib/meal-store'
import { checkMealAgainstRestrictions, type MealRestrictionVerdict } from '@/lib/meal-restriction-check'
import type { PoolOption } from '@/lib/meal-generation'

const SLOT_ORDER: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
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
  isGenerating: boolean
  /** Set when a (re)generate call failed or came back empty for one or more slots — the existing plan is always left in place when this fires. */
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
  profileId, date, pools, chosen, totals, targets, isGenerating, regenerateError, onDismissRegenerateError,
  unrecognisedDietaryRestrictions, onFixDietaryRestrictions, dietaryPreferences = [], avoidFoods = [],
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
  const blockedSlots = SLOT_ORDER.filter(s => restrictionBySlot[s] && !restrictionBySlot[s]!.ok)

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
    return getTodayLedger(profileId, date, targets ?? totals)
      .then(ledger => { setLoggedBySlot(loggedEventsBySlot(ledger.events)) })
      .catch(console.error)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reloadLogged() }, [profileId, date])

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

  if (activeSlots.length === 0 && emptySlots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        {unrecognisedBanner || errorBanner}
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
      </div>
    )
  }

  return (
    <div data-tour="meals" className="space-y-4">
      {unrecognisedBanner || errorBanner}
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
      <div className="flex items-center justify-between">
        <span className="ds-label">Today's meals</span>
        <button
          type="button"
          onClick={onRegenerateAll}
          disabled={isGenerating}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          Regenerate all
        </button>
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
              await voidMealEvents(clientIds)
              await reloadLogged()
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
        <span className={proteinAchieved ? 'text-primary glow-mint' : 'text-muted-foreground'}>
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
}) {
  const [busy, setBusy] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
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
        <span className={expanded ? 'ds-label-compact text-primary glow-mint' : 'ds-label-compact'}>
          {SLOT_LABEL[slot]}{expanded ? ' · open' : ''}
        </span>
        <div className="flex items-baseline justify-between gap-3">
          {option ? (
            <>
              <span className={expanded ? 'min-w-0 truncate text-[1.1875rem] font-semibold tracking-[-.02em]' : 'min-w-0 truncate text-[1.03125rem] font-medium'}>
                {option.name}
              </span>
              {!expanded && (
                <span className="flex shrink-0 items-center gap-1">
                  {/* THE NUMBER THAT IS ACTUALLY COUNTING. A duplicated slot
                      showed the meal's own calories with a tick beside it
                      while contributing twice that to the totals above — the
                      one place a user could have caught the discrepancy, and
                      it agreed with the wrong figure. */}
                  <span className={`tabular-mono text-xs ${duplicated ? 'text-[color:var(--role-warn-text)]' : isLogged ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
                    {isLogged ? '✓ ' : ''}{Math.round(isLogged ? loggedKcal : option.macros.calories)} kcal
                    {duplicated ? ` ·×${loggedEvents.length}` : ''}
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No option generated</span>
          )}
        </div>
      </button>

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
            <div className="flex flex-col gap-2">
              <span className="ds-label-compact">{option.ingredients.length} ingredients</span>
              <div className="flex flex-col gap-1.5">
                {option.ingredients.map((ing, i) => (
                  <span key={i} className="tabular-mono text-xs text-[color:var(--text-tertiary)]">{formatIngredient(ing)}</span>
                ))}
              </div>
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

          {blocked && restriction?.message && (
            /* Above the buttons, not below: it explains why the one beside
               it is greyed out, and a reason that arrives after the action
               has already been refused is not an explanation. */
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
                  ? 'flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary/15 px-3.5 text-xs font-semibold text-primary'
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
                      <p className="truncate text-xs font-medium">{alt.name}</p>
                      {verdict.ok ? (
                        <p className="tabular-mono text-[0.65625rem] text-muted-foreground">{Math.round(alt.macros.calories)} kcal · P {Math.round(alt.macros.protein)}g</p>
                      ) : (
                        <p className="text-[0.65625rem] text-[color:var(--role-warn)]">{verdict.message ?? "Clashes with what you've said you avoid"}</p>
                      )}
                    </div>
                    {verdict.ok && (
                      <span className={`tabular-mono shrink-0 text-[0.65625rem] ${Math.abs(calDelta) < 20 ? 'text-muted-foreground' : calDelta > 0 ? 'text-[color:var(--role-warn)]' : 'text-primary'}`}>
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
