import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §3.6/§3.8/§7.6 (prerequisite #8) — net-new: nothing reads
// visualViewport today. iOS Safari resizes the visual viewport but NOT the
// layout viewport when the soft keyboard opens, so a `position: fixed`
// element (BottomDock) stays anchored to the bottom of the layout viewport
// and ends up hidden under the keyboard instead of riding above it. This
// hook is the single source for "how much of the bottom is currently
// covered" so any fixed-position UI can offset itself, and for "is the
// keyboard up at all" so BottomDock can collapse to its one-thin-line state
// per the §3.6 state table.
// ---------------------------------------------------------------------------

const KEYBOARD_OPEN_THRESHOLD_PX = 100

export function useViewportInset(): { insetPx: number; isKeyboardOpen: boolean } {
  const [insetPx, setInsetPx] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setInsetPx(inset)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return { insetPx, isKeyboardOpen: insetPx > KEYBOARD_OPEN_THRESHOLD_PX }
}
