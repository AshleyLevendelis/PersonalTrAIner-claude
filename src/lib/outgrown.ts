// ---------------------------------------------------------------------------
// A WEIGHT CLEARLY OUTGROWN IN ONE SESSION (18 Nov 2026; docs/plans/weights-leftovers-2026-11-18.md, gap 3).
//
// Reaching the top of the range earns one step. Beating it by a wide margin (100 kg x 20 when 8-12 was asked) used
// to earn the same one step, so a weight that was far too light took many sessions to catch up. Now, when EVERY
// working set beats the top of the range by at least half the range's width and at least 3 reps, the next weight is
// worked from the weakest of those sets: its estimated one-rep max (Epley, the formula every record here uses) taken
// back to the top of the range, capped at 10% over last time in one session and laid on whole steps of the
// implement. Never less than the ordinary one step.
//
// Basis (CSCS): the "2-for-2" rule raises load when the top of the range is beaten by two or more reps; the 10% cap
// is the same ceiling the find-your-weight search uses for one session. Pure and import-free, so the card's rule and
// the testing week's anchor share it.
// ---------------------------------------------------------------------------

/** The beat over the top that counts as clearly outgrown: half the range's width, and never fewer than 3 reps. */
export function outgrownMargin(low: number, high: number): number {
  return Math.max(3, Math.ceil((high - Math.max(1, low)) / 2))
}

/**
 * The next weight for a weight clearly outgrown, or null when the sets do not clear the margin (the caller then
 * does what it did before). `stepKg` is one real step of the implement.
 */
export function outgrownWeightKg(lastWeightKg: number, reps: readonly number[], low: number, high: number, stepKg: number): number | null {
  if (!(lastWeightKg > 0) || !(stepKg > 0) || !(high > 0) || reps.length === 0) return null
  const need = high + outgrownMargin(low, high)
  if (!reps.every(r => r >= need)) return null
  const weakest = Math.min(...reps)
  const e1rm = lastWeightKg * (1 + weakest / 30)
  const atTop = high === 1 ? e1rm : e1rm / (1 + high / 30)
  const target = Math.min(atTop, lastWeightKg * 1.1)
  const steps = Math.max(1, Math.floor((target - lastWeightKg) / stepKg + 1e-9))
  return Math.round((lastWeightKg + steps * stepKg) * 100) / 100
}
