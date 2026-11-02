import type { MesocycleWeek, UserProfile, WorkoutDay } from './types'
import { adjustDayVolume, isVolumeAdjustable } from './volume-adjust'
import { settleWeek } from './settle-week'
import { estimateDaySeconds } from './session-duration'

// ---------------------------------------------------------------------------
// "MAKE IT EASIER TODAY" — SHOWN FIRST, THEN DONE, THEN UNDOABLE (2 Nov 2026,
// the UX pass, Ashley's "work through all of these": every change shows itself
// before the tap and offers Undo after). It used to apply on the tap with no
// preview and no way back; the whole-app test (#5) found it so.
//
// ONE DAY ONLY, AND NOTHING ELSE IN THE WEEK MOVES. The week-balance pass is
// not run (settleWeek's weekBalance: false), the reorder's rule: a CSCS call,
// recorded in BACKLOG — a lighter day for fatigue is a deliberate dip, and
// paying it back on another day's sets would load the days after a tired one.
// It also makes Undo exact: the planned day is all it needs.
// ---------------------------------------------------------------------------

/** What a lightened day remembers, in the week row's `days` jsonb, so Undo survives a reload. */
export interface LightenedFrom {
  /** The day as planned, before this. */
  planned: WorkoutDay
  /** The day as "make it easier" left it: Undo puts the plan back only while the day is still this. */
  left: string
}

/** The exercises and their sets: what "make it easier" changes, and what a later edit would change too. */
export function dayFingerprint(day: WorkoutDay): string {
  return day.exercises.map(e => `${e.name}:${e.sets ?? 0}`).join('|')
}

export type LighterPlan =
  | { ok: true; mesocycle: MesocycleWeek[]; lines: string[] }
  | { ok: false; refusal: string }

/**
 * The trial: what "make it easier" would do to this day, in words, and the plan with it done. Nothing is written.
 * `sayDay` is the day as she sees it ("Today", "Thursday").
 */
export function planLighterToday(input: {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  weekNumber: number
  dayName: string
  sayDay: string
}): LighterPlan {
  const { mesocycle, profile, weekNumber, dayName, sayDay } = input
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  if (!week || !day) return { ok: false, refusal: "I can't see today's session just now." }
  // AN EMPTY DAY IS NOT A DAY AT ITS FLOOR (M26).
  if (day.exercises.length === 0) return { ok: false, refusal: "There's no session here to make lighter." }
  if (!isVolumeAdjustable(week)) return { ok: false, refusal: "This is a deload week — it's already lighter on purpose." }
  if (day.lightened_from) return { ok: false, refusal: `${sayDay}'s session is already made lighter. Put the full session back first if you want to change it again.` }
  const result = adjustDayVolume(day, 'lighter', profile)
  if (!result.changed) {
    // SAY WHAT THE MINIMUM IS, AND WHAT IS STILL POSSIBLE (M26).
    const sets = day.exercises.reduce((n, e) => n + (e.sets ?? 0), 0)
    const floor = `${sayDay}'s session is already as light as it goes: ${sets} sets across ${day.exercises.length} exercises, the fewest that still trains each one.`
    const blocked = result.blocked[0] ? ` (${result.blocked[0].name} is ${result.blocked[0].reason}.)` : ''
    return { ok: false, refusal: `${floor}${blocked} You can still swap an exercise for an easier one, shorten the session, or move it to another day from the day menu.` }
  }
  const settled = settleWeek(
    { ...week, days: week.days.map(d => (d.day === dayName ? { ...result.day, lightened_today: true } : d)) },
    dayName,
    profile,
    { weekBalance: false },
  )
  const after = settled.week.days.find(d => d.day === dayName)
  if (!after) return { ok: false, refusal: "I can't see today's session just now." }
  const marked: WorkoutDay = { ...after, lightened_from: { planned: day, left: dayFingerprint(after) } }
  const finalWeek: MesocycleWeek = { ...settled.week, days: settled.week.days.map(d => (d.day === dayName ? marked : d)) }

  // THE WORDS, read off the two days: every exercise whose sets moved, then the length.
  const lines: string[] = []
  for (const ex of after.exercises) {
    const was = day.exercises.find(e => e.name === ex.name)
    if (was && (was.sets ?? 0) !== (ex.sets ?? 0)) lines.push(`${ex.name}: ${was.sets} → ${ex.sets} ${ex.sets === 1 ? 'set' : 'sets'}`)
  }
  const before = Math.round(estimateDaySeconds(day) / 60)
  const now = Math.round(estimateDaySeconds(after) / 60)
  if (now < before) lines.push(`About ${before} → ${now} min.`)
  lines.push('Weights and reps stay the same. Only today changes; the rest of your week is as it was.')
  return { ok: true, mesocycle: mesocycle.map(w => (w.week_number === weekNumber ? finalWeek : w)), lines }
}

/**
 * Puts the planned day back — only while the day is still as "make it easier" left it and no working set is logged
 * (her 29 Oct rule: an Undo puts back only what is still as the card left it).
 */
export function undoLighterToday(
  mesocycle: MesocycleWeek[],
  weekNumber: number,
  dayName: string,
  loggedSets: number,
): { ok: true; mesocycle: MesocycleWeek[] } | { ok: false; refusal: string } {
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  const from = day?.lightened_from
  if (!week || !day || !from) return { ok: false, refusal: "Today is the full session already, so there's nothing to put back." }
  if (loggedSets > 0) return { ok: false, refusal: `You've logged sets in today's session, so it stays lighter. ${dayName} is back to the full session next week.` }
  if (dayFingerprint(day) !== from.left) return { ok: false, refusal: "You've changed today's session since, so I've left it as it is." }
  const restored: MesocycleWeek = { ...week, days: week.days.map(d => (d.day === dayName ? from.planned : d)) }
  return { ok: true, mesocycle: mesocycle.map(w => (w.week_number === weekNumber ? restored : w)) }
}
