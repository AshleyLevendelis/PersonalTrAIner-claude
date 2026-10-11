import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ChevronDown, Thermometer } from 'lucide-react'
import { normalizeWarmup, warmupBadgeText } from '@/lib/session-derive'
import type { WorkoutDay } from '@/lib/types'
import type { WarmupItem } from '@/lib/warmup'

// ---------------------------------------------------------------------------
// Rebuilt per LAYOUT-DESIGN.md §1.5: General + Mobility + coach_note only.
// The percentage ramp block is GONE — the per-exercise kg RampStrip (§1.6.2)
// is the sole surface for ramp data now, never collapsible. No auto-expand
// either: that existed only because ramps used to live here; the safety
// story rests on RampStrip being permanently visible on the row, not on
// this section being open. Counted label so a collapsed section states
// what's inside before it's opened.
// ---------------------------------------------------------------------------

export function WarmupSection({
  warmup,
  open,
  onToggle,
  extra = [],
  extraNote,
  extraCaveat,
}: {
  warmup: WorkoutDay['warmup']
  open: boolean
  onToggle: () => void
  /**
   * Drills added for what she said felt tight THIS MORNING — computed here,
   * never stored on the plan. Separate from `warmup.mobility` on purpose: the
   * plan's mobility is what the session needs and is the same every time that
   * session comes round; these are about today and vanish when she clears them.
   */
  extra?: WarmupItem[]
  /** "Added for the hips you said felt tight" — why these are here. */
  extraNote?: string | null
  /** What it could NOT do, said out loud rather than swallowed. */
  extraCaveat?: string | null
}) {
  // Defensive against legacy/partial warmup shapes (a mesocycle_weeks row
  // written before a WarmupBlock field existed, or hand-edited data) — see
  // normalizeWarmup's own doc comment. Anything not cleanly renderable
  // degrades to "render nothing" here, same as the original `!warmup` guard.
  const normalized = normalizeWarmup(warmup)
  if (!normalized) return null
  const { general, mobility, rampCount, totalMinutes, coachNote } = normalized
  // rampCount isn't rendered in this section's body (RampStrip on the
  // focused exercise row is the sole surface for ramp data) but its set
  // time is already folded into totalMinutes, so it must count here too —
  // otherwise "1 move" next to "~10 min" reads as a bug, not a ramp.
  // THE COUNT ON THE CLOSED SECTION HAS TO INCLUDE THEM. She adds three drills
  // and the badge still says 4 moves would read as the answer not landing —
  // which is the shape of defect this repo keeps paying for.
  //
  // AND IT SAYS WHICH OF THEM ARE TODAY'S (test log L17). The programme view
  // shows this same warm-up without the drills, so "7 moves · ~10 min" here
  // against "4 moves · ~6 min" there read as the two screens disagreeing about
  // one warm-up. They are counted, and they are named: warmupBadgeText.
  const planMoves = general.length + mobility.length + rampCount
  const extraMinutes = Math.round(extra.reduce((n, e) => n + e.duration_seconds, 0) / 60)

  return (
    // ONE ROW, CLOSED (design handoff 2c, 10 Oct 2026): 48px on the raised
    // fill, "Warm-up · what's in it", and the chevron opens all of it. No
    // "done" tick: nothing records a warm-up as done, and a tick the app
    // cannot back would claim something it does not know.
    <Collapsible open={open} onOpenChange={onToggle} className="rounded-[14px]" style={{ background: 'var(--surface-raised)' }}>
      <CollapsibleTrigger className="flex min-h-12 w-full items-center justify-between gap-2 px-3.5 text-left">
        <span className="flex min-w-0 items-center gap-2 text-[0.875rem] font-medium text-foreground">
          <Thermometer className="size-4 shrink-0 text-primary-text" aria-hidden />
          Warm-up
          <span className="truncate text-[0.8125rem] font-normal text-muted-foreground" data-testid="warmup-badge">· {warmupBadgeText(planMoves, totalMinutes, extra.length, extraMinutes)}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-3">
        {/* FIRST, because its own line says "do these first" and the feature puts them at the
            front of today's warm-up; it was drawn third, after General and Mobility (user test #24). */}
        {extra.length > 0 && (
          <div className="space-y-1" data-testid="warmup-tightness">
            <p className="text-[0.625rem] uppercase tracking-wider text-primary-text font-medium">For what feels tight</p>
            {extra.map((item, i) => (
              <div key={`tight-${i}`} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
            {extraNote && <p className="text-[0.6875rem] text-muted-foreground">{extraNote}</p>}
          </div>
        )}
        {extra.length === 0 && extraNote && (
          <p className="text-[0.6875rem] text-muted-foreground" data-testid="warmup-tightness-note">{extraNote}</p>
        )}
        {general.length > 0 && (
          <div className="space-y-1">
            <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground font-medium">General</p>
            {general.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
          </div>
        )}
        {mobility.length > 0 && (
          <div className="space-y-1">
            <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground font-medium">Mobility</p>
            {mobility.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
          </div>
        )}
        {extraCaveat && (
          <p className="text-[0.6875rem] text-muted-foreground" data-testid="warmup-tightness-caveat">{extraCaveat}</p>
        )}
        {coachNote && (
          <p className="text-[0.6875rem] text-muted-foreground/80 italic">{coachNote}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
