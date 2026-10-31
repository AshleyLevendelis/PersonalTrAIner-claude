import type * as React from 'react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ChevronRight, Flame } from 'lucide-react'
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
  trailing,
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
  /** On the row itself, beside the trigger (30 Oct 2026): "Feeling tight?", which changes this warm-up. */
  trailing?: React.ReactNode
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
    // ONE HAIRLINE ROW (tab polish, Exercise 2a, 31 Oct 2026): a flame, "Warm-up"
    // over what is in it, "Feeling tight?" on the row it changes, and a
    // chevron. No "done" tick: nothing records a warm-up as done, and a tick
    // the app cannot back would claim something it does not know.
    <Collapsible open={open} onOpenChange={onToggle} className="border-y border-[color:var(--hairline)]" data-testid="warmup-section">
      <div className="flex min-h-[52px] items-center gap-3 px-1">
      <CollapsibleTrigger className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 text-left">
        <Flame className="size-4 shrink-0 text-text-tertiary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-medium text-foreground">Warm-up</span>
          <span className="block truncate text-[0.71875rem] text-muted-foreground" data-testid="warmup-badge">{warmupBadgeText(planMoves, totalMinutes, extra.length, extraMinutes)}</span>
        </span>
      </CollapsibleTrigger>
      {trailing && <div className="shrink-0">{trailing}</div>}
      <ChevronRight aria-hidden onClick={onToggle} className={`size-3.5 shrink-0 cursor-pointer text-muted-foreground transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
      </div>
      <CollapsibleContent className="px-1 pb-3 space-y-3">
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
