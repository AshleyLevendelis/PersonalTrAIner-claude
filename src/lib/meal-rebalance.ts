import { serveMealWeek, addDays, type ServedDay } from './meal-rotation'
import { dayLabel } from './day-labels'
import { ask, DAY_MOVE, REBALANCE } from './coach-voice'
import { computeSlotBudgets, namedMiss, type PoolOption } from './meal-generation'
import { movedOptionFor } from './meal-move'
import { tagsNewFrom, isBookkeepingTag } from './meal-new-from'
import { resizedCopyBase } from './meal-dish-identity'
import { isNoticeableResize, mealAsCurrent, resolveDay, sameMealDayMove, type MealDayMoveLeg, type MealDayMoveServing } from './meal-day-move'
import { USER_REQUESTED_TAG, type MealSlotName } from './meal-store'
import type { PendingActionReceipt, ProposalDiff } from './pending-actions-store'

// ---------------------------------------------------------------------------
// MOVING CALORIES FROM ONE MEAL TO ANOTHER — "move some of lunch's calories to
// dinner" (live test, 19 Oct 2026, finding 5).
//
// She named both meals and got the whole-day resize's refusal: "Your meals
// already add up to your targets, near enough — nothing to resize. If a
// particular meal feels off, tell me which". Nothing on either surface moved
// PART of one meal to another. Her ruling, 20 Oct 2026: "Ask how much first" —
// with buttons — then BOTH new sizes before Apply.
//
// THE SAME DISHES, ONE SMALLER AND ONE BIGGER. The from-meal and the to-meal
// as SERVED (the week the strip and the swap card read, serveMealWeek) are each
// resized by the slot move's own function (movedOptionFor: the lines' own
// numbers moved, verified like every meal the app adds) into a copy named
// "X (smaller)" / "Y (bigger)", held until the strip ends and pinned for that
// one date — exactly how the day swap of two different meals lands a resized
// dish on one date (meal-day-move.ts). So the write and the Undo are the day
// swap's own, both picks or neither.
//
// THE CARD IS READ OFF A TRIAL: the week served again with both pins in, so
// each meal's size, the day's total and any other meal that moves are what the
// screen will show after the tap, never asserted.
//
// BOUNDS (CSCS / population nutrition, decided under her 18 Sep delegation;
// basis in docs/plans/moving-calories-between-meals.md and BACKLOG):
//   - the from-meal keeps at least HALF of what it is served now (per-meal
//     protein: the ISSN protein stand's ~20-40 g a meal; the app's main meals
//     carry ~35-50 g, so half stays a meal);
//   - the to-meal at most DOUBLES (meal distribution barely matters when the
//     day's energy and protein are equal, ISSN meal-frequency stand, so this is
//     practical: well inside the scaler's own 0.4-2.5x refusal);
//   - the smallest move is 30 kcal, below which the rounding is the change.
// Asked for more than that: the most that fits, said on the card.
//
// ONE BUILDER FOR BOTH SURFACES. The Move sheet and the coach call this through
// one controller (useMealDays' `rebalance`), so the coach cannot offer a move
// the sheet would refuse, and both ask "how much" with the same amounts.
// ---------------------------------------------------------------------------

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** The from-meal keeps at least this share of what it is served now. */
export const REBALANCE_MIN_KEEP = 0.5
/** The to-meal grows to at most this multiple of what it is served now. */
export const REBALANCE_MAX_GROW = 2
/** Below this the kitchen rounding is the change. */
const REBALANCE_MIN_KCAL = 30
/** The amounts offered as buttons, her own example's (20 Oct 2026). */
const REBALANCE_STEPS = [100, 200, 300] as const
/** A day that moves by more than this after rounding is said, not called "the same". */
const DAY_HELD_KCAL = 20

