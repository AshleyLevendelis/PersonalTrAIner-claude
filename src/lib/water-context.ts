// ---------------------------------------------------------------------------
// WHAT THE COACH KNOWS ABOUT TODAY'S WATER.
//
// The exact gap steps-context.ts was written to close, one field along, and it
// went unnoticed because the coach could already WRITE water (log_water has
// shipped for a while) — so nothing looked broken until someone asked it to
// read one back.
//
// Measured live, 7 Sep 2026. 1,000ml logged, showing on Home, two rows sitting
// in water_logs. Asked "how much water have I had today?", the coach answered:
//
//     "You haven't logged any water yet today."
//
// Reloaded the app, asked again, same answer. proactiveData has carried
// waterMl and waterTargetMl all along — but the only thing reading them was
// the accountability check-in, and neither ever reached the context the model
// sees. With no field for water, the model had nothing to answer from and
// filled the silence with a confident zero.
//
// THAT IS THE PART THAT MATTERS. Before steps got their summary the coach said
// "I can't check your water or step logs from here" — wrong, but honest, and a
// user knows what to do with it. Denying a log that exists is worse: it is the
// app telling someone their own logging did not happen.
//
// Same shape as buildCoachStepsSummary: one plain line, built from the numbers
// the rings already draw, never a second copy of the rule.
// ---------------------------------------------------------------------------

/**
 * One line for the coach's context, or null when we genuinely do not know yet.
 *
 * NULL IS NOT ZERO, and the distinction is the whole point of the return type.
 * proactiveData resolves asynchronously; quoting "0ml" while it is still
 * loading would reproduce the exact bug this closes, just with a shorter
 * window. Null makes the prompt fall through to "no water figure available",
 * which the model is told to treat as "say you cannot see it".
 *
 * Zero WITH data loaded is a real answer, though — water_logs is additive, so
 * no rows for today honestly means none drunk yet, unlike daily_steps where a
 * missing row and a logged 0 are different facts.
 */
export function buildCoachWaterSummary(
  waterMl: number | null | undefined,
  targetMl: number | null | undefined,
): string | null {
  if (waterMl == null) return null
  const target = targetMl && targetMl > 0 ? targetMl : null
  if (waterMl <= 0) {
    return target
      ? `Water today: none logged yet (their target is ${target.toLocaleString()}ml).`
      : 'Water today: none logged yet.'
  }
  return target
    ? `Water today: ${waterMl.toLocaleString()}ml of ${target.toLocaleString()}ml.`
    : `Water today: ${waterMl.toLocaleString()}ml.`
}
