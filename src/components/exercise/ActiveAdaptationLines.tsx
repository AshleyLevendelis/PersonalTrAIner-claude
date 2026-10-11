import { useState } from 'react'
import { describeActiveAdaptation, isAdaptationActive, type ActiveAdaptationLike } from '@/lib/effective-constraints'
import { EQUIPMENT_OPTIONS } from '@/lib/picker-options'
import { getAppNow } from '@/lib/dev-clock'

// ---------------------------------------------------------------------------
// "Easing off your knees until 22 Oct · End now"
//
// Test log M25, 9 Oct 2026: a temporary change to the plan was shown nowhere
// once its card had scrolled away. Profile is where the tester looked for it;
// the Exercise tab is where it matters. The plan's owner question 2, built as
// its recommended answer (both) and recorded as decided unprompted.
//
// ONE COMPONENT ON BOTH SCREENS, so the sentence and the button cannot drift.
// "End now" is the coach's own promise ("tell me anytime to end it early")
// given something to press.
// ---------------------------------------------------------------------------

interface ActiveAdaptationLinesProps {
  adaptations: (ActiveAdaptationLike & { id: string })[]
  profileId?: string
  /** The one being ended right now, if any — its button waits. */
  endingId?: string | null
  /** Ends it. Resolves to a sentence when it could not, or null when it did. */
  onEnd?: (id: string) => Promise<string | null>
  className?: string
}

export function ActiveAdaptationLines({ adaptations, profileId, endingId, onEnd, className }: ActiveAdaptationLinesProps) {
  const [problem, setProblem] = useState<string | null>(null)
  const now = getAppNow(profileId)
  const live = adaptations.filter(a => isAdaptationActive(a, now))
  if (live.length === 0) return null
  const label = (tier: string) => EQUIPMENT_OPTIONS.find(o => o.value === tier)?.label ?? tier.replace(/_/g, ' ')

  return (
    <div className={className} data-testid="active-adaptations">
      {live.map(a => (
        <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-1 text-sm" data-testid="active-adaptation">
          <span className="min-w-0 text-foreground">{describeActiveAdaptation(a, label)}</span>
          {onEnd && (
            <button
              type="button"
              className="min-h-11 shrink-0 px-2 font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
              disabled={!!endingId}
              data-testid="end-adaptation"
              onClick={async () => { setProblem(null); setProblem(await onEnd(a.id)) }}
            >
              {endingId === a.id ? 'Ending…' : 'End now'}
            </button>
          )}
        </div>
      ))}
      {problem && <p className="mt-1 px-1 text-xs text-destructive" data-testid="end-adaptation-error">{problem}</p>}
    </div>
  )
}
