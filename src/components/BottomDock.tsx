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
import { useDeadlineTick } from '@/hooks/useDeadlineTick'
import { useTimers } from '@/hooks/useTimers'
import { useViewportInset } from '@/hooks/useViewportInset'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'
import { useBottomDockHeight } from '@/hooks/useBottomDockHeight'
import { tabHash } from '@/lib/app-route'
import { getAppNow } from '@/lib/dev-clock'
import { playTimerCue } from '@/lib/timer-cues'

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(Math.abs(ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}


export function BottomDock() {
  const { restEndsAt, restLabel, restRemainingMs, restTargetSetNumber, restTotalMs, adjustRest, dismissRest, requestSetFocus, profileId, status: sessionStatus, startedAtIso } = useActiveSession()
  const timers = useTimers()
  const { insetPx, isKeyboardOpen } = useViewportInset()
  const chimedForRef = useRef<string | null>(null)
  // Publish our real height so the chat composer can ride above us instead of
  // underneath — see useBottomDockHeight for why this is measured, not a
  // constant. Attached to whichever branch renders; only one ever does.
  const { reportDockHeight } = useBottomDockHeight()
  const dockRef = useRef<HTMLDivElement | null>(null)

  const hasRestForTick = !!restEndsAt && restRemainingMs != null
  const hasSessionIndicator = !hasRestForTick && !timers.isActive && sessionStatus === 'running'
  // Deadline-anchored count-UP, same tick source as the rest facade — must
  // be called unconditionally (Rules of Hooks), gated by the flag rather
  // than skipped when the session branch isn't reached.
  useDeadlineTick(hasSessionIndicator)

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

  const hasRest = hasRestForTick
  const hasStandaloneTimer = !hasRest && timers.isActive
  const dockVisible = hasRest || hasStandaloneTimer || hasSessionIndicator

  // Measure and publish, so the chat composer can offset above us. Observed
  // rather than measured once: the rest card grows a line when the exercise
  // name wraps, and the label changes mid-countdown. Reports 0 whenever the
  // dock isn't rendered so the composer drops straight back down.
  useEffect(() => {
    if (!dockVisible) {
      reportDockHeight(0)
      return
    }
    const el = dockRef.current
    if (!el) return
    const publish = () => reportDockHeight(el.getBoundingClientRect().height)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  }, [dockVisible, reportDockHeight])

  // Unmounting must not strand a stale offset — without this the composer
  // would stay pushed up after a session ends.
  useEffect(() => () => reportDockHeight(0), [reportDockHeight])

  if (!dockVisible) return null

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
      <div ref={dockRef} className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
        <button
          type="button"
          onClick={timers.requestScreenOpen}
          className="w-full rounded-xl bg-card/95 glow-mint-box backdrop-blur-sm shadow-lg px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium tabular-nums text-left"
        >
          <Timer className="h-3 w-3 text-primary shrink-0" />
          {chipLabel}
        </button>
      </div>
    )
  }

  // Row B, at last — a running session with neither rest nor a standalone
  // timer active. Lowest priority of the three (rest > standalone timer >
  // this), so it never disrupts either of the dock's proven states; it's
  // what's left showing once both fall away while a session is still open.
  // Tap navigates only (mirrors the standalone-timer chip) — Finish stays
  // singly-owned in TodayPanel's hero, no second entry point for it here.
  if (hasSessionIndicator) {
    const elapsedMs = startedAtIso ? getAppNow(profileId).getTime() - new Date(startedAtIso).getTime() : 0
    return (
      <div ref={dockRef} className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
        <button
          type="button"
          onClick={() => { if (!window.location.hash.startsWith('#/tab/exercise')) window.location.hash = tabHash('exercise') }}
          className="w-full rounded-xl bg-card/95 glow-mint-box backdrop-blur-sm shadow-lg px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium tabular-nums text-left"
        >
          <Timer className="h-3 w-3 text-primary shrink-0" />
          Session running · {formatDuration(elapsedMs)}
        </button>
      </div>
    )
  }

  // Keyboard up (a set input is focused): collapse to one thin line — the
  // full two-row card would occlude the very row the user is editing (§3.6).
  if (isKeyboardOpen) {
    return (
      <div ref={dockRef} className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
        <div className="rounded-xl bg-card/95 glow-mint-box backdrop-blur-sm shadow-lg px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium tabular-nums">
          <Timer className="h-3 w-3 text-primary shrink-0" />
          {isOverrun
            ? (restTargetSetNumber != null ? `Rest complete — set ${restTargetSetNumber}` : 'Rest complete')
            : formatDuration(restMs)}
        </div>
      </div>
    )
  }

  if (isOverrun) {
    return (
      <div ref={dockRef} className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
        <Card className="bg-card/95 backdrop-blur-sm shadow-lg">
          <div className="p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Timer className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-medium truncate">
                {restTargetSetNumber != null
                  ? `Rest complete — ready for set ${restTargetSetNumber}?`
                  : 'Rest complete'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {restTargetSetNumber != null ? (
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
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Turn 5: the rest timer takes over the dock while it runs — an inline
  // mint-gradient fill-bar (width = elapsed fraction) replaces the plain
  // text+button row, its own fill supplying the visual weight the
  // `border-primary/30` override used to (now redundant with the app-wide
  // borderless base).
  const fillFraction = restTotalMs ? Math.min(1, Math.max(0, 1 - restMs / restTotalMs)) : 0

  return (
    <div ref={dockRef} className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
      <div className="relative overflow-hidden rounded-[14px] bg-card/95 backdrop-blur-sm shadow-lg">
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 transition-[width] duration-1000 ease-linear"
          style={{ width: `${fillFraction * 100}%`, background: 'linear-gradient(90deg, rgba(var(--glow-rgb),.22), rgba(var(--glow-rgb),.32))' }}
        />
        <div className="relative p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium tabular-mono">
              {formatDuration(restMs)}
              {restLabel && <span className="text-muted-foreground font-normal not-italic font-sans"> · rest · {restLabel}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => adjustRest(30)}>
              +30s
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={dismissRest}>
              Skip ▸
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
