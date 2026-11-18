// ---------------------------------------------------------------------------
// WEIGHT, WEEK BY WEEK (his request 18 Nov 2026, "Add all three", from another app's screen): behind the Weight row
// on Home, a graph of every weigh-in with each week's average drawn as a line, a 3M / 6M / 1Y choice, and a list of
// weeks (average, and the change from the week before; tap one to see its days). The readings are the ones the
// calorie targets follow: a weigh-in the targets set aside is left out here too, so the two never disagree.
// Kept off first paint (lazy, opened from the Weight row).
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react'
import { getWeighInHistory } from '@/lib/nutrition-targets'
import {
  WEIGHT_RANGE_DAYS, cleanWeighIns, weightWeeks, weekLabel, dayLabel, changeLabel, monthShort, shiftDate, mondayOf,
  type WeightRange, type WeighInPoint, type WeightWeek,
} from '@/lib/weight-weeks'

const RANGES: WeightRange[] = ['3M', '6M', '1Y']

interface Props {
  profileId: string
  /** The person's own date, YYYY-MM-DD (Home's `today`). */
  today: string
  goalKg?: number | null
  /** Bumped by the parent after a weigh-in is logged, so the history reads again. */
  refreshKey?: number
  /** For the browser harness: skip the database and draw these. */
  readings?: WeighInPoint[]
}

