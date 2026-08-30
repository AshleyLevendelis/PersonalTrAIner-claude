import { Thermometer } from 'lucide-react'
import type { RampDisplay } from '@/lib/session-derive'

// ---------------------------------------------------------------------------
// The single, canonical rendering of a ramp block (LAYOUT-DESIGN.md §1.6.2 /
// §7.5) — safety-critical, never collapsible, shared by every surface that
// shows an exercise row (today view, peek, program browse). Three shapes:
// kg (the common case), bodyweight (rep-only, closes the gap the deleted
// warm-up percentage block used to cover), and stale (the ramp exists but
// no longer names this exercise — a generic instruction rather than
// nothing).
// ---------------------------------------------------------------------------

export function RampStrip({ ramp }: { ramp: RampDisplay }) {
  if (ramp.kind === 'stale') {
    return (
      <div className="flex items-center gap-1 mt-0.5 rounded border border-muted-foreground/30 bg-muted/30 px-1.5 py-1">
        <Thermometer className="size-2.5 text-muted-foreground shrink-0" />
        <span className="text-[0.625rem] text-muted-foreground">Build up in 3-4 lighter sets before set 1</span>
      </div>
    )
  }
  return (
    <div
      className="flex items-center gap-1 flex-wrap mt-0.5 rounded-[10px] border border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] px-1.5 py-1"
      title="Ramp-up sets — build to your working weight before the sets below. These don't count toward working volume."
    >
      <Thermometer className="size-2.5 text-[color:var(--role-warn)] shrink-0" />
      <span className="ds-label-compact text-[color:var(--role-warn-text)]">Ramp:</span>
      {ramp.kind === 'kg'
        ? ramp.sets.map((s, i) => (
            <span key={s.setNumber} className="text-[0.625rem] text-[color:var(--role-warn-text)]">
              {i > 0 && <span className="text-[color:var(--role-warn)]">·</span>} {s.kg}kg×{s.reps}
            </span>
          ))
        : ramp.sets.map((s, i) => (
            <span key={s.setNumber} className="text-[0.625rem] text-[color:var(--role-warn-text)]">
              {i > 0 && <span className="text-[color:var(--role-warn)]">·</span>} ×{s.reps}
            </span>
          ))}
      {ramp.kind === 'bodyweight' && (
        <span className="text-[0.5625rem] italic text-muted-foreground/60">→ bodyweight</span>
      )}
    </div>
  )
}
