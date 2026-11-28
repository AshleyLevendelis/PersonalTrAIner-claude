// ---------------------------------------------------------------------------
// FREESTYLE A DAY, FROM THE CHAT (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (b) 5; the lead's order).
//
// Nutrition's "Freestyle this day" / "Back to the plan" (his strategy slice 4a, ruling "Its own label") had no coach
// route: "I'll just eat what I like on Saturday" got words and no change. The screen already has ONE controller for it
// (useMealDays' FreestyleController: mark / clear, the window, all-or-nothing writes). This plans the coach's card over
// that same controller, so the two cannot differ: the date is read from his words within the controller's own window,
// the card says what the screen says (FREESTYLE_WORDS), Apply calls the controller, Undo calls its opposite.
//
// Advise, then allow: nothing is refused but what cannot be done (a day outside the window, a day already that way).
// The card tells him a meal already eaten that day stays as eaten (the controller's own rule), and that the day is
// judged on protein and calories only (his "Its own label").
// ---------------------------------------------------------------------------
import { FREESTYLE_WORDS, type FreestyleController } from '../freestyle'

export interface FreestyleRequest {
  /** 'today', 'tomorrow', a weekday name, or a YYYY-MM-DD date. */
  day: string
  /** freestyle: let the plan's meals step aside. plan: back to the plan's meals. */
  want: 'freestyle' | 'plan'
}

export type FreestylePlan =
  | { ok: true; date: string; dayWord: string; want: 'freestyle' | 'plan'; lead: string; row: { field: string; before: string; after: string } }
  | { ok: false; reason: string }

export const FREESTYLE_REFUSALS = {
  day: "I couldn't tell which day. Today, tomorrow, or a day this week?",
  already: (dayWord: string) => `${dayWord} is already freestyle.`,
  notFreestyle: (dayWord: string) => `${dayWord} is already on the plan.`,
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The date his words name inside the window (today first), or null; never a guess outside it. */
export function freestyleDateFor(day: string, dates: readonly string[]): string | null {
  const d = day.trim().toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return dates.includes(d) ? d : null
  if (d === 'today' || d === 'tonight') return dates[0] ?? null
  if (d === 'tomorrow') return dates[1] ?? null
  const wanted = WEEKDAYS.find(w => d.length >= 3 && w.startsWith(d.replace(/^(this|on|next)\s+/, '')))
  if (!wanted) return null
  // The first such day in the window (today counts): "Saturday" said on a Saturday is today.
  return dates.find(x => weekdayOf(x) === wanted) ?? null
}

function dayWordFor(date: string, dates: readonly string[]): string {
  if (date === dates[0]) return 'Today'
  if (date === dates[1]) return 'Tomorrow'
  return cap(weekdayOf(date))
}

/** THE TRIAL. `isFreestyleOn` is the screen's own reading of a date (isFreestyleDay over that date's meals). */
export function planFreestyle(req: FreestyleRequest, live: { dates: readonly string[]; isFreestyleOn: (date: string) => boolean }): FreestylePlan {
  const date = freestyleDateFor(req.day ?? '', live.dates)
  if (!date) {
    const named = /^\d{4}-\d{2}-\d{2}$/.test((req.day ?? '').trim()) || WEEKDAYS.some(w => (req.day ?? '').trim().toLowerCase().includes(w.slice(0, 3)))
    return { ok: false, reason: named ? FREESTYLE_WORDS.outsideWindow : FREESTYLE_REFUSALS.day }
  }
  const dayWord = dayWordFor(date, live.dates)
  const now = live.isFreestyleOn(date)
  if (req.want === 'freestyle' && now) return { ok: false, reason: FREESTYLE_REFUSALS.already(dayWord) }
  if (req.want === 'plan' && !now) return { ok: false, reason: FREESTYLE_REFUSALS.notFreestyle(dayWord) }
  const lead = req.want === 'freestyle'
    ? `Want me to make ${dayWord === 'Today' || dayWord === 'Tomorrow' ? dayWord.toLowerCase() : dayWord} freestyle? Your plan's meals step aside for that day only; eat what you like and log it as you go. ${date === live.dates[0] ? 'Anything you have already logged today stays. ' : ''}The day is judged on protein and calories only.`
    : `Want me to put ${dayWord === 'Today' || dayWord === 'Tomorrow' ? dayWord.toLowerCase() : dayWord} back on the plan? Its planned meals come back; anything you have logged stays.`
  return {
    ok: true, date, dayWord, want: req.want, lead,
    row: { field: `${dayWord}'s meals`, before: now ? 'freestyle' : 'the plan', after: req.want === 'freestyle' ? 'freestyle' : 'the plan' },
  }
}

/** Apply: the screen's own controller. The receipt is the screen's own words. */
export async function confirmFreestyle(controller: FreestyleController, plan: Extract<FreestylePlan, { ok: true }>): Promise<{ ok: boolean; message: string }> {
  if (plan.want === 'freestyle') {
    const r = await controller.mark(plan.date)
    return r.ok ? { ok: true, message: FREESTYLE_WORDS.marked(plan.dayWord) } : { ok: false, message: r.reason ?? FREESTYLE_WORDS.notSaved }
  }
  const ok = await controller.clear(plan.date)
  return ok ? { ok: true, message: FREESTYLE_WORDS.cleared(plan.dayWord) } : { ok: false, message: FREESTYLE_WORDS.notSaved }
}

/** Undo: the opposite call on the same date. */
export async function undoFreestyle(controller: FreestyleController, plan: Extract<FreestylePlan, { ok: true }>): Promise<{ ok: boolean; message: string }> {
  return confirmFreestyle(controller, { ...plan, want: plan.want === 'freestyle' ? 'plan' : 'freestyle' })
}
