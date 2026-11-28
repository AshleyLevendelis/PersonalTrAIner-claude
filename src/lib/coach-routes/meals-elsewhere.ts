// ---------------------------------------------------------------------------
// MEALS COOKED FOR HIM, FROM THE CHAT: the shared planner (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (b) 4).
//
// Profile → Meals & shopping → "Meals cooked for me" sets which meals somebody else cooks for him on which weekdays
// (his ruling 11 Nov 2026, "Set days + optional menu"). The coach could not ("I get lunch at work Monday to Friday" had
// no route), and docs/plans/meals-cooked-elsewhere.md names the coach card on the kit card's shape. This is that shape:
// ONE planner and ONE controller, handed by App to the Profile grid and to the coach, so the two cannot drift
// (the meal-refit / day-move "parity by construction" pattern).
//
//   plan(request)    pure: the new standing answer, the card's before/after row, the lead line. Writes nothing.
//   confirm(request) re-plans against the LIVE answer at the tap (a change made on Profile meanwhile wins), then saves.
//   undo(receipt)    puts the old answer back only while the live answer is still what the change left.
//
// Nothing here is unsafe, so nothing is refused but nonsense: an unknown meal, no days, or a change that changes
// nothing. The words come from meals-elsewhere.ts (describeDays, ELSEWHERE_WORDS), the screen's own.
// ---------------------------------------------------------------------------
import { describeDays, ELSEWHERE_WORDS, readMealsElsewhere, setMealElsewhereDays, WEEKDAYS, hasMealsElsewhere, type MealsElsewhere, type Weekday } from '../meals-elsewhere'
import type { MealSlotName } from '../meal-store'

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const SLOT_WORD: Record<MealSlotName, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

export interface MealsElsewhereRequest {
  /** The meal, as the coach's tool or the screen names it. */
  slot: string
  /** Weekdays 1 (Monday) to 7, or their names ("Monday", "mon"), or "weekdays" / "every day". */
  days: readonly (number | string)[]
  /** set: exactly these days. add: these as well. remove: no longer these (empty days with remove: none at all). */
  mode: 'set' | 'add' | 'remove'
}

export type MealsElsewherePlan =
  | { ok: true; slot: MealSlotName; before: MealsElsewhere; next: MealsElsewhere; row: { field: string; before: string; after: string }; lead: string; note: string }
  | { ok: false; reason: string }

export const MEALS_ELSEWHERE_REFUSALS = {
  slot: "I couldn't tell which meal that is: breakfast, lunch, dinner or a snack?",
  days: "I couldn't tell which days. Which days is it cooked for you?",
  nothing: (slot: MealSlotName, days: string) => days
    ? `${SLOT_WORD[slot]} is already down as cooked for you ${days}.`
    : `${SLOT_WORD[slot]} is already yours to cook every day.`,
  stale: 'That changed on your Profile in the meantime, so nothing was saved. Ask again and I will work it out from what is there now.',
  notSaved: "That didn't save. Check your connection and try again.",
  undoStale: "That changed again since, so I've left it as it is now.",
}

const NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** The weekdays a request names, sorted and once each; null when any part is unreadable (never a guess). */
export function readWeekdays(days: readonly (number | string)[]): Weekday[] | null {
  const out = new Set<Weekday>()
  for (const d of days) {
    if (typeof d === 'number') {
      if (!Number.isInteger(d) || d < 1 || d > 7) return null
      out.add(d as Weekday)
      continue
    }
    const w = d.trim().toLowerCase()
    if (w === 'weekdays' || w === 'mon to fri' || w === 'monday to friday') { [1, 2, 3, 4, 5].forEach(n => out.add(n as Weekday)); continue }
    if (w === 'weekend' || w === 'weekends') { out.add(6); out.add(7); continue }
    if (w === 'every day' || w === 'everyday' || w === 'daily') { WEEKDAYS.forEach(n => out.add(n)); continue }
    const i = NAMES.findIndex(n => w.length >= 3 && n.startsWith(w))
    if (i < 0) return null
    out.add((i + 1) as Weekday)
  }
  return WEEKDAYS.filter(d => out.has(d))
}

function slotOf(raw: string): MealSlotName | null {
  const s = raw.trim().toLowerCase().replace(/s$/, '')
  return (SLOTS as string[]).includes(s) ? (s as MealSlotName) : null
}

const daysWords = (days: readonly Weekday[] | undefined) => describeDays([...(days ?? [])])

