// ---------------------------------------------------------------------------
// LESSONS THAT BUILD OVER TIME.
//
// Ashley, 6 Nov 2026: "I want it to educate the user so that they can learn
// and progress as they use the app ... the reasons behind why we eat certain
// foods or do certain exercises." Her ruling, from three options: "A why on
// every answer", plus lessons that build, each taught when her own week makes
// it relevant, and never repeated.
//
// The coach's instructions already ask for a why on every answer. This is the
// part an instruction cannot do on its own: a SEQUENCE. A short list of the
// ideas every trainee should come to understand, each with the moment from
// her own data that makes it worth saying now (her first lighter week, a rest
// day, a new best). The app picks at most one per day, hands it to the coach,
// and remembers it once taught, so it is never taught twice and later answers
// can build on it.
//
// HOW "TAUGHT" IS KNOWN: the coach ends the message that teaches it with
// [LESSON: id]. The app removes the marker (reply-text.ts) and writes the id
// onto that coach message's stored row (action_data), so the record is the
// message that taught it. No new table, no migration.
//
// THE CONTENT IS A CSCS CALL (her 18 Sep delegation), basis in
// docs/plans/coach-persona.md: population-level education the app already
// works at, plain words, and no number the app does not already show her.
// Every point is phrased so it stays true for anyone it is offered to: the
// coach ties it to her, the point itself never claims a fact about her.
// ---------------------------------------------------------------------------

export interface LessonFacts {
  /** This week of the plan is a planned lighter week. */
  isDeload: boolean
  /** This week finds working weights. */
  isCalibrationWeek: boolean
  /** The plan is new (week 1, made in the last few days). */
  planIsNew: boolean
  /** A session is planned today and not yet logged. */
  sessionDueToday: boolean
  /** She has trained today. */
  trainedToday: boolean
  /** Today is a rest day on the plan. */
  restDayToday: boolean
  /** A personal best in the last two weeks. */
  recentBest: boolean
  /** Sessions in a row (the streak), or null when unknown. */
  streak: number | null
  /** Her goal, as the profile names it. */
  goal: string | null
  /** The weight trend is downward. */
  weightFalling: boolean
}

export interface Lesson {
  id: string
  /** What it is about, in a few words: the coach may build on it later by this. */
  title: string
  /** The idea, in plain words. The coach says it in its own words, tied to her. */
  point: string
  /** True when her week makes this worth saying now. */
  when: (f: LessonFacts) => boolean
}

/** In priority order: the first one due and not yet taught is offered. */
export const LESSONS: readonly Lesson[] = [
  {
    id: 'deload',
    title: 'why a lighter week',
    point: "A lighter week is not lost progress. The strength built over the last few weeks is still there; the tiredness clears this week, so it can show in the next block.",
    when: f => f.isDeload,
  },
  {
    id: 'calibration',
    title: 'finding working weights',
    point: 'This week finds the right working weights. Starting a little under the limit and building up beats guessing heavy and stalling a week later.',
    when: f => f.isCalibrationWeek,
  },
  {
    id: 'progressive-overload',
    title: 'how the plan makes you stronger',
    point: 'The plan asks a little more over time, a rep and then a little weight, so the body always has a reason to adapt, without big jumps that cost good form.',
    when: f => f.planIsNew,
  },
  {
    id: 'rest-days',
    title: 'why rest days count',
    point: 'Rest days are when the work turns into progress: muscle rebuilds between sessions, not during them.',
    when: f => f.restDayToday,
  },
  {
    id: 'compound-first',
    title: 'why the big lifts come first',
    point: 'The big lifts go first while fresh, because they need the most strength and focus. The smaller exercises after are fine done a little tired.',
    when: f => f.sessionDueToday,
  },
  {
    id: 'protein-repair',
    title: 'protein and repair',
    point: 'Training is the signal; protein is the building material. Spreading it across the day keeps the repair going all day, not just at one meal.',
    when: f => f.trainedToday,
  },
  {
    id: 'carbs-fuel',
    title: 'carbs as fuel',
    point: 'Carbs are the fuel muscles use for hard sets. Eating some in the hours before training means more good reps, and good reps are what build you.',
    when: f => f.sessionDueToday,
  },
  {
    id: 'strength-is-skill',
    title: 'why strength climbs',
    point: 'Strength is partly skill: the nervous system learns the lift as well as the muscle growing, which is why early progress can come quickly. More good reps at a weight usually come before more weight.',
    when: f => f.recentBest,
  },
  {
    id: 'consistency',
    title: 'consistency over single sessions',
    point: 'Turning up week after week is what changes the body; no single session does. A steady run matters more than any one great day.',
    when: f => f.streak != null && f.streak >= 3,
  },
  {
    id: 'protein-in-a-deficit',
    title: 'keeping muscle while losing fat',
    point: "Eating less to lose fat, protein and lifting are what tell the body to keep its muscle, so more of the weight that comes off is fat.",
    when: f => f.goal === 'fat_loss' && f.weightFalling,
  },
  {
    id: 'daily-steps',
    title: 'everyday movement',
    point: 'Everyday walking adds up to more over a week than most people expect, and it barely tires you, so it is one of the easiest levers for fat loss.',
    when: f => f.goal === 'fat_loss' && f.restDayToday,
  },
]

