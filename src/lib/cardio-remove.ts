// ---------------------------------------------------------------------------
// WHICH LOGGED ACTIVITY HE MEANS (27 Nov 2026, his report: "I accidentally added a walk today. Remove it", and the
// coach searched the session's exercises for "Walk"). The coach's propose_cardio_remove, and the app's own catch when
// the coach reaches for the exercise-removal tool instead, find the log here: the day's logged activities, matched on
// whole words of his ("walk", "the run", "my bike ride"). Nothing is guessed: no match says what the day holds, and two
// matches ask which.
// ---------------------------------------------------------------------------

const FILLER = new Set(['the', 'my', 'a', 'an', 'that', 'this', 'today', 'todays', "today's", 'logged', 'log', 'session', 'workout', 'i', 'did', 'added'])

/** Whole words of a name, lower case, plural "s" off ("walks" is "walk"), filler gone. */
function activityWords(text: string): string[] {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').split(/[\s-]+/)
    .map(w => w.replace(/'s$/, '').replace(/^(.{3,})s$/, '$1'))
    .filter(w => w && !FILLER.has(w))
}

/**
 * The logs his words name: every word he used is a word of the log's name ("walk" names "Walk" and "Brisk Walk";
 * "brisk walk" names only "Brisk Walk"). An exact name wins over a wider match, so "walk" with both a "Walk" and a
 * "Brisk Walk" logged is the Walk, never a question.
 */
export function matchLoggedActivity<T extends { activity_name: string }>(said: string, logs: readonly T[]): T[] {
  const want = activityWords(said)
  if (want.length === 0) return []
  const hits = logs.filter(l => { const have = new Set(activityWords(l.activity_name)); return want.every(w => have.has(w)) })
  const exact = hits.filter(l => activityWords(l.activity_name).join(' ') === want.join(' '))
  return exact.length > 0 ? exact : hits
}
