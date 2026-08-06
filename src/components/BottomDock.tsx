// ---------------------------------------------------------------------------
// Row A of the bottom region (LAYOUT-DESIGN.md §3.6/§3.8, D2). P1 ships row A
// only — the rest timer — mounted once at app root so it survives tab
// switches and reloads (the old RestTimer lived inside ExercisePlan and was
// destroyed by both). Row B (the primary action) has no home until P2's
// TodayPanel exists.
//
// Controls are `-30s / +30s / Skip`, no pause — a persisted deadline makes
// pause incoherent (RestTimer's tick-counting model, which pause required,
// is exactly what made backgrounding/reload/re-render corrupt the
// countdown). Overrun renders "Rest finished Ns ago", never a frozen 0:00.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Timer } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useTimers } from '@/hooks/useTimers'
import { useViewportInset } from '@/hooks/useViewportInset'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'
import { tabHash } from '@/lib/app-route'
import { playTimerCue } from '@/lib/timer-cues'

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(Math.abs(ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}


export function BottomDock() {
  const { restEndsAt, restLabel, restRemainingMs, restTargetSetNumber, adjustRest, dismissRest, requestSetFocus } = useActiveSession()
  const timers = useTimers()
  const { insetPx, isKeyboardOpen } = useViewportInset()
  const chimedForRef = useRef<string | null>(null)

  // "Start next set" — the dock is mounted outside the exercise list's
  // subtree, so this routes the request through the shared session context
  // rather than a prop; ExerciseRow picks it up, force-expands, and focuses
  // the target set's input once it has painted. Navigates to the Exercise
  // tab first if the user is elsewhere.
  const handleStartNextSet = () => {
    if (restTargetSetNumber != null && restLabel) {
      requestSetFocus({ exerciseName: restLabel, setNumber: restTargetSetNumber })
    }
    dismissRest()
    if (!window.location.hash.startsWith('#/tab/exercise')) {
      window.location.hash = tabHash('exercise')
    }
  }

  useEffect(() => {
    if (!restEndsAt) {
      chimedForRef.current = null
      return
    }
    if (restRemainingMs != null && restRemainingMs <= 0 && chimedForRef.current !== restEndsAt) {
      chimedForRef.current = restEndsAt
      playTimerCue('rest-complete')
    }
  }, [restEndsAt, restRemainingMs])

  const hasRest = !!restEndsAt && restRemainingMs != null
  const hasStandaloneTimer = !hasRest && timers.isActive

  if (!hasRest && !hasStandaloneTimer) return null

  const restMs = restRemainingMs ?? 0
  const isOverrun = hasRest && restMs <= 0
  // Keyboard open: ride above it instead of sliding under it — iOS Safari
  // doesn't resize the layout viewport this `fixed` element is anchored to.
  // Keyboard closed: sit directly above the bottom tab bar (which hides
  // itself while the keyboard is open, so these two cases never overlap).
  // Gated on isKeyboardOpen, not a raw `insetPx > 0` check — a few stray
  // pixels of viewport delta (scroll-induced browser-chrome collapse, or
  // similar noise with nothing actually focused) must not float the dock
  // up off its tab-bar baseline; see useViewportInset's own doc comment.
  const bottomStyle = isKeyboardOpen
    ? { bottom: insetPx + 16 }
    : { bottom: `calc(${TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom) + 12px)` }

  // Standalone stopwatch/lap/round timer running with no rest active — a
  // compact chip, tap to reopen the Timers screen (wherever its Dialog is
  // mounted; requestScreenOpen is the cross-tree channel, same pattern as
  // useActiveSession's requestSetFocus). Rest always wins the dock (D2's
  // "one fixed element" rule) — this branch is unreachable while hasRest.
  if (hasStandaloneTimer) {
    const chipLabel = timers.mode === 'round'
      ? (timers.roundConfig
        ? `Round ${timers.currentRound}/${timers.roundConfig.rounds} · ${timers.currentPhase === 'work' ? 'Work' : 'Rest'} · ${formatDuration(timers.phaseRemainingMs ?? 0)}`
        : 'Round timer')
      : `${timers.mode === 'lap' ? 'Lap' : 'Stopwatch'} · ${formatDuration(timers.elapsedMs)}`
    return (
      <div className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
        <button
          type="button"
          onClick={timers.requestScreenOpen}
          className="w-full rounded-md border border-primary/30 bg-card/95 backdrop-blur-sm shadow-lg px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium tabular-nums text-left"
        >
          <Timer className="h-3 w-3 text-primary shrink-0" />
          {chipLabel}
        </button>
      </div>
    )
  }

  // Keyboard up (a set input is focused): collapse to one thin line — the
  // full two-row card would occlude the very row the user is editing (§3.6).
  if (isKeyboardOpen) {
    return (
      <div className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
        <div className="rounded-md border border-primary/30 bg-card/95 backdrop-blur-sm shadow-lg px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium tabular-nums">
          <Timer className="h-3 w-3 text-primary shrink-0" />
          {isOverrun
            ? (restTargetSetNumber != null ? `Rest complete — set ${restTargetSetNumber}` : 'Rest complete')
            : formatDuration(restMs)}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
      <Card className="border-primary/30 bg-card/95 backdrop-blur-sm shadow-lg">
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Timer className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              {isOverrun ? (
                <p className="text-sm font-medium truncate">
                  {restTargetSetNumber != null
                    ? `Rest complete — ready for set ${restTargetSetNumber}?`
                    : 'Rest complete'}
                </p>
              ) : (
                <p className="text-sm font-medium tabular-nums">
                  {formatDuration(restMs)}
                  {restLabel && <span className="text-muted-foreground font-normal"> · Rest · {restLabel}</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isOverrun && (
              <>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => adjustRest(-30)}>
                  −30s
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => adjustRest(30)}>
                  +30s
                </Button>
              </>
            )}
            {isOverrun && restTargetSetNumber != null ? (
              <>
                <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleStartNextSet}>
                  Start next set ▸
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={dismissRest}>
                  Dismiss
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={dismissRest}>
                {isOverrun ? 'Dismiss' : 'Skip ▸'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