/** One lesson already taught: its id and when. */
export interface TaughtLesson { id: string; at: string }

/** The local calendar date of an instant, as YYYY-MM-DD. */
function localDate(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * THE LESSON TO OFFER NOW, or null. At most one a day, so the coach teaches
 * steadily rather than in a burst; never one already taught.
 */
export function lessonDue(facts: LessonFacts, taught: readonly TaughtLesson[], now: Date): Lesson | null {
  const today = localDate(now)
  if (taught.some(t => !Number.isNaN(Date.parse(t.at)) && localDate(new Date(t.at)) === today)) return null
  const done = new Set(taught.map(t => t.id))
  return LESSONS.find(l => !done.has(l.id) && l.when(facts)) ?? null
}

/** The id of a lesson the coach marked as taught in this reply, if it is one the app offered. */
const LESSON_TAG_RE = /\[LESSON:\s*([a-z0-9-]+)\s*\]/gi

export function lessonTaughtIn(rawReply: string, offered: string | null): string | null {
  if (!offered) return null
  for (const m of rawReply.matchAll(LESSON_TAG_RE)) if (m[1].toLowerCase() === offered) return offered
  return null
}

/** Every lesson id stored on chat rows (action_data.lesson), newest first as given. */
export function taughtFromRows(rows: readonly { action_data?: unknown; created_at?: string }[]): TaughtLesson[] {
  const out: TaughtLesson[] = []
  for (const r of rows) {
    const a = r.action_data
    if (!a || typeof a !== 'object') continue
    const id = (a as Record<string, unknown>).lesson
    if (typeof id === 'string' && LESSONS.some(l => l.id === id)) out.push({ id, at: r.created_at ?? '' })
  }
  return out
}

/** What the stored row carries: the plan action as it was, with the lesson beside it, or the lesson alone. */
export function actionDataWithLesson<A extends object>(action: A | null | undefined, lesson: string | null): A | { source: 'lesson'; lesson: string } | (A & { lesson: string }) | null {
  if (!lesson) return action ?? null
  return action ? { ...action, lesson } : { source: 'lesson', lesson }
}

/** The block the coach is handed: the lesson to teach, and what it has already taught. */
export function lessonBrief(due: Lesson | null, taught: readonly TaughtLesson[]): string {
  const titles = taught.map(t => LESSONS.find(l => l.id === t.id)?.title).filter((x): x is string => !!x)
  const lines: string[] = []
  if (due) lines.push(`LESSON TO TEACH (id ${due.id}, "${due.title}"): ${due.point}`)
  if (titles.length > 0) lines.push(`Already taught, never repeat as a lesson (build on them where it helps): ${titles.join('; ')}.`)
  return lines.join('\n')
}