/** THE TRIAL: the new standing answer and the card's words. Pure; writes nothing. */
export function planMealsElsewhere(currentRaw: unknown, req: MealsElsewhereRequest): MealsElsewherePlan {
  const slot = slotOf(req.slot ?? '')
  if (!slot) return { ok: false, reason: MEALS_ELSEWHERE_REFUSALS.slot }
  const asked = readWeekdays(req.days ?? [])
  if (asked === null) return { ok: false, reason: MEALS_ELSEWHERE_REFUSALS.days }
  if (asked.length === 0 && req.mode !== 'remove') return { ok: false, reason: MEALS_ELSEWHERE_REFUSALS.days }

  const before = readMealsElsewhere(currentRaw)
  const had = before[slot] ?? []
  const wanted = req.mode === 'set' ? asked
    : req.mode === 'add' ? WEEKDAYS.filter(d => had.includes(d) || asked.includes(d))
    : asked.length === 0 ? [] : had.filter(d => !asked.includes(d))
  if (wanted.length === had.length && wanted.every((d, i) => d === had[i])) {
    return { ok: false, reason: MEALS_ELSEWHERE_REFUSALS.nothing(slot, daysWords(had)) }
  }
  const next = setMealElsewhereDays(before, slot, wanted)
  const beforeWords = had.length > 0 ? daysWords(had) : 'none'
  const afterWords = wanted.length > 0 ? daysWords(wanted) : 'none'
  const lead = wanted.length > 0
    ? `Want me to set ${SLOT_WORD[slot].toLowerCase()} as cooked for you ${afterWords}?`
    : `Want me to make ${SLOT_WORD[slot].toLowerCase()} yours to cook every day again?`
  return {
    ok: true, slot, before, next, lead,
    row: { field: `${SLOT_WORD[slot]} cooked for you`, before: beforeWords, after: afterWords },
    note: ELSEWHERE_WORDS.saved(hasMealsElsewhere(next)),
  }
}

export interface MealsElsewhereReceipt { slot: MealSlotName; before: MealsElsewhere; after: MealsElsewhere }

export interface MealsElsewhereController {
  plan: (req: MealsElsewhereRequest) => MealsElsewherePlan
  /** Re-plans against the live answer; saves only when the card he tapped still describes the change. */
  confirm: (req: MealsElsewhereRequest, shown: MealsElsewherePlan) => Promise<{ ok: true; message: string; receipt: MealsElsewhereReceipt } | { ok: false; message: string }>
  undo: (receipt: MealsElsewhereReceipt) => Promise<{ ok: boolean; message: string }>
}

const same = (a: MealsElsewhere, b: MealsElsewhere) => JSON.stringify(readMealsElsewhere(a)) === JSON.stringify(readMealsElsewhere(b))

/** One object for Profile and the coach. `read` gives the live stored answer; `save` writes it and says if it landed. */
export function makeMealsElsewhereController(live: {
  read: () => unknown
  save: (next: MealsElsewhere) => Promise<boolean>
}): MealsElsewhereController {
  return {
    plan: req => planMealsElsewhere(live.read(), req),
    confirm: async (req, shown) => {
      const now = planMealsElsewhere(live.read(), req)
      if (!now.ok) return { ok: false, message: now.reason }
      if (!shown.ok || !same(now.next, shown.next)) return { ok: false, message: MEALS_ELSEWHERE_REFUSALS.stale }
      if (!(await live.save(now.next))) return { ok: false, message: MEALS_ELSEWHERE_REFUSALS.notSaved }
      return { ok: true, message: now.note, receipt: { slot: now.slot, before: now.before, after: now.next } }
    },
    undo: async receipt => {
      if (!same(readMealsElsewhere(live.read()), receipt.after)) return { ok: false, message: MEALS_ELSEWHERE_REFUSALS.undoStale }
      const ok = await live.save(receipt.before)
      return { ok, message: ok ? `Put back: ${SLOT_WORD[receipt.slot].toLowerCase()} ${daysWords(receipt.before[receipt.slot]) || 'yours to cook every day'}.` : MEALS_ELSEWHERE_REFUSALS.notSaved }
    },
  }
}

/** For the coach's prompt or a tool description: the days a meal is cooked for him, in words, or 'none'. */
export function mealsElsewhereDaysFor(currentRaw: unknown, slot: MealSlotName): string {
  return daysWords(readMealsElsewhere(currentRaw)[slot]) || 'none'
}
