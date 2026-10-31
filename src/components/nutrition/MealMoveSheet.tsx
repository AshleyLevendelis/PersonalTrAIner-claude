import { useState, useMemo, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { buildMealMoveProposal } from '@/lib/meal-move'
import { executeMealMove } from '@/lib/pending-action-executor'
import type { MealDayMoveController, MealDayMoveResult } from '@/lib/meal-day-move'
import { DAY_MOVE, REBALANCE } from '@/lib/coach-voice'
import type { MealRebalanceResult } from '@/lib/meal-rebalance'
import { weekdayLong, weekdayShort, dayLabel } from '@/lib/day-labels'
import type { MealAdditionPayload } from '@/lib/meal-addition'
import type { MealSlotName } from '@/lib/meal-store'
import type { MacroTargets } from '@/lib/types'
import type { CurrentMealForSlot } from '@/lib/meal-food-add'
import { revealBelowTap } from './reveal'
import type { ProposalDiff } from '@/lib/pending-actions-store'

// ---------------------------------------------------------------------------
// MOVING A MEAL, FROM THE SCREEN — "I'll have dinner as my snack instead."
//
// NO RADIX MENU, and the same reason MealFoodEditSheet gives for not having
// one: the destinations are three plain buttons in an expanded row, because a
// dropdown on a phone held one-handed in a kitchen is a second tap and a
// target that moves. This is that component's shape with a different verb.
//
// PROPOSE, THEN CONFIRM — never a one-tap move. The resize is the part she
// cannot predict from the request she made ("put dinner in the snack slot"
// does not tell her the portions halve), so the card states both new sizes
// and nothing is written until she taps again. That is the same contract the
// coach's cards have, and the screen does not get a weaker one.
//
// TWO KINDS OF DESTINATION, ONE SHEET (29 Sep 2026). Another MEAL today (both
// resized to fit) and another DAY (the same meal on the other day; they swap
// places, nothing is resized). Both were Ashley's rulings and both end in the
// same preview and the same confirm, so the sheet holds one destination at a
// time and one preview.
//
// AND SOME OF ITS CALORIES TO ANOTHER MEAL (20 Oct 2026, her "Ask how much
// first"): a meal, then how much, as buttons, then both new sizes before the
// tap. The amounts, the card and the write are the coach's, through one
// controller (the day swap's, `rebalance`), so the two cannot offer different
// amounts or land different sizes.
// ---------------------------------------------------------------------------

export interface MealMoveContext {
  profileId: string
  date: string
  fromSlot: MealSlotName
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods: string[]
  /** Every slot's current meal — the destination's is what comes back the other way. */
  mealsBySlot: Partial<Record<MealSlotName, CurrentMealForSlot>>
}

const SLOT_LABEL: Record<MealSlotName, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
}

/** The preview both kinds of move show, in one shape. */
type Preview =
  | { kind: 'loading' }
  | { kind: 'refused'; reason: string }
  | { kind: 'ready'; diff: ProposalDiff; confirmLabel: string; run: () => Promise<string | null> }

/** What a finished swap hands back so the row can offer to put it back. */
export type MealMoveUndo = () => Promise<{ ok: boolean; text: string }>

