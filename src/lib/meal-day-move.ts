import { serveMealWeek, pinsFromPicks, type ServedDay } from './meal-rotation'
import { weekdayLong, dayLabel } from './day-labels'
import { ask, DAY_MOVE } from './coach-voice'
import type { PoolOption } from './meal-generation'
import type { MealSlotName } from './meal-store'
import type { PendingActionReceipt, ProposalDiff } from './pending-actions-store'

// ---------------------------------------------------------------------------
// SWAPPING A MEAL WITH ANOTHER DAY'S — "move Monday's dinner to Wednesday."
//
// Ashley, 29 Sep 2026, item 2 of her list: "Moving a meal to another day.
// Neither the screen nor the coach can do this yet." Her ruling on what
// happens to the day the meal LEAVES, from three options: THEY SWAP PLACES
// (over a fresh dinner for the emptied day, and over eating the same dish
// twice) — her 14 Sep slot-move ruling, applied across days.
//
// A DAY'S MEALS ARE NOT STORED. `meal_plan_picks` holds (profile, date, slot)
// -> meal name over the dateless pool, and the day assembler fits the rest of
// the day around whatever is pinned. So this is TWO PICKS naming two dishes
// already in the pool. Same slot on both days, so the same budget: no resize
// and no new pool option, which is what the slot-to-slot move (meal-move.ts)
// has to do and this does not.
//
// THE CARD IS READ OFF A TRIAL, NOT ASSERTED. This runs the same week
// derivation the screen runs (serveMealWeek), once as it stands and once with
// the two picks in, and reports the difference. That matters because a pin
// re-fits the rest of the day, and a lunch that is last night's dinner is
// re-made from whichever dinner is now served the night before (28 Sep), so a
// move can change a meal on a day nobody named. Said before the tap.
//
// ONE BUILDER FOR BOTH SURFACES. The Move sheet and the coach's card call this
// with the same inputs from App, so the coach cannot offer a swap the sheet
// would refuse. It is imported lazily: the first paint never needs it.
// ---------------------------------------------------------------------------

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** The inputs of the week derivation, unchanged: this is the app's own week. */
export type MealDayMoveServing = Parameters<typeof serveMealWeek>[0]

export interface MealDayMoveLeg {
  /** The day whose meal changes. */
  date: string
  /** The dish that becomes that day's meal for the slot. */
  name: string
  /** The pick stored for that day and slot beforehand, so a failed write can be put back. Null: none. */
  previous: string | null
}

export interface MealDayMovePayload {
  slot: MealSlotName
  legs: [MealDayMoveLeg, MealDayMoveLeg]
}

/** What the Move sheet and the coach hand in: the meal and the two days. */
export interface MealDayMoveArgs {
  meal_slot: MealSlotName | string
  from_date: string
  to_date: string
}

/**
 * The one way in, for the sheet and the coach alike (App builds it once).
 * `plan` is the card; `confirm` re-plans against the live week and writes.
 */
export interface MealDayMoveController {
  /** The strip's days, today first. */
  dates: string[]
  today: string
  plan: (args: MealDayMoveArgs) => Promise<MealDayMoveResult>
  confirm: (payload: MealDayMovePayload) => Promise<PendingActionReceipt>
}

export interface BuildMealDayMoveInput {
  profileId: string
  rawArgs: { meal_slot?: unknown; from_date?: unknown; to_date?: unknown }
  serving: MealDayMoveServing
  /** Slots of TODAY already logged as eaten. Null when the ledger could not be read. */
  loggedTodaySlots: MealSlotName[] | null
  /** Dates on the shopping list from today on. Null when the list could not be read. */
  listDates: string[] | null
}

