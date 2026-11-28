// ---------------------------------------------------------------------------
// HOW EACH LIFT FELT, FOR THE COACH (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md, gap (a) 1).
//
// Exercise asks once per lift "Too easy / About right / Too hard" (his ruling 11 Nov 2026, "One tap per lift") and keeps
// the answer as the effort on that lift's LAST WORKING SET. The workout history the coach is given prints weight x reps
// and drops the effort, so "that felt easy, should I go up?" was answered blind. This reads the same column through the
// same rule the weights use (lift-effort.ts effortFromRpe), so the coach's word is the app's word: an effort he told the
// coach and one he tapped read alike, as they do for progression.
//
// Pure: logs in, one block of text out ('' when nothing was said). The coach is told what HE answered, never a verdict.
// ---------------------------------------------------------------------------
import { effortFromRpe, type LiftEffort } from './lift-effort'
import type { ExerciseSetLog } from './types'

const WORDS: Record<LiftEffort, string> = { easy: 'too easy', right: 'about right', hard: 'too hard' }

/** Most lifts named, and answers kept per lift, so the block stays a glance. */
export const LIFT_FEEL_MAX_LIFTS = 6
export const LIFT_FEEL_MAX_ANSWERS = 3

type FeelLog = Pick<ExerciseSetLog, 'date' | 'exercise_name' | 'set_number' | 'rpe' | 'is_warmup' | 'drop_index'>

/** One answer per lift per day: the effort on that day's last working set (never a build-up row, never a drop). */
export function liftFeelAnswers(logs: readonly FeelLog[]): { lift: string; date: string; feel: LiftEffort }[] {
  const last = new Map<string, FeelLog>()
  for (const l of logs) {
    if (l.is_warmup || (l.drop_index ?? 0) > 0) continue
    const key = `${l.date}\u0000${l.exercise_name}`
    const held = last.get(key)
    if (!held || l.set_number > held.set_number) last.set(key, l)
  }
  const out: { lift: string; date: string; feel: LiftEffort }[] = []
  for (const l of last.values()) {
    const feel = effortFromRpe(l.rpe)
    if (feel) out.push({ lift: l.exercise_name, date: l.date, feel })
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.lift.localeCompare(b.lift)))
}

/** "HOW EACH LIFT FELT ...": his answers, most recent first, a lift said "too easy" twice running named as such. */
export function buildCoachLiftFeel(logs: readonly FeelLog[]): string {
  const answers = liftFeelAnswers(logs)
  if (answers.length === 0) return ''
  const byLift = new Map<string, { date: string; feel: LiftEffort }[]>()
  for (const a of answers) {
    const list = byLift.get(a.lift) ?? []
    if (list.length < LIFT_FEEL_MAX_ANSWERS) list.push({ date: a.date, feel: a.feel })
    byLift.set(a.lift, list)
  }
  const lines = [...byLift.entries()].slice(0, LIFT_FEEL_MAX_LIFTS).map(([lift, list]) => {
    const said = list.map(x => `${WORDS[x.feel]} (${x.date})`).join(', ')
    const run = list.length >= 2 && list[0].feel === list[1].feel && list[0].feel !== 'right'
      ? ` — ${WORDS[list[0].feel]} the last two times`
      : ''
    return `- ${lift}: ${said}${run}`
  })
  return `HOW EACH LIFT FELT (his own answer after its sets, most recent first; the app already moves the next weight off it):\n${lines.join('\n')}`
}
