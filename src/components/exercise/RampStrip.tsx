import { Thermometer } from 'lucide-react'
import type { RampDisplay } from '@/lib/session-derive'

// ---------------------------------------------------------------------------
// The single, canonical rendering of a ramp block (LAYOUT-DESIGN.md §1.6.2 /
// §7.5) — safety-critical, never collapsible. Three shapes: kg (the common
// case), bodyweight (rep-only, closes the gap the deleted warm-up percentage
// block used to cover), and stale (the ramp exists but no longer names this
// exercise — a generic instruction rather than nothing).
//
// READ-ONLY EVERYWHERE, SINCE 17 Sep 2026. It used to be tickable on today's
// session: Ashley's 7 Sep ruling made the steps place-keepers you could mark
// off, and nothing was ever written down. On 17 Sep, standing in the gym, she
// reversed that from three options — the build-up is a box per set now, in
// the grid, logged like any other set. This component is what the surfaces
// that only SHOW a day render: browse and peek, where a tick would have
// marked a set on a day nobody is training.
//
// The tick machinery went with it — the `ticked`/`onToggle` props, the
// button branch, and rampTicks in the session record. Leaving them would have
// been worse than untidy: three gate checks asserted they existed, so the dead
// code would have been enforced.
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

  const label = (s: { kg?: number; reps: number | string }) =>
    ramp.kind === 'kg' ? `${s.kg}kg×${s.reps}` : `×${s.reps}`

  return (
    <div
      className="flex items-center gap-1 flex-wrap mt-0.5 rounded-[10px] border border-[color:var(--ramp-border)] bg-[color:var(--ramp-bg)] px-1.5 py-1"
      title="Ramp-up sets — build to your working weight before the sets below. These don't count toward working volume."
    >
      <Thermometer className="size-2.5 text-[color:var(--ramp-label)] shrink-0" />
      {/* "Ramp up first", not "Ramp": the order is the instruction. Until
          10 Sep 2026 the only words saying this came before the working sets
          lived in a title attribute, which a phone never shows, and the block
          was drawn BELOW the working-set chips — so it read as something to
          do afterwards (Ashley: "do you do the prescribed weights and then
          ramp up or start ramp up from the start"). */}
      <span className="ds-label-compact text-[color:var(--ramp-label)]">Ramp up first:</span>
      {ramp.sets.map((s, i) => (
        <span key={s.setNumber} className="text-[0.625rem] text-[color:var(--ramp-label)]">
          {i > 0 && <span className="text-[color:var(--ramp)]">·</span>} {label(s)}
        </span>
      ))}
      {ramp.kind === 'bodyweight' && (
        <span className="text-[0.5625rem] italic text-muted-foreground/60">→ bodyweight</span>
      )}
      {/* NO LONGER CONDITIONAL. This line used to render only on the tickable
          surface, so removing the ticks would have taken the sentence that
          states the ORDER off the only screen still showing this block —
          silently undoing Ashley's 10 Sep ruling that the order is said on
          screen and not in a tooltip. */}
      {ramp.kind === 'kg' && (
        <span className="text-[0.5625rem] italic text-[color:var(--ramp-label)]/70">→ then set 1</span>
      )}
    </div>
  )
}
