// ---------------------------------------------------------------------------
// THE ACCELERATOR. Every other backward-reading path in this app is a brake.
//
// VISION.md: "The app currently prescribes forward. It should also read
// backward... Progression that ignores what the user did isn't progression."
// Two thirds of that shipped: block-review.ts holds a stalled lift's weight
// flat (Step 4), block-consistency.ts holds volume when attendance drops
// (Step 5). Both can only ever slow someone down.
//
// Nothing could speed them up. Beat the prescription for four weeks and the
// next block still started from the formula's original guess — the session
// screen's "go up next time" note (progression-engine.ts) is DISPLAY ONLY and
// was never written back. This is that missing half.
//
// IT PROPOSES; IT NEVER APPLIES. Ashley's ruling, asked directly, 1 Sep 2026,
// and the asymmetry with block-review is principled rather than accidental:
//
//   - block-review APPLIES its hold directly, because a decline there would
//     mean adding weight to someone who is genuinely stalled — the worse
//     outcome. (Her own correction, recorded in that file.)
//   - this OFFERS, because a decline here means the app simply doesn't add
//     weight to someone who earned it — the safe outcome. And an automatic
//     version would silently reward chasing rep counts, which the original
//     design doc parked for exactly that reason: it "risks encouraging
//     chasing reps past good form".
//
// The brake may act alone. The accelerator asks first.
//
// NO NEW TABLE. The offer lives on the pending_actions rail, whose partial
// unique index on (profile_id, scope_key) for open rows gives "offered once
// per block per lift" for free — a second check on the same day collides and
// returns the existing row rather than raising a duplicate card. Decline is a
// row status, so it is remembered without a schema change.
// ---------------------------------------------------------------------------

import type { MesocycleWeek, UserProfile, Exercise } from './types'
import type { ExerciseHistorySession } from './exercise-history'
import { getActiveMesocycleWeek } from './calculations'
import {
  MIN_SESSIONS_TO_JUDGE,
  didExerciseStallInBlock,
  lastLoggedWeight,
  getBlockDateRange,
} from './block-review'
import { getExerciseHistory } from './exercise-history'
import { getExerciseId, getExerciseEntry } from './exercise-db'
import { isMainLiftSlot } from './mesocycle-edit'
import { prescribeLoad } from './load-prescription'
import { saveMesocycleWeek } from './mesocycle-persistence'
import {
  createPendingAction,
  claimPendingAction,
  resolvePendingAction,
  declinePendingAction,
} from './pending-actions-store'

/** What the offer would change, and everything confirm needs to apply it without re-reading history. */
export interface BeatTargetPayload {
  blockNumber: number
  dayName: string
  exIndex: number
  exerciseName: string
  plannedKg: number
  liftedKg: number
}

export interface BeatTargetOffer {
  id: string
  text: string
  payload: BeatTargetPayload
}

/**
 * Did this lift genuinely outgrow its prescription during the block?
 *
 * DELIBERATELY THE INVERSE OF THE STALL CHECK, not a second definition of
 * progress. `didExerciseStallInBlock` already encodes what this app means by
 * "improved", and reusing it inverted is what stops the brake and the
 * accelerator drifting apart into two opinions about the same four weeks.
 *
 * The length test is NOT redundant with it. `didExerciseStallInBlock` returns
 * FALSE when there are fewer than three sessions — meaning "not enough data
 * to say", not "went well" — so a bare `!stalled` would read two lucky
 * sessions as evidence. Same three-session bar as the stall check, for the
 * same reason Ashley gave: with one comparison, an off day and a real trend
 * look identical.
 */
export function beatTargetInBlock(
  sessionsInBlock: ExerciseHistorySession[],
  plannedKg: number,
): boolean {
  if (sessionsInBlock.length < MIN_SESSIONS_TO_JUDGE) return false
  if (didExerciseStallInBlock(sessionsInBlock)) return false
  // The person is working above what the next block is about to ask for.
  // Strictly above: equal is the plan being correct, not behind.
  return lastLoggedWeight(sessionsInBlock) > plannedKg
}

/**
 * States both numbers and takes no view on the person.
 *
 * No praise: "great work, you smashed it" is precisely the encouragement the
 * automatic version was rejected for, since the app cannot see whether the
 * last two reps were clean. It reports what was lifted and what was planned,
 * and asks.
 */
