import type { MesocycleWeek } from './types'

// ---------------------------------------------------------------------------
// THE WEEK NOTE — one short paragraph saying what THIS week is, for the
// program browse screen.
//
// Ashley, 1 Sep 2026, on the first screenshots of the redesign: the note ran
// ten lines, ran sentences together ("controlled tempo The volume phase"),
// and said the same thing twice. Root cause: the screen concatenated four
// separate texts — phase_focus, the phase's own coaching, the goal's
// programme-level framing, and this week's progression note — with a bare
// space, and two of the four already overlapped in content.
//
// THE RULE, and it is a rule about EDITING, not formatting: a week note
// carries exactly two things — what this BLOCK is for (phase_focus, the
// same for its four weeks) and what THIS WEEK does differently (the last
// sentence of coach_note, which is buildProgressionNote's single sentence).
// Everything in between is block- or programme-level: it is identical on
// every week of the block, the coach can be asked for it, and repeating it
// above every workout is what pushed the actual training off the screen.
//
// The doubled "Deload week — … Deload week — …" is prevented STRUCTURALLY by
// that rule rather than by a de-duplicating filter: taking one sentence
// cannot yield two copies of it. A filter was written first and removing it
// changed no test — an un-exercised guard sitting over a problem the shape
// already solved, which is this repo's most familiar defect wearing a
// helpful face.
//
// Deliberately reads the STORED text rather than regenerating it. A plan is
// generated once and its notes are persisted in mesocycle_weeks, so a
// trainee mid-block keeps the notes their plan was written with; wording
// fixed in the generator reaches them only when a plan is next built. That
// is why the trimming happens here, on the way to the screen, and not by
// asking the generator to emit less.
// ---------------------------------------------------------------------------

/**
 * Splits on sentence boundaries. Every sentence buildProgressionNote emits is
 * a single sentence with no internal full stop, which is what makes "the last
 * sentence is this week's note" a safe read rather than a guess.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** Ends a fragment so the next sentence cannot run into it — the "controlled tempo The volume phase" defect. */
function terminate(text: string): string {
  const t = text.trim()
  if (!t) return t
  return /[.!?]$/.test(t) ? t : `${t}.`
}

/**
 * The paragraph shown above the week's days. Empty string when the week
 * carries no notes at all (a plan generated before these fields existed).
 */
export function weekNoteText(week: Pick<MesocycleWeek, 'phase_focus' | 'coach_note' | 'days'> | undefined): string {
  if (!week) return ''

  // A WEEK WITH NO EXERCISES IS NOT DESCRIBED IN LIFTING LANGUAGE. A
  // starting-out plan is walks — four of them and three rest days, no sets
  // anywhere in sixteen weeks — and it was being handed the phase's lifting
  // copy verbatim: "Load goes up this week on the main lifts", "find the
  // weight where the last rep feels like RPE 6, log it", under a heading
  // reading "Build muscle — moderate loads, higher volume, controlled
  // tempo". Every one of those describes work that is not in the plan.
  // Ashley's screenshot, 1 Sep 2026.
  //
  // The walk's own reason is used instead — already written, already true,
  // already the sentence shown on the day itself — rather than new copy
  // invented here. Checked on the WEEK'S OWN DAYS rather than on the
  // profile, for the same reason isLoadlessWeek does: the plan in front of
  // the trainee is the thing being described.
  const days = week.days ?? []
  const trains = days.some(d => d.exercises.length > 0)
  if (days.length > 0 && !trains) {
    const activity = days.find(d => d.plannedActivity)?.plannedActivity
    if (activity?.reason?.trim()) return terminate(activity.reason.trim())
    return ''
  }
  const kept: string[] = []
  const add = (sentence: string) => {
    const s = terminate(sentence)
    if (s) kept.push(s)
  }

  // What this block is for. One sentence — phase_focus is a phrase, not a
  // paragraph, and is terminated here rather than trusted to be.
  if (week.phase_focus?.trim()) add(splitSentences(terminate(week.phase_focus))[0] ?? '')

  // What this week does differently: buildProgressionNote's sentence, which
  // the generator appends last.
  if (week.coach_note?.trim()) {
    const sentences = splitSentences(week.coach_note)
    const last = sentences[sentences.length - 1]
    if (last) add(last)
  }

  return kept.join(' ')
}
