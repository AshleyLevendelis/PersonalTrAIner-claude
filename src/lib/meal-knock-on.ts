// ---------------------------------------------------------------------------
// WHAT ELSE CHANGES WHEN A MEAL IS EDITED — read off a trial, not asserted.
//
// 9 Oct 2026, the test log's H9: 100 g of banana was added to a lunch, and the
// dinner and the snack were replaced with different dishes. The card had said
// "The rest of the day re-fits around it" — true, and no use to anybody,
// because it was a sentence written in advance rather than a look at what
// would happen. Pinning a meal makes the day's search run again over every
// other meal with that one fixed, and a lunch that is last night's dinner is
// re-made from whichever dinner is now served the night before, so one food
// can move a meal on a day nobody named.
//
// The standard already existed, for the newest meal tool only: the day swap's
// card "is read off a trial" (meal-day-move.ts). This is that trial for an
// edit that makes ONE new option and pins it to ONE date and meal — adding a
// food, and a custom meal. It serves the week exactly as the screen does, once
// as it stands and once as it will be after the tap (the new option in the
// meal's options, tagged as hers, and pinned to that date — what the executor
// writes), and reports every OTHER meal that differs: a different dish, or the
// same dish at a size she would notice. The sentences are the day swap's own
// (DAY_MOVE in the phrasebook), so the wording is already Ashley's.
//
// WHAT THIS DOES NOT DO, on purpose: choose. Which outcome the day's search
// prefers when a meal is pinned — re-portion the others, or pick different
// dishes — is untouched (an owner decision is open on it). This only tells
// the truth about whichever it picked.
// ---------------------------------------------------------------------------

