import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// How tall the BottomDock currently is, in pixels — 0 when it isn't showing.
//
// This exists because BottomDock and the chat composer are BOTH `fixed` to the
// same baseline (TAB_BAR_HEIGHT_PX + safe-area), and the dock is z-50 against
// the composer's z-40. Mid-workout on the Chat tab that put the rest timer
// directly on top of the text input: the session chip clipped the placeholder,
// and a running rest timer hid the input completely. Found by Ashley on a real
// phone, mid-session.
//
// The height is MEASURED rather than declared as a constant because the dock
// has three shapes (rest card, standalone-timer chip, session chip) and the
// rest card's own height depends on whether the exercise name wraps — "0:20 ·
// rest · Neutral-Grip Dumbbell Press" wraps to two lines on a 375px screen. A
// constant would have been right for one shape and wrong for the others, and
// would drift the first time the dock's padding changed.
//
// One writer (BottomDock), any number of readers. Kept as its own context
// rather than folded into useActiveSession because the dock is also driven by
// useTimers — neither existing context owns "is the dock on screen".
// ---------------------------------------------------------------------------

interface BottomDockHeightValue {
  /** Measured dock height in px, including its own gap above the tab bar. 0 when hidden. */
  dockHeightPx: number
  /** Called by BottomDock only. */
  reportDockHeight: (px: number) => void
}

const BottomDockHeightContext = createContext<BottomDockHeightValue>({
  dockHeightPx: 0,
  reportDockHeight: () => {},
})

export function BottomDockHeightProvider({ children }: { children: ReactNode }) {
  const [dockHeightPx, setDockHeightPx] = useState(0)

  // Identity-stable so BottomDock's measuring effect doesn't re-run every
  // render, and only sets state on a real change — a ResizeObserver firing at
  // the same height must not loop.
  const reportDockHeight = useCallback((px: number) => {
    setDockHeightPx(prev => (Math.abs(prev - px) < 1 ? prev : px))
  }, [])

  const value = useMemo(() => ({ dockHeightPx, reportDockHeight }), [dockHeightPx, reportDockHeight])

  return <BottomDockHeightContext.Provider value={value}>{children}</BottomDockHeightContext.Provider>
}

export function useBottomDockHeight(): BottomDockHeightValue {
  return useContext(BottomDockHeightContext)
}
