import { Thermometer, Check } from 'lucide-react'
import type { RampDisplay } from '@/lib/session-derive'

// ---------------------------------------------------------------------------
// The single, canonical rendering of a ramp block (LAYOUT-DESIGN.md §1.6.2 /
// §7.5) — safety-critical, never collapsible, shared by every surface that
// shows an exercise row (today view, peek, program browse). Three shapes:
// kg (the common case), bodyweight (rep-only, closes the gap the deleted
// warm-up percentage block used to cover), and stale (the ramp exists but
// no longer names this exercise — a generic instruction rather than
// nothing).
//
// TICKABLE ON TODAY'S SESSION, AND ONLY THERE (7 Sep 2026). Ashley: "theres
// no way to log the ramp up weights." Five steps were printed with weights
// and reps and none of them could be marked, so a warm-up you were three sets
// into looked exactly like one you had not started.
//
// A PLACE-KEEPER, NOT A LOG — her ruling once the options were put to her.
// Nothing is written to the database: every read in this app filters
// is_warmup out of volume, PRs, progression and history, so a stored ramp set
// would change no number anyone can see. The tick survives a tab switch
// (useActiveSession's rampTicks, beside the set drafts) because a phone gets
// put down between sets, and expires with the day.
//
// Browse and peek surfaces pass no handler and get exactly what they had
// before: plain text. A tick there would be a control that remembers a set
// you have not done yet, on a day that is not today.
// ---------------------------------------------------------------------------

export function RampStrip({
  ramp,
  ticked,
  onToggle,
}: {
  ramp: RampDisplay
  /** Ramp set numbers already marked done. Omitted on read-only surfaces. */
  ticked?: number[]
  /** Omitted on read-only surfaces — without it the steps render as text, not buttons. */
  onToggle?: (setNumber: number) => void
}) {
  if (ramp.kind === 'stale') {
    return (
      <div className="flex items-center gap-1 mt-0.5 rounded border border-muted-foreground/30 bg-muted/30 px-1.5 py-1">
        <Thermometer className="size-2.5 text-muted-foreground shrink-0" />
        <span className="text-[0.625rem] text-muted-foreground">Build up in 3-4 lighter sets before set 1</span>
      </div>
    )
  }

  const interactive = typeof onToggle === 'function'
  const isTicked = (n: number) => (ticked ?? []).includes(n)
  const label = (s: { kg?: number; reps: number | string }) =>
    ramp.kind === 'kg' ? `${s.kg}kg×${s.reps}` : `×${s.reps}`

  return (
    <div
      className="flex items-center gap-1 flex-wrap mt-0.5 rounded-[10px] border border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] px-1.5 py-1"
      title={interactive
        ? "Ramp-up sets — build to your working weight before the sets below. Tap one to mark it done; they don't count toward working volume and aren't saved to your history."
        : "Ramp-up sets — build to your working weight before the sets below. These don't count toward working volume."}
    >
      <Thermometer className="size-2.5 text-[color:var(--role-warn)] shrink-0" />
      <span className="ds-label-compact text-[color:var(--role-warn-text)]">Ramp:</span>
      {ramp.sets.map((s, i) => {
        const text = label(s)
        const done = isTicked(s.setNumber)
        if (!interactive) {
          return (
            <span key={s.setNumber} className="text-[0.625rem] text-[color:var(--role-warn-text)]">
              {i > 0 && <span className="text-[color:var(--role-warn)]">·</span>} {text}
            </span>
          )
        }
        return (
          <button
            key={s.setNumber}
            type="button"
            onClick={() => onToggle!(s.setNumber)}
            aria-pressed={done}
            aria-label={done ? `${text} warm-up, done — tap to unmark` : `${text} warm-up — tap to mark done`}
            className={`hit-slop-44 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[0.625rem] transition-opacity ${
              done
                ? 'text-[color:var(--role-warn-text)] opacity-50 line-through decoration-[color:var(--role-warn)]'
                : 'text-[color:var(--role-warn-text)]'
            }`}
          >
            {done && <Check className="size-2.5 shrink-0" aria-hidden />}
            {text}
          </button>
        )
      })}
      {ramp.kind === 'bodyweight' && (
        <span className="text-[0.5625rem] italic text-muted-foreground/60">→ bodyweight</span>
      )}
    </div>
  )
}
