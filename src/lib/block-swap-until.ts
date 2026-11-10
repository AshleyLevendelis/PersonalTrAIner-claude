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

/**
 * THE WEEKS A "WHOLE BLOCK" SWAP WRITES (QA walk, 10 Nov 2026). From this week to the end of the block, but only while
 * the slot still holds the lift being swapped away: accessories rotate inside a block (a hypertrophy plan changes its
 * accessory variation at week 3), and the swap had been writing over the plan's own week-3 pick, a lift she never
 * swapped, at half its price. Contiguous: once the slot holds something else, the swap has ended. A slot is the same
 * lift by name, or by the name she first swapped away from (a swap of a swap keeps its lineage).
 */
export function blockSwapWeeks(mesocycle: MesocycleWeek[], weekNumber: number, dayName: string, exIndex: number): number[] {
  const here = mesocycle.find(w => w.week_number === weekNumber)
  const outgoing = here?.days.find(d => d.day === dayName)?.exercises[exIndex]
  if (!here || !outgoing) return []
  const lineage = (e: { name: string; swapped_for?: string | null }) => (e.swapped_for ?? e.name).toLowerCase()
  const weeks: number[] = []
  const inBlock = mesocycle
    .filter(w => w.block_number === here.block_number && w.week_number >= weekNumber)
    .sort((a, b) => a.week_number - b.week_number)
  for (const w of inBlock) {
    const slot = w.days.find(d => d.day === dayName)?.exercises[exIndex]
    if (!slot) break
    if (slot.name.toLowerCase() !== outgoing.name.toLowerCase() && lineage(slot) !== lineage(outgoing)) break
    weeks.push(w.week_number)
  }
  return weeks
}

/**
 * When a whole-block swap ends, and why: the day after the last week it writes. 'rotation' when the plan itself
 * changes this exercise before the block ends (the swap stops there, and the line says so); 'block' at the next block.
 * Null when it lasts as long as the plan does.
 */
export function blockSwapEnd(
  mesocycle: MesocycleWeek[], weekNumber: number, planCreatedAt: string | null | undefined, dayName: string, exIndex: number,
): { date: string; why: 'block' | 'rotation' } | null {
  const weeks = blockSwapWeeks(mesocycle, weekNumber, dayName, exIndex)
  const blockEnd = blockSwapEndsOn(mesocycle, weekNumber, planCreatedAt)
  if (weeks.length === 0 || !planCreatedAt) return blockEnd ? { date: blockEnd, why: 'block' } : null
  const here = mesocycle.find(w => w.week_number === weekNumber)
  const after = weeks[weeks.length - 1] + 1
  const stopsEarly = mesocycle.some(w => w.week_number === after && w.block_number === here?.block_number)
  if (!stopsEarly) return blockEnd ? { date: blockEnd, why: 'block' } : null
  const start = new Date(planCreatedAt)
  if (Number.isNaN(start.getTime())) return null
  return { date: addDays(getLocalDateString(start), (after - 1) * 7), why: 'rotation' }
}

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
