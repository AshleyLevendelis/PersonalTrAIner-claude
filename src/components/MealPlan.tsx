import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  UtensilsCrossed,
  RefreshCw,
  Loader2,
  Check,
  ChevronDown,
} from 'lucide-react'
import { InsightBanner } from '@/components/ui/insight-banner'
import type { MacroTargets } from '@/lib/types'
import { getTodayLedger, logMealEaten, voidMealEvent, type MealSlotName, type MealEventRecord } from '@/lib/meal-store'
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
  onSwapSlot: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerateSlot: (slot: MealSlotName) => Promise<void>
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
  unrecognisedDietaryRestrictions, onFixDietaryRestrictions, onSwapSlot, onRegenerateSlot, onRegenerateAll,
}: MealPlanProps) {
  const activeSlots = SLOT_ORDER.filter(s => (pools[s]?.length ?? 0) > 0)
  // A slot generation requested and asked for (present as a key in `pools`,
  // per generateMealPools always seeding every active slot to []) but came
  // back with zero options must render honestly, never disappear — silently
  // dropping it lets the day's totals quietly absorb its calories elsewhere.
  const emptySlots = SLOT_ORDER.filter(s => s in pools && (pools[s]?.length ?? 0) === 0)
  const [expandedSlot, setExpandedSlot] = useState<MealSlotName | null>(null)

  // Which meals are already logged eaten today, keyed by slot — reuses
  // getTodayLedger's own local-first merge (server rows + pending queue) so
  // a just-tapped "Log this meal" reflects instantly, matching every other
  // confirm-action in this app. targets is only needed for getTodayLedger's
  // remaining-calc, which this screen doesn't use — totals (always present)
  // is a safe stand-in when targets hasn't loaded yet.
  const [loggedBySlot, setLoggedBySlot] = useState<Partial<Record<MealSlotName, MealEventRecord>>>({})
  const reloadLogged = () => {
    if (!profileId || !date) return
    getTodayLedger(profileId, date, targets ?? totals).then(ledger => {
      const next: Partial<Record<MealSlotName, MealEventRecord>> = {}
      for (const e of ledger.events) {
        if (e.slot && (e.eventType === 'confirmed' || e.eventType === 'extra')) next[e.slot] = e
      }
      setLoggedBySlot(next)
    }).catch(console.error)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadLogged, [profileId, date])

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
    <div className="space-y-4">
      {unrecognisedBanner || errorBanner}
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
            loggedEvent={loggedBySlot[slot]}
            onLog={async option => {
              if (!profileId) return
              logMealEaten(profileId, date, slot, option.name, {
                kcal: option.macros.calories, protein: option.macros.protein, carbs: option.macros.carbs, fat: option.macros.fat,
              })
              reloadLogged()
            }}
            onUnlog={async clientId => {
              await voidMealEvent(clientId)
              reloadLogged()
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
  loggedEvent,
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
  loggedEvent: MealEventRecord | undefined
  onLog: (option: PoolOption) => Promise<void>
  onUnlog: (clientId: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
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

  const handleLogToggle = async () => {
    if (!option) return
    setBusy(true)
    try {
      if (loggedEvent) await onUnlog(loggedEvent.clientId)
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
              <span className={expanded ? 'min-w-0 truncate text-[19px] font-semibold tracking-[-.02em]' : 'min-w-0 truncate text-[16.5px] font-medium'}>
                {option.name}
              </span>
              {!expanded && (
                <span className="flex shrink-0 items-center gap-1">
                  <span className={`tabular-mono text-xs ${loggedEvent ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
                    {loggedEvent ? '✓ ' : ''}{Math.round(option.macros.calories)} kcal
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
                <span key={t} className="rounded-full bg-[color:var(--surface-raised)] px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogToggle}
              disabled={busy}
              className={
                loggedEvent
                  ? 'flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary/15 px-3.5 text-xs font-semibold text-primary'
                  : 'flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground glow-mint-box'
              }
            >
              {loggedEvent ? <><Check className="size-3.5" /> Logged</> : 'Log this meal'}
            </button>
            <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={busy} className="h-8 px-2.5 text-xs" title="Regenerate this slot's pool">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
            {otherOptions.length > 0 && (
              <button
                type="button"
                onClick={() => setSwapOpen(prev => !prev)}
                className="text-xs text-muted-foreground"
              >
                Swap · {otherOptions.length} option{otherOptions.length === 1 ? '' : 's'}
              </button>
            )}
          </div>

          {swapOpen && otherOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              {otherOptions.map(alt => {
                const calDelta = Math.round(alt.macros.calories - option.macros.calories)
                const proteinDelta = Math.round(alt.macros.protein - option.macros.protein)
                return (
                  <button
                    key={alt.name}
                    type="button"
                    onClick={() => handleChoose(alt.name)}
                    disabled={busy}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-raised)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{alt.name}</p>
                      <p className="tabular-mono text-[10.5px] text-muted-foreground">{Math.round(alt.macros.calories)} kcal · P {Math.round(alt.macros.protein)}g</p>
                    </div>
                    <span className={`tabular-mono shrink-0 text-[10.5px] ${Math.abs(calDelta) < 20 ? 'text-muted-foreground' : calDelta > 0 ? 'text-[color:var(--role-warn)]' : 'text-primary'}`}>
                      {calDelta > 0 ? '+' : ''}{calDelta} kcal, {proteinDelta > 0 ? '+' : ''}{proteinDelta}g P
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
