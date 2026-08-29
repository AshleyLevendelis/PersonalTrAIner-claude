import { FIELD_INK, inkAlpha } from '@/lib/field-ink'

// ---------------------------------------------------------------------------
// The field's ring (handoff v2 §1, "The ring").
//
// "Every field carries one, drawn from real data." Arcs are computed from the
// value passed in — the handoff's "Never eyeball them" is enforced by there
// being no way to pass a dasharray.
//
// Two placements, and they mean different things:
//   - AMBIENT (Home, Exercise): bleeds off the top-right corner, decorative
//     weight, pointer-events:none. It is atmosphere that happens to be true.
//   - INLINE (Nutrition): in flow at 130px, "because it's an instrument you
//     read" — the five-ring meter is the point of that field.
//
// A coloured arc keeps its own token colour and gets a 3px ink keyline behind
// it, which is what lets a light hue survive a mint ground. The handoff is
// explicit that darkening the hues instead was tried and "goes muddy".
// ---------------------------------------------------------------------------

export interface FieldArc {
  /** 0..1. Clamped — a ledger can exceed its target and the arc must not wrap. */
  value: number
  radius: number
  width: number
  /** A token like 'var(--chart-2)'. Omit for the headline arc, which is solid ink. */
  color?: string
  label: string
}

const VIEW = 200
const CENTRE = VIEW / 2

function Arc({ arc }: { arc: FieldArc }) {
  const v = Math.max(0, Math.min(1, arc.value))
  const circumference = 2 * Math.PI * arc.radius
  const dash = `${circumference * v} ${circumference}`
  const isHeadline = !arc.color
  return (
    <g transform={`rotate(-90 ${CENTRE} ${CENTRE})`}>
      {/* track */}
      <circle
        cx={CENTRE} cy={CENTRE} r={arc.radius} fill="none"
        stroke={inkAlpha(FIELD_INK.ringTrack)} strokeWidth={arc.width}
      />
      {/* the keyline: same geometry, 3px wider, behind. Only a coloured arc
          needs it — the headline is already ink. */}
      {!isHeadline && (
        <circle
          cx={CENTRE} cy={CENTRE} r={arc.radius} fill="none"
          stroke={inkAlpha(FIELD_INK.keyline)} strokeWidth={arc.width + 3}
          strokeDasharray={dash} strokeLinecap="round"
        />
      )}
      <circle
        cx={CENTRE} cy={CENTRE} r={arc.radius} fill="none"
        stroke={isHeadline ? 'var(--field-ink)' : arc.color}
        strokeWidth={arc.width} strokeDasharray={dash} strokeLinecap="round"
      />
    </g>
  )
}

export function FieldRing({ arcs, placement, size }: {
  arcs: FieldArc[]
  placement: 'ambient' | 'inline'
  /** Inline only. Ambient is fixed at the handoff's 430px bleed. */
  size?: number
}) {
  const px = placement === 'ambient' ? 430 : (size ?? 130)
  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={px}
      height={px}
      aria-hidden
      className={placement === 'ambient' ? 'pointer-events-none absolute' : 'shrink-0'}
      style={placement === 'ambient' ? { top: -96, right: -168 } : undefined}
    >
      {arcs.map(a => <Arc key={a.label} arc={a} />)}
    </svg>
  )
}
