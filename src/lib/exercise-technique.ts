// ---------------------------------------------------------------------------
// THE TECHNIQUE HALF OF THE COACH'S CONTEXT.
//
// Ashley, 5 Sep 2026, on being told the coach could not see the app's own form
// cues: "fix it."
//
// THE DEFECT. The catalogue carries 801 curated form cues across 199 live
// exercises, written for humans and rendered on the Exercise tab's "How to"
// tab. Until this file, `form_cues` had EXACTLY ONE READER IN THE REPO —
// ExerciseDetailDialog. Not a prompt, not a context builder, not the edge
// function. So the coach answered "how do I deadlift?" from the model's
// general knowledge while the app held its own answer one tap away, and the
// two could disagree with nothing to catch it.
//
// THIS IS THE THIRD TIME, which is why the gate that comes with it asserts an
// invariant rather than a string:
//
//   meal-ingredients.ts exists because the coach said "none of your scheduled
//   meals actually contain almond butter" about a breakfast holding 13g of it.
//   Its gate names the shape: "Two readers of the same data, one right and
//   one blind."
//
//   chat-plan-context.ts's own describeExerciseForCoach header records the
//   second: intensity and tempo were withheld, leaving the coach "unable to
//   answer 'how hard should the push-ups be?' about a number on the next
//   screen."
//
// Ingredients, then intensity, now cues. Deliberately built as a near-copy of
// meal-ingredients.ts — same cap-and-announce discipline, same "say so in
// words" treatment of absence — because that file is the shape that worked.
//
// WHY CONTEXT AND NOT A TOOL. chat-gemini makes exactly one generateContent
// call and every tool branch is terminal; there is no leg that could hand a
// lookup back to the model and let it keep talking. A tool would be new
// mechanism and a second billed call under a cap that counts requests, not
// calls. The prompt also tells the model not to call functions for technique
// questions at all. Injection is both cheaper and the sanctioned path.
// ---------------------------------------------------------------------------

import { getExerciseEntry } from './exercise-db'

/**
 * A cap, for the same reason meal-ingredients.ts has one: a big week should
 * not crowd out the rest of the coach's context. Measured before choosing —
 * a real 16-week hypertrophy plan carries 26 distinct exercises in week 1
 * (~3.6 KB), against 66 across the whole mesocycle and 199 in the catalogue
 * (~28 KB). 40 clears a normal week with room, and stays far inside the
 * 256 KB request cap in _shared/spend-cap.ts.
 *
 * Truncation is ANNOUNCED. A shortened list silently read as complete would
 * reproduce this whole bug in a new place: the model reasoning from a partial
 * view it believed was total.
 */
export const MAX_TECHNIQUE_EXERCISES = 40

/** The marker appended when a week holds more exercises than are described. */
export function techniqueTruncationNote(total: number): string {
  return `+${total - MAX_TECHNIQUE_EXERCISES} more exercises this week, technique notes not listed`
}

/** What the app knows about performing one movement, or an honest blank. */
export function describeTechniqueForCoach(name: string): string {
  const entry = getExerciseEntry(name)
  // "No entry" and "no cues" are the same sentence to a reader and different
  // facts to a coach — but both mean the app has nothing of its own to offer
  // here, which is the only distinction the model needs to act on. Said in
  // words rather than rendered as an empty bracket, because "" and "(none)"
  // read identically as absence to a model and mean different things: one is
  // a movement we have no notes for, the other is a formatting accident.
  if (!entry || entry.form_cues.length === 0) {
    return `${name}: no technique notes recorded in the app — answer from your own knowledge`
  }
  return `${name} (works ${entry.primary_muscles.join(', ')}): ${entry.form_cues.join('; ')}`
}

/**
 * The technique block appended to the coach's exercise summary.
 *
 * Deduplicated, because a lift programmed twice in a week would otherwise
 * carry its cues twice for no gain. Order is first-appearance, so the week
 * reads in the order it is trained.
 *
 * Returns '' for an empty list — the caller appends nothing at all in that
 * case, which is what keeps buildCoachExerciseSummary's empty-plan contract
 * (it must return exactly '') intact.
 */
export function buildCoachTechniqueSummary(names: string[]): string {
  const seen = new Set<string>()
  const distinct: string[] = []
  for (const n of names) {
    const key = n.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    distinct.push(n)
  }
  if (distinct.length === 0) return ''

  const shown = distinct.slice(0, MAX_TECHNIQUE_EXERCISES)
  const lines = shown.map(describeTechniqueForCoach)
  if (distinct.length > MAX_TECHNIQUE_EXERCISES) {
    lines.push(techniqueTruncationNote(distinct.length))
  }
  return lines.join('\n')
}