export interface MealRebalanceArgs {
  from_slot?: unknown
  to_slot?: unknown
  /** How many kcal to move. Absent: the app asks. */
  kcal?: unknown
  /** `YYYY-MM-DD`, 'today', 'tomorrow' or a weekday of the strip. Absent: today. */
  date?: unknown
}

/** Two picks on one date, the day swap's own payload shape, plus what the card said. */
export interface MealRebalancePayload {
  legs: [MealDayMoveLeg, MealDayMoveLeg]
  date: string
  from: MealSlotName
  to: MealSlotName
  /** The kcal actually moved (the asked amount, or the most that fits). */
  kcal: number
}

export type MealRebalanceResult =
  | {
      ok: true
      scopeKey: string
      preconditions: Record<string, unknown>
      payload: MealRebalancePayload
      diff: ProposalDiff
      /** The week as it will be after the tap. */
      after: ServedDay[]
    }
  /** `ask`: nothing wrong, no amount yet. The question and the amounts the meals can take. */
  | { ok: false; reason: string; ask?: { amounts: number[]; from: MealSlotName; to: MealSlotName; date: string } }

export interface BuildMealRebalanceInput {
  profileId: string
  rawArgs: MealRebalanceArgs
  serving: MealDayMoveServing
  dietaryPreferences?: string[]
  dislikedFoods?: string[]
  /** Slots of TODAY already logged as eaten. Null when the ledger could not be read. */
  loggedTodaySlots: MealSlotName[] | null
  /** Dates on the shopping list from today on. Null when the list could not be read. */
  listDates: string[] | null
}

/** The one way in, for the Move sheet and the coach alike (useMealDays builds it). */
export interface MealRebalanceController {
  plan: (args: MealRebalanceArgs) => Promise<MealRebalanceResult>
  confirm: (payload: MealRebalancePayload) => Promise<PendingActionReceipt>
  undo: (payload: MealRebalancePayload) => Promise<PendingActionReceipt>
}

function normaliseSlot(value: unknown): MealSlotName | null {
  const s = String(value ?? '').trim().toLowerCase().replace(/s$/, '')
  return (SLOTS as string[]).includes(s) ? (s as MealSlotName) : null
}

/** The most kcal that can move from a meal of `fromKcal` to one of `toKcal`, in tens, inside both bounds. */
export function rebalanceRoom(fromKcal: number, toKcal: number): number {
  const room = Math.min(fromKcal * (1 - REBALANCE_MIN_KEEP), toKcal * (REBALANCE_MAX_GROW - 1))
  return Math.max(0, Math.floor(room / 10) * 10)
}

/** The amounts offered: her steps that fit, else the most there is room for. Empty: nothing can move. */
export function rebalanceAmounts(room: number): number[] {
  const steps = REBALANCE_STEPS.filter(k => k <= room)
  if (steps.length > 0) return [...steps]
  return room >= REBALANCE_MIN_KCAL ? [room] : []
}

/** The ask, as the chat sends it: the question, then the amounts as buttons (the [QUICK_REPLIES] channel). */
export function rebalanceAskText(reason: string, ask: { amounts: number[]; to: MealSlotName }): string {
  return `${reason}\n[QUICK_REPLIES: ${ask.amounts.map(k => `"${REBALANCE.chip(k, ask.to)}"`).join(' | ')}]`
}

/** A copy's name: the dish it was made from, "(smaller)" or "(bigger)", numbered when a meal already has that name. */
function copyName(base: string, bigger: boolean, taken: Set<string>): string {
  const word = bigger ? 'bigger' : 'smaller'
  if (!taken.has(`${base} (${word})`)) return `${base} (${word})`
  for (let n = 2; ; n++) if (!taken.has(`${base} (${word} ${n})`)) return `${base} (${word} ${n})`
}

