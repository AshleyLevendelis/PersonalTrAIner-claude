import type * as React from 'react'
import { macroEnergySplit, type RingGeometry, type RingKey } from '@/lib/nutrition-week'

// ---------------------------------------------------------------------------
// THE NUTRITION WEEK'S DRAWN PARTS (his handoff of 11 Nov 2026): one circle of nested rings, and a meal's split bar
// with its legend line. Tokens only, so all nine themes keep working; the sizes and shares come from
// nutrition-week.ts, which a gate can ask.
// ---------------------------------------------------------------------------

/** Each ring's colour, the same on the circle, its legend row and a meal's split bar. */
export const RING_COLOR: Record<RingKey, string> = {
  water: 'var(--chart-3)',
  calories: 'var(--primary)',
  protein: 'var(--chart-2)',
  carbs: 'var(--chart-4)',
  fat: 'var(--text-tertiary)',
}

/** The name of each ring as a row says it. */
export const RING_LABEL: Record<RingKey, string> = { water: 'Water', calories: 'Kcal', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' }

/**
 * ONE CIRCLE, RINGS NESTED, outermost first: a faint track for each, the fill from 12 o'clock with round caps,
 * eaten (or planned) over target, capped at 100%. A ring with no target is a bare track, marked `data-share="none"`.
 */
export function NestedRings({ size, rings, shares, label, children, ...rest }: {
  size: number
  rings: RingGeometry[]
  shares: Partial<Record<RingKey, number | null>>
  /** What the circle shows, for a screen reader. */
  label: string
  children?: React.ReactNode
  'data-testid'?: string
}) {
  const c = size / 2
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label} data-testid={rest['data-testid']}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden className="block">
        {rings.map(r => (
          <circle key={`t-${r.key}`} cx={c} cy={c} r={r.radius} fill="none" strokeWidth={r.stroke}
            stroke="color-mix(in srgb, var(--foreground) 9%, transparent)" />
        ))}
        {rings.map(r => {
          const share = shares[r.key]
          const fill = share ?? 0
          const circ = 2 * Math.PI * r.radius
          return (
            <circle
              key={`f-${r.key}`}
              cx={c} cy={c} r={r.radius} fill="none" strokeWidth={r.stroke} strokeLinecap="round"
              stroke={RING_COLOR[r.key]}
              strokeDasharray={`${(circ * fill).toFixed(1)} ${circ.toFixed(1)}`}
              transform={`rotate(-90 ${c} ${c})`}
              opacity={fill > 0 ? 1 : 0}
              data-ring={r.key}
              data-share={share == null ? 'none' : fill.toFixed(3)}
              style={{
                transition: 'stroke-dasharray 400ms ease',
                filter: r.glow ? 'drop-shadow(0 0 calc(5px * var(--glow-strength, 1)) rgba(var(--glow-rgb), .7))' : undefined,
              }}
            />
          )
        })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  )
}

/**
 * M2: A MEAL'S SPLIT BAR. 8px, fully rounded, 2px between segments, each sized by that macro's share of the meal's
 * energy (protein and carbs x4, fat x9). Under it the grams with their words: "■ 42g protein ■ 92g carbs ■ 18g fat".
 */
export function MealMacros({ protein, carbs, fat, className }: { protein: number; carbs: number; fat: number; className?: string }) {
  const split = macroEnergySplit(protein, carbs, fat)
  const parts = [
    { key: 'protein' as const, grams: protein, word: 'protein' },
    { key: 'carbs' as const, grams: carbs, word: 'carbs' },
    { key: 'fat' as const, grams: fat, word: 'fat' },
  ]
  return (
    <span className={`flex flex-col gap-1.5 ${className ?? ''}`} data-meal-macros>
      {split && (
        <span aria-hidden className="flex h-2 w-full gap-[2px]" data-meal-split>
          {parts.filter(p => split[p.key] > 0).map(p => (
            <span key={p.key} className="block h-2 rounded-full" data-split={p.key} data-share={split[p.key].toFixed(3)}
              style={{ flexGrow: split[p.key], flexBasis: 0, background: RING_COLOR[p.key] }} />
          ))}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {parts.map(p => (
          <span key={p.key} className="flex items-center gap-1.5 whitespace-nowrap" data-macro={p.key}>
            <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: RING_COLOR[p.key] }} />
            <span className="tabular-nums text-[0.875rem] font-bold text-foreground">{Math.round(p.grams)}g</span>{' '}
            <span className="text-[0.8125rem] text-text-tertiary">{p.word}</span>
          </span>
        ))}
      </span>
    </span>
  )
}
