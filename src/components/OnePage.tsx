import type * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// THE BLOCKS THE ONE-PAGE SCREENS ARE BUILT FROM (design 5c·5 / 5c·6 / 5c·4, 17 Oct 2026). One file so
// Home, Nutrition and Exercise cannot drift: the ring meter, its key, the section label, the hairline row
// and the primary button's fill. Tokens only. docs/plans/one-page-tabs.md.
// ---------------------------------------------------------------------------

export const RING_RADII = [44, 35, 26, 17] as const

export interface RingSpec {
  key: string
  /** 0..1, or null when there is no target (drawn as an empty track). */
  share: number | null
  color: string
  /** Only the outer accent ring glows. */
  glow?: boolean
}

/** 162px, viewBox 100, stroke 6, round caps, from 12 o'clock, outermost first. */
export function RingMeter({ rings, size = 162, label, children, className, ...rest }: {
  rings: RingSpec[]
  size?: number
  label: string
  children?: React.ReactNode
  className?: string
  'data-testid'?: string
}) {
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} role="img" aria-label={label} data-testid={rest['data-testid']}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="block">
        {rings.map((r, i) => (
          <circle key={`t-${r.key}`} cx="50" cy="50" r={RING_RADII[i]} fill="none" stroke="var(--surface-raised)" strokeWidth="6" />
        ))}
        {rings.map((r, i) => {
          const rad = RING_RADII[i]
          const circ = 2 * Math.PI * rad
          const share = r.share ?? 0
          return (
            <circle
              key={`f-${r.key}`}
              cx="50" cy="50" r={rad} fill="none" strokeWidth="6" strokeLinecap="round"
              stroke={r.color}
              strokeDasharray={`${circ * share} ${circ}`}
              transform="rotate(-90 50 50)"
              opacity={share > 0 ? 1 : 0}
              className={r.glow ? 'glow-icon' : undefined}
              data-ring={r.key}
              data-share={r.share == null ? 'none' : share.toFixed(3)}
              style={{ transition: 'stroke-dasharray 400ms ease' }}
            />
          )
        })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  )
}

export interface KeyItem {
  key: string
  label: string
  color: string
  /** "1,640" */
  value: string
  /** "/2,350", "/180g"; absent when there is no target. */
  target?: string
  glow?: boolean
  onClick?: () => void
  ariaLabel?: string
}

/** Two columns, gaps 10 by 22: a 9px swatch, the label, the mono value with its target muted. */
export function RingKey({ items, ...rest }: { items: KeyItem[]; 'data-testid'?: string }) {
  return (
    <div className="grid grid-cols-2 gap-x-[22px] gap-y-2.5" data-testid={rest['data-testid']}>
      {items.map(it => {
        const inner = (
          <>
            <span aria-hidden className={cn('size-[9px] shrink-0 rounded-[3px]', it.glow && 'glow-mint-box')} style={{ background: it.color }} />
            <span className="min-w-0 flex-1 truncate text-left text-[0.75rem] text-muted-foreground">{it.label}</span>
            <span className="tabular-mono shrink-0 text-[0.78125rem]">
              {it.value}<span className="text-muted-foreground">{it.target ?? ''}</span>
            </span>
          </>
        )
        return it.onClick ? (
          <button key={it.key} type="button" onClick={it.onClick} aria-label={it.ariaLabel} className="hit-slop-44 flex min-w-0 items-center gap-2" data-key-row={it.key}>
            {inner}
          </button>
        ) : (
          <div key={it.key} className="flex min-w-0 items-center gap-2" data-key-row={it.key}>{inner}</div>
        )
      })}
    </div>
  )
}

/** `.ds-label` on the left, an optional mono count on the right. */
export function SectionLabel({ children, right, rightMono = true, ...rest }: { children: React.ReactNode; right?: React.ReactNode; rightMono?: boolean; 'data-testid'?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-1.5" data-testid={rest['data-testid']}>
      <p className="ds-label">{children}</p>
      {right != null && <span className={cn('min-w-0 truncate text-[0.6875rem] text-muted-foreground', rightMono && 'tabular-mono')}>{right}</span>}
    </div>
  )
}

/** A list of hairline rows: a hairline on top of the first, one under each. */
export function RowList({ children, className, ...rest }: { children: React.ReactNode; className?: string; 'data-testid'?: string }) {
  return <div className={cn('flex flex-col border-t border-[color:var(--hairline)]', className)} data-testid={rest['data-testid']}>{children}</div>
}

/**
 * ONE ROW: an optional 32px tile, a title over a muted sub-line, a mono value, a chevron. A button when it
 * goes somewhere, a plain row when it does not (no chevron then, so nothing looks tappable that is not).
 */
export function PageRow({ icon, iconTone = 'plain', title, sub, right, onClick, ariaLabel, className, ...rest }: {
  icon?: React.ReactNode
  iconTone?: 'plain' | 'accent'
  title: React.ReactNode
  sub?: React.ReactNode
  right?: React.ReactNode
  onClick?: () => void
  ariaLabel?: string
  className?: string
  [data: `data-${string}`]: string | undefined
}) {
  const dataAttrs = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('data-')))
  const body = (
    <>
      {icon && (
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: 'var(--surface-raised)', color: iconTone === 'accent' ? 'var(--primary-text)' : 'var(--text-tertiary)' }}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[0.90625rem]">{title}</span>
        {sub && <span className="block truncate text-[0.71875rem] text-muted-foreground">{sub}</span>}
      </span>
      {right != null && <span className="shrink-0">{right}</span>}
      {onClick && <ChevronRight aria-hidden className="size-4 shrink-0" style={{ color: 'var(--text-dim)' }} />}
    </>
  )
  const cls = cn('flex min-h-[56px] w-full items-center gap-3 border-b border-[color:var(--hairline)] py-2', className)
  return onClick
    ? <button type="button" onClick={onClick} aria-label={ariaLabel} className={cls} {...dataAttrs}>{body}</button>
    : <div className={cls} {...dataAttrs}>{body}</div>
}

/** The primary button's fill: the accent gradient, ink on accent, 52 tall, radius 14. */
export const PRIMARY_CTA_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white) 0%, var(--primary) 55%, var(--primary-2) 100%)',
  color: 'var(--primary-foreground)',
}
export const PRIMARY_CTA_CLASS = 'glow-mint-box h-[52px] w-full rounded-[14px] text-[0.9375rem] font-bold'
