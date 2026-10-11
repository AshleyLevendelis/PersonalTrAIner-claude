// ---------------------------------------------------------------------------
// WHAT A REBUILD WILL DO, SAID BEFORE THE TAP — and from WHEN.
//
// Run 5 of the live-app test (11 Oct 2026, H28). She asked the coach for
// Mon/Wed/Fri/Sun "from next week". The card said "Rebuilds 16 weeks from
// week 1 on. Anything you've already logged stays exactly as it is." and the
// rebuild then started TODAY, replaced the session she was half-way through,
// handed back a lift she had swapped out and an exercise her knee change had
// removed, and reset two weights. None of it was on the card, because the card
// was written before anything was worked out.
//
// Two answers, both pure:
//
//   resolveRebuildStart — the date she asked for ("next week", a date, or from
//     today when she named none), as a plan week and a first date.
//   describeRebuild — read off a TRIAL of the very rebuild confirm runs (the
//     same seed, so the same plan): the first date it touches, each day of the
//     first week that changes, what comes into the plan and what leaves it,
//     weights that restart from an estimate, and the swaps it keeps.
//
// The card says what the trial did, never what a rebuild usually does.
// ---------------------------------------------------------------------------

import type { MesocycleWeek } from './types'
import { addDays } from './session-move'
import { planDayDate, planWeeksOnDate, shortDate, weekdayIndex } from './plan-guard'

export interface RebuildStart {
  /** The plan week the change begins in. */
  fromWeek: number
  /** The first date it may touch (YYYY-MM-DD). */
  fromDate: string
  /** "from today", "from Mon 12 Oct, when your next training week starts". */
  said: string
}

function localDateOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * When a rebuild starts. `starts` is the coach's argument: 'today' (or nothing), 'next_week', or a date. A date in
 * the past means today; a "next week" past the plan's last week is refused rather than quietly made "today".
 */
export function resolveRebuildStart(
  starts: unknown,
  at: { liveWeek: number; today: string; planCreatedAt: string | undefined; totalWeeks: number },
): RebuildStart | { refusal: string } {
  const raw = typeof starts === 'string' ? starts.trim().toLowerCase() : ''
  if (raw === 'next_week' || raw === 'next week') {
    const fromWeek = at.liveWeek + 1
    if (fromWeek > at.totalWeeks) return { refusal: "There's no next week left in this plan to change — this is its last week. I can make the change from today instead, or you can start a new plan." }
    const fromDate = at.planCreatedAt ? addDays(localDateOf(at.planCreatedAt), (fromWeek - 1) * 7) : addDays(at.today, 7)
    return { fromWeek, fromDate, said: `from ${shortDate(fromDate)}, when your next training week starts` }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && raw > at.today) {
    const weeks = planWeeksOnDate(at.planCreatedAt, raw, at.totalWeeks)
    if (weeks.length === 0) return { refusal: `${shortDate(raw)} is after this plan ends, so there's nothing to change then. I can make the change from today instead.` }
    return { fromWeek: Math.min(...weeks), fromDate: raw, said: `from ${shortDate(raw)}` }
  }
  return { fromWeek: at.liveWeek, fromDate: at.today, said: 'from today' }
}

const SHORT = (day: string) => day.slice(0, 3)
const focusOf = (week: MesocycleWeek | undefined, day: string): string | null => {
  const d = week?.days.find(x => x.day === day)
  if (!d) return null
  if (d.exercises.length === 0) return d.plannedActivity ? d.plannedActivity.activity ?? 'an activity' : 'recovery'
  return d.focus || 'training'
}
const listOf = (names: string[], cap = 5): string => {
  const shown = names.slice(0, cap)
  const more = names.length - shown.length
  const joined = shown.length <= 1 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  return more > 0 ? `${joined} and ${more} more` : joined
}

/**
 * The lines a rebuild card carries, read off before/after. Empty when nothing changed — the caller refuses then,
 * because a card for a change that changes nothing is the app claiming to do something.
 */