import { serveMealWeek, type ServedDay } from './meal-rotation'
import { dayLabel } from './day-labels'
import { DAY_MOVE, KNOCK_ON } from './coach-voice'
import { isNoticeableResize, type MealDayMoveServing } from './meal-day-move'
import { USER_REQUESTED_TAG, type MealSlotName } from './meal-store'
import { dayVerdict, namedMiss, type PoolOption } from './meal-generation'
import { dayAsShown, type EatenMacros } from './day-as-shown'
import { isAfterEaten } from './meal-new-from'
import type { MacroTargets } from './types'
import type { ProposalDiff } from './pending-actions-store'

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** The most other-meal changes listed before the rest are folded into one line (the day swap's own limit). */
const MAX_LISTED_CHANGES = 4

export interface MealKnockOnChange {
  date: string
  slot: MealSlotName
  /** 'dish': a different dish is served. 'size': the same dish, at a size she would notice. */
  kind: 'dish' | 'size'
  from: string | null
  to: string
  fromKcal: number | null
  toKcal: number
}

export interface MealKnockOn {
  /** Every other meal that changes, different dishes first. Empty means the trial ran and nothing else moved. */
  changes: MealKnockOnChange[]
  /** The card's lines, in order: each change, a day the edit took off target, and the shopping list. */
  lines: NonNullable<ProposalDiff['implications']>
  /** The week as the trial served it with the edit in — what the screen should show after the tap. Absent when no trial could run. */
  after?: ServedDay[]
  /** The week as the screen serves it now, before the edit. Absent when no trial could run. */
  before?: ServedDay[]
  /**
   * The sentences for meals that changed on OTHER days, in the trial's own words ("Friday's lunch is now …").
   * The swap sheet names the day's own changes in its words and these beside them (QA round 3, 9 Nov 2026: it named
   * the edited day only, so a swap that changed tomorrow's leftover lunch said nothing about it on the screen, while
   * the coach's card for the same swap listed it).
   */
  elsewhere?: string[]
}

export type MealKnockOnFn = (date: string, slot: MealSlotName, option: PoolOption, existing?: boolean) => Promise<MealKnockOn>

export interface MealKnockOnInput {
  /** The week exactly as the screen serves it — the same object the day swap's trial is handed. */
  serving: MealDayMoveServing
  date: string
  slot: MealSlotName
  /** The new option, as the builder made it (before the executor's tag). */
  option: PoolOption
  /** Days on the shopping list; null when the list could not be read (said, never passed off as "none"). */
  listDates: string[] | null
  /**
   * The option is ALREADY one of the meal's options (a swap to another of her dishes, live test 19 Oct 2026): pinned as
   * the screen's swap pins it, by itself, neither added to the options nor tagged as her own request.
   */
  existing?: boolean
  /**
   * More new options pinned on the SAME date with this one — a meal moved to another slot writes one or two resized
   * copies (meal-move.ts), and both land at once (2 Nov 2026, the UX pass: the move's card is read off a trial too).
   */
  alsoPinned?: { slot: MealSlotName; option: PoolOption }[]
  /** Say what the edit does to the day's total, read off the trial (the move's card used to compute it from the two meals alone). */
  sayDayTotal?: boolean
  /**
   * TODAY AS THE SCREEN SHOWS IT (9 Nov 2026, QA round 3): what is logged as eaten, and whether the fit-around was
   * undone, so the trial compares today the way Nutrition draws it (day-as-shown.ts). Without it the card read the
   * plan and the screen then grew or shrank the meals left around what was eaten: "No other meal changes" over a
   * lunch that came out 11% bigger. Absent: the plan alone, as before.
   */
  todayShown?: { slots: MealSlotName[]; eatenBySlot: Partial<Record<MealSlotName, EatenMacros>>; keepAsPlanned: boolean }
}

/** One served day as the card compares it: the plan's own, or today as the screen shows it. */
interface DayView { chosen: Partial<Record<MealSlotName, PoolOption>>; totals: MacroTargets; withinTolerance: boolean; eaten: Set<MealSlotName> }

export function knockOnOfPin(input: MealKnockOnInput): MealKnockOn {
  const { serving, date, slot, option, listDates, existing, alsoPinned = [], sayDayTotal, todayShown } = input
  const { today, dates, targets, pools } = serving
  // No targets, or a day the strip does not serve: there is no week to try it
  // on. Said, not guessed.
  if (!targets || !dates.includes(date)) return { changes: [], lines: [{ severity: 'info', text: KNOCK_ON.unknown }] }

  const before = serveMealWeek(serving)

  // AS THE EXECUTOR WILL STORE IT (executeMealAddition): beside the meal's
  // other options, tagged as her own request, and pinned to this date.
  const store = (o: PoolOption): PoolOption => (existing ? o : { ...o, tags: [...(o.tags ?? []), USER_REQUESTED_TAG] })
  const pinned = [{ slot, option }, ...alsoPinned].map(p => ({ slot: p.slot, stored: store(p.option) }))
  const afterPools = { ...pools }
  if (!existing) for (const p of pinned) afterPools[p.slot] = [...(afterPools[p.slot] ?? []), p.stored]
  const todaysPins = { ...serving.todaysPins }
  const pinsByDate = { ...serving.pinsByDate }
  for (const p of pinned) {
    if (date === today) todaysPins[p.slot] = p.stored
    else pinsByDate[date] = { ...(pinsByDate[date] ?? {}), [p.slot]: p.stored }
  }
  const pinnedSlots = new Set(pinned.map(p => p.slot))
  // No rotation is handed over: the one in `serving` was built from the old
  // options, and the week builds its own for any pool it was not built from
  // (serveDates checks `builtFrom`) — which is what the app does when it reads
  // the options back.
  const after = serveMealWeek({ ...serving, pools: afterPools, todaysPins, pinsByDate, rotation: existing ? serving.rotation : null })

  // TODAY, AS DRAWN. A meal logged as eaten shows what was eaten, whatever the plan does under it, so it is never a
  // change; the meals left are fitted around it. An edit correcting an eaten meal is eaten as edited (eaten-correction.ts).
  const view = (served: ServedDay | undefined, side: 'before' | 'after'): DayView | undefined => {
    if (!served) return undefined
    if (served.date !== today || !todayShown || !targets) {
      return { chosen: served.day.chosen, totals: served.day.totals, withinTolerance: served.day.withinTolerance, eaten: new Set() }
    }
    const eatenBySlot = { ...todayShown.eatenBySlot }
    if (side === 'after' && date === today) {
      for (const p of pinned) {
        if (eatenBySlot[p.slot] && isAfterEaten(p.stored)) {
          const m = p.stored.macros
          eatenBySlot[p.slot] = { kcal: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat }
        }
      }
    }
    const shown = dayAsShown({ slots: todayShown.slots, chosen: served.day.chosen, eatenBySlot, targets, keepAsPlanned: todayShown.keepAsPlanned })
    const chosen: Partial<Record<MealSlotName, PoolOption>> = {}
    for (const r of shown.slots) if (r.option) chosen[r.slot] = r.option
    return { chosen, totals: shown.totals, withinTolerance: dayVerdict(shown.totals, targets).onTarget, eaten: new Set(Object.keys(eatenBySlot) as MealSlotName[]) }
  }
  const beforeViews = new Map(before.map(b => [b.date, view(b, 'before')]))
  const afterViews = new Map(after.map(a => [a.date, view(a, 'after')]))

  const changes: MealKnockOnChange[] = []
  for (const served of after) {
    const nowDay = afterViews.get(served.date)
    const wasDay = beforeViews.get(served.date)
    for (const s of SLOTS) {
      if (served.date === date && pinnedSlots.has(s)) continue
      if (nowDay?.eaten.has(s)) continue
      const now = nowDay?.chosen[s]
      const was = wasDay?.chosen[s]
      if (!now) continue
      if (was?.name !== now.name) {
        changes.push({ date: served.date, slot: s, kind: 'dish', from: was?.name ?? null, to: now.name, fromKcal: was ? Math.round(was.macros.calories) : null, toKcal: Math.round(now.macros.calories) })
      } else if (isNoticeableResize(was.macros.calories, now.macros.calories)) {
        changes.push({ date: served.date, slot: s, kind: 'size', from: was.name, to: now.name, fromKcal: Math.round(was.macros.calories), toKcal: Math.round(now.macros.calories) })
      }
    }
  }
  changes.sort((x, y) => Number(x.kind === 'size') - Number(y.kind === 'size'))

  const lines: NonNullable<ProposalDiff['implications']> = []
  const elsewhere: string[] = []
  if (changes.length === 0) lines.push({ severity: 'info', text: KNOCK_ON.none })
  for (const c of changes.slice(0, MAX_LISTED_CHANGES)) {
    const day = dayLabel(c.date, today)
    const nowOption = afterViews.get(c.date)?.chosen[c.slot]
    const wasOption = beforeViews.get(c.date)?.chosen[c.slot]
    const fits = afterViews.get(c.date)?.withinTolerance === true
    const text = c.kind === 'size' ? DAY_MOVE.alsoResized(day, c.slot, c.fromKcal ?? 0, c.toKcal, fits)
      : nowOption?.leftoverFrom === 'dinner' ? DAY_MOVE.alsoLeftover(day, c.slot, c.to)
      : wasOption?.leftoverFrom === 'dinner' ? DAY_MOVE.alsoFresh(day, c.slot, c.to)
      : DAY_MOVE.alsoRefit(day, c.slot, c.to, fits)
    lines.push({ severity: 'info', text })
    if (c.date !== date) elsewhere.push(text)
  }
  if (changes.length > MAX_LISTED_CHANGES) lines.push({ severity: 'info', text: DAY_MOVE.andMore(changes.length - MAX_LISTED_CHANGES) })
  const elsewhereNotListed = changes.slice(MAX_LISTED_CHANGES).filter(c => c.date !== date).length
  if (elsewhereNotListed > 0) elsewhere.push(DAY_MOVE.andMore(elsewhereNotListed))

  // A DAY THE EDIT TOOK OFF TARGET. One that was already off is not blamed on it.
  for (const served of after) {
    const was = beforeViews.get(served.date)
    const now = afterViews.get(served.date)
    if (was?.withinTolerance && now && !now.withinTolerance) {
      lines.push({ severity: 'warn', text: DAY_MOVE.offTarget(dayLabel(served.date, today), Math.round(now.totals.calories), Math.round(now.totals.calories - targets.calories), namedMiss(now.totals, targets) ?? undefined) })
    }
  }

  // THE DAY'S TOTAL, as served after the tap against as served now (the move's card).
  if (sayDayTotal) {
    const was = beforeViews.get(date)?.totals.calories
    const now = afterViews.get(date)?.totals.calories
    if (was != null && now != null) lines.push({ severity: 'info', text: KNOCK_ON.dayTotal(dayLabel(date, today), Math.round(was), Math.round(now)) })
  }

  // THE SHOPPING LIST IS NOT REBUILT BEHIND HER BACK (her refit and top-up
  // rulings: tell her). The day of the edit counts, and every day a meal
  // changed on.
  if (listDates === null) {
    lines.push({ severity: 'info', text: KNOCK_ON.listUnknown })
  } else {
    const touched = [...new Set([date, ...changes.map(c => c.date)])].sort()
    const onList = touched.filter(d => listDates.includes(d))
    if (onList.length > 0) lines.push({ severity: 'info', text: DAY_MOVE.listStale(onList.map(d => dayLabel(d, today))) })
  }
  return { changes, lines, after, before, elsewhere }
}
