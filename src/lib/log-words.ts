// ---------------------------------------------------------------------------
// WHAT THE CHAT SAYS WHEN IT HAS LOGGED A WORKOUT FOR HIM.
//
// Found on the coach exam of 18 Nov 2026 and by a tester the same week: "squats
// done, got 50kg for all three sets" was a first at that weight, and the chat
// answered with a card and no words. Worse, the line above the card was the
// card's own title, so "Logged · Wednesday" read twice.
//
// A set logged by chat is written by the app, on the phone, with no coach turn
// behind it (the numbers are never the model's). So the words are the app's
// too: one plain line, and when a set beat his record, the record named with
// its unit the way every other screen names it (personalBest).
//
// "A first log is a baseline, not a best" is the record engine's rule and is
// kept by asking the engine: nothing here decides what a best is.
// ---------------------------------------------------------------------------
import type { ExerciseSetLog } from './types'
import { checkForPR, readingFor } from './pr-engine'
import { personalBest, LOG_WORDS, type BestReading } from './coach-voice'

export interface LoggedBest {
  exerciseName: string
  reading: BestReading
  /** How many OTHER exercises in the same message also beat their record. */
  more: number
}

const size = (r: BestReading): [number, number] =>
  r.kind === 'reps' ? [0, r.reps] : r.kind === 'added_load' ? [r.addedKg, 0] : r.kind === 'best_set' ? [r.weightKg, r.reps] : [r.weightKg, 0]

/**
 * The best among the sets this message wrote, or null. Build-up sets, drops,
 * and anything not counted in reps (a hold, a carry) are never a record: the
 * same exclusions the set screen makes before it asks.
 */
export function bestAmongLogged(profileId: string, written: ExerciseSetLog[], onDate: string): LoggedBest | null {
  const byExercise = new Map<string, BestReading>()
  for (const row of written) {
    if (row.is_warmup || (row.drop_index ?? 0) > 0 || (row.unit ?? 'reps') !== 'reps') continue
    const pr = checkForPR(profileId, row.exercise_name, {
      weightKg: row.weight_kg,
      reps: row.reps_completed,
      isBodyweight: row.is_bodyweight,
      addedLoadKg: row.added_load_kg ?? null,
    }, onDate)
    if (!pr) continue
    const reading = readingFor(pr)
    const had = byExercise.get(row.exercise_name)
    const [w, r] = size(reading)
    const [hw, hr] = had ? size(had) : [-1, -1]
    if (!had || w > hw || (w === hw && r > hr)) byExercise.set(row.exercise_name, reading)
  }
  const first = [...byExercise.entries()][0]
  return first ? { exerciseName: first[0], reading: first[1], more: byExercise.size - 1 } : null
}

/** The line above the receipt. A log that saved nothing keeps the card's own title: that is the news. */
export function logBubble(a: { saved: boolean; corrected: boolean; title: string; best: LoggedBest | null }): string {
  if (!a.saved) return a.title
  if (a.best) return LOG_WORDS.best(a.best.exerciseName, personalBest(a.best.reading), a.best.more)
  return a.corrected ? LOG_WORDS.corrected : LOG_WORDS.logged
}
