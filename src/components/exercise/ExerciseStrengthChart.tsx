// ---------------------------------------------------------------------------
// A simple top-set e1RM trend line for one exercise. Hand-rolled raw <svg>
// following Dashboard.tsx's ring-meter precedent (CSS-var strokes, glow
// classes, no charting library — none is a dependency and none should be
// added for one chart). Caller gates the honest empty state via
// hasEnoughTrendData; this component assumes 2+ points.
// ---------------------------------------------------------------------------

import type { TrendPoint } from '@/lib/exercise-history'

const WIDTH = 300
const HEIGHT = 120
const PAD_X = 8
const PAD_Y = 12

export function ExerciseStrengthChart({ points }: { points: TrendPoint[] }) {
  const values = points.map(p => p.topSetE1RM)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = points.length > 1 ? (WIDTH - PAD_X * 2) / (points.length - 1) : 0

  const coords = points.map((p, i) => {
    const x = PAD_X + i * stepX
    const y = HEIGHT - PAD_Y - ((p.topSetE1RM - min) / range) * (HEIGHT - PAD_Y * 2)
    return { x, y }
  })

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')

  const first = points[0]
  const last = points[points.length - 1]
  const mid = points[Math.floor(points.length / 2)]

  return (
    <div>
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="overflow-visible">
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="glow-icon" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3.5 : 2.5} fill="var(--primary)" className="glow-dot" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 text-[0.625rem] text-muted-foreground">
        <span>{first.date}</span>
        {points.length > 2 && <span>{mid.date}</span>}
        <span>{last.date}</span>
      </div>
    </div>
  )
}
