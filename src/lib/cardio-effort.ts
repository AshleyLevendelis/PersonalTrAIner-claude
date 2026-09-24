/**
 * HOW HARD A PIECE OF CARDIO WAS, IN THE THREE WORDS THE APP USES FOR IT.
 *
 * Ashley, 24 Sep 2026, choosing how cardio logging should look everywhere:
 * "Like a lifting set" — and in that option, effort is Easy / Steady / Hard
 * everywhere. Before this, five screens wrote a cardio log and effort was a
 * different thing on each: the plan's RPE written silently, a 5-10 strip, and
 * an invented 4 or 6 that no screen ever showed.
 *
 * THE SCALE IS THE ONE THE APP ALREADY PLANNED WITH. AddCardioSessionSheet has
 * offered Easy / Steady / Hard at RPE 3 / 5 / 7 since 15 Sep 2026; logging now
 * speaks the same three words, so a session planned "Steady" is logged against
 * a "Steady" box rather than a number.
 *
 * A PLAN'S RPE FALLS INTO A WORD BY THE PLAN'S OWN LABELS. Every RPE-4
 * prescription the generator writes says "conversational pace", which is what
 * Easy means here; RPE 5 is the Zone-2 steady work; 7 and 8 are the intervals.
 * So Easy is up to 4, Steady 5-6, Hard 7 and above — the everyday 1-10 talk-test
 * scale (can chat / can talk but working / short sentences).
 *
 * A LEAF MODULE, for the reason activity-day.ts records: a phrasebook that
 * reaches into the plan engine drags the exercise catalogue into first paint.
 */

export type EffortKey = 'easy' | 'steady' | 'hard'

export interface Effort {
  key: EffortKey
  label: string
  /** What the word means, for somebody unsure — the talk test, not a number. */
  note: string
  /** The RPE stored when this word is chosen and nothing more exact is known. */
  rpe: number
}

export const EFFORTS: readonly Effort[] = [
  { key: 'easy', label: 'Easy', note: 'can hold a conversation', rpe: 3 },
  { key: 'steady', label: 'Steady', note: 'working, but not gasping', rpe: 5 },
  { key: 'hard', label: 'Hard', note: 'intervals', rpe: 7 },
]

/** The word for an RPE. Null when there is no usable number — never a guess. */
export function effortForRpe(rpe: number | null | undefined): EffortKey | null {
  if (rpe == null || !Number.isFinite(rpe) || rpe <= 0) return null
  if (rpe <= 4) return 'easy'
  if (rpe <= 6) return 'steady'
  return 'hard'
}

export function effortLabel(key: EffortKey): string {
  return EFFORTS.find(e => e.key === key)!.label
}

/**
 * The RPE to STORE for the word chosen.
 *
 * When the word is the plan's own, the plan's exact number is kept: logging an
 * RPE-8 interval finisher exactly as prescribed records 8, not the 7 that
 * "Hard" stands for — the word is how the screen talks, and it must not round
 * away what the plan knew. Choosing a DIFFERENT word is a statement about how
 * it felt, and stores that word's number.
 */
export function rpeToStore(chosen: EffortKey, prescribedRpe?: number | null): number {
  if (prescribedRpe != null && effortForRpe(prescribedRpe) === chosen) return Math.round(prescribedRpe)
  return EFFORTS.find(e => e.key === chosen)!.rpe
}

/**
 * THE READ-BACK. "Walk · 20 min · Easy" — the line a saved row collapses to,
 * the cardio twin of a set's "Set 1: 8 reps @ 20kg".
 *
 * The effort clause disappears rather than printing a word the app does not
 * have, the same rule prescriptionLine keeps for an unstated target.
 */
export function cardioReadback(p: { activity: string; minutes: number; rpe?: number | null }): string {
  const key = effortForRpe(p.rpe)
  return `${p.activity} · ${p.minutes} min${key ? ` · ${effortLabel(key)}` : ''}`
}

/**
 * HOW HARD SHE SAID IT WAS, read from her own words — or null, and then the
 * app asks. Added 24 Sep 2026 for the chat: "did a 30 min walk" had recorded
 * an effort of 5 that nobody chose, the one writer still inventing after the
 * screens stopped (Ashley's "like a lifting set" ruling; nothing pre-chooses
 * an effort the app cannot know).
 *
 * A NUMBER SHE STATED WINS and is kept exactly — "RPE 8", "8/10". Otherwise
 * a word from one of three short lists. The lists are deliberately narrow:
 * a word that could mean either ("comfortable", "zone 2", "tempo") is not on
 * any of them, because a wrong guess is a fact she did not give, and asking
 * costs one tap. A word she NEGATED ("not hard", "wasn't easy") is not taken,
 * and two words that disagree are not resolved by picking one — both ask.
 */
const EFFORT_WORDS: Record<EffortKey, RegExp> = {
  easy: /\b(easy|easily|light|gentle|relaxed|leisurely|conversational|chilled|slow)\b/gi,
  steady: /\b(steady|moderate|medium)\b/gi,
  hard: /\b(hard|tough|intense|intervals?|sprints?|hiit|all[- ]out|brutal|flat[- ]out)\b/gi,
}
const NEGATED = /\b(not|never|no|wasn't|isn't|wasnt|isnt|didn't|didnt|hardly)\s+(?:\w+\s+)?$/i

export function effortFromWords(text: string | null | undefined): { key: EffortKey; rpe: number } | null {
  if (!text) return null
  const rpeMatch = /\brpe\s*(\d{1,2}(?:\.\d)?)\b/i.exec(text) ?? /\b(\d{1,2})\s*\/\s*10\b/.exec(text)
  if (rpeMatch) {
    const n = Math.round(Number(rpeMatch[1]))
    const key = effortForRpe(n)
    if (key && n <= 10) return { key, rpe: n }
  }
  const found = new Set<EffortKey>()
  for (const key of Object.keys(EFFORT_WORDS) as EffortKey[]) {
    for (const m of text.matchAll(EFFORT_WORDS[key])) {
      if (!NEGATED.test(text.slice(0, m.index))) found.add(key)
    }
  }
  if (found.size !== 1) return null
  const key = [...found][0]
  return { key, rpe: EFFORTS.find(e => e.key === key)!.rpe }
}