export function WeightHistory({ profileId, today, goalKg, refreshKey = 0, readings }: Props) {
  const [range, setRange] = useState<WeightRange>('3M')
  const [rows, setRows] = useState<WeighInPoint[] | null>(readings ?? null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  // Read a year once; the three ranges are cuts of it, so switching costs no wait.
  const yearFrom = shiftDate(today, -(WEIGHT_RANGE_DAYS['1Y'] - 1))

  useEffect(() => {
    if (readings) { setRows(readings); return }
    let live = true
    setFailed(false)
    getWeighInHistory(profileId, yearFrom)
      .then(r => { if (live) setRows(r) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [profileId, yearFrom, refreshKey, attempt, readings])

  const from = shiftDate(today, -(WEIGHT_RANGE_DAYS[range] - 1))
  const points = useMemo(() => cleanWeighIns(rows ?? [], from, today), [rows, from, today])
  const weeks = useMemo(() => weightWeeks(points), [points])

  if (failed) {
    return (
      <div className="mt-3 text-xs text-muted-foreground" data-testid="weight-history-failed">
        Couldn't load your weigh-ins. Check your connection and try again.{' '}
        <button type="button" className="min-h-[44px] font-semibold text-primary-text underline" onClick={() => setAttempt(a => a + 1)}>Try again</button>
      </div>
    )
  }
  if (rows == null) return <p className="mt-3 text-xs text-muted-foreground">Loading your weigh-ins…</p>

  return (
    <div className="mt-3" data-testid="weight-history">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.75rem] font-semibold">Weekly average</span>
        <div className="flex gap-1" role="group" aria-label="How far back">
          {RANGES.map(r => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              data-testid={`weight-range-${r}`}
              onClick={() => { setRange(r); setOpenWeek(null) }}
              className={`min-h-[44px] min-w-[44px] rounded-full px-2 text-[0.75rem] font-semibold ${range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="weight-history-empty">No weigh-ins in the last {range === '1Y' ? 'year' : `${range === '3M' ? 3 : 6} months`}.</p>
      ) : (
        <WeightChart points={points} weeks={weeks} from={from} to={today} goalKg={goalKg ?? null} />
      )}
      {weeks.length > 0 && (
        <ul className="mt-2" data-testid="weight-weeks">
          {weeks.map(w => (
            <WeekRow key={w.start} week={w} current={w.start === mondayOf(today)} open={openWeek === w.start} onToggle={() => setOpenWeek(o => (o === w.start ? null : w.start))} />
          ))}
        </ul>
      )}
    </div>
  )
}

function WeekRow({ week, current, open, onToggle }: { week: WeightWeek; current: boolean; open: boolean; onToggle: () => void }) {
  const change = changeLabel(week.changeKg)
  return (
    <li className="border-t border-[color:var(--hairline)]" data-testid="weight-week" data-week={week.start} data-avg={week.avgKg}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left">
        <span className="text-[0.8125rem]">
          {current ? 'This week' : weekLabel(week.start, week.end)}
          <span className="ml-1.5 text-[0.6875rem] text-muted-foreground">{week.days.length} weigh-in{week.days.length === 1 ? '' : 's'}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="tabular-mono text-[0.8125rem] font-semibold" data-testid="weight-week-avg">{week.avgKg.toFixed(1)} kg</span>
          <span className="tabular-mono min-w-[4.5rem] text-right text-[0.75rem] text-muted-foreground" data-testid="weight-week-change">{change ?? ''}</span>
        </span>
      </button>
      {open && (
        <ul className="pb-2 pl-3" data-testid="weight-week-days">
          {week.days.map(d => (
            <li key={d.date} className="flex justify-between py-1 text-[0.75rem] text-muted-foreground">
              <span>{dayLabel(d.date)}</span>
              <span className="tabular-mono">{d.kg.toFixed(1)} kg</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Weigh-ins as faint dots, each week's average as a line through the middle of its week, on one date scale. */
function WeightChart({ points, weeks, from, to, goalKg }: { points: WeighInPoint[]; weeks: WeightWeek[]; from: string; to: string; goalKg: number | null }) {
  const W = 340, H = 150, padL = 34, padR = 8, padT = 10, padB = 22
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000
  const x0 = day(from), x1 = day(to)
  const toX = (d: string) => padL + ((Math.min(Math.max(day(d), x0), x1) - x0) / Math.max(1, x1 - x0)) * (W - padL - padR)
  const values = [...points.map(p => p.kg), ...(goalKg != null ? [goalKg] : [])]
  let lo = Math.floor(Math.min(...values) - 0.5), hi = Math.ceil(Math.max(...values) + 0.5)
  if (hi - lo < 2) { lo -= 1; hi += 1 }
  const toY = (kg: number) => padT + (1 - (kg - lo) / (hi - lo)) * (H - padT - padB)
  const ticks = [lo, Math.round((lo + hi) / 2), hi]
  // A week's average sits at its Thursday, kept inside the range so a part week at either end stays on the chart.
  const avg = [...weeks].reverse().map(w => ({ x: toX(shiftDate(w.start, 3)), y: toY(w.avgKg) }))
  const months: string[] = []
  for (let d = `${from.slice(0, 7)}-01`; d <= to; d = shiftDate(`${d.slice(0, 7)}-28`, 4).slice(0, 7) + '-01') if (d >= from) months.push(d)
  const step = Math.max(1, Math.ceil(months.length / 4))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-2 block" role="img" aria-label={`Weight from ${from} to ${to}: ${weeks.length} weeks, latest weekly average ${weeks[0]?.avgKg.toFixed(1)} kg`} data-testid="weight-chart">
      {ticks.map(t => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={toY(t)} y2={toY(t)} stroke="var(--hairline, rgba(127,127,127,.25))" strokeWidth="1" />
          <text x={padL - 6} y={toY(t) + 3} textAnchor="end" fontSize="10" fill="currentColor" className="text-muted-foreground">{t}</text>
        </g>
      ))}
      {months.filter((_, i) => i % step === 0).map(m => (
        <text key={m} x={toX(m)} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" className="text-muted-foreground">{monthShort(m)}</text>
      ))}
      {goalKg != null && (
        <g data-testid="weight-chart-goal">
          <line x1={padL} x2={W - padR} y1={toY(goalKg)} y2={toY(goalKg)} stroke="var(--role-warn, #FFB454)" strokeWidth="1" strokeDasharray="3 3" />
          <text x={W - padR} y={toY(goalKg) - 3} textAnchor="end" fontSize="10" fill="var(--role-warn-text, #B7791F)">goal {goalKg} kg</text>
        </g>
      )}
      {points.map(p => <circle key={p.date} cx={toX(p.date)} cy={toY(p.kg)} r="2" fill="var(--primary)" opacity="0.35" data-testid="weight-chart-dot" />)}
      {avg.length > 1 && (
        <polyline points={avg.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" data-testid="weight-chart-avg" />
      )}
      {avg.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--primary)" data-testid="weight-chart-avg-point" />)}
    </svg>
  )
}
