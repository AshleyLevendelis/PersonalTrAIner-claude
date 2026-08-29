import type { ReactNode } from 'react'
import { FIELD_INK, ink } from '@/lib/field-ink'
import { FieldRing, type FieldArc } from './FieldRing'

// ---------------------------------------------------------------------------
// THE FIELD (design handoff v2 §1).
//
// "A tab gets a field when it owns a daily fact." Home owns the day, Nutrition
// owns intake, Exercise owns the program and session. Tools owns nothing, so
// it has no field — "the absence is the point, and it makes the ownership rule
// visible." There is deliberately no `variant="none"`: a tab without a field
// simply does not render one.
//
// Colour comes from --field / --field-ink, which adjust per theme so the ink
// ladder holds on all 15 grounds (see field-ink.ts). Never a literal hex: the
// handoff's own hexes are the Nightshift values of tokens.
// ---------------------------------------------------------------------------

/**
 * The field's state (handoff v2 §6). "The field already shows the state of a
 * session, so during rest it BECOMES the countdown — no new surface."
 *
 * Each state re-points --field and --field-ink locally, so everything drawn on
 * the field — the ladder, the ring, the inverted CTA — follows without any of
 * them knowing a timer exists.
 */
export type FieldState = 'default' | 'resting' | 'alert'

const STATE_VARS: Record<FieldState, { bg: string; ink: string }> = {
  default: { bg: 'var(--field)', ink: 'var(--field-ink)' },
  resting: { bg: 'var(--field-warn)', ink: 'var(--field-warn-ink)' },
  // Complete AND overdue. The handoff flags the collision itself: red means
  // "finished" for a round timer and "off-plan" for an overrun rest. Ashley
  // asked for red at the end, so both keep it; if completion ever reads as
  // failure after a good circuit, this is the one line to change.
  alert: { bg: 'var(--field-destructive)', ink: 'var(--field-destructive-ink)' },
}

export function Field({ arcs, ringPlacement = 'ambient', state = 'default', children }: {
  arcs?: FieldArc[]
  ringPlacement?: 'ambient' | 'inline'
  state?: FieldState
  children: ReactNode
}) {
  const vars = STATE_VARS[state]
  return (
    <div
      className="relative overflow-hidden ds-field"
      style={{
        // Re-pointed rather than overridden, so ink('...') and the ring keep
        // working unchanged inside any state.
        ['--field' as string]: vars.bg,
        ['--field-ink' as string]: vars.ink,
        background: vars.bg,
        color: vars.ink,
        padding: '22px 22px 24px',
        // NO RADIUS, AND IT BREAKS OUT OF THE PAGE GUTTER.
        //
        // "A full-bleed band of accent colour at the top of a tab" with
        // "square top corners (it meets the status bar)". The first build had
        // a bottom radius and sat inside <main>'s px-4 pt-12, so it rendered
        // as an inset rounded card floating below the settings gear — which
        // read, correctly, as the design not having been applied. The
        // prototype settles it: its field is the first child of the phone
        // frame with no radius of its own, clipped by the frame.
        //
        // -16px each side cancels <main>'s px-4, which always applies.
        //
        // The TOP is NOT handled here. A blind negative margin would drag the
        // band over the adaptation banners that render above the tabs, so
        // App.tsx drops the page's top padding instead — it is the only place
        // that knows both which tab is showing and whether a banner is.
        borderRadius: 0,
        marginLeft: -16,
        marginRight: -16,
      }}
    >
      {arcs && arcs.length > 0 && ringPlacement === 'ambient' && (
        <FieldRing arcs={arcs} placement="ambient" />
      )}
      <div className="relative">{children}</div>
    </div>
  )
}

/** The field's label row — 10-12px type, so .88 on the ladder. */
export function FieldLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: ink('textSmall') }}>
        {children}
      </span>
      {trailing}
    </div>
  )
}

/**
 * A chip on the field — the streak on Home, the phase on Exercise.
 * Fill at the hairline rung, text solid: the handoff puts every small glyph on
 * solid ink, and a chip's label is small by definition.
 */
export function FieldChip({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: ink('hairline'), color: 'var(--field-ink)' }}
    >
      {children}
    </span>
  )
}

/**
 * The field's call to action. "The CTA inverts: background: ink; color: field.
 * No halo — it doesn't need one."
 */
export function FieldCta({ children, onClick, disabled }: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full font-bold disabled:opacity-60"
      style={{
        height: 56,
        borderRadius: 14,
        background: 'var(--field-ink)',
        color: 'var(--field)',
      }}
    >
      {children}
    </button>
  )
}

/**
 * One outstanding item on Home's field.
 *
 * The square is a swatch, so it takes the fact's own colour where it has one
 * (protein is violet) and solid ink where it does not (sets). Hairline between
 * rows, never a border box.
 */
export function FieldListRow({ swatch, label, figure, first }: {
  swatch?: string
  label: string
  figure: string
  first?: boolean
}) {
  return (
    <div
      className="flex items-center justify-between gap-3"
      style={{
        padding: '11px 0',
        borderTop: first ? undefined : `1px solid ${ink('hairline')}`,
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="shrink-0"
          style={{ width: 9, height: 9, background: swatch ?? 'var(--field-ink)' }}
        />
        <span className="truncate text-[14.5px] font-semibold" style={{ color: ink('text') }}>{label}</span>
      </span>
      <span className="shrink-0 font-mono text-[13px] font-bold" style={{ color: 'var(--field-ink)' }}>
        {figure}
      </span>
    </div>
  )
}

export { FIELD_INK }
export type { FieldArc }
