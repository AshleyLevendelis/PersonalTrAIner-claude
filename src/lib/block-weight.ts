// ---------------------------------------------------------------------------
// ONE WEIGHT WRITTEN ACROSS A BLOCK, EACH WEEK PRICED AS ITSELF (18 Nov 2026;
// docs/plans/weights-leftovers-2026-11-18.md).
//
// The block review (a stalled main lift held at its last weight) and a confirmed "start heavier" suggestion each
// priced ONE load off the block's first week and copied it into every week of the block. Two faults came with that:
// the deload week was written as heavy as the loading weeks (the card then showed the full weight under "Deload week:
// lighter on purpose"), and weeks 2-4 carried week 1's set ladder under their own reps. Both writers now call this.
//
// Pure: returns the patched plan. Saving is the caller's, so a gate can run it with no database.
// ---------------------------------------------------------------------------

import type { Exercise, MesocycleWeek, UserProfile } from './types'
import { getExerciseEntry } from './exercise-db'
import { prescribeLoad, DELOAD_LOAD_FRACTION } from './load-prescription'

export interface BlockWeightTarget {
  blockNumber: number
  dayName: string
  exIndex: number
  /** A name guard against index drift from an unrelated swap in between. */
  exerciseName: string
  /** The weight for the block's loading weeks. The deload takes DELOAD_LOAD_FRACTION of it. */
  weightKg: number
  /** Kept on the loading weeks' rows (the block review's "held steady" sentence). Never on the deload. */
  holdNote?: string
}

export function writeBlockWeight(mesocycle: MesocycleWeek[], profile: UserProfile, t: BlockWeightTarget): MesocycleWeek[] {
  const entry = getExerciseEntry(t.exerciseName)
  if (!entry || !(t.weightKg > 0)) return mesocycle
  return mesocycle.map(week => {
    if (week.block_number !== t.blockNumber) return week
    const targetDay = week.days.find(d => d.day === t.dayName)
    const targetEx = targetDay?.exercises[t.exIndex]
    if (!targetDay || !targetEx || targetEx.name !== t.exerciseName) return week
    const load = prescribeLoad(entry, profile, {
      targetRpeLabel: targetEx.intensity || '',
      isFirstBlock: false,
      sets: targetEx.sets,
      repRangeLabel: targetEx.reps,
      forceStartingWeightKg: week.is_deload ? t.weightKg * DELOAD_LOAD_FRACTION : t.weightKg,
    })
    const patchedEx: Exercise = {
      ...targetEx,
      suggested_load: load.display,
      suggested_load_kg: load.starting_weight_kg,
      per_set_load: load.per_set,
      load_guidance: load.basis,
      ...(t.holdNote && !week.is_deload ? { block_hold_note: t.holdNote } : {}),
    }
    return { ...week, days: week.days.map(d => (d.day === t.dayName ? { ...d, exercises: d.exercises.map((e, i) => (i === t.exIndex ? patchedEx : e)) } : d)) }
  })
}