export function describeRebuild(
  before: MesocycleWeek[],
  after: MesocycleWeek[],
  at: { start: RebuildStart; planCreatedAt: string | undefined },
): string[] {
  const changed = after.filter((w, i) => w !== before[i] && JSON.stringify(w.days) !== JSON.stringify(before[i]?.days))
  if (changed.length === 0) return []
  const lines: string[] = []
  const nums = changed.map(w => w.week_number)
  lines.push(`Starts ${at.start.said}, and changes ${changed.length === 1 ? `week ${nums[0]}` : `weeks ${Math.min(...nums)} to ${Math.max(...nums)}`}. Days you've already trained, and a session you've started, stay exactly as they are.`)

  // THE FIRST WEEK IT TOUCHES, day by day — where a finished session or today's would show if it were touched.
  const first = changed[0]
  const was = before.find(w => w.week_number === first.week_number)
  const names = [...new Set([...(was?.days ?? []).map(d => d.day), ...first.days.map(d => d.day)])].sort((a, b) => weekdayIndex(a) - weekdayIndex(b))
  const dayLines: string[] = []
  for (const day of names) {
    const b = focusOf(was, day)
    const a = focusOf(first, day)
    const sameDay = JSON.stringify(was?.days.find(d => d.day === day)) === JSON.stringify(first.days.find(d => d.day === day))
    if (sameDay) continue
    const date = planDayDate(at.planCreatedAt, first.week_number, day)
    const when = date ? shortDate(date) : SHORT(day)
    dayLines.push(`${when}: ${a ?? 'rest'}${b !== a ? ` (was ${b ?? 'rest'})` : ', new exercises'}`)
  }
  if (dayLines.length > 0) lines.push(`Week ${first.week_number}: ${dayLines.join('; ')}.`)

  // WHAT COMES IN AND WHAT LEAVES, across every week it changes.
  const namesIn = (weeks: MesocycleWeek[]) => new Set(weeks.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))
  const beforeRange = before.filter(w => nums.includes(w.week_number))
  const had = namesIn(beforeRange)
  const has = namesIn(changed)
  const arriving = [...has].filter(n => !had.has(n))
  const leaving = [...had].filter(n => !has.has(n))
  if (arriving.length > 0) lines.push(`New in your plan: ${listOf(arriving)}.`)
  if (leaving.length > 0) lines.push(`Leaves your plan: ${listOf(leaving)}.`)

  // WEIGHTS: a lift kept at the same reps keeps its weight (the rebuild carries it); a lift at new reps restarts
  // from an estimate, and that is said, never left to be found at the rack.
  const restarted: string[] = []
  const lighter: string[] = []
  for (const w of changed) {
    const b = before.find(x => x.week_number === w.week_number)
    for (const d of w.days) for (const e of d.exercises) {
      if (e.suggested_load_kg == null) continue
      const old = b?.days.flatMap(x => x.exercises).find(x => x.name === e.name && x.suggested_load_kg != null)
      if (!old || old.suggested_load_kg == null || old.suggested_load_kg <= e.suggested_load_kg) continue
      const label = `${e.name} ${e.suggested_load_kg} kg (was ${old.suggested_load_kg})`
      if (old.reps !== e.reps) { if (!restarted.some(x => x.startsWith(e.name))) restarted.push(label) }
      else if (!w.is_deload && !lighter.some(x => x.startsWith(e.name))) lighter.push(label)
    }
  }
  if (restarted.length > 0) lines.push(`New reps, so the weight starts from an estimate: ${listOf(restarted, 3)}.`)
  if (lighter.length > 0) lines.push(`Lighter than before: ${listOf(lighter, 3)}.`)

  const kept = [...new Set(changed.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => e.swapped_for).map(e => `${e.name} for ${e.swapped_for}`))))]
  if (kept.length > 0) lines.push(`Your swaps stay: ${listOf(kept, 3)}.`)
  return lines
}
