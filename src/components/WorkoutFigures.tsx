import { useState } from 'react'
import { Swatch } from '@/components/exercise/ExerciseBar'
import { heartRange, heartSeries, heartZones, mostlyZone, pacePerKm, rowSpans, ZONES, type HeartReading, type HeartZones } from '@/lib/heart-series'

// ---------------------------------------------------------------------------
// A WORKOUT'S FIGURES, DRAWN (his words 26 Nov 2026 on the first watch card: "too simple, doesn't add any real value
// and doesn't fit the aesthetic of the rest of the app", with Garmin's heart-rate graph and time-in-zones and Apple's
// workout details beside it).
//
// Three blocks, each drawn only when the phone holds what it needs, in the session hero's own pieces (a swatch, a big
// mono number, its unit small, its label under it):
//   1. THE NUMBERS: time, distance, pace, calories, average and highest heart rate.
//   2. THE HEART RATE as a line over the session, its average marked. One series, so one colour and no legend; a
//      finger on the graph reads the value at that moment.
//   3. TIME IN HEART RATE ZONES (his ruling 26 Nov 2026, "heart rate zones is better than the 3 options for effort"):
//      five rows, zone 5 at the top as his watch draws them, each with its number, the app's effort word, its range in
//      beats, a bar and its minutes. One hue light to dark (an ordered scale), and the words and minutes carry
//      everything the colour does.
// Description after the fact, never a target (heart-series.ts has the basis and who the zones are not shown to).
// ---------------------------------------------------------------------------

const HEART = 'var(--destructive)'
/** Zone 1 faintest, zone 5 the full colour. */
const ZONE_FILL = [22, 38, 56, 76, 100].map(p => (p === 100 ? HEART : `color-mix(in srgb, ${HEART} ${p}%, transparent)`))