export function offerText(exerciseName: string, plannedKg: number, liftedKg: number): string {
  return `You've been working ${exerciseName} at ${liftedKg}kg, and the next block is planned from ${plannedKg}kg. `
    + `Want me to start it from what you're actually lifting?`
}

/**
 * The weight the plan currently holds for this exact slot, or null if the slot
 * is no longer what the offer was raised against. Used as the confirm-time
 * precondition: a rebuild, a swap or an injury adaptation between the offer
 * and the tap changes the very number this was comparing to, and applying a
 * stale catch-up would write a weight nobody agreed to.
 */
function plannedKgForSlot(
  mesocycle: MesocycleWeek[],
  blockNumber: number,
  dayName: string,
  exIndex: number,
  exerciseName: string,
): number | null {
  const week = mesocycle.find(w => w.block_number === blockNumber && w.week_in_block === 1)
  const ex = week?.days.find(d => d.day === dayName)?.exercises[exIndex]
  if (!ex || ex.name !== exerciseName) return null
  return ex.suggested_load_kg ?? null
}

/** Stable per block and per lift, so the rail's unique index enforces "offered once". */
function scopeKeyFor(p: BeatTargetPayload): string {
  return `load_catchup:b${p.blockNumber}:${p.exerciseName.toLowerCase()}`
}

export interface CheckBeatTargetParams {
  profileId: string
  mesocycle: MesocycleWeek[]
  planCreatedAt: string
  now: Date
}

/**
 * Check-on-load, at a block boundary — the same shape and the same reason as
 * block-review.ts and block-consistency.ts: there is no scheduled-job infra
 * in this codebase, so periodic checks run the next time the app opens.
 *
 * Returns at most ONE offer. A block boundary can easily produce three or
 * four eligible lifts, and four confirm cards at once is a wall, not a
 * conversation — the strongest single case is offered and the rest are left
 * for the formula, which is the conservative direction. The one chosen is the
 * biggest gap between planned and lifted.
 */
export async function checkForBeatTargetOffer(
  { profileId, mesocycle, planCreatedAt, now }: CheckBeatTargetParams,
): Promise<BeatTargetOffer | null> {
  if (mesocycle.length === 0) return null

  const liveWeek = getActiveMesocycleWeek(planCreatedAt, now, mesocycle.length)
  const currentWeek = mesocycle.find(w => w.week_number === liveWeek)
  // Only at the start of a block after the first: before that there is no
  // finished block to read.
  if (!currentWeek || currentWeek.block_number == null || currentWeek.block_number <= 1 || currentWeek.week_in_block !== 1) {
    return null
  }

  const { start, end } = getBlockDateRange(planCreatedAt, currentWeek.block_number - 1)
  const candidates: BeatTargetPayload[] = []

  for (const day of currentWeek.days) {
    for (let exIndex = 0; exIndex < day.exercises.length; exIndex++) {
      const ex = day.exercises[exIndex]
      if (!isMainLiftSlot(ex)) continue
      // A lift block-review already held is one that stalled. It cannot also
      // have beaten its target, and re-reading it here would be asking the
      // same four weeks the same question twice.
      if (ex.block_hold_note) continue
      const plannedKg = ex.suggested_load_kg
      // Nothing to raise on a bodyweight movement — its progress lives in the
      // rep count, which this load-shaped mechanism cannot express.
      if (plannedKg == null || plannedKg <= 0) continue

      const sessionsInBlock = (await getExerciseHistory(profileId, ex.id ?? getExerciseId(ex.name)))
        .filter(s => s.date >= start && s.date < end)
      if (!beatTargetInBlock(sessionsInBlock, plannedKg)) continue

      candidates.push({
        blockNumber: currentWeek.block_number,
        dayName: day.day,
        exIndex,
        exerciseName: ex.name,
        plannedKg,
        liftedKg: lastLoggedWeight(sessionsInBlock),
      })
    }
  }

  if (candidates.length === 0) return null
  const best = candidates.sort((a, b) => (b.liftedKg - b.plannedKg) - (a.liftedKg - a.plannedKg))[0]

  const row = await createPendingAction({
    profileId,
    actionClass: 'plan_mutation',
    kind: 'propose_load_catchup',
    scopeKey: scopeKeyFor(best),
    preconditions: {
      blockNumber: best.blockNumber,
      dayName: best.dayName,
      exIndex: best.exIndex,
      exerciseName: best.exerciseName,
      plannedKg: best.plannedKg,
    },
    payload: best as unknown as Record<string, unknown>,
    diff: {
      rows: [{ field: best.exerciseName, before: `${best.plannedKg}kg`, after: `${best.liftedKg}kg` }],
      rationale: `Block ${best.blockNumber} starts from what you actually lifted last block.`,
      reversible: true,
    },
  })

  return { id: row.id, text: offerText(best.exerciseName, best.plannedKg, best.liftedKg), payload: best }
}

