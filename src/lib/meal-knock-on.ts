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
import type { PoolOption } from './meal-generation'
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
}

export type MealKnockOnFn = (date: string, slot: MealSlotName, option: PoolOption) => Promise<MealKnockOn>

export interface MealKnockOnInput {
  /** The week exactly as the screen serves it — the same object the day swap's trial is handed. */
  serving: MealDayMoveServing
  date: string
  slot: MealSlotName
  /** The new option, as the builder made it (before the executor's tag). */
  option: PoolOption
  /** Days on the shopping list; null when the list could not be read (said, never passed off as "none"). */
  listDates: string[] | null
}

export function knockOnOfPin(input: MealKnockOnInput): MealKnockOn {
  const { serving, date, slot, option, listDates } = input
  const { today, dates, targets, pools } = serving
  // No targets, or a day the strip does not serve: there is no week to try it
  // on. Said, not guessed.
  if (!targets || !dates.includes(date)) return { changes: [], lines: [{ severity: 'info', text: KNOCK_ON.unknown }] }

  const before = serveMealWeek(serving)

  // AS THE EXECUTOR WILL STORE IT (executeMealAddition): beside the meal's
  // other options, tagged as her own request, and pinned to this date.
  const stored: PoolOption = { ...option, tags: [...(option.tags ?? []), USER_REQUESTED_TAG] }
  const afterPools = { ...pools, [slot]: [...(pools[slot] ?? []), stored] }
  const todaysPins = { ...serving.todaysPins }
  const pinsByDate = { ...serving.pinsByDate }
  if (date === today) todaysPins[slot] = stored
  else pinsByDate[date] = { ...(pinsByDate[date] ?? {}), [slot]: stored }
  // No rotation is handed over: the one in `serving` was built from the old
  // options, and the week builds its own for any pool it was not built from
  // (serveDates checks `builtFrom`) — which is what the app does when it reads
  // the options back.
  const after = serveMealWeek({ ...serving, pools: afterPools, todaysPins, pinsByDate, rotation: null })

  const changes: MealKnockOnChange[] = []
  for (const served of after) {
    const wasDay = before.find(b => b.date === served.date)
    for (const s of SLOTS) {
      if (served.date === date && s === slot) continue
      const now = served.day.chosen[s]
      const was = wasDay?.day.chosen[s]
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
  if (changes.length === 0) lines.push({ severity: 'info', text: KNOCK_ON.none })
  for (const c of changes.slice(0, MAX_LISTED_CHANGES)) {
    const day = dayLabel(c.date, today)
    const nowOption = after.find(d => d.date === c.date)?.day.chosen[c.slot]
    const wasOption = before.find(d => d.date === c.date)?.day.chosen[c.slot]
    const text = c.kind === 'size' ? DAY_MOVE.alsoResized(day, c.slot, c.fromKcal ?? 0, c.toKcal)
      : nowOption?.leftoverFrom === 'dinner' ? DAY_MOVE.alsoLeftover(day, c.slot, c.to)
      : wasOption?.leftoverFrom === 'dinner' ? DAY_MOVE.alsoFresh(day, c.slot, c.to)
      : DAY_MOVE.alsoRefit(day, c.slot, c.to)
    lines.push({ severity: 'info', text })
  }
  if (changes.length > MAX_LISTED_CHANGES) lines.push({ severity: 'info', text: DAY_MOVE.andMore(changes.length - MAX_LISTED_CHANGES) })

  // A DAY THE EDIT TOOK OFF TARGET. One that was already off is not blamed on it.
  for (const served of after) {
    const was = before.find(b => b.date === served.date)
    if (was?.day.withinTolerance && !served.day.withinTolerance) {
      lines.push({ severity: 'warn', text: DAY_MOVE.offTarget(dayLabel(served.date, today), Math.round(served.day.totals.calories), Math.round(served.day.totals.calories - targets.calories)) })
    }
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
  return { changes, lines, after }
}