function Stat({ value, unit, label, color, id }: { value: string; unit?: string; label: string; color: string; id: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5" data-figure={id}>
      <span className="flex items-baseline gap-1.5">
        <span className="self-center"><Swatch color={color} /></span>
        <span className="tabular-mono text-[1.375rem] font-bold leading-none tracking-[-.02em] text-foreground">{value}</span>
        {unit && <span className="truncate text-[0.75rem] font-medium text-text-tertiary">{unit}</span>}
      </span>
      <span className="mt-1.5 block text-[0.625rem] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</span>
    </div>
  )
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

function HeartChart({ samples, start, end, avg, max }: { samples: readonly HeartReading[]; start: Date; end: Date; avg: number | null; max: number | null }) {
  const [at, setAt] = useState<number | null>(null)
  const pts = heartSeries(samples, start, end)
  if (pts.length < 3) return null
  const W = 320, H = 104, padT = 14, padB = 4
  const lo = Math.min(...pts.map(p => p.bpm)) - 6, hi = Math.max(...pts.map(p => p.bpm)) + 4
  const x = (t: number) => t * W
  const y = (bpm: number) => padT + (1 - (bpm - lo) / Math.max(1, hi - lo)) * (H - padT - padB)
  const line = pts.map(p => `${x(p.t).toFixed(1)},${y(p.bpm).toFixed(1)}`).join(' ')
  const area = `M${x(pts[0].t).toFixed(1)},${H} L${line.replace(/ /g, ' L')} L${x(pts[pts.length - 1].t).toFixed(1)},${H} Z`
  const peak = pts.reduce((a, b) => (b.bpm > a.bpm ? b : a))
  const range = heartRange(samples, start, end)
  // The average's label sits at whichever end the line is further from it, so the line never runs through the words.
  const labelLeft = Math.abs(pts[0].bpm - (avg ?? 0)) > Math.abs(pts[pts.length - 1].bpm - (avg ?? 0))
  const read = at == null ? null : pts.reduce((a, b) => (Math.abs(b.t - at) < Math.abs(a.t - at) ? b : a))
  const readAt = read ? new Date(start.getTime() + read.t * (end.getTime() - start.getTime())) : null
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setAt(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
  }
  return (
    <div data-heart-chart>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.625rem] font-semibold uppercase tracking-[.12em] text-muted-foreground">Heart rate</span>
        <span className="tabular-mono text-[0.75rem] text-text-tertiary" data-heart-chart-read aria-live="polite">
          {read && readAt ? `${read.bpm} bpm at ${hhmm(readAt)}` : range ? `${range.low}–${range.high} bpm` : ''}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-1.5 block touch-none select-none" role="img"
        aria-label={`Heart rate over the session${avg != null ? `: average ${avg}, highest ${max ?? peak.bpm}` : ''}`}
        onPointerDown={move} onPointerMove={move} onPointerLeave={() => setAt(null)} onPointerUp={() => setAt(null)}
      >
        <defs>
          <linearGradient id="heart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={HEART} stopOpacity=".32" />
            <stop offset="1" stopColor={HEART} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#heart-fill)" />
        {avg != null && avg > lo && avg < hi && (
          <>
            <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="3 4" data-heart-chart-avg />
            <text x={labelLeft ? 0 : W} y={y(avg) - 5} textAnchor={labelLeft ? 'start' : 'end'} fontSize="10" fill="var(--text-tertiary)" stroke="var(--surface-raised)" strokeWidth="3" style={{ paintOrder: 'stroke' }} data-heart-chart-avg-label>avg {avg}</text>
          </>
        )}
        <polyline points={line} fill="none" stroke={HEART} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-heart-chart-line />
        {!read && <circle cx={x(peak.t)} cy={y(peak.bpm)} r="4" fill={HEART} stroke="var(--surface-raised)" strokeWidth="2" data-heart-chart-peak />}
        {read && (
          <>
            <line x1={x(read.t)} x2={x(read.t)} y1={padT - 6} y2={H} stroke="var(--text-tertiary)" strokeWidth="1" />
            <circle cx={x(read.t)} cy={y(read.bpm)} r="4" fill={HEART} stroke="var(--surface-raised)" strokeWidth="2" />
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[0.6875rem] tabular-mono text-text-tertiary"><span>{hhmm(start)}</span><span>{hhmm(end)}</span></div>
    </div>
  )
}

function Zones({ zones }: { zones: HeartZones }) {
  const most = Math.max(...zones.minutes, 1)
  const mostly = mostlyZone(zones)
  const range = (i: number) => (i === 0 ? `<${zones.floors[1]}` : i === 4 ? `${zones.floors[4]}+` : `${zones.floors[i]}–${zones.floors[i + 1] - 1}`)
  return (
    <div data-heart-zones={mostly ?? ''}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.625rem] font-semibold uppercase tracking-[.12em] text-muted-foreground">Time in heart rate zones</span>
        <span className="text-[0.6875rem] text-text-tertiary" data-heart-zones-note>about</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {[4, 3, 2, 1, 0].map(i => (
          <div key={i} className="grid grid-cols-[4.75rem_3.6rem_1fr_3rem] items-center gap-x-2" data-zone={ZONES[i].zone} data-zone-minutes={zones.minutes[i]}>
            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="tabular-mono text-[0.8125rem] font-bold text-foreground">Z{ZONES[i].zone}</span>
              <span className="text-[0.75rem] text-text-tertiary">{ZONES[i].word}</span>
            </span>
            <span className="tabular-mono whitespace-nowrap text-[0.6875rem] text-text-tertiary" data-zone-range>{range(i)}</span>
            <span className="h-2.5 rounded-[4px] bg-[color:var(--surface-deep)]" aria-hidden>
              {zones.minutes[i] > 0 && <span className="block h-full rounded-[4px]" style={{ width: `${Math.max(4, (zones.minutes[i] / most) * 100)}%`, background: ZONE_FILL[i] }} data-zone-bar />}
            </span>
            <span className="whitespace-nowrap text-right"><span className="tabular-mono text-[0.8125rem] font-bold text-foreground">{zones.minutes[i]}</span> <span className="text-[0.6875rem] text-text-tertiary">min</span></span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[0.6875rem] leading-[1.4] text-text-tertiary">Zones are tenths of an estimated top heart rate of {zones.maxUsed}, so read them as a guide.</p>
    </div>
  )
}

export interface WorkoutFiguresProps {
  minutes: number
  km: number | null
  /** Pace is a fact about travelling on foot or wheels; a strength session has none. */
  showPace: boolean
  kcal: number | null
  kcalEstimated?: boolean
  steps?: number | null
  avgHeart: number | null
  maxHeart: number | null
  samples: readonly HeartReading[]
  start: Date
  end: Date
  /** His estimated maximum heart rate, or null when the zones must not be drawn (no age, or a condition ticked). */
  estimatedMax: number | null
}

/** The zones this workout would draw, for a caller that words them (the plan-versus-done line). */
export function zonesFor(p: Pick<WorkoutFiguresProps, 'samples' | 'start' | 'end' | 'estimatedMax'>): HeartZones | null {
  return heartZones(p.samples, p.start, p.end, p.estimatedMax)
}

export function WorkoutFigures(p: WorkoutFiguresProps) {
  const pace = p.showPace ? pacePerKm(p.minutes, p.km) : null
  const zones = zonesFor(p)
  const stats: { id: string; value: string; unit?: string; label: string; color: string }[] = [
    { id: 'time', value: String(p.minutes), unit: 'min', label: 'Time', color: 'var(--working-track-done)' },
  ]
  if (p.km != null && p.km > 0) stats.push({ id: 'distance', value: String(p.km), unit: 'km', label: 'Distance', color: 'var(--chart-3)' })
  // "/km" beside a four-figure pace does not fit a third of a phone, so the unit rides in the label.
  if (pace) stats.push({ id: 'pace', value: pace, label: 'Pace / km', color: 'var(--chart-3)' })
  if (p.kcal != null && p.kcal > 0) stats.push({ id: 'kcal', value: `${p.kcalEstimated ? '≈' : ''}${Math.round(p.kcal)}`, unit: 'kcal', label: p.kcalEstimated ? 'Estimate' : 'Active', color: 'var(--chart-4)' })
  if (p.steps != null && p.steps > 0) stats.push({ id: 'steps', value: p.steps.toLocaleString('en-GB'), label: 'Steps', color: 'var(--chart-2)' })
  if (p.avgHeart != null) stats.push({ id: 'avg-heart', value: String(p.avgHeart), unit: 'bpm', label: 'Average', color: HEART })
  if (p.maxHeart != null) stats.push({ id: 'max-heart', value: String(p.maxHeart), unit: 'bpm', label: 'Highest', color: HEART })
  const spans = rowSpans(stats.length)
  return (
    <div className="space-y-3.5" data-workout-figures>
      <div className="grid grid-cols-6 overflow-hidden rounded-[14px] bg-[color:var(--surface-deep)]" data-figure-grid={stats.length}>
        {stats.map((s, i) => (
          <div key={s.id} className="border-b border-r border-[color:var(--hairline)] -mb-px -mr-px" style={{ gridColumn: `span ${spans[i]}` }}><Stat {...s} /></div>
        ))}
      </div>
      <HeartChart samples={p.samples} start={p.start} end={p.end} avg={p.avgHeart} max={p.maxHeart} />
      {zones && <Zones zones={zones} />}
    </div>
  )
}
