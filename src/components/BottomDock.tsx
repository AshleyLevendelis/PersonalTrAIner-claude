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
import { useViewportInset } from '@/hooks/useViewportInset'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(Math.abs(ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Best-effort chime, played once per rest deadline. iOS suspends an
 * AudioContext created without a user gesture, so this can silently no-op —
 * that is the correct, honest behaviour (§3.8): the visual overrun state is
 * the only signal this design promises. The gesture-unlock ladder (reusing
 * one context across the session, resuming on every set-log tap) lands with
 * active mode's Start entry point in P3; this is a standalone best-effort
 * attempt until then.
 */
function playChime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => ctx.close(), 600)
  } catch {
    // Silent fallback — see doc comment above.
  }
  // Android only — a permanent no-op on iOS Safari at every version.
  if (navigator.vibrate) navigator.vibrate([200, 100, 200])
}

export function BottomDock() {
  const { restEndsAt, restLabel, restRemainingMs, adjustRest, dismissRest } = useActiveSession()
  const { insetPx, isKeyboardOpen } = useViewportInset()
  const chimedForRef = useRef<string | null>(null)

  useEffect(() => {
    if (!restEndsAt) {
      chimedForRef.current = null
      return
    }
    if (restRemainingMs != null && restRemainingMs <= 0 && chimedForRef.current !== restEndsAt) {
      chimedForRef.current = restEndsAt
      playChime()
    }
  }, [restEndsAt, restRemainingMs])

  if (!restEndsAt || restRemainingMs == null) return null

  const isOverrun = restRemainingMs <= 0
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

  // Keyboard up (a set input is focused): collapse to one thin line — the
  // full two-row card would occlude the very row the user is editing (§3.6).
  if (isKeyboardOpen) {
    return (
      <div className="fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96" style={bottomStyle}>
        <div className="rounded-md border border-primary/30 bg-card/95 backdrop-blur-sm shadow-lg px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium tabular-nums">
          <Timer className="h-3 w-3 text-primary shrink-0" />
          {isOverrun ? `Rest finished ${formatDuration(restRemainingMs)} ago` : formatDuration(restRemainingMs)}
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
                  Rest finished {formatDuration(restRemainingMs)} ago
                </p>
              ) : (
                <p className="text-sm font-medium tabular-nums">
                  {formatDuration(restRemainingMs)}
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
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={dismissRest}>
              {isOverrun ? 'Dismiss' : 'Skip ▸'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