export interface ConfirmBeatTargetParams {
  offerId: string
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  profileId: string
}

/**
 * Applies the catch-up across every week of the block, and returns the
 * patched mesocycle for the caller to merge into state.
 *
 * THE LOAD IS REBUILT, NEVER PATCHED FIELD BY FIELD. `prescribeLoad` with
 * `forceStartingWeightKg` is the same door block-review.ts and
 * mesocycle-edit.ts's recomputeLoad already use, and it returns the number,
 * the display string and the per-set breakdown from one calculation — so the
 * three cannot disagree. Setting `suggested_load_kg` by hand is exactly the
 * bug that had this app telling the coach 7.5kg for a lift it had prescribed
 * at 8kg (fixed 1 Sep 2026); the fix was to stop having a second way to write
 * a weight, and this does not add one back.
 */
export async function confirmBeatTargetOffer(
  { offerId, mesocycle, profile, profileId }: ConfirmBeatTargetParams,
): Promise<MesocycleWeek[] | null> {
  // THE PRECONDITION IS THE PLAN NOT HAVING MOVED. Between the offer being
  // raised and the tap, a rebuild, a swap or an injury adaptation can change
  // the very weight this was comparing against — applying a stale catch-up
  // then would write a number nobody agreed to. The rail checks this before
  // it claims, so a moved plan comes back 'stale' rather than being applied.
  const claim = await claimPendingAction(offerId, async pre => plannedKgForSlot(
    mesocycle,
    pre.blockNumber as number,
    pre.dayName as string,
    pre.exIndex as number,
    pre.exerciseName as string,
  ) === (pre.plannedKg as number))
  if (claim.outcome !== 'claimed') return null
  const payload = claim.row.payload as unknown as BeatTargetPayload

  const entry = getExerciseEntry(payload.exerciseName)
  if (!entry) return null

  let patched = false
  const next = mesocycle.map(week => {
    if (week.block_number !== payload.blockNumber) return week
    const day = week.days.find(d => d.day === payload.dayName)
    const target = day?.exercises[payload.exIndex]
    if (!day || !target || target.name !== payload.exerciseName) return week
    // NEVER DOWNWARD. The offer is only ever raised on a weight the person has
    // already lifted, but a later week of the block can legitimately sit above
    // it (the phase steps up within a block) and pulling those down would be
    // this accelerator quietly acting as a brake — the one thing it must not
    // do, since holding back is block-review's job and its evidence bar.
    if (target.suggested_load_kg != null && target.suggested_load_kg >= payload.liftedKg) return week

    const load = prescribeLoad(entry, profile, {
      targetRpeLabel: target.intensity || '',
      isFirstBlock: false,
      sets: target.sets,
      repRangeLabel: target.reps,
      forceStartingWeightKg: payload.liftedKg,
    })
    const patchedEx: Exercise = {
      ...target,
      suggested_load: load.display,
      suggested_load_kg: load.starting_weight_kg,
      per_set_load: load.per_set,
      load_guidance: load.basis,
    }
    patched = true
    return {
      ...week,
      days: week.days.map(d => (d.day === payload.dayName
        ? { ...d, exercises: d.exercises.map((e, i) => (i === payload.exIndex ? patchedEx : e)) }
        : d)),
    }
  })

  if (!patched) {
    // The plan moved under the offer — a rebuild, a swap, a rotation. Resolve
    // it rather than leaving a card that can never apply, and change nothing.
    await resolvePendingAction(offerId, 'failed', {
      landed: [],
      failed: [{ op: 'load_catchup', error: 'The plan changed before this was confirmed.' }],
    })
    return null
  }

  await Promise.all(
    next.filter(w => w.block_number === payload.blockNumber).map(w => saveMesocycleWeek(profileId, w)),
  )
  await resolvePendingAction(offerId, 'done', {
    landed: [`${payload.exerciseName} starts block ${payload.blockNumber} at ${payload.liftedKg}kg.`],
    failed: [],
  })
  return next
}

export async function declineBeatTargetOffer(offerId: string): Promise<void> {
  await declinePendingAction(offerId)
}