export function buildMealRebalanceProposal(input: BuildMealRebalanceInput): MealRebalanceResult {
  const { serving } = input
  const { today, dates, targets, pools } = serving
  const refuse = (reason: string): MealRebalanceResult => ({ ok: false, reason })
  if (!targets) return refuse(REBALANCE.refusals.noBody)

  const from = normaliseSlot(input.rawArgs.from_slot)
  const to = normaliseSlot(input.rawArgs.to_slot)
  if (!from || !to) return refuse(REBALANCE.refusals.whichSlots)
  if (from === to) return refuse(REBALANCE.refusals.sameSlot)
  const budgets = computeSlotBudgets(targets, serving.shape.mealsPerDay, serving.shape.includeSnacks)
  if (!budgets[from]) return refuse(REBALANCE.refusals.noSuchMeal(from))
  if (!budgets[to]) return refuse(REBALANCE.refusals.noSuchMeal(to))

  const rawDate = String(input.rawArgs.date ?? '').trim()
  const resolved = rawDate ? resolveDay(rawDate, today, dates) : { date: today }
  if ('error' in resolved) return refuse(REBALANCE.refusals.outOfRange)
  const date = resolved.date
  const label = dayLabel(date, today)

  // A LOGGED MEAL STAYS AS EATEN (her 10 Oct rule), either end of the move.
  if (date === today) {
    if (input.loggedTodaySlots === null) return refuse(REBALANCE.refusals.ledgerUnreadable)
    for (const s of [from, to]) if (input.loggedTodaySlots.includes(s)) return refuse(REBALANCE.refusals.eaten(s))
  }

  const before = serveMealWeek(serving)
  const day = before.find(d => d.date === date)
  const optFrom = day?.day.chosen[from]
  const optTo = day?.day.chosen[to]
  if (!day || !optFrom) return refuse(REBALANCE.refusals.nothingThere(from, label))
  if (!optTo) return refuse(REBALANCE.refusals.nothingThere(to, label))

  const fromKcal = Math.round(optFrom.macros.calories)
  const toKcal = Math.round(optTo.macros.calories)
  const room = rebalanceRoom(fromKcal, toKcal)
  if (room < REBALANCE_MIN_KCAL) return refuse(REBALANCE.refusals.noRoom(from, to))

  // HOW MUCH. No amount: the app asks, with the amounts these two meals can take.
  const askedRaw = Number(String(input.rawArgs.kcal ?? '').replace(/[^\d.]/g, ''))
  const asked = Number.isFinite(askedRaw) && askedRaw > 0 ? Math.round(askedRaw) : null
  if (asked === null) {
    return { ok: false, reason: REBALANCE.ask(label, from, fromKcal, to, toKcal), ask: { amounts: rebalanceAmounts(room), from, to, date } }
  }
  if (asked < REBALANCE_MIN_KCAL) return refuse(REBALANCE.refusals.tooSmall(asked))
  const moved = Math.min(asked, room)

  // THE TWO COPIES, by the slot move's own resize and verification, from the dishes as served.
  const rules = { dietaryPreferences: input.dietaryPreferences ?? [], dislikedFoods: input.dislikedFoods ?? [] }
  const heldUntil = addDays(dates[dates.length - 1], 1)
  const copyOf = (opt: PoolOption, slot: MealSlotName, targetKcal: number, bigger: boolean) => {
    const taken = new Set((pools[slot] ?? []).map(o => o.name))
    const made = movedOptionFor(mealAsCurrent(opt), slot, { calories: targetKcal, protein: 0, carbs: 0, fat: 0 }, rules, copyName(resizedCopyBase(opt), bigger, taken))
    if ('err' in made) return made
    // THE DISH'S OWN LABELS, not the verifier's "own recipe": this is the plan's dish at another size, not one she wrote.
    const carried = (opt.tags ?? []).filter(t => t !== USER_REQUESTED_TAG && !isBookkeepingTag(t))
    return { option: { ...made.option, tags: tagsNewFrom(carried, heldUntil) } }
  }
  const smaller = copyOf(optFrom, from, fromKcal - moved, false)
  if ('err' in smaller) return refuse(smaller.err)
  const bigger = copyOf(optTo, to, toKcal + moved, true)
  if ('err' in bigger) return refuse(bigger.err)

  // THE TRIAL. Pinned as the executor will store them: tagged as her request (what a stored copy carries, and what
  // the week reads to know a copy is the plan's own dish and the same dish as its base).
  const asStored = (o: PoolOption): PoolOption => ({ ...o, tags: [...(o.tags ?? []), USER_REQUESTED_TAG] })
  const todaysPins = { ...serving.todaysPins }
  const pinsByDate = { ...serving.pinsByDate }
  const put = (slot: MealSlotName, option: PoolOption) => {
    if (date === today) todaysPins[slot] = option
    else pinsByDate[date] = { ...(pinsByDate[date] ?? {}), [slot]: option }
  }
  put(from, asStored(smaller.option))
  put(to, asStored(bigger.option))
  const after = serveMealWeek({ ...serving, todaysPins, pinsByDate })
  const afterDay = after.find(d => d.date === date)
  const nowFrom = afterDay?.day.chosen[from]
  const nowTo = afterDay?.day.chosen[to]
  if (!afterDay || nowFrom?.name !== smaller.option.name || nowTo?.name !== bigger.option.name) return refuse(REBALANCE.refusals.wouldNotHold)

  const rows: ProposalDiff['rows'] = [
    { field: REBALANCE.rowLabel(label, from, resizedCopyBase(optFrom)), before: REBALANCE.size(fromKcal, Math.round(optFrom.macros.protein)), after: REBALANCE.size(Math.round(nowFrom.macros.calories), Math.round(nowFrom.macros.protein)), note: REBALANCE.note(nowFrom.macros.calories - fromKcal) },
    { field: REBALANCE.rowLabel(label, to, resizedCopyBase(optTo)), before: REBALANCE.size(toKcal, Math.round(optTo.macros.protein)), after: REBALANCE.size(Math.round(nowTo.macros.calories), Math.round(nowTo.macros.protein)), note: REBALANCE.note(nowTo.macros.calories - toKcal) },
  ]

  const implications: NonNullable<ProposalDiff['implications']> = []
  if (moved < asked) implications.push({ severity: 'warn', text: REBALANCE.capped(asked, moved, from, to) })
  // THE DAY'S TOTAL, AND WHY IT MOVED IF IT DID. The two meals hold it between them, within the rounding. A day that
  // was off its target before is re-fitted around the two new pins by her 10 Oct hold rule ("Resize, else leave"), so
  // its other meals can change size too: said as that, never blamed on the rounding.
  const dayBefore = Math.round(day.day.totals.calories)
  const dayAfter = Math.round(afterDay.day.totals.calories)
  const pairBefore = fromKcal + toKcal
  const pairAfter = Math.round(nowFrom.macros.calories) + Math.round(nowTo.macros.calories)
  const othersMoved = Math.abs((dayAfter - pairAfter) - (dayBefore - pairBefore)) > DAY_HELD_KCAL
  implications.push({
    severity: 'info',
    text: othersMoved ? REBALANCE.dayRefit(dayBefore, dayAfter)
      : Math.abs(pairAfter - pairBefore) <= DAY_HELD_KCAL ? REBALANCE.dayHeld(dayAfter)
      : REBALANCE.dayMoved(pairBefore, pairAfter),
  })
  implications.push({ severity: 'info', text: REBALANCE.protein(from, Math.max(0, Math.round(optFrom.macros.protein - nowFrom.macros.protein)), to, Math.max(0, Math.round(nowTo.macros.protein - optTo.macros.protein))) })
  if (from === 'lunch' && optFrom.leftoverFrom === 'dinner') implications.push({ severity: 'info', text: REBALANCE.leftover(label, false) })
  if (to === 'lunch' && optTo.leftoverFrom === 'dinner') implications.push({ severity: 'info', text: REBALANCE.leftover(label, true) })

  // EVERY OTHER MEAL THE TRIAL CHANGED, on any day: the day swap's own account and sentences.
  type Change = { date: string; slot: MealSlotName; was: PoolOption | undefined; to: PoolOption; resized: boolean }
  const changes: Change[] = []
  for (const served of after) {
    const wasDay = before.find(b => b.date === served.date)
    for (const s of SLOTS) {
      if (served.date === date && (s === from || s === to)) continue
      const now = served.day.chosen[s]
      const was = wasDay?.day.chosen[s]
      if (!now) continue
      if (was?.name !== now.name) changes.push({ date: served.date, slot: s, was, to: now, resized: false })
      else if (was && isNoticeableResize(was.macros.calories, now.macros.calories)) changes.push({ date: served.date, slot: s, was, to: now, resized: true })
    }
  }
  changes.sort((x, y) => Number(x.resized) - Number(y.resized))
  for (const c of changes.slice(0, 4)) {
    const d = dayLabel(c.date, today)
    implications.push({
      severity: 'info',
      text: c.resized ? DAY_MOVE.alsoResized(d, c.slot, Math.round(c.was!.macros.calories), Math.round(c.to.macros.calories))
        : c.to.leftoverFrom === 'dinner' ? DAY_MOVE.alsoLeftover(d, c.slot, c.to.name)
        : c.was?.leftoverFrom === 'dinner' ? DAY_MOVE.alsoFresh(d, c.slot, c.to.name)
        : DAY_MOVE.alsoRefit(d, c.slot, c.to.name),
    })
  }
  if (changes.length > 4) implications.push({ severity: 'info', text: DAY_MOVE.andMore(changes.length - 4) })

  // A day this took off target (one already off is not blamed on it).
  if (day.day.withinTolerance && !afterDay.day.withinTolerance) {
    implications.push({ severity: 'warn', text: DAY_MOVE.offTarget(label, dayAfter, dayAfter - Math.round(targets.calories), namedMiss(afterDay.day.totals, targets) ?? undefined) })
  }

  // The shopping list is not rebuilt behind her back: said.
  if (input.listDates === null) implications.push({ severity: 'info', text: DAY_MOVE.listUnknown })
  else {
    const touched = [...new Set([date, ...changes.map(c => c.date)])].sort()
    const onList = touched.filter(d => input.listDates!.includes(d))
    if (onList.length > 0) implications.push({ severity: 'info', text: DAY_MOVE.listStale(onList.map(d => dayLabel(d, today))) })
  }

  const previousOf = (slot: MealSlotName): string | null =>
    (date === today ? serving.todaysPins[slot] : serving.pinsByDate[date]?.[slot])?.name ?? null
  const legFrom: MealDayMoveLeg = { date, slot: from, name: smaller.option.name, previous: previousOf(from), option: smaller.option }
  const legTo: MealDayMoveLeg = { date, slot: to, name: bigger.option.name, previous: previousOf(to), option: bigger.option }

  return {
    ok: true,
    // One card per day and pair of meals, whichever way round: a second ask about the same two replaces the first.
    scopeKey: `${input.profileId}:propose_meal_rebalance:${date}:${[from, to].sort().join('-')}`,
    preconditions: { date, from, to, served: [optFrom.name, optTo.name], kcal: moved },
    payload: { legs: [legFrom, legTo], date, from, to, kcal: moved },
    diff: {
      lead: ask(REBALANCE.lead(moved, label, from, to)),
      rows,
      unchanged: [REBALANCE.unchanged],
      implications,
      reversible: true,
    },
    after,
  }
}

