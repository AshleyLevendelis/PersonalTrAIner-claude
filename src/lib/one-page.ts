// ---------------------------------------------------------------------------
// THE NUMBERS THE ONE-PAGE SCREENS DRAW (design 5c·5 / 5c·6 / 5c·4, 17 Oct 2026).
//
// Pure, so a gate can ask them: the share each ring fills, Home's "% of today's targets", the Exercise
// week meter, and the Program row's phase bar read off the plan's own blocks. docs/plans/one-page-tabs.md.
// ---------------------------------------------------------------------------
import type { MesocycleWeek } from './types'
import { sessionSetCount } from './session-count'
import { countsTowardWeekTally, type TrainingWeekDay } from '@/hooks/useTrainingWeek'

/** How full a ring is: eaten over target, 0 to 1. No target, no share (null), never "full" or "empty". */
export function ringShare(value: number, target: number | null | undefined): number | null {
  if (target == null || !(target > 0) || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(1, value / target))
}

/**
 * HOME'S HEADLINE: the mean of the rings that HAVE a target, each capped at 100%. A ring with no target
 * (no body metrics yet means no calorie or protein target) is left out rather than counted as 0, which
 * would read as a day gone badly. None at all: null, and the screen shows a dash.
 */
export function todaySoFarPercent(shares: (number | null)[]): number | null {
  const known = shares.filter((s): s is number => s != null)
  if (known.length === 0) return null
  return Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 100)
}

/** "6.2k" for 6,200; "9k" for 9,000; the number itself under 1,000. */
export function compactCount(n: number): string {
  if (n < 1000) return Math.round(n).toLocaleString()
  const k = Math.round(n / 100) / 10
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`
}

export interface PhaseSegment {
  block: number
  label: string
  state: 'done' | 'current' | 'future'
  /** How much of the segment is filled: 1 done, 0 future, the weeks reached so far for the current one. */
  fill: number
}

export interface ProgramSummary {
  /** "B1 Anatomical adaptation", or "Calibration" in a calibration week, or the deload's own name. */
  title: string | null
  /** "deload in 2 wks", "deload this week", or null when no deload lies ahead in this block. */
  deload: string | null
  segments: PhaseSegment[]
}

function sentenceCase(s: string): string {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : t
}

/**
 * THE PROGRAM ROW, FROM THE PLAN'S OWN BLOCKS. One segment per block (block_number), named by its own
 * phase label, never the handoff's Base/Build/Peak/Deload, which this plan does not have. A block is done
 * once the live week is past its last week; the current one fills by the weeks reached, this week included.
 */
export function programSummary(mesocycle: MesocycleWeek[], liveWeek: number): ProgramSummary {
  const weeks = [...mesocycle].sort((a, b) => a.week_number - b.week_number)
  const byBlock = new Map<number, MesocycleWeek[]>()
  for (const w of weeks) {
    const b = w.block_number ?? 1
    byBlock.set(b, [...(byBlock.get(b) ?? []), w])
  }
  const segments: PhaseSegment[] = [...byBlock.entries()].sort((a, b) => a[0] - b[0]).map(([block, ws]) => {
    const first = ws[0].week_number
    const last = ws[ws.length - 1].week_number
    const named = ws.find(w => !w.is_deload && w.phase_label) ?? ws.find(w => w.phase_label)
    const state: PhaseSegment['state'] = liveWeek > last ? 'done' : liveWeek < first ? 'future' : 'current'
    const fill = state === 'done' ? 1 : state === 'future' ? 0 : (liveWeek - first + 1) / ws.length
    return { block, label: sentenceCase(named?.phase_label ?? `Block ${block}`), state, fill }
  })
  const now = weeks.find(w => w.week_number === liveWeek)
  const current = segments.find(s => s.state === 'current')
  const title = !now ? null
    : now.isCalibrationWeek ? 'Calibration week'
    : current ? `B${current.block} ${current.label}` : null
  let deload: string | null = null
  if (now) {
    const blockWeeks = byBlock.get(now.block_number ?? 1) ?? []
    const next = blockWeeks.find(w => w.is_deload && w.week_number >= liveWeek)
    if (next) {
      const n = next.week_number - liveWeek
      deload = n === 0 ? 'deload this week' : `deload in ${n} wk${n === 1 ? '' : 's'}`
    }
  }
  return { title, deload, segments }
}

/**
 * THE EXERCISE WEEK METER (5c·4): sets logged over sets planned across the week's training days — the same
 * days the session count counts (countsTowardWeekTally) and the same capped per-session count the strips and
 * Home use (sessionSetCount, her M39 "one count"), so the ring cannot say a different fraction from them.
 */
export function weekSetCount(days: TrainingWeekDay[]): { logged: number; planned: number } {
  let logged = 0
  let planned = 0
  for (const d of days) {
    if (!countsTowardWeekTally(d.state)) continue
    const c = sessionSetCount(d.session, d.workingLogs)
    if (!c) continue
    logged += c.logged
    planned += c.planned
  }
  return { logged, planned }
}