export type MealDayMoveResult =
  | {
      ok: true
      scopeKey: string
      preconditions: Record<string, unknown>
      payload: MealDayMovePayload
      diff: ProposalDiff
      /** The week as it will be once both picks are in — what the screen must show afterwards. */
      after: ServedDay[]
    }
  | { ok: false; reason: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/

function normaliseSlot(value: unknown): MealSlotName | null {
  const s = String(value ?? '').trim().toLowerCase()
  return (SLOTS as string[]).includes(s) ? (s as MealSlotName) : null
}

/**
 * A day as the model or the screen named it: the date itself, "today",
 * "tomorrow", or a weekday. A weekday is unambiguous because the strip is
 * seven days. Anything outside the strip is refused rather than written
 * somewhere nobody can see.
 */
function resolveDay(value: unknown, today: string, dates: string[]): { date: string } | { error: 'missing' | 'outside' } {
  const raw = String(value ?? '').trim()
  if (!raw) return { error: 'missing' }
  if (DATE.test(raw)) return dates.includes(raw) ? { date: raw } : { error: 'outside' }
  const word = raw.toLowerCase()
  if (word === 'today') return { date: today }
  if (word === 'tomorrow') return dates[1] ? { date: dates[1] } : { error: 'outside' }
  const byName = dates.find(d => weekdayLong(d).toLowerCase() === word || weekdayLong(d).toLowerCase().slice(0, 3) === word)
  return byName ? { date: byName } : { error: 'missing' }
}

const kcalNote = (from: PoolOption, to: PoolOption) => {
  const diff = Math.round(to.macros.calories - from.macros.calories)
  return Math.abs(diff) < 10 ? 'same size' : `${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} kcal`
}

/** The most other-meal changes the card lists before folding the rest into one line. */
const MAX_LISTED_CHANGES = 4

/**
 * A meal that keeps its name but changes size is worth a line only when the
 * change is one she would notice on the plate: at least this many calories AND
 * this share of the meal. A few grams either way is the day re-fitting and
 * would bury the changes that matter.
 */
const RESIZE_NOTICE_KCAL = 50
const RESIZE_NOTICE_SHARE = 0.1

/** Is a meal going from `was` to `now` calories a change worth a line on the card? */
export function isNoticeableResize(was: number, now: number): boolean {
  const change = Math.abs(now - was)
  return change >= RESIZE_NOTICE_KCAL && change >= was * RESIZE_NOTICE_SHARE
}

export function buildMealDayMoveProposal(input: BuildMealDayMoveInput): MealDayMoveResult {
  const { serving } = input
  const { today, dates, targets, pools } = serving
  const refuse = (reason: string): MealDayMoveResult => ({ ok: false, reason })

  if (!targets) return refuse(DAY_MOVE.refusals.noBody)

  const slot = normaliseSlot(input.rawArgs.meal_slot)
  if (!slot) return refuse(DAY_MOVE.refusals.whichSlot)

  const from = resolveDay(input.rawArgs.from_date, today, dates)
  const to = resolveDay(input.rawArgs.to_date, today, dates)
  if ('error' in from || 'error' in to) {
    return refuse('error' in from && from.error === 'outside' || 'error' in to && to.error === 'outside'
      ? DAY_MOVE.refusals.outOfRange
      : DAY_MOVE.refusals.whichDays)
  }
  if (from.date === to.date) return refuse(DAY_MOVE.refusals.sameDay)
  const dateA = from.date
  const dateB = to.date
  const labelA = dayLabel(dateA, today)
  const labelB = dayLabel(dateB, today)

  // Both dates are in the strip (resolveDay), and the week serves every date
  // of the strip, so both days are there.
  const before = serveMealWeek(serving)
  const dayA = before.find(d => d.date === dateA)!
  const dayB = before.find(d => d.date === dateB)!

  // A MEAL ALREADY EATEN CANNOT MOVE — either way round. Its row would still
  // show the logged name, and the plan would say she is about to eat it again.
  if ((dateA === today || dateB === today)) {
    if (input.loggedTodaySlots === null) return refuse(DAY_MOVE.refusals.ledgerUnreadable)
    if (input.loggedTodaySlots.includes(slot)) return refuse(DAY_MOVE.refusals.eaten(slot))
  }

  const optA = dayA.day.chosen[slot]
  const optB = dayB.day.chosen[slot]
  if (!optA) return refuse(DAY_MOVE.refusals.nothingThere(slot, labelA))
  if (!optB) return refuse(DAY_MOVE.refusals.nothingThere(slot, labelB))

  // A LEFTOVER LUNCH IS NOT A DISH OF ITS OWN: it is last night's dinner,
  // re-made each day from whatever dinner was actually served. It follows the
  // dinner; moving the dinner is how to move it.
  if (slot === 'lunch') {
    if (optA.leftoverFrom === 'dinner') return refuse(DAY_MOVE.refusals.leftover(labelA))
    if (optB.leftoverFrom === 'dinner') return refuse(DAY_MOVE.refusals.leftover(labelB))
  }
  if (optA.name === optB.name) return refuse(DAY_MOVE.refusals.sameDish(slot, labelA, labelB))

  // The pins are resolved the way the app resolves every stored pick, by name
  // against the whole pool, so the trial is the week the screen will serve.
  const pinForA = pinsFromPicks({ [slot]: optB.name }, pools)[slot]
  const pinForB = pinsFromPicks({ [slot]: optA.name }, pools)[slot]
  if (!pinForA) return refuse(DAY_MOVE.refusals.notInPlan(labelB, slot))
  if (!pinForB) return refuse(DAY_MOVE.refusals.notInPlan(labelA, slot))

  const previousOf = (date: string): string | null =>
    (date === today ? serving.todaysPins[slot] : serving.pinsByDate[date]?.[slot])?.name ?? null
  const previousA = previousOf(dateA)
  const previousB = previousOf(dateB)

  const todaysPins = { ...serving.todaysPins }
  const pinsByDate = { ...serving.pinsByDate }
  const put = (date: string, option: PoolOption) => {
    if (date === today) todaysPins[slot] = option
    else pinsByDate[date] = { ...(pinsByDate[date] ?? {}), [slot]: option }
  }
  put(dateA, pinForA)
  put(dateB, pinForB)
  const after = serveMealWeek({ ...serving, todaysPins, pinsByDate })

  const afterA = after.find(d => d.date === dateA)
  const afterB = after.find(d => d.date === dateB)
  // The trial must serve the two dishes it was asked to. A pinned meal the
  // day assembler sets aside (one marked as breaking a restriction) would
  // otherwise read as a swap that happened.
  if (afterA?.day.chosen[slot]?.name !== optB.name || afterB?.day.chosen[slot]?.name !== optA.name) {
    return refuse(DAY_MOVE.refusals.wouldNotHold)
  }

  const rows: ProposalDiff['rows'] = [
    { field: DAY_MOVE.rowLabel(labelA, slot), before: optA.name, after: optB.name, note: kcalNote(optA, afterA.day.chosen[slot]!) },
    { field: DAY_MOVE.rowLabel(labelB, slot), before: optB.name, after: optA.name, note: kcalNote(optB, afterB.day.chosen[slot]!) },
  ]

  const implications: { severity: 'info' | 'warn'; text: string }[] = [
    { severity: 'info', text: DAY_MOVE.swapped(slot, labelA, labelB) },
  ]

  // A DAY THAT FALLS OUT OF TARGET BECAUSE OF THE MOVE. One that was already
  // out is not blamed on it.
  const newlyOff = [afterA, afterB].filter(d => {
    const was = before.find(b => b.date === d.date)!
    return was.day.withinTolerance && !d.day.withinTolerance
  })
  for (const d of newlyOff) {
    implications.push({
      severity: 'warn',
      text: DAY_MOVE.offTarget(dayLabel(d.date, today), Math.round(d.day.totals.calories), Math.round(d.day.totals.calories - targets.calories)),
    })
  }
  if (afterA.day.withinTolerance && afterB.day.withinTolerance) {
    implications.push({ severity: 'info', text: DAY_MOVE.stillOnTarget })
  }

  // EVERY OTHER MEAL THE SWAP CHANGES, on any day of the week: a different
  // dish first, then the same dish at a different size (a pinned meal leaves
  // the free ones to re-fit, and a free meal can be resized a long way).
  type Change = { date: string; slot: MealSlotName; was: PoolOption | undefined; to: PoolOption; resized: boolean }
  const changes: Change[] = []
  for (const served of after) {
    const wasDay = before.find(b => b.date === served.date)!
    for (const s of SLOTS) {
      if ((served.date === dateA || served.date === dateB) && s === slot) continue
      const now = served.day.chosen[s]
      const was = wasDay.day.chosen[s]
      if (!now) continue
      if (was?.name !== now.name) changes.push({ date: served.date, slot: s, was, to: now, resized: false })
      else if (was && isNoticeableResize(was.macros.calories, now.macros.calories)) {
        changes.push({ date: served.date, slot: s, was, to: now, resized: true })
      }
    }
  }
  changes.sort((x, y) => Number(x.resized) - Number(y.resized))
  for (const c of changes.slice(0, MAX_LISTED_CHANGES)) {
    const day = dayLabel(c.date, today)
    const text = c.resized
      ? DAY_MOVE.alsoResized(day, c.slot, Math.round(c.was!.macros.calories), Math.round(c.to.macros.calories))
      : c.to.leftoverFrom === 'dinner' ? DAY_MOVE.alsoLeftover(day, c.slot, c.to.name)
      : c.was?.leftoverFrom === 'dinner' ? DAY_MOVE.alsoFresh(day, c.slot, c.to.name)
      : DAY_MOVE.alsoRefit(day, c.slot, c.to.name)
    implications.push({ severity: 'info', text })
  }
  if (changes.length > MAX_LISTED_CHANGES) {
    implications.push({ severity: 'info', text: DAY_MOVE.andMore(changes.length - MAX_LISTED_CHANGES) })
  }

  // THE SHOPPING LIST IS NOT REBUILT BEHIND HER BACK (her refit and top-up
  // rulings: tell her). Every day whose meals changed counts, not only the two
  // she named.
  if (input.listDates === null) {
    implications.push({ severity: 'info', text: DAY_MOVE.listUnknown })
  } else {
    const touched = [...new Set([dateA, dateB, ...changes.map(c => c.date)])].sort()
    const onList = touched.filter(d => input.listDates!.includes(d))
    if (onList.length > 0) implications.push({ severity: 'info', text: DAY_MOVE.listStale(onList.map(d => dayLabel(d, today))) })
  }

  return {
    ok: true,
    // The two dates are part of what is being changed, so a second ask about
    // the same pair replaces the pending card instead of stacking on it.
    scopeKey: `${input.profileId}:propose_meal_day_move:${slot}:${[dateA, dateB].sort().join(':')}`,
    preconditions: { slot, dates: [dateA, dateB], served: [optA.name, optB.name] },
    payload: {
      slot,
      legs: [
        { date: dateA, name: optB.name, previous: previousA },
        { date: dateB, name: optA.name, previous: previousB },
      ],
    },
    diff: {
      lead: ask(DAY_MOVE.lead(slot, labelA, labelB)),
      rows,
      unchanged: [DAY_MOVE.unchanged],
      implications,
      reversible: false,
    },
    after,
  }
}

/**
 * Is this the swap the card described? The confirm plans again against the
 * live week and only writes when every day still gets the dish it was shown:
 * a dish swapped on either day in between would otherwise be overwritten by a
 * pick for a card she read before it changed.
 */
export function sameMealDayMove(a: MealDayMovePayload, b: MealDayMovePayload): boolean {
  const key = (p: MealDayMovePayload) => `${p.slot}|${p.legs.map(l => `${l.date}:${l.name}`).join('|')}`
  return key(a) === key(b)
}
