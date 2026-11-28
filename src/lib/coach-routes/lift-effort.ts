// ---------------------------------------------------------------------------
// HOW A LIFT FELT, TOLD TO THE COACH: the shared planner (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (b) 2).
//
// Exercise asks Too easy / About right / Too hard once a lift's sets are in, and keeps the answer as the effort on the
// LAST WORKING SET (his ruling 11 Nov 2026, "One tap per lift"; SetGrid's sayEffort). "That bench felt easy" said in the
// chat had no route to the same record, so the next weight never heard it. This plans that one write, from the day's
// own log, never from a number the coach supplies:
//
//   - the lift is found in THAT DAY'S LOGGED working sets, by his words; two that fit are asked about, never guessed;
//   - the row written is the lift's last working set, as logged (weight, reps, unit, set number untouched), with the
//     effort the screen's tap would store (EFFORT_RPE), so progression reads one rule for both surfaces;
//   - nothing is refused for being early: a lift stopped short still has a last working set, and how it felt is the
//     most useful thing to know about it (advise-then-allow; the screen asks only once all sets are in because that is
//     when a tap row appears, not because an earlier answer is wrong). The card says it is short.
//
// Pure: the day's logs and his words in, the write and the card's words out. The caller writes through logSet.
// ---------------------------------------------------------------------------
import { EFFORT_RPE, effortFromRpe, type LiftEffort } from '../lift-effort'
import type { ExerciseSetLog } from '../types'

const WORDS: Record<LiftEffort, string> = { easy: 'too easy', right: 'about right', hard: 'too hard' }

/** His word for how it felt, from a closed list; null when it is not one of them (asked, never guessed). */
export function readLiftEffort(said: string): LiftEffort | null {
  const s = said.trim().toLowerCase().replace(/[.!]+$/, '')
  if (/^(too easy|easy|very easy|light|too light|a breeze)$/.test(s)) return 'easy'
  if (/^(about right|right|just right|fine|good|ok|okay|spot on)$/.test(s)) return 'right'
  if (/^(too hard|hard|very hard|heavy|too heavy|tough|brutal|maxed out)$/.test(s)) return 'hard'
  return null
}

type DayLog = Pick<ExerciseSetLog, 'exercise_name' | 'exercise_id' | 'set_number' | 'weight_kg' | 'reps_completed' | 'unit' | 'is_bodyweight' | 'added_load_kg' | 'is_warmup' | 'drop_index' | 'rpe' | 'date'>

export type LiftEffortPlan =
  | { ok: true; effort: LiftEffort; lift: string; set: DayLog; rpe: number; lead: string; row: { field: string; before: string; after: string }; short: boolean }
  | { ok: false; reason: string; choices?: string[] }

export const LIFT_EFFORT_REFUSALS = {
  word: 'Was it too easy, about right or too hard?',
  none: (day: string) => `I can't see any working sets logged ${day}, so there's nothing to put that on yet.`,
  noLift: (day: string) => `I can't find that lift in what's logged ${day}. Which one was it?`,
  which: 'Which one do you mean?',
  same: (lift: string, effort: LiftEffort) => `${lift} is already down as ${WORDS[effort]}.`,
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** The lift his words name among the day's logged lifts: an exact name first, else every word he used in one name. */
function findLift(names: string[], said: string): string[] {
  const want = norm(said)
  if (!want) return []
  const exact = names.filter(n => norm(n) === want)
  if (exact.length > 0) return exact
  const words = want.split(' ').filter(w => w.length >= 3)
  if (words.length === 0) return []
  return names.filter(n => { const h = ` ${norm(n)} `; return words.every(w => h.includes(` ${w}`)) })
}

/** THE TRIAL. `prescribedSets` (when known) only decides whether the card says the lift was stopped short. */
export function planLiftEffort(input: {
  logs: readonly DayLog[]
  lift: string
  said: string
  dayWords: string
  prescribedSets?: (liftName: string) => number | null
  /** That day was in a deload week: the answer is kept, and the next weight goes by the plan (progression-engine). */
  deloadWeek?: boolean
}): LiftEffortPlan {
  const effort = readLiftEffort(input.said)
  if (!effort) return { ok: false, reason: LIFT_EFFORT_REFUSALS.word }
  const working = input.logs.filter(l => !l.is_warmup && (l.drop_index ?? 0) === 0)
  if (working.length === 0) return { ok: false, reason: LIFT_EFFORT_REFUSALS.none(input.dayWords) }
  const names = [...new Set(working.map(l => l.exercise_name))]
  const found = findLift(names, input.lift)
  if (found.length === 0) return { ok: false, reason: LIFT_EFFORT_REFUSALS.noLift(input.dayWords), choices: names }
  if (found.length > 1) return { ok: false, reason: LIFT_EFFORT_REFUSALS.which, choices: found }
  const lift = found[0]
  const sets = working.filter(l => l.exercise_name === lift)
  const last = sets.reduce((a, b) => (b.set_number > a.set_number ? b : a))
  const before = effortFromRpe(last.rpe)
  if (before === effort) return { ok: false, reason: LIFT_EFFORT_REFUSALS.same(lift, effort) }
  const planned = input.prescribedSets?.(lift) ?? null
  const short = planned != null && sets.length < planned
  return {
    ok: true, effort, lift, set: last, rpe: EFFORT_RPE[effort], short,
    lead: `Want me to put ${lift} down as ${WORDS[effort]}?${short ? ` That's after ${sets.length} of ${planned} sets.` : ''}${input.deloadWeek ? ' It\'s a deload week, so it\'s kept but the next weight goes by your plan.' : ' The next weight for it takes that into account.'}`,
    row: { field: `${lift}, how it felt`, before: before ? WORDS[before] : 'not said', after: WORDS[effort] },
  }
}
