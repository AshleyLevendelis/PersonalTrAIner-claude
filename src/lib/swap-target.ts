// ---------------------------------------------------------------------------
// WHICH EXERCISE, ON WHICH DAY — resolved the way a person means it.
//
// Ashley, 8 Sep 2026: asking the coach to swap an exercise answers "I couldn't
// find that on your current plan." The handler required THREE exact strings —
// a day name matching the plan's spelling, the old exercise's full catalogue
// name, and the new one's — and every near miss collapsed into that one
// sentence. MEASURED against a real generated Tuesday:
//
//   day      "Tuesday" ok · "today" MISS · "Tue" MISS
//   old_item "Barbell Squats" ok · "Squats" MISS · "Barbell" MISS
//   new_item "Lateral Raises" ok · "Lateral Raise" MISS
//
// "Swap this exercise" is the request; the model has to invent all three, and
// one wrong plural sends the whole thing to the same dead end.
//
// So resolution lives here, pure, and it REFUSES WITH A REASON rather than
// returning null. A swap rewrites the plan, so a near miss must never be
// guessed at: two candidates come back as a question naming both, which is
// the same rule the set parser already follows for an ambiguous lift.
// ---------------------------------------------------------------------------

/** Just enough of a plan day for the resolver — deliberately not WorkoutDay, so this stays testable with a literal. */
export interface SwapDay {
  day: string
  exercises: { name: string }[]
}

export type SwapTargetResult =
  | { ok: true; dayName: string; exIndex: number; exerciseName: string }
  /** `message` is shown to the trainee verbatim; it says which of the three parts could not be resolved. */
  | { ok: false; reason: 'no_day' | 'no_exercise' | 'ambiguous_exercise'; message: string }

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The day the request means.
 *
 * "today"/"tomorrow" are resolved against the caller's own idea of today
 * rather than a clock read here — the app has one clock (dev-clock) and this
 * module having a second is how two parts of one screen come to disagree
 * about what day it is.
 *
 * Returns the day's name AS THE PLAN SPELLS IT, so everything downstream keys
 * off the plan's own string rather than the model's.
 */
export function resolveDayName(arg: string, days: SwapDay[], todayName: string): string | null {
  const a = normalise(arg)
  if (!a) return null

  if (a === 'today') return days.find(d => normalise(d.day) === normalise(todayName))?.day ?? null
  if (a === 'tomorrow') {
    const i = WEEKDAYS.indexOf(normalise(todayName))
    if (i === -1) return null
    return days.find(d => normalise(d.day) === WEEKDAYS[(i + 1) % 7])?.day ?? null
  }

  const exact = days.find(d => normalise(d.day) === a)
  if (exact) return exact.day
  // "Tue", "Thurs" — a prefix, but only when it picks out exactly one day.
  const prefixed = days.filter(d => normalise(d.day).startsWith(a) || a.startsWith(normalise(d.day)))
  return prefixed.length === 1 ? prefixed[0].day : null
}

/**
 * Which exercise on this day the request means.
 *
 * Exact name, then a substring either way ("Squats" inside "Barbell Squats",
 * or a model's over-long "Barbell Back Squats" containing the plan's name),
 * then a word-level match for the case those miss. Each step only counts when
 * it lands on exactly ONE exercise; two is a question, never a coin toss.
 */
export function resolveExerciseOnDay(arg: string, exercises: { name: string }[]): { index: number } | { ambiguous: string[] } | null {
  const a = normalise(arg)
  if (!a) return null
  const names = exercises.map(e => normalise(e.name))

  const exact = names.indexOf(a)
  if (exact !== -1) return { index: exact }

  const substring = names.map((n, i) => ({ n, i })).filter(({ n }) => n.includes(a) || a.includes(n))
  if (substring.length === 1) return { index: substring[0].i }
  if (substring.length > 1) return { ambiguous: substring.map(({ i }) => exercises[i].name) }

  // Last resort: every word of the request appears in the name. Catches
  // "squat barbell" and "barbell squat" (singular) alike, which substring
  // matching cannot.
  const words = a.split(' ').filter(w => w.length > 2)
  if (words.length > 0) {
    const wordHits = names.map((n, i) => ({ n, i })).filter(({ n }) => words.every(w => n.includes(w) || w.includes(n)))
    if (wordHits.length === 1) return { index: wordHits[0].i }
    if (wordHits.length > 1) return { ambiguous: wordHits.map(({ i }) => exercises[i].name) }
  }
  return null
}

/**
 * The whole target for a swap: which day, and which exercise on it.
 *
 * Every failure carries a sentence that says which part failed and what the
 * alternatives were — the thing the single "I couldn't find that on your
 * current plan" could never do, and the reason a real swap request looked
 * identical to a request about a plan that had changed underneath.
 */
export function resolveSwapTarget(input: {
  dayArg: string
  exerciseArg: string
  days: SwapDay[]
  todayName: string
}): SwapTargetResult {
  const dayName = resolveDayName(input.dayArg, input.days, input.todayName)
  if (!dayName) {
    return {
      ok: false,
      reason: 'no_day',
      message: input.dayArg.trim()
        ? `I don't have a "${input.dayArg.trim()}" on your plan this week — which day did you mean?`
        : 'Which day did you want to change?',
    }
  }

  const day = input.days.find(d => d.day === dayName)!
  const hit = resolveExerciseOnDay(input.exerciseArg, day.exercises)
  if (!hit) {
    return {
      ok: false,
      reason: 'no_exercise',
      message: day.exercises.length === 0
        ? `${dayName} is a rest day — there's nothing on it to swap.`
        : `I couldn't match "${input.exerciseArg.trim()}" to anything on ${dayName}. It has: ${day.exercises.map(e => e.name).join(', ')}.`,
    }
  }
  if ('ambiguous' in hit) {
    return {
      ok: false,
      reason: 'ambiguous_exercise',
      message: `${dayName} has more than one of those — ${hit.ambiguous.join(' and ')}. Which one?`,
    }
  }

  return { ok: true, dayName, exIndex: hit.index, exerciseName: day.exercises[hit.index].name }
}
