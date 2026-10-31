// ---------------------------------------------------------------------------
// THE TOOLS TAB'S OWN DECISIONS, design handoff 2a (31 Oct 2026, her "build,
// keep my rulings"). Pure, so test:tools-2a can CALL them rather than read the
// component's text: which lift the plate card starts on, how the stepper moves,
// what goes on each side of the bar, the header's week line, the program bar,
// and how the last round is named.
//
// Nothing here is new arithmetic. The plates are plate-math's greedy pass, the
// round's name and length are the timer engine's and the round sheet's own,
// and the week and block come off the mesocycle.
// ---------------------------------------------------------------------------
import { greedyPlatesPerSide } from '@/lib/plate-math'
import { loadingMode } from '@/lib/load-prescription'
import { getExerciseEntry } from '@/lib/exercise-db'
import { protocolNameOf, describeRoundPreset, type RoundConfig } from '@/lib/timer-engine'
import { clock, workingSeconds } from '@/lib/round-setup'
import type { MesocycleWeek, WorkoutDay } from '@/lib/types'

/** The card's stepper: 2.5 kg a tap, from an empty bar to 300 kg (the handoff's range). */
export const PLATE_CARD_STEP_KG = 2.5
export const PLATE_CARD_MIN_KG = 20
export const PLATE_CARD_MAX_KG = 300
/** The card assumes the standard bar and says so ("20 kg bar"); the full calculator lets her change it. */
export const PLATE_CARD_BAR_KG = 20
/**
 * When the plan has no barbell lift ahead, the card still works, starting at a
 * 20 kg bar with a pair of 10s — an ordinary first loading, and no lift is
 * named, because none was prescribed.
 */
export const PLATE_CARD_DEFAULT_KG = 40

/** Held inside the stepper's range. A prescribed load outside it is shown at the nearest end, never invented past it. */
export function clampPlateKg(kg: number): number {
  if (!Number.isFinite(kg)) return PLATE_CARD_DEFAULT_KG
  return Math.min(PLATE_CARD_MAX_KG, Math.max(PLATE_CARD_MIN_KG, kg))
}

/** One tap of − or +. Rounded to the gram so 2.5 steps never drift into 72.49999. */
export function stepPlateKg(kg: number, dir: 1 | -1): number {
  return clampPlateKg(Math.round((kg + dir * PLATE_CARD_STEP_KG) * 1000) / 1000)
}

/** What hangs on EACH side of the 20 kg bar, heaviest first. [] is "Bar only". */
export function eachSidePlates(kg: number): number[] {
  return greedyPlatesPerSide(kg, PLATE_CARD_BAR_KG)
}

/**
 * How a plate chip looks: competition (IWF) colours, taller for heavier.
 * INK IS DARK ON EVERY PLATE, a departure from the mock's white on red and
 * blue: white measures 3.9:1 on both, under the 4.5:1 a 12px label needs; the
 * dark ink is 4.65:1 or better on all seven. Real-world colours, so literal
 * values rather than theme tokens — a red 25 is red in every theme.
 */
export const PLATE_LOOK: Record<number, { bg: string; h: number }> = {
  25: { bg: '#E5484D', h: 40 },
  20: { bg: '#3E7BFA', h: 38 },
  15: { bg: '#F5C542', h: 36 },
  10: { bg: '#3DBE6E', h: 34 },
  5: { bg: '#F5F3FF', h: 30 },
  2.5: { bg: '#E5484D', h: 26 },
  1.25: { bg: '#C9CBD3', h: 24 },
}
export const PLATE_INK = '#15122B'

const NOT_A_STRAIGHT_BAR = new Set(['trap bar', 't-bar', 'landmine', 'smith machine'])

type DayLike ={ date: string; state: string; movedTo?: unknown; session?: WorkoutDay | null }

/** A lift the card can honestly describe: a straight barbell (the 20 kg bar it assumes), loaded, not movement prep. */
function barbellLiftOf(day: WorkoutDay | null | undefined): { name: string; kg: number } | null {
  for (const ex of day?.exercises ?? []) {
    if (ex.tier === 'tier_0_primer') continue
    const kg = ex.suggested_load_kg
    if (kg == null || !(kg >= PLATE_CARD_BAR_KG)) continue
    const entry = getExerciseEntry(ex.name)
    // A trap bar, a T-bar / landmine or a Smith machine is "barbell" to the load
    // engine, but none is the 20 kg bar loaded at both ends that this card
    // subtracts, so its plates would be wrong.
    if (!entry || loadingMode(entry) !== 'barbell' || !entry.equipment.includes('barbell')) continue
    if (entry.equipment.some(e => NOT_A_STRAIGHT_BAR.has(e))) continue
    return { name: ex.name, kg }
  }
  return null
}

/**
 * THE NEXT PRESCRIBED BARBELL LIFT, which the plate card starts on. Today's
 * session if it is still due (or under way), then the rest of this week in
 * order, then next week's plan; a day whose session moved away does not count
 * (its session is being done on the day it moved to, which is in the list).
 * Null when nothing ahead has a barbell lift: the card then starts at the
 * default and names no lift.
 */
export function nextBarbellLift(days: DayLike[], today: string, nextWeek?: WorkoutDay[] | null): { name: string; kg: number } | null {
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.date < today || d.movedTo) continue
    if (d.state !== 'due' && !(d.date === today && d.state === 'partial')) continue
    const lift = barbellLiftOf(d.session)
    if (lift) return lift
  }
  for (const day of nextWeek ?? []) {
    const lift = barbellLiftOf(day)
    if (lift) return lift
  }
  return null
}

/** "Week 2 of 16 · B1": the live week, the plan's length and the block it is in. Null without a plan. */
export function weekEyebrow(mesocycle: MesocycleWeek[] | undefined, liveWeek: number | undefined): string | null {
  if (!mesocycle || mesocycle.length === 0) return null
  const week = liveWeek ?? 1
  const block = mesocycle.find(w => w.week_number === week)?.block_number ?? 1
  return `Week ${week} of ${mesocycle.length} · B${block}`
}

/** How far through the plan she is, for the program row's bar: weeks begun over weeks in the plan, 0..1. */
export function programProgress(mesocycle: MesocycleWeek[] | undefined, liveWeek: number | undefined): number | null {
  if (!mesocycle || mesocycle.length === 0) return null
  return Math.min(1, Math.max(0, (liveWeek ?? 1) / mesocycle.length))
}

/**
 * "Tabata", "8 × 20s / 10s" and "3:50" for the hero's LAST ROUND line. The name
 * is the preset's own label (Custom when it matches none), the numbers are the
 * presets' own phrase, and the length is the round sheet's working time — so
 * the line can never name a protocol it does not run or a length the sheet
 * would not show.
 */
export function lastRoundLine(config: RoundConfig): { name: string; numbers: string; total: string } {
  return {
    name: protocolNameOf(config),
    numbers: describeRoundPreset({ key: '', label: '', config }),
    total: clock(workingSeconds(config)),
  }
}
