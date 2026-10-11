import { serveMealWeek, pinsFromPicks, addDays, type ServedDay } from './meal-rotation'
import { weekdayLong, dayLabel } from './day-labels'
import { ask, DAY_MOVE } from './coach-voice'
import { computeSlotBudgets, type PoolOption } from './meal-generation'
import { movedOptionFor } from './meal-move'
import { tagsNewFrom } from './meal-new-from'
import type { CurrentMealForSlot } from './meal-food-add'
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
// TWO DIFFERENT MEALS ON TWO DAYS (30 Sep 2026): "Monday's dinner to
// Wednesday's lunch". Her 14 Sep slot-move ruling applied across days: they
// swap places and EACH IS RESIZED to fit the meal it lands in, both new sizes
// stated before the tap. The resized copies are new pool options ("X (as
// lunch)"), so they are written the way the slot move writes them, and they
// carry a first day just past the strip: served from a pick by name, never
// found by any other day's search, so the swap cannot reshuffle a day nobody
// named (the top-up's own device, meal-new-from.ts).
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
  /** Which of that day's meals changes. The two legs share one for the same meal on two days, and differ for two different meals. */
  slot: MealSlotName
  /** The dish that becomes that day's meal for the slot. */
  name: string
  /** The pick stored for that day and slot beforehand, so a failed write can be put back. Null: none. */
  previous: string | null
  /**
   * Only for two DIFFERENT meals: the other meal, resized to this slot, that
   * must be added to the slot's options before it can be picked. Absent for
   * the same meal on two days, where both dishes are already options.
   */
  option?: PoolOption
}

export interface MealDayMovePayload {
  legs: [MealDayMoveLeg, MealDayMoveLeg]
}

/** What the Move sheet and the coach hand in: the meal, and the day (and meal) to swap it with. */
export interface MealDayMoveArgs {
  meal_slot: MealSlotName | string
  from_date: string
  to_date: string
  /** The meal on `to_date` to swap with. Absent or equal to `meal_slot`: the same meal on the other day. */
  to_slot?: MealSlotName | string
}

/**
 * The one way in, for the sheet and the coach alike (App builds it once).
 * `plan` is the card; `confirm` re-plans against the live week and writes.
 */
export interface MealDayMoveController {
  /** The strip's days, today first. */
  dates: string[]
  today: string
  /** The meals this profile has, in the order of the day: what a swap between different meals can choose from. */
  slots: MealSlotName[]
  plan: (args: MealDayMoveArgs) => Promise<MealDayMoveResult>
  confirm: (payload: MealDayMovePayload) => Promise<PendingActionReceipt>
  /**
   * Puts a confirmed swap back. Only when both days still hold what the swap
   * wrote (something changed since, and it says so and leaves them alone), and
   * both picks or neither, like the swap itself.
   */
  undo: (payload: MealDayMovePayload) => Promise<PendingActionReceipt>
  /**
   * What ELSE changes if this new option becomes that date's meal — the trial
   * behind the add-a-food and custom-meal cards (meal-knock-on.ts). Here, on
   * the one controller, because it has to be run over the same week the swap's
   * own trial runs over, and because this object already reaches both surfaces.
   */
  knockOn: (date: string, slot: MealSlotName, option: PoolOption) => Promise<import('./meal-knock-on').MealKnockOn>
}

