// ---------------------------------------------------------------------------
// WHEN A "REST OF BLOCK" SWAP ENDS (runs 3-4, M40b). The tester swapped an
// exercise "for the rest of the block" and read it as for good; at the next
// block the plan changed exercises, as it does on purpose, and the old one
// came back. Ashley, 10 Oct 2026, from three options: "Keep to the block, say
// it" — the same behaviour, the end date said on the swap, and "never give me
// this one" beside it for good. Rejected: carrying the swap into later blocks,
// and a third "from now on" choice.
//
// The first day of the next block, counted the way the live week is (days
// since the plan began, seven to a week: calculations.ts). Null when this is
// the plan's last block: then the swap lasts as long as the plan does.
// ---------------------------------------------------------------------------
import { addDays } from './session-move'
import { getLocalDateString } from './dev-clock'
import type { MesocycleWeek } from './types'

export function blockSwapEndsOn(mesocycle: MesocycleWeek[], weekNumber: number, planCreatedAt: string | null | undefined): string | null {
  if (!planCreatedAt) return null
  const here = mesocycle.find(w => w.week_number === weekNumber)
  if (!here) return null
  // A week with no block marked has no later block to find: null, from the
  // filter itself (a second guard here was measured redundant: removing it
  // changed no answer).
  const block = here.block_number ?? Infinity
  const next = mesocycle
    .filter(w => w.block_number != null && w.block_number > block && w.week_number > weekNumber)
    .sort((a, b) => a.week_number - b.week_number)[0]
  if (!next) return null
  const start = new Date(planCreatedAt)
  if (Number.isNaN(start.getTime())) return null
  return addDays(getLocalDateString(start), (next.week_number - 1) * 7)
}