export function MealMoveSheet({ ctx, dayMove, onPick, onDone, onCancel }: {
  /** Moving to another meal today. Null where that is not offered (another day's row). */
  ctx: MealMoveContext | null
  /** Swapping with another day's. Null where the app has no days to swap between. */
  dayMove: { controller: MealDayMoveController; date: string; slot: MealSlotName } | null
  onPick?: (slot: MealSlotName, chosenName: string) => Promise<boolean>
  /** `undo` is given for a swap between days only: the row shows it beside the summary. */
  onDone: (summary: string, undo?: MealMoveUndo) => void
  onCancel: () => void
}) {
  const [toSlot, setToSlot] = useState<MealSlotName | null>(null)
  const [toDate, setToDate] = useState<string | null>(null)
  // WHICH MEAL ON THE OTHER DAY (30 Sep 2026). The same meal unless she picks
  // another; a different meal swaps places with this one and both are resized.
  const [toMeal, setToMeal] = useState<MealSlotName | null>(null)
  const [dayPlan, setDayPlan] = useState<MealDayMoveResult | null>(null)
  // MOVING SOME CALORIES: to which meal, how much, the amounts it can take, and the card.
  const [rbTo, setRbTo] = useState<MealSlotName | null>(null)
  const [rbKcal, setRbKcal] = useState<number | null>(null)
  const [rbAsk, setRbAsk] = useState<MealRebalanceResult | null>(null)
  const [rbPlan, setRbPlan] = useState<MealRebalanceResult | null>(null)
  const rebalance = dayMove?.controller.rebalance ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only slots this profile actually has. A destination with no budget is a
  // control that cannot take effect, and the builder refuses it anyway — but
  // offering it and then refusing is worse than not offering it.
  const destinations = useMemo(
    () => (ctx ? (Object.keys(SLOT_LABEL) as MealSlotName[]).filter(s => s !== ctx.fromSlot && s in ctx.mealsBySlot) : []),
    [ctx],
  )
  const otherDays = useMemo(
    () => (dayMove ? dayMove.controller.dates.filter(d => d !== dayMove.date) : []),
    [dayMove],
  )

  const slotProposal = useMemo(
    () => (ctx && toSlot ? buildMealMoveProposal({
      rawArgs: { from_slot: ctx.fromSlot, to_slot: toSlot },
      mealsBySlot: ctx.mealsBySlot,
      profileId: ctx.profileId,
      todayDate: ctx.date,
      targets: ctx.targets,
      mealsPerDay: ctx.mealsPerDay,
      includeSnacks: ctx.includeSnacks,
      dietaryPreferences: ctx.dietaryPreferences,
      dislikedFoods: ctx.dislikedFoods,
    }) : null),
    [toSlot, ctx],
  )

  // THE DAY'S PLAN IS WORKED OUT WHEN A DAY IS TAPPED, from the live week, and
  // it reads the shopping list and the ledger to do it. Cleared first so a
  // previous day's card is never on screen under the newly chosen day's button.
  const dayDate = dayMove?.date
  const daySlot = dayMove?.slot
  useEffect(() => {
    setDayPlan(null)
    if (!toDate || !dayMove) return
    let live = true
    dayMove.controller.plan({ meal_slot: dayMove.slot, from_date: dayMove.date, to_date: toDate, to_slot: toMeal ?? dayMove.slot })
      .then(r => { if (live) setDayPlan(r) })
      .catch(() => { if (live) setDayPlan({ ok: false, reason: DAY_MOVE.refusals.wouldNotHold }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toDate, toMeal, dayDate, daySlot])

  // THE AMOUNTS ARE THE BUILDER'S ANSWER, asked with no amount the way the coach asks: the question and the amounts
  // these two meals can take, or why nothing can move.
  useEffect(() => {
    setRbAsk(null)
    setRbKcal(null)
    if (!rbTo || !rebalance || !dayMove) return
    let live = true
    rebalance.plan({ from_slot: dayMove.slot, to_slot: rbTo, date: dayMove.date })
      .then(r => { if (live) setRbAsk(r) })
      .catch(() => { if (live) setRbAsk({ ok: false, reason: REBALANCE.refusals.wouldNotHold }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rbTo, dayDate, daySlot])
  useEffect(() => {
    setRbPlan(null)
    if (!rbTo || rbKcal == null || !rebalance || !dayMove) return
    let live = true
    rebalance.plan({ from_slot: dayMove.slot, to_slot: rbTo, kcal: rbKcal, date: dayMove.date })
      .then(r => { if (live) setRbPlan(r) })
      .catch(() => { if (live) setRbPlan({ ok: false, reason: REBALANCE.refusals.wouldNotHold }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rbTo, rbKcal, dayDate, daySlot])

  const preview: Preview | null = useMemo(() => {
    if (rbTo) {
      if (!rbAsk) return { kind: 'loading' }
      if (!rbAsk.ok && !rbAsk.ask) return { kind: 'refused', reason: rbAsk.reason }
      if (rbKcal == null) return null
      if (!rbPlan) return { kind: 'loading' }
      if (!rbPlan.ok) return { kind: 'refused', reason: rbPlan.reason }
      const plan = rbPlan
      return {
        kind: 'ready',
        diff: plan.diff,
        confirmLabel: 'Move them',
        run: async () => {
          if (!rebalance || !dayMove) return null
          const receipt = await rebalance.confirm(plan.payload)
          if (receipt.failed.length > 0) return REBALANCE.failureLine(receipt.failed[0].error, receipt.landed.length > 0)
          const day = dayLabel(plan.payload.date, dayMove.controller.today)
          onDone(
            REBALANCE.done(plan.payload.kcal, day, plan.payload.from, plan.payload.to),
            // The same function the coach's Undo calls, handed the move it made.
            async () => {
              const back = await rebalance.undo(plan.payload)
              return back.failed.length > 0
                ? { ok: false, text: back.failed[0].error }
                : { ok: true, text: REBALANCE.undoDone(day, plan.payload.from, plan.payload.to) }
            },
          )
          return null
        },
      }
    }
    if (toDate) {
      if (!dayPlan) return { kind: 'loading' }
      if (!dayPlan.ok) return { kind: 'refused', reason: dayPlan.reason }
      const plan = dayPlan
      return {
        kind: 'ready',
        diff: plan.diff,
        confirmLabel: 'Swap them',
        run: async () => {
          const controller = dayMove!.controller
          const receipt = await controller.confirm(plan.payload)
          if (receipt.failed.length > 0) return DAY_MOVE.failureLine(receipt.failed[0].error, receipt.landed.length > 0)
          const [a, b] = plan.payload.legs
          const dayA = dayLabel(a.date, controller.today)
          const dayB = dayLabel(b.date, controller.today)
          onDone(
            a.slot === b.slot ? DAY_MOVE.done(a.slot, dayA, dayB) : DAY_MOVE.doneAcross(a.slot, dayA, b.slot, dayB),
            // The same function the coach's Undo calls, handed the swap it made.
            async () => {
              const back = await controller.undo(plan.payload)
              return back.failed.length > 0
                ? { ok: false, text: back.failed[0].error }
                : { ok: true, text: DAY_MOVE.undo.done(a.slot, dayA, b.slot, dayB) }
            },
          )
          return null
        },
      }
    }
    if (slotProposal) {
      if (!slotProposal.ok) return { kind: 'refused', reason: slotProposal.reason }
      const proposal = slotProposal
      return {
        kind: 'ready',
        diff: proposal.diff,
        confirmLabel: proposal.payload.legs.length === 2 ? 'Swap them' : 'Move it',
        run: async () => {
          if (!ctx || !onPick) return null
          const pick = (payload: MealAdditionPayload) => onPick(payload.slot, payload.option.name)
          const receipt = await executeMealMove(ctx.profileId, proposal.payload, pick)
          if (receipt.failed.length > 0) return receipt.failed[0].error
          onDone(`${proposal.payload.legs.length === 2
            ? `${SLOT_LABEL[ctx.fromSlot]} and ${SLOT_LABEL[proposal.payload.legs[0].slot]} swapped`
            : `Moved to ${SLOT_LABEL[proposal.payload.legs[0].slot].toLowerCase()}`}. Both were resized to fit where they landed.`)
          return null
        },
      }
    }
    return null
  }, [rbTo, rbAsk, rbKcal, rbPlan, rebalance, toDate, dayPlan, slotProposal, ctx, dayMove, onPick, onDone])

  // WHATEVER THE TAP PRODUCES IS BROUGHT INTO VIEW. The card, a refusal and a
  // failure all appear below the buttons that were tapped, and on a phone that
  // can be under the fold, under the fixed tab bar or under the recipe sheet's
  // footer: a message is only shown if it is on screen where the tap was.
  // revealBelowTap says how, for the page and for the sheet.
  const resultRef = useRef<HTMLDivElement>(null)
  const resultKind = preview?.kind
  useEffect(() => {
    if (!resultKind || resultKind === 'loading') return
    revealBelowTap(resultRef.current)
  }, [resultKind, toDate, toMeal, toSlot, rbTo, rbKcal, error])
  // The "how much?" question is what a tap on a meal produces before any card, so it is brought into view the same way.
  const askRef = useRef<HTMLDivElement>(null)
  const asking = !!(rbTo && rbAsk && !rbAsk.ok && rbAsk.ask)
  useEffect(() => { if (asking) revealBelowTap(askRef.current) }, [asking, rbTo])

  const confirm = async () => {
    if (preview?.kind !== 'ready') return
    setBusy(true)
    setError(null)
    const failure = await preview.run()
    setBusy(false)
    if (failure) setError(failure)
  }

  // The day's OTHER meals, for moving some calories to one. Only meals this profile has; only with the controller.
  const rbMeals = rebalance && dayMove ? dayMove.controller.slots.filter(m => m !== dayMove.slot) : []
  const nothingElse = destinations.length === 0 && otherDays.length === 0 && rbMeals.length === 0

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-[color:var(--surface-raised)] p-2.5" data-testid="meal-move-sheet">
      {nothingElse ? (
        <p className="text-[0.71875rem] text-muted-foreground">
          There's nowhere else to put it — this is your only meal today.
        </p>
      ) : (
        <>
          {destinations.length > 0 && (
            <>
              <p className="text-[0.71875rem] text-muted-foreground">Move it to…</p>
              <div className="flex flex-wrap gap-2">
                {destinations.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setRbTo(null); setToDate(null); setToMeal(null); setToSlot(prev => (prev === s ? null : s)); setError(null) }}
                    className={`min-h-[44px] rounded-xl px-3.5 text-xs font-semibold ${
                      toSlot === s ? 'bg-primary text-primary-foreground' : 'bg-[color:var(--surface-base)] text-foreground'
                    }`}
                    data-testid={`meal-move-to-${s}`}
                  >
                    {SLOT_LABEL[s]}
                  </button>
                ))}
              </div>
            </>
          )}
          {otherDays.length > 0 && dayMove && (
            <>
              <p className="text-[0.71875rem] text-muted-foreground">
                {destinations.length > 0 ? 'Or swap it with' : 'Swap it with'} another day…
              </p>
              <div className="flex flex-wrap gap-2" data-testid="meal-move-days">
                {otherDays.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setRbTo(null); setToSlot(null); setToMeal(null); setToDate(prev => (prev === d ? null : d)); setError(null) }}
                    aria-label={d === dayMove.controller.today ? 'Today' : weekdayLong(d)}
                    aria-pressed={toDate === d}
                    // px-2.5, not the meal buttons' px-3.5: six days have to
                    // fit one row on a 390px phone, or the last one wraps onto
                    // a line of its own.
                    className={`min-h-[44px] min-w-[44px] rounded-xl px-2.5 text-xs font-semibold ${
                      toDate === d ? 'bg-primary text-primary-foreground' : 'bg-[color:var(--surface-base)] text-foreground'
                    }`}
                    data-testid={`meal-move-day-${d}`}
                  >
                    {d === dayMove.controller.today ? 'Today' : weekdayShort(d)}
                  </button>
                ))}
              </div>
              {toDate && dayMove.controller.slots.length > 1 && (
                <>
                  <p className="text-[0.71875rem] text-muted-foreground">
                    …with {toDate === dayMove.controller.today ? "today's" : `${weekdayLong(toDate)}'s`}
                  </p>
                  <div className="flex flex-wrap gap-2" data-testid="meal-move-day-meals">
                    {dayMove.controller.slots.map(m => {
                      const current = (toMeal ?? dayMove.slot) === m
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => { setToMeal(m === dayMove.slot ? null : m); setError(null) }}
                          aria-pressed={current}
                          className={`min-h-[44px] rounded-xl px-3.5 text-xs font-semibold ${
                            current ? 'bg-primary text-primary-foreground' : 'bg-[color:var(--surface-base)] text-foreground'
                          }`}
                          data-testid={`meal-move-day-meal-${m}`}
                        >
                          {SLOT_LABEL[m]}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
          {rbMeals.length > 0 && (
            <>
              <p className="text-[0.71875rem] text-muted-foreground">Or move some of its calories to…</p>
              <div className="flex flex-wrap gap-2" data-testid="meal-rebalance-meals">
                {rbMeals.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setToSlot(null); setToDate(null); setToMeal(null); setRbTo(prev => (prev === m ? null : m)); setError(null) }}
                    aria-pressed={rbTo === m}
                    className={`min-h-[44px] rounded-xl px-3.5 text-xs font-semibold ${
                      rbTo === m ? 'bg-primary text-primary-foreground' : 'bg-[color:var(--surface-base)] text-foreground'
                    }`}
                    data-testid={`meal-rebalance-to-${m}`}
                  >
                    {SLOT_LABEL[m]}
                  </button>
                ))}
              </div>
              {/* HOW MUCH, ASKED FIRST (her ruling): the builder's own question and amounts, the coach's buttons. */}
              {rbTo && rbAsk && !rbAsk.ok && rbAsk.ask && (
                <>
                  <p className="text-[0.71875rem] text-muted-foreground" data-testid="meal-rebalance-ask">{rbAsk.reason}</p>
                  <div ref={askRef} className="flex flex-wrap gap-2" data-testid="meal-rebalance-amounts">
                    {rbAsk.ask.amounts.map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setRbKcal(prev => (prev === k ? null : k)); setError(null) }}
                        aria-pressed={rbKcal === k}
                        className={`min-h-[44px] rounded-xl px-3.5 text-xs font-semibold ${
                          rbKcal === k ? 'bg-primary text-primary-foreground' : 'bg-[color:var(--surface-base)] text-foreground'
                        }`}
                        data-testid={`meal-rebalance-kcal-${k}`}
                      >
                        {REBALANCE.chip(k, rbTo)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      <div ref={resultRef} className="space-y-2">
      {preview?.kind === 'loading' && (
        <p className="flex items-center gap-1.5 text-[0.71875rem] text-muted-foreground" data-testid="meal-move-loading">
          <Loader2 className="size-3.5 animate-spin" /> Checking how the week fits…
        </p>
      )}

      {preview?.kind === 'refused' && (
        <p className="text-[0.71875rem] text-[color:var(--role-warn)]" data-testid="meal-move-refusal">{preview.reason}</p>
      )}

      {/* WHAT IT WILL DO, BEFORE THE TAP. Both new sizes, because the resize
          is the thing she did not ask for and cannot predict; for a swap
          between days, both dishes and every other meal the swap changes. */}
      {preview?.kind === 'ready' && (
        <div className="space-y-1.5" data-testid="meal-move-preview">
          {preview.diff.rows.map(r => (
            <p key={r.field} className="text-[0.71875rem]">
              <span className="font-medium">{r.field}</span>
              <span className="text-muted-foreground"> · {r.before} → {r.after}{r.note ? ` (${r.note})` : ''}</span>
            </p>
          ))}
          {preview.diff.implications?.map((imp, i) => (
            <p
              key={i}
              className={`text-[0.65625rem] ${imp.severity === 'warn' ? 'text-[color:var(--role-warn)]' : 'text-muted-foreground'}`}
            >
              {imp.text}
            </p>
          ))}
          {error && <p className="text-[0.71875rem] text-[color:var(--role-warn)]" data-testid="meal-move-error">{error}</p>}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
              data-testid="meal-move-confirm"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {preview.confirmLabel}
            </button>
            <button type="button" onClick={onCancel} className="min-h-[44px] px-2 text-xs text-muted-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>

      {!preview && !nothingElse && (
        <button type="button" onClick={onCancel} className="min-h-[44px] px-2 text-xs text-muted-foreground">
          Cancel
        </button>
      )}
    </div>
  )
}
