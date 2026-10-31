// ---------------------------------------------------------------------------
// THE EXERCISE TAB'S COACH LINE, BY LOGGED SET (tab polish, design 2a,
// 31 Oct 2026). One sentence about the exercise she is on, that changes as
// working sets land: before the first, between sets, before the last, and
// once it is done.
//
// EVERY LINE IS TRUE THAT DAY (her "build, keep my rulings"): built only from
// the plan's own numbers and what she logged. The design's "Set 1 moved well"
// is a judgement the app cannot make, so it is not said; "Hold 72.5 kg" is
// said only where 72.5 is what a blank box on the next set logs (the carry,
// set-row.ts), and "probe" only in a calibration week on the lift the
// calibration cue is attached to. Anything else falls back to the line the
// tab already said (sessionNudge: progression note, calibration cue, week
// note). Import-free on purpose: the carry rule comes in as a function.
// ---------------------------------------------------------------------------

export interface CoachLineSet {
  set_number: number
  weight_kg: number
  is_bodyweight?: boolean | null
}

export interface CoachLineExercise {
  name: string
  sets: number
  reps: string
  /** The working weight on the row (progressed or eased where it is), or null with no external load. */
  loadKg: number | null
  /** The unit the plan writes it in: "kg", "kg per hand". */
  unit: string
  perSetLoadKg?: (number | null)[]
  addedLoadKg?: number | null
  assistanceKg?: number | null
  /** A superset member: the next set is the partner's, so no per-set line. */
  inSuperset?: boolean
}

export interface CoachLineInput {
  /** Today's exercises, in the order they are done. */
  exercises: CoachLineExercise[]
  /** Working sets logged today (no ramp rows, no drops), per exercise, same order. */
  logged: CoachLineSet[][]
  /** The exercise the calibration cue is on, when it carries a weight to search for. Null outside a calibration week. */
  probeIndex: number | null
  /** That lift is at the heaviest she has said she owns: reps go up, not weight (CalibrationCue). */
  probeAtLimit?: boolean
  /** The exercise whose working set was logged last (the rest engine's label), or null when unknown. */
  recentIndex?: number | null
  /** What the tab says when the sets give nothing to say (sessionNudge's line). */
  fallback: string | null
  /** set-row.ts's carriedWeightFor, passed in so this stays import-free. */
  carry: (setNumber: number, logged: readonly CoachLineSet[], perSetLoadKg?: readonly (number | null)[]) => { kg: number; isBodyweight: boolean } | null
}

export type CoachLineSource = 'probe' | 'between-sets' | 'last-set' | 'next-exercise' | 'all-done' | 'fallback'

export const PROBE_LINE = 'Set 1 is a probe. Stop with 3-4 reps in reserve.'

/** "72.5 kg", "24 kg per hand" — the number never without its unit. */
const kgText = (kg: number, unit: string) => `${Number(kg.toFixed(2))} ${unit || 'kg'}`

function doneSetNumbers(sets: readonly CoachLineSet[]): Set<number> {
  return new Set(sets.map(s => s.set_number))
}

/** "60 kg", "+10 kg added", "20 kg assist", or null — the next exercise's load in the plan's own words. */
function loadPhrase(ex: CoachLineExercise): string | null {
  if (ex.loadKg != null) return ` at ${kgText(ex.loadKg, ex.unit)}`
  if (ex.addedLoadKg != null) return ` with ${kgText(ex.addedLoadKg, 'kg')} added`
  if (ex.assistanceKg != null) return ` with ${kgText(ex.assistanceKg, 'kg')} assist`
  return null
}

export function exerciseCoachLine(input: CoachLineInput): { text: string; source: CoachLineSource } | null {
  const { exercises, logged } = input
  const fallback = input.fallback?.trim() ? { text: input.fallback.trim(), source: 'fallback' as const } : null
  const count = (i: number) => doneSetNumbers(logged[i] ?? []).size
  const isComplete = (i: number) => count(i) >= exercises[i].sets
  const isPartial = (i: number) => count(i) > 0 && !isComplete(i)
  const all = [...exercises.keys()]
  const recent = input.recentIndex != null && input.recentIndex >= 0 && input.recentIndex < exercises.length ? input.recentIndex : null

  // THE LIFT SHE IS ON: the one she logged last, while it has sets to do, else
  // any lift part-way through. She may skip a primer and start on the squat.
  const cur = recent != null && isPartial(recent) ? recent : all.find(isPartial) ?? null

  if (cur == null) {
    // Nothing part-way through: either nothing is logged yet, or the lift she
    // just finished is done and the next is untouched.
    const firstOpen = all.find(i => !isComplete(i)) ?? null
    const anyLogged = all.some(i => count(i) > 0)
    if (!anyLogged) return firstOpen != null && input.probeIndex === firstOpen ? { text: PROBE_LINE, source: 'probe' } : fallback
    const justDone = recent != null && isComplete(recent) ? recent : [...all].reverse().find(i => isComplete(i) && count(i) > 0) ?? null
    if (justDone == null) return fallback
    const next = all.find(i => i > justDone && !isComplete(i)) ?? firstOpen
    if (next == null) return { text: `${exercises[justDone].name} done. Every working set is logged.`, source: 'all-done' }
    const nx = exercises[next]
    return { text: `${exercises[justDone].name} done. Next: ${nx.name}, ${nx.sets} × ${nx.reps}${loadPhrase(nx) ?? ''}.`, source: 'next-exercise' }
  }

  const ex = exercises[cur]
  const mine = logged[cur] ?? []
  const done = doneSetNumbers(mine)
  const probe = input.probeIndex === cur

  if (ex.inSuperset) return fallback

  const lastDone = Math.max(...done)
  let next = 1
  while (done.has(next)) next++
  const left = ex.sets - done.size

  // The weight a blank box on the next set logs: the set just done, unless the
  // plan steps the load there, in which case the plan's own number.
  const carried = input.carry(next, mine, ex.perSetLoadKg)
  const planKg = ex.perSetLoadKg?.[next - 1] ?? ex.loadKg
  const weight = carried
    ? (carried.isBodyweight ? null : { text: kgText(carried.kg, ex.unit), same: true })
    : planKg != null ? { text: kgText(planKg, ex.unit), same: false } : null

  if (left <= 1) {
    if (probe) return { text: 'One set left. Stop with 3-4 reps in reserve.', source: 'last-set' }
    if (!weight) return { text: 'One set left.', source: 'last-set' }
    return { text: weight.same ? 'One set left. Same weight.' : `One set left: ${weight.text}.`, source: 'last-set' }
  }
  if (probe) {
    return {
      text: input.probeAtLimit
        ? `Set ${lastDone} done. Easy? Add reps, not weight, for set ${next}.`
        : `Set ${lastDone} done. 5 or more reps left? Go up 5-10% for set ${next}.`,
      source: 'between-sets',
    }
  }
  if (!weight) return { text: `Set ${lastDone} done. Set ${next} next.`, source: 'between-sets' }
  return { text: weight.same ? `Set ${lastDone} done. Hold ${weight.text} for set ${next}.` : `Set ${lastDone} done. ${weight.text} for set ${next}.`, source: 'between-sets' }
}
