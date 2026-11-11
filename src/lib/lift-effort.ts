// ---------------------------------------------------------------------------
// HOW A LIFT FELT: the three answers and the number each is kept as. No
// imports, so the set grid can use it without pulling in the weight rules.
//
// Ashley's ruling, 11 Nov 2026, from three options: "One tap per lift" (Too
// easy, About right, Too hard), asked once a lift's sets are done. The answer
// is kept as the effort on the lift's last working set, on the same 1-10 scale
// a set the coach logs already carries, so an effort said to the coach and one
// tapped on the screen are read by one rule (progression-engine.ts, which says
// what each answer does to the next weight and why).
// ---------------------------------------------------------------------------

export type LiftEffort = 'easy' | 'right' | 'hard'

/** What one tap stores, on the 1-10 effort scale: about five left, about two left, nothing left. */
export const EFFORT_RPE: Record<LiftEffort, number> = { easy: 5, right: 8, hard: 10 }

/** Six or under is four or more reps left; nine and a half or over is the limit. Null when no effort was given. */
export function effortFromRpe(rpe: number | null | undefined): LiftEffort | null {
  if (rpe == null || !Number.isFinite(rpe)) return null
  if (rpe <= 6) return 'easy'
  if (rpe >= 9.5) return 'hard'
  return 'right'
}