export interface BuildMealDayMoveInput {
  profileId: string
  rawArgs: { meal_slot?: unknown; from_date?: unknown; to_date?: unknown; to_slot?: unknown }
  serving: MealDayMoveServing
  /** What a resized meal is verified against, like every meal the app adds. Only used to swap two different meals. */
  dietaryPreferences?: string[]
  dislikedFoods?: string[]
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

const mealAsCurrent = (o: PoolOption): CurrentMealForSlot => ({
  name: o.name,
  ingredients: o.ingredients.map(i => `${i.quantity}${i.unit} ${i.name}`),
  macros: o.macros,
})

export function buildMealDayMoveProposal(input: BuildMealDayMoveInput): MealDayMoveResult {
  const { serving } = input
  const { today, dates, targets, pools } = serving
  const refuse = (reason: string): MealDayMoveResult => ({ ok: false, reason })

  if (!targets) return refuse(DAY_MOVE.refusals.noBody)

  const slotA = normaliseSlot(input.rawArgs.meal_slot)
  if (!slotA) return refuse(DAY_MOVE.refusals.whichSlot)
  // The meal on the OTHER day. Absent, or the same meal: the same meal on two
  // days, which needs no resize and no new option.
  const rawTo = String(input.rawArgs.to_slot ?? '').trim()
  const slotB = rawTo === '' ? slotA : normaliseSlot(rawTo)
  if (!slotB) return refuse(DAY_MOVE.refusals.whichSlot)
  const across = slotA !== slotB

  const from = resolveDay(input.rawArgs.from_date, today, dates)
  const to = resolveDay(input.rawArgs.to_date, today, dates)
  if ('error' in from || 'error' in to) {
    return refuse('error' in from && from.error === 'outside' || 'error' in to && to.error === 'outside'
      ? DAY_MOVE.refusals.outOfRange
      : DAY_MOVE.refusals.whichDays)
  }
  if (from.date === to.date) return refuse(across ? DAY_MOVE.refusals.sameDayOtherMeal : DAY_MOVE.refusals.sameDay)
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
  if (dateA === today || dateB === today) {
    if (input.loggedTodaySlots === null) return refuse(DAY_MOVE.refusals.ledgerUnreadable)
    if (dateA === today && input.loggedTodaySlots.includes(slotA)) return refuse(DAY_MOVE.refusals.eaten(slotA))
    if (dateB === today && input.loggedTodaySlots.includes(slotB)) return refuse(DAY_MOVE.refusals.eaten(slotB))
  }

  const optA = dayA.day.chosen[slotA]
  const optB = dayB.day.chosen[slotB]
  if (!optA) return refuse(DAY_MOVE.refusals.nothingThere(slotA, labelA))
  if (!optB) return refuse(DAY_MOVE.refusals.nothingThere(slotB, labelB))

  // A LEFTOVER LUNCH IS NOT A DISH OF ITS OWN: it is last night's dinner,
  // re-made each day from whatever dinner was actually served. It follows the
  // dinner; moving the dinner is how to move it.
  if (slotA === 'lunch' && optA.leftoverFrom === 'dinner') return refuse(DAY_MOVE.refusals.leftover(labelA))
  if (slotB === 'lunch' && optB.leftoverFrom === 'dinner') return refuse(DAY_MOVE.refusals.leftover(labelB))
  if (!across && optA.name === optB.name) return refuse(DAY_MOVE.refusals.sameDish(slotA, labelA, labelB))

  // WHAT LANDS IN EACH CELL. The same meal on two days: the other day's dish
  // itself, already an option. Two different meals: the other meal RESIZED to
  // the budget of the meal it lands in (her 14 Sep ruling), as a new option
  // that no day's search can find before the strip ends.
  let landsInA: PoolOption
  let landsInB: PoolOption
  if (across) {
    const budgets = computeSlotBudgets(targets, serving.shape.mealsPerDay, serving.shape.includeSnacks)
    const budgetA = budgets[slotA]
    const budgetB = budgets[slotB]
    if (!budgetA) return refuse(DAY_MOVE.refusals.noSuchMeal(slotA))
    if (!budgetB) return refuse(DAY_MOVE.refusals.noSuchMeal(slotB))
    const rules = { dietaryPreferences: input.dietaryPreferences ?? [], dislikedFoods: input.dislikedFoods ?? [] }
    const intoA = movedOptionFor(mealAsCurrent(optB), slotA, budgetA, rules)
    if ('err' in intoA) return refuse(intoA.err)
    const intoB = movedOptionFor(mealAsCurrent(optA), slotB, budgetB, rules)
    if ('err' in intoB) return refuse(intoB.err)
    const heldUntil = addDays(dates[dates.length - 1], 1)
    landsInA = { ...intoA.option, tags: tagsNewFrom(intoA.option.tags, heldUntil) }
    landsInB = { ...intoB.option, tags: tagsNewFrom(intoB.option.tags, heldUntil) }
    // The copies are NOT put in the trial's pools: they are held until the
    // strip ends, so no day's search could find them there anyway, and a pin
    // is served as given. That is also what keeps every other day where it is.
  } else {
    // The pins are resolved the way the app resolves every stored pick, by name
    // against the whole pool, so the trial is the week the screen will serve.
    const pinForA = pinsFromPicks({ [slotA]: optB.name }, pools)[slotA]
    const pinForB = pinsFromPicks({ [slotA]: optA.name }, pools)[slotA]
    if (!pinForA) return refuse(DAY_MOVE.refusals.notInPlan(labelB, slotA))
    if (!pinForB) return refuse(DAY_MOVE.refusals.notInPlan(labelA, slotA))
    landsInA = pinForA
    landsInB = pinForB
  }

  const previousOf = (date: string, slot: MealSlotName): string | null =>
    (date === today ? serving.todaysPins[slot] : serving.pinsByDate[date]?.[slot])?.name ?? null
  const previousA = previousOf(dateA, slotA)
  const previousB = previousOf(dateB, slotB)

  const todaysPins = { ...serving.todaysPins }
  const pinsByDate = { ...serving.pinsByDate }
  const put = (date: string, slot: MealSlotName, option: PoolOption) => {
    if (date === today) todaysPins[slot] = option
    else pinsByDate[date] = { ...(pinsByDate[date] ?? {}), [slot]: option }
  }
  put(dateA, slotA, landsInA)
  put(dateB, slotB, landsInB)
  const after = serveMealWeek({ ...serving, todaysPins, pinsByDate })

  const afterA = after.find(d => d.date === dateA)
  const afterB = after.find(d => d.date === dateB)
  // The trial must serve the two dishes it was asked to. A pinned meal the
  // day assembler sets aside (one marked as breaking a restriction) would
  // otherwise read as a swap that happened.
  if (afterA?.day.chosen[slotA]?.name !== landsInA.name || afterB?.day.chosen[slotB]?.name !== landsInB.name) {
    return refuse(DAY_MOVE.refusals.wouldNotHold)
  }

  const rows: ProposalDiff['rows'] = [
    { field: DAY_MOVE.rowLabel(labelA, slotA), before: optA.name, after: landsInA.name, note: kcalNote(optA, afterA.day.chosen[slotA]!) },
    { field: DAY_MOVE.rowLabel(labelB, slotB), before: optB.name, after: landsInB.name, note: kcalNote(optB, afterB.day.chosen[slotB]!) },
  ]

  const implications: { severity: 'info' | 'warn'; text: string }[] = [
    { severity: 'info', text: across ? DAY_MOVE.swappedAcross(slotA, labelA, slotB, labelB) : DAY_MOVE.swapped(slotA, labelA, labelB) },
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
      if ((served.date === dateA && s === slotA) || (served.date === dateB && s === slotB)) continue
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

  const legA: MealDayMoveLeg = { date: dateA, slot: slotA, name: landsInA.name, previous: previousA, ...(across ? { option: landsInA } : {}) }
  const legB: MealDayMoveLeg = { date: dateB, slot: slotB, name: landsInB.name, previous: previousB, ...(across ? { option: landsInB } : {}) }
  return {
    ok: true,
    // The two days (and meals) are part of what is being changed, so a second
    // ask about the same pair replaces the pending card instead of stacking on
    // it. The same-meal key is unchanged from before two meals could differ.
    scopeKey: across
      ? `${input.profileId}:propose_meal_day_move:${[`${slotA}@${dateA}`, `${slotB}@${dateB}`].sort().join(':')}`
      : `${input.profileId}:propose_meal_day_move:${slotA}:${[dateA, dateB].sort().join(':')}`,
    preconditions: across
      ? { cells: [{ slot: slotA, date: dateA }, { slot: slotB, date: dateB }], served: [optA.name, optB.name] }
      : { slot: slotA, dates: [dateA, dateB], served: [optA.name, optB.name] },
    payload: { legs: [legA, legB] },
    diff: {
      lead: ask(across ? DAY_MOVE.leadAcross(slotA, labelA, slotB, labelB) : DAY_MOVE.lead(slotA, labelA, labelB)),
      rows,
      unchanged: [across ? DAY_MOVE.unchangedAcross : DAY_MOVE.unchanged],
      implications,
      reversible: true,
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
  // The pick each day held before is part of what the card described: it is
  // what an undo puts back, so a card read before that pick changed is stale.
  const key = (p: MealDayMovePayload) => p.legs.map(l => `${l.slot}@${l.date}:${l.name}:${l.previous ?? ''}`).join('|')
  return key(a) === key(b)
}
