// ---------------------------------------------------------------------------
// WHAT THE COACH KNOWS ABOUT TODAY'S WATER.
//
// 22 Sep 2026, following the profile-field audit and the steps precedent
// (steps-context.ts, 5 Sep 2026, "both halves ship together on purpose").
// Water had the SAME half-built shape: log_water writes immediately, and
// ChatAssistant.tsx's own comment on that write path already said "the
// coach quotes waterMl off proactiveData" — but nothing ever sent a water
// summary to the prompt. The only place waterMl/waterTargetMl reached the
// coach was the one-shot accountability nudge (accountability.ts, rule 8,
// evening-only, fires once per conversation and only when short) — asked
// "how's my water today?" outside that narrow window, the coach had nothing
// to answer from.
//
// UNLIKE STEPS, this needed no write-side fix. log_water is append-only —
// every call adds an amount, never replaces a day's total — so there is no
// "total vs increment" ambiguity for a missing read to get wrong. This is a
// pure read-side gap: a helpful answer missing, not a correctness bug.
//
// waterMl/waterTargetMl both already exist on `proactiveData`
// (dashboard-data.ts computes them for the Dashboard) — this reads them,
// never refetches or re-derives them, so the coach's number and the
// Dashboard's number cannot drift apart by construction.
// ---------------------------------------------------------------------------

/**
 * One plain line for the coach's context.
 *
 * No null/"not logged yet" state to handle, unlike steps: water has no
 * single upserted daily row that can be missing versus zero — it is a sum
 * of today's log rows, and an empty sum IS zero, honestly.
 */
export function buildCoachWaterSummary(waterMl: number, waterTargetMl: number): string {
  return `Water today: ${Math.round(waterMl).toLocaleString()}ml of ${Math.round(waterTargetMl).toLocaleString()}ml.`
}
