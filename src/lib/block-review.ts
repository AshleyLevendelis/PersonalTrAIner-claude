// ---------------------------------------------------------------------------
// VISION.md Step 4: "The app currently prescribes forward. It should also
// read backward." This is the first, deliberately small piece of that — a
// once-per-block check that looks at what a trainee actually logged for
// each main lift during the block that just ended, and if one genuinely
// didn't move (not one bad session, no real progress across the whole
// block), holds that exercise's starting weight flat into the next block
// instead of letting the formula step it up on an assumption. See
// docs/PLAN-learn-from-what-happened.md for the full design and the
// corrections that shaped it.
//
// "Real progress" is deliberately NOT the same signal as
// progression-engine.ts's single-session didProgress flag — that flag means
// "hasn't yet earned a heavier weight this session," which is true even when
// someone is making genuine rep-count progress within their range. This
// module instead compares actual (weight, reps) pairs between consecutive
// REAL logged sessions directly, crediting either more weight or the same
// weight with more reps as progress.
// ---------------------------------------------------------------------------

import type { MesocycleWeek, Exercise, UserProfile } from './types'
import { getActiveMesocycleWeek } from './calculations'
import { getExerciseHistory, type ExerciseHistorySession } from './exercise-history'
import { getExerciseId, getExerciseEntry } from './exercise-db'
import { isMainLiftSlot } from './mesocycle-edit'
import { prescribeLoad } from './load-prescription'
import { saveMesocycleWeek } from './mesocycle-persistence'

/**
 * At least three real logged sessions (two comparisons) before a stall can
 * be flagged — with only two sessions (one comparison), a single off day
 * would look identical to a real stall, exactly the case this exists to
 * exclude. This is Ashley's own correction on the approved plan.
 */
const MIN_SESSIONS_TO_JUDGE = 3

interface BlockProgressPoint {
  date: string
  topSetWeightKg: number
  repsAtTopSet: number
}

/**
 * Reps achieved at the session's heaviest weight. Built from sets matching
 * topSetWeightKg rather than requiring topSetWeightKg itself to be nonzero —
 * groupSetsBySession skips bodyweight sets when computing topSetWeightKg, so
 * for an all-bodyweight session every set matches (all at 0kg) and this
 * still captures real rep progress on bodyweight main lifts.
 */
function toProgressPoint(session: ExerciseHistorySession): BlockProgressPoint {
  const repsAtWeight = session.sets.filter(s => s.weightKg === session.topSetWeightKg).map(s => s.repsCompleted)
  return {
    date: session.date,
    topSetWeightKg: session.topSetWeightKg,
    repsAtTopSet: repsAtWeight.length > 0 ? Math.max(...repsAtWeight) : 0,
  }
}

/** More weight, or the same weight with more reps — double progression's own definition of real progress. */
function improved(prev: BlockProgressPoint, next: BlockProgressPoint): boolean {
  if (next.topSetWeightKg > prev.topSetWeightKg) return true
  return next.topSetWeightKg === prev.topSetWeightKg && next.repsAtTopSet > prev.repsAtTopSet
}

/**
 * True only when there's enough real data (>= MIN_SESSIONS_TO_JUDGE logged
 * sessions) AND most of the consecutive-session comparisons show no
 * improvement. A skipped week simply isn't a session — it contributes no
 * comparison and never counts toward a stall, satisfying Ashley's "a missed
 * week is not a stalled week" correction without any separate missed-session
 * bookkeeping.
 */
export function didExerciseStallInBlock(sessionsInBlock: ExerciseHistorySession[]): boolean {
  if (sessionsInBlock.length < MIN_SESSIONS_TO_JUDGE) return false

  const points = [...sessionsInBlock].sort((a, b) => a.date.localeCompare(b.date)).map(toProgressPoint)
  const comparisons = points.slice(1).map((point, i) => improved(points[i], point))
  const notImprovedCount = comparisons.filter(c => !c).length

  return notImprovedCount > comparisons.length / 2
}

/** The weight actually lifted last, within the block — the hold target, not a block-wide max. */
function lastLoggedWeight(sessionsInBlock: ExerciseHistorySession[]): number {
  const mostRecent = [...sessionsInBlock].sort((a, b) => b.date.localeCompare(a.date))[0]
  return mostRecent.topSetWeightKg
}

/**
 * Calendar date range (UTC, matching exercise-history's session.date
 * derivation from completed_at.slice(0, 10)) covered by block N — weeks
 * (N-1)*4+1 through N*4, using the same elapsed-days-since-plan-creation
 * arithmetic as getActiveMesocycleWeek. `end` is exclusive (the first day of
 * the following block).
 */
