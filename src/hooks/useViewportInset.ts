import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §3.6/§3.8/§7.6 (prerequisite #8) — net-new: nothing reads
// visualViewport today. iOS Safari resizes the visual viewport but NOT the
// layout viewport when the soft keyboard opens, so a `position: fixed`
// element (BottomDock) stays anchored to the bottom of the layout viewport
// and ends up hidden under the keyboard instead of riding above it. This
// hook is the single source for "how much of the bottom is currently
// covered" so any fixed-position UI can offset itself, and for "is the
// keyboard up at all" so BottomDock/BottomTabBar can collapse/hide per the
// §3.6 state table.
//
// isKeyboardOpen is gated primarily on a focused text input, NOT on the
// visualViewport/innerHeight delta alone — that delta also opens up for
// reasons that have nothing to do with a soft keyboard (mobile browser
// chrome collapsing on scroll, some in-app browsers, and — confirmed
// directly — headless/automation viewport emulation, where the two numbers
// simply never agree even with nothing focused). A focused input is the
// actual precondition for a soft keyboard to exist at all; the viewport
// delta is kept only as corroboration once that's true, both to size the
// offset and to avoid collapsing for a focused input paired with a
// hardware/Bluetooth keyboard (input focused, but no on-screen keyboard
// ever opens, so the delta stays ~0).
// ---------------------------------------------------------------------------

const KEYBOARD_OPEN_THRESHOLD_PX = 100

const TEXT_INPUT_TYPES = new Set([
  'text', 'number', 'email', 'tel', 'url', 'password', 'search',
  'date', 'datetime-local', 'month', 'time', 'week',
])

function isTextInputElement(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type)
  return (el as HTMLElement).isContentEditable === true
}

export function useViewportInset(): { insetPx: number; isKeyboardOpen: boolean } {
  const [insetPx, setInsetPx] = useState(0)
  const [isInputFocused, setIsInputFocused] = useState(() => isTextInputElement(document.activeElement))

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

  useEffect(() => {
    // By the time either event fires, document.activeElement already
    // reflects the new focus target (or <body> if focus left the page) —
    // one handler covering both focusin/focusout avoids a focus-to-focus
    // flicker between reading a stale "blurred" state and the new element.
    const onFocusChange = () => setIsInputFocused(isTextInputElement(document.activeElement))
    document.addEventListener('focusin', onFocusChange)
    document.addEventListener('focusout', onFocusChange)
    return () => {
      document.removeEventListener('focusin', onFocusChange)
      document.removeEventListener('focusout', onFocusChange)
    }
  }, [])

  const isKeyboardOpen = isInputFocused && insetPx > KEYBOARD_OPEN_THRESHOLD_PX

  return { insetPx, isKeyboardOpen }
}
