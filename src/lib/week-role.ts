// ---------------------------------------------------------------------------
// WHAT THIS WEEK IS FOR, IN ONE WORD.
//
// Ashley, on the Full Program screen: "each block still shows the same phase.
// 4 weeks all show hypertrophy rather than going through each phase." Then:
// "Why are 4 weeks anatomical adaptation, followed by four weeks of
// hypertrophy. Shouldn't it change week by week through the phases."
//
// The programming was right and the screen was wrong. A phase is a stimulus
// the body needs weeks of repeated exposure to before it adapts, so a phase
// per week would mean never staying anywhere long enough to get one —
// VISION.md commits to "four-week blocks with distinct phases" for that
// reason. But the four weeks inside a block genuinely differ (measured on her
// own plan: 72.5 -> 77.5 -> 82.5kg, then a deload to 57.5, with sets going
// 11 -> 11 -> 11 -> 8) and the largest text on the page repeated one word
// four times, so it read as static.
//
// This names the difference. It is a PURE FUNCTION, in its own file, for the
// same reason week-note.ts and week-delta.ts are: so the naming can be tested
// against real generated plans rather than eyeballed on a screenshot.
//
// IT INVENTS NO VOCABULARY. Every label here is the word buildProgressionNote
// (exercise-plan.ts) already writes into the paragraph below the strip —
// "Baseline week — this sets the working weight...", "Load goes up this
// week...", "the heaviest working sets of the block before the deload", and
// the calibration week's "Loads start deliberately light...". The strip is a
// heading for a sentence the screen was already showing.
// ---------------------------------------------------------------------------

import type { MesocycleWeek } from './types'

export type WeekRoleKey = 'calibration' | 'baseline' | 'building' | 'peak' | 'deload'

export interface WeekRole {
  key: WeekRoleKey
  label: string
}

/**
 * Which week of its block this is.
 *
 * `week_in_block` is stamped by the generator and persisted, so it is the
 * answer whenever it is there. The fallback derives it from the week number,
 * which is only correct because EVERY BLOCK IS EXACTLY FOUR WEEKS — the
 * generator's own `for (let w = 1; w <= 4; w++)`. If blocks ever become
 * variable-length, this line is wrong and the gate's sweep over real plans is
 * what will say so.
 */
function positionInBlock(week: Pick<MesocycleWeek, 'week_in_block' | 'week_number'>): number {
  if (week.week_in_block != null) return week.week_in_block
  return ((week.week_number - 1) % 4) + 1
}

/**
 * The one-word name for a week's job inside its block.
 *
 * ORDER MATTERS, and deload is tested first deliberately. Today a deload and
 * a calibration week cannot collide — the generator sets `isDeload = w === 4`
 * and `isCalibrationWeek` only ever on week 1 of the whole plan — but relying
 * on that is a live condition that could quietly stop being true. Asking
 * "is this the easy week?" before anything else costs nothing and cannot
 * mislabel a recovery week as a working one, which is the direction that
 * matters: telling someone to push on a week designed for them to back off.
 */
export function weekRole(
  week: Pick<MesocycleWeek, 'week_number' | 'week_in_block' | 'is_deload' | 'isCalibrationWeek'>,
): WeekRole {
  if (week.is_deload) return { key: 'deload', label: 'Deload' }
  if (week.isCalibrationWeek) return { key: 'calibration', label: 'Calibration' }
  switch (positionInBlock(week)) {
    case 1: return { key: 'baseline', label: 'Baseline' }
    case 2: return { key: 'building', label: 'Building' }
    // Week 3 is the block's heaviest working sets. Anything past 3 that is not
    // flagged as a deload should not exist, and reading as "Peak" is the safe
    // way to be wrong: it never tells someone a hard week is an easy one.
    default: return { key: 'peak', label: 'Peak' }
  }
}
