import type { MesocycleWeek, UserProfile, WorkoutDay } from './types'
import { adjustDayVolumeAdvised } from './volume-adjust'
import { settleWeek } from './settle-week'
import { dayLengthParts } from './session-duration'

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
  // ADVISE, THEN ALLOW (his ruling 28 Nov 2026, fix 7): a deload week, a day already made lighter and a day at the
  // plan's set floor each take the step, with the reason said first. Only "nothing left to take" stays a no-op.
  const again = day.lightened_from
  const advised = adjustDayVolumeAdvised(day, 'lighter', profile, { deload: !!week.is_deload, sayDay })
  const result = advised.result
  if (!result.changed) {
    // SAY WHAT IS LEFT, AND WHAT IS STILL POSSIBLE (M26): every exercise is down to one set.
    return { ok: false, refusal: `${sayDay}'s session is down to one set of each exercise, so there's no set left to take. You can still shorten it, swap an exercise for an easier one, or move it to another day from the day menu.` }
  }
  const advice = [
    ...(again ? [`${sayDay}'s session is already one step lighter; this takes it one step further. "Put the full session back" still restores the session as planned.`] : []),
    ...advised.advice,
  ]
  const settled = settleWeek(
    { ...week, days: week.days.map(d => (d.day === dayName ? { ...result.day, lightened_today: true } : d)) },
    dayName,
    profile,
    { weekBalance: false },
  )
  const after = settled.week.days.find(d => d.day === dayName)
  if (!after) return { ok: false, refusal: "I can't see today's session just now." }
  // A SECOND STEP KEEPS THE PLANNED DAY, so Undo puts back the session as planned, never the first step.
  const marked: WorkoutDay = { ...after, lightened_from: { planned: again ? again.planned : day, left: dayFingerprint(after) } }
  const finalWeek: MesocycleWeek = { ...settled.week, days: settled.week.days.map(d => (d.day === dayName ? marked : d)) }

  // THE WORDS, read off the two days: every exercise whose sets moved, then the length.
  const lines: string[] = [...advice]
  for (const ex of after.exercises) {
    const was = day.exercises.find(e => e.name === ex.name)
    if (was && (was.sets ?? 0) !== (ex.sets ?? 0)) lines.push(`${ex.name}: ${was.sets} → ${ex.sets} ${ex.sets === 1 ? 'set' : 'sets'}`)
  }
  // The session's work, as the header says it (18 Nov 2026): an optional close-out is not part of either number.
  const before = dayLengthParts(day).workMinutes
  const now = dayLengthParts(after).workMinutes
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
