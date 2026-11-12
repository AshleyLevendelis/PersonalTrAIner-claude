// ---------------------------------------------------------------------------
// THE NUMBERS THE NUTRITION WEEK SCREENS DRAW — his design handoff of 11 Nov 2026 ("Nutrition Week": N1 today's
// rings card, W1 a future day tapped in the strip, W3 the week on one screen, M2 the meal rows).
//
// Pure, so a gate can ask them: the size of every ring, how full each one is, how a meal's split bar divides, and
// what the week view's heading says. The screens draw; this decides. docs/plans/nutrition-week.md.
// ---------------------------------------------------------------------------
import type { MacroTargets } from './types'
import { ringShare } from './one-page'
import { kcalLeftOrOver } from './coach-voice'

/** The rings, outside in. Water is today's only: water is logged, never planned (W1, W3). */
export type RingKey = 'water' | 'calories' | 'protein' | 'carbs' | 'fat'

export interface RingGeometry { key: RingKey; radius: number; stroke: number; glow?: boolean }

/** N1's circle, 196px, as the design's table gives it: water 94/6, calories 80/13 (glowing), the macros 63, 50, 37 at 9. */
export const TODAY_RINGS: RingGeometry[] = [
  { key: 'water', radius: 94, stroke: 6 },
  { key: 'calories', radius: 80, stroke: 13, glow: true },
  { key: 'protein', radius: 63, stroke: 9 },
  { key: 'carbs', radius: 50, stroke: 9 },
  { key: 'fat', radius: 37, stroke: 9 },
]
export const TODAY_RING_SIZE = 196

/**
 * THE PLANNED CIRCLE, any size (W1 at 150px, W3's mini rings at 44px): four rings, no water. The design draws both
 * sizes from one set of proportions (150: 66, 49.5, 35.2, 21 at 12.8 and 9.8; 44: 19.4, 14.5, 10.3, 6.2 at 3.7 and
 * 2.9), so one function serves both and they cannot drift apart.
 */
export function plannedRings(size: number): RingGeometry[] {
  const r = (f: number) => Math.round(size * f * 10) / 10
  const outer = r(0.0853)
  const inner = r(0.0653)
  return [
    { key: 'calories', radius: r(0.44), stroke: outer, glow: size >= 100 },
    { key: 'protein', radius: r(0.33), stroke: inner },
    { key: 'carbs', radius: r(0.2347), stroke: inner },
    { key: 'fat', radius: r(0.14), stroke: inner },
  ]
}

/** How full each ring is: the value over its target, capped at 100% (ringShare). Water only when it is given. */
export function ringShares(values: MacroTargets, targets: MacroTargets | null, water?: { ml: number; targetMl: number }): Partial<Record<RingKey, number | null>> {
  const out: Partial<Record<RingKey, number | null>> = {
    calories: ringShare(values.calories, targets?.calories),
    protein: ringShare(values.protein, targets?.protein),
    carbs: ringShare(values.carbs, targets?.carbs),
    fat: ringShare(values.fat, targets?.fat),
  }
  if (water) out.water = ringShare(water.ml, water.targetMl)
  return out
}

/**
 * M2: A MEAL'S SPLIT BAR. Each macro's share of the meal's ENERGY — protein and carbs at 4 kcal a gram, fat at 9 —
 * so the bar shows what the meal is made of, not which number is biggest in grams. A meal with no macros at all
 * has no bar (null), never three equal thirds.
 */
export function macroEnergySplit(protein: number, carbs: number, fat: number): { protein: number; carbs: number; fat: number } | null {
  const p = Math.max(0, protein) * 4
  const c = Math.max(0, carbs) * 4
  const f = Math.max(0, fat) * 9
  const total = p + c + f
  if (!(total > 0)) return null
  return { protein: p / total, carbs: c / total, fat: f / total }
}

/** "1,410 left" or "120 over", from the phrasebook's own left-or-over, with the number grouped as the screen prints it. */
export function leftOrOverLabel(target: number, value: number, unit = ''): { amount: string; word: 'left' | 'over'; text: string } {
  const [n, word] = kcalLeftOrOver(target - value).split(' ') as [string, 'left' | 'over']
  const amount = Number(n).toLocaleString('en-GB')
  return { amount, word, text: `${amount}${unit} ${word}` }
}

/** Litres as he reads them: "1.25", "2.5", "0", never trailing zeros. */
export function litres(ml: number): string {
  return String(Number((ml / 1000).toFixed(2)))
}

const MONTH = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
function utc(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}

/**
 * W3's heading: the strip's seven days as a range — "16 – 22 September", "28 September – 4 October" across a month,
 * "29 December 2026 – 4 January 2027" across a year.
 */
export function weekRangeLabel(dates: string[]): string {
  const a = utc(dates[0] ?? '')
  const b = utc(dates[dates.length - 1] ?? '')
  if (!a || !b) return ''
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${a.getUTCDate()} ${MONTH(a)} ${a.getUTCFullYear()} – ${b.getUTCDate()} ${MONTH(b)} ${b.getUTCFullYear()}`
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${a.getUTCDate()} ${MONTH(a)} – ${b.getUTCDate()} ${MONTH(b)}`
  return `${a.getUTCDate()} – ${b.getUTCDate()} ${MONTH(b)}`
}