export function getBlockDateRange(planCreatedAt: string, blockNumber: number): { start: string; end: string } {
  const startWeek = (blockNumber - 1) * 4 + 1
  const endWeek = blockNumber * 4
  const base = new Date(planCreatedAt).getTime()
  const toDateStr = (days: number) => new Date(base + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return {
    start: toDateStr((startWeek - 1) * 7),
    end: toDateStr(endWeek * 7),
  }
}

export interface BlockReviewResult {
  mesocycle?: MesocycleWeek[]
  messages: string[]
}

/**
 * Check-on-load sweep (no scheduled-job infra exists in this codebase — same
 * convention as checkAndRevertExpiredAdaptations) — call once per mesocycle
 * load, alongside that check. Runs only the moment the live week is week 1
 * of a block after the first, and is naturally idempotent even if called
 * again mid-block: `block_hold_note` already set on a slot is the sole
 * dedup guard, so a second call the same week (or the same day) does
 * nothing further — no separate "already reviewed this block" table needed.
 *
 * Looks up history under each main-lift slot's CURRENT (upcoming-block)
 * exercise name/id, never a fixed "previous block's nominal lift" — this is
 * what makes the check rotation-safe: an exercise that got rotated away
 * between blocks naturally has too little history under its new name and is
 * skipped, with no explicit rotation-tracking needed.
 *
 * Applies the hold directly (never a confirm/decline proposal — Ashley's
 * correction: a decline would mean the app adds weight to someone who's
 * genuinely stalled, the worse outcome) via the same prescribeLoad
 * mechanism mesocycle-edit.ts's recomputeLoad uses for a swapped-in
 * exercise's fresh load, just forced to the trainee's own last logged
 * weight instead of a live progression estimate.
 */
export async function checkForBlockReview(
  profileId: string,
  mesocycle: MesocycleWeek[],
  profile: UserProfile,
  planCreatedAt: string,
  now: Date,
): Promise<BlockReviewResult> {
  if (mesocycle.length === 0) return { messages: [] }

  const totalWeeks = mesocycle.length
  const liveWeek = getActiveMesocycleWeek(planCreatedAt, now, totalWeeks)
  const currentWeek = mesocycle.find(w => w.week_number === liveWeek)
  if (!currentWeek || currentWeek.block_number == null || currentWeek.block_number <= 1 || currentWeek.week_in_block !== 1) {
    return { messages: [] }
  }

  const { start, end } = getBlockDateRange(planCreatedAt, currentWeek.block_number - 1)

  let workingMesocycle = mesocycle
  const messages: string[] = []
  let anyPatch = false

  for (const day of currentWeek.days) {
    for (let exIndex = 0; exIndex < day.exercises.length; exIndex++) {
      const ex = day.exercises[exIndex]
      if (!isMainLiftSlot(ex)) continue
      if (ex.block_hold_note) continue // already reviewed for this block

      const exerciseId = ex.id ?? getExerciseId(ex.name)
      const allSessions = await getExerciseHistory(profileId, exerciseId)
      const sessionsInBlock = allSessions.filter(s => s.date >= start && s.date < end)
      if (!didExerciseStallInBlock(sessionsInBlock)) continue

      const heldWeightKg = lastLoggedWeight(sessionsInBlock)
      // A bodyweight-only exercise has nothing to "hold" as a load number —
      // its stall (real, if flagged above) is visible in the rep count
      // itself, not something this load-holding mechanism can express.
      if (heldWeightKg <= 0) continue

      const entry = getExerciseEntry(ex.name)
      if (!entry) continue

      const load = prescribeLoad(entry, profile, {
        targetRpeLabel: ex.intensity || '',
        isFirstBlock: false,
        sets: ex.sets,
        repRangeLabel: ex.reps,
        forceStartingWeightKg: heldWeightKg,
      })

      const note = `Held steady at ${heldWeightKg}kg — no real progress last block. You can log heavier if it feels right; this is a starting point, not a limit.`
      const dayName = day.day
      const exerciseName = ex.name

      workingMesocycle = workingMesocycle.map(week => {
        if (week.block_number !== currentWeek.block_number) return week
        const targetDay = week.days.find(d => d.day === dayName)
        const targetEx = targetDay?.exercises[exIndex]
        if (!targetDay || !targetEx || targetEx.name !== exerciseName) return week
        const patchedEx: Exercise = {
          ...targetEx,
          suggested_load: load.display,
          suggested_load_kg: load.starting_weight_kg,
          per_set_load: load.per_set,
          load_guidance: load.basis,
          block_hold_note: note,
        }
        const days = week.days.map(d => (d.day === dayName ? { ...d, exercises: d.exercises.map((e, i) => (i === exIndex ? patchedEx : e)) } : d))
        return { ...week, days }
      })

      anyPatch = true
      messages.push(`Coach note on ${exerciseName}: ${note}`)
    }
  }

  if (!anyPatch) return { messages: [] }

  // Persists here (like plan-adaptations-store.ts's own revertAdaptation),
  // not left to the App.tsx caller — this keeps the App.tsx wiring a plain
  // call-then-merge-into-state shape identical to the adaptation-expiry
  // sweep it runs alongside.
  const touchedWeeks = workingMesocycle.filter(w => w.block_number === currentWeek.block_number)
  await Promise.all(touchedWeeks.map(w => saveMesocycleWeek(profileId, w)))

  return { mesocycle: workingMesocycle, messages }
}
