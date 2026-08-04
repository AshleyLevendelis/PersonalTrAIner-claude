import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Thermometer } from 'lucide-react'
import type { WorkoutDay } from '@/lib/types'

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
}: {
  warmup: WorkoutDay['warmup']
  open: boolean
  onToggle: () => void
}) {
  if (!warmup) return null
  const totalMinutes = Math.round(warmup.total_seconds / 60)
  const moveCount = warmup.general.length + warmup.mobility.length

  return (
    <Collapsible open={open} onOpenChange={onToggle} className="border-b border-border/30">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-accent/30 transition-colors">
        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Thermometer className="size-3.5 text-primary" />
          Warm-up
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{moveCount} moves · ~{totalMinutes} min</Badge>
        </span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3 space-y-3">
        {warmup.general.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">General</p>
            {warmup.general.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
          </div>
        )}
        {warmup.mobility.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Mobility</p>
            {warmup.mobility.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
          </div>
        )}
        {warmup.coach_note && (
          <p className="text-[11px] text-muted-foreground/80 italic">{warmup.coach_note}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
