import type { RecommendedCardio } from '@/lib/types'
import { PlannedCardioRow } from './CardioSetRow'

// ---------------------------------------------------------------------------
// The PRESCRIBED cardio entry point (LAYOUT-DESIGN.md §1.7 F) — activity,
// duration and effort prefilled from the plan, one tap on the ✓ to log it.
// Distinct from AddUnplannedWork (§1.7 G), which is for anything NOT
// prescribed. Writes through the optimistic cardio-log-store wrapper (§7.6
// #5), never the old direct insertCardioLog network call.
//
// LOGGED LIKE A LIFTING SET since 24 Sep 2026 — Ashley's ruling, from three
// options, that every cardio log in the app should look like a set row. This
// was an amber strip with an outline "Log" button and a "Logged" that forgot
// itself on every tab change; the row, the read-back and the refusal all live
// in CardioSetRow now, shared with the rest day and unplanned work, so the
// three cannot drift apart again.
//
// THE PROTOCOL IS NOT AN AFTERTHOUGHT — Ashley, 14 Sep 2026: "the finisher
// title is truncated (Finisher · 11m Rowing Intervals — 6 rounds...), making
// it impossible to see the full description, round breakdown, or work/rest
// durations." The row still splits the plan's string at the dash and gives
// the rounds their own line; see splitActivity.
// ---------------------------------------------------------------------------

/** `label` leads the row. "Finisher" unless the caller knows better — the
 *  mobility close-out on a day that already had its cardio says "Optional",
 *  because that is what it is, and a second row headed "Finisher" would read
 *  as a second thing the session requires. */
export function FinisherRow({ cardio, onLogged, label = 'Finisher' }: { cardio: RecommendedCardio; onLogged?: () => void; label?: string }) {
  return (
    <PlannedCardioRow
      prescription={cardio}
      label={label}
      onLogged={onLogged}
      testid={label === 'Finisher' ? 'finisher-row' : `finisher-row-${label.toLowerCase()}`}
    />
  )
}