/**
 * Is this the move the card described? The confirm plans again against the live week and writes only when both meals
 * would get the very copies the card showed: the same names over the same picks, at the same sizes.
 */
export function sameMealRebalance(a: MealRebalancePayload, b: MealRebalancePayload): boolean {
  const sizes = (p: MealRebalancePayload) => p.legs.map(l => Math.round(l.option?.macros.calories ?? -1)).join('|')
  return sameMealDayMove(a, b) && sizes(a) === sizes(b) && a.kcal === b.kcal
}

// ---------------------------------------------------------------------------
// WHAT SHE SAID, READ BY THE APP — the backstop for the coach reaching for the whole-day resize when she named two meals
// (the 19 Oct defect). Only a direction the words give is taken; two meals with no direction are asked about.
// ---------------------------------------------------------------------------

const SLOT_WORD = /\b(breakfast|lunch|dinner|snacks?)\b/g
const SOURCE_BEFORE = /\b(?:from|of|off|out of)\s+(?:my\s+|the\s+|today's\s+|tonight's\s+|tomorrow's\s+)?$/
const DEST_BEFORE = /\b(?:to|into|onto|towards|over to|across to|on to)\s+(?:my\s+|the\s+|today's\s+|tonight's\s+|tomorrow's\s+)?$/
const LESS = /\b(?:smaller|lighter|less|fewer|lower|reduce|cut|shrink)\b/
const MORE = /\b(?:bigger|larger|heavier|more|higher|increase|boost|grow)\b/
/** Words that make "lunch ... dinner" a request to move food, not two meals mentioned. */
const MOVE_WORDS = /\b(?:move|moving|shift|transfer|put|take|give|swap some|redistribute|rebalance|bigger|smaller|larger|lighter|more|less)\b/

export type RebalanceSaid =
  | { kind: 'ordered'; from: MealSlotName; to: MealSlotName; kcal: number | null }
  | { kind: 'unordered'; slots: [MealSlotName, MealSlotName] }
  | { kind: 'none' }

const mentionsIn = (t: string) =>
  [...t.matchAll(SLOT_WORD)].map(m => ({ slot: (m[1].startsWith('snack') ? 'snack' : m[1]) as MealSlotName, at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))

/** Every meal her words name, once each, in the order said. */
export function mealsNamed(text: string): MealSlotName[] {
  return [...new Set(mentionsIn(text.toLowerCase()).map(m => m.slot))]
}

export function rebalanceSaid(text: string): RebalanceSaid {
  const t = text.toLowerCase().replace(/[’`]/g, "'")
  const mentions = mentionsIn(t)
  const distinct = [...new Set(mentions.map(m => m.slot))]
  if (distinct.length !== 2 || !MOVE_WORDS.test(t)) return { kind: 'none' }
  const kcalMatch = /(\d{2,4})\s*(?:kcal|calories|cals?)\b/.exec(t)
  const kcal = kcalMatch ? Number(kcalMatch[1]) : null
  const role = new Map<MealSlotName, 'from' | 'to'>()
  for (const m of mentions) {
    const head = t.slice(Math.max(0, m.at - 40), m.at)
    const tail = t.slice(m.end, m.end + 30).split(/\b(?:and|but|,)\b|,/)[0]
    const near = `${head.split(/\b(?:and|but)\b|,/).pop() ?? ''} ${tail}`
    if (SOURCE_BEFORE.test(head)) role.set(m.slot, 'from')
    else if (DEST_BEFORE.test(head)) role.set(m.slot, 'to')
    else if (LESS.test(near) && !MORE.test(near)) role.set(m.slot, 'from')
    else if (MORE.test(near) && !LESS.test(near)) role.set(m.slot, 'to')
  }
  const [a, b] = distinct as [MealSlotName, MealSlotName]
  const ra = role.get(a), rb = role.get(b)
  const fromSlot = ra === 'from' ? a : rb === 'from' ? b : ra === 'to' ? b : rb === 'to' ? a : null
  const toSlot = fromSlot === a ? b : fromSlot === b ? a : null
  if (!fromSlot || !toSlot || (ra && rb && ra === rb)) return { kind: 'unordered', slots: [a, b] }
  return { kind: 'ordered', from: fromSlot, to: toSlot, kcal }
}
