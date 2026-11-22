import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

// ---------------------------------------------------------------------------
// SWIPE RIGHT OR PRESS AND HOLD A MESSAGE (his ruling 22 Nov 2026, "1, build it": WhatsApp's way).
//
// - Swipe a bubble to the right past SWIPE_AT and let go: reply to it. The bubble follows the finger (never further
//   than MAX) and springs back; a reply arrow fades in beside it as it travels.
// - Hold it still for HOLD_MS: the small menu (Reply, Copy). A right click does the same on a computer.
// - A vertical move is the page scrolling: the bubble lets go at once (touch-action: pan-y keeps the scroll the
//   browser's). A press on a button or a link inside the bubble (Listen, Report, Apply, a video) is that control's.
//
// Plain DOM on the one bubble, no React state per move, so a swipe never redraws the chat. THE GESTURE IN PROGRESS
// LIVES HERE, NOT IN THE HANDLERS: the chat redraws for its own reasons mid-swipe (a scroll, a clock) and every redraw
// hands the bubble new handlers; a gesture kept in them was dropped by the first redraw (found by verify:chat-reply,
// 22 Nov 2026: the second swipe of a session did nothing). One finger, one gesture, so one slot.
// ---------------------------------------------------------------------------

export const SWIPE_AT = 56
export const MAX_SWIPE = 72
export const HOLD_MS = 450
const SLOP = 10

const CONTROL = 'button, a, input, textarea, select, [role="button"], [role="menuitem"]'

interface Gesture {
  id: number
  x: number
  y: number
  el: HTMLElement
  timer: ReturnType<typeof setTimeout> | null
  dragging: boolean
  held: boolean
  onReply: () => void
  onMenu: () => void
}

let g: Gesture | null = null
const stop = () => {
  if (g?.timer) clearTimeout(g.timer)
  if (g) settle(g.el)
  g = null
}

function settle(el: HTMLElement) {
  el.style.transition = 'transform 160ms ease-out'
  el.style.transform = ''
  el.style.setProperty('--swipe-p', '0')
  delete el.dataset.swipeArmed
}

export function replyGestures(onReply: () => void, onMenu: () => void) {
  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest(CONTROL)) return
      stop()
      const el = e.currentTarget
      const started: Gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, el, timer: null, dragging: false, held: false, onReply, onMenu }
      started.timer = setTimeout(() => {
        if (g !== started || started.dragging) return
        started.held = true
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15)
        started.onMenu()
      }, HOLD_MS)
      g = started
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      if (!g || e.pointerId !== g.id || g.held) return
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (!g.dragging) {
        if (Math.abs(dx) <= SLOP && Math.abs(dy) <= SLOP) return
        if (g.timer) clearTimeout(g.timer)
        g.timer = null
        // Only a move that is clearly sideways AND to the right is a swipe; anything else lets go.
        if (dx > SLOP && Math.abs(dx) > Math.abs(dy) * 1.5) {
          g.dragging = true
          try { g.el.setPointerCapture(e.pointerId) } catch { /* a pointer the page no longer holds */ }
        } else {
          stop()
          return
        }
      }
      const t = Math.min(MAX_SWIPE, Math.max(0, dx))
      g.el.style.transition = 'none'
      g.el.style.transform = `translateX(${t}px)`
      g.el.style.setProperty('--swipe-p', String(Math.min(1, t / SWIPE_AT)))
      if (t >= SWIPE_AT) g.el.dataset.swipeArmed = '1'
      else delete g.el.dataset.swipeArmed
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      if (!g || e.pointerId !== g.id) return
      const swiped = g.dragging && e.clientX - g.x >= SWIPE_AT
      const reply = g.onReply
      stop()
      if (swiped) reply()
    },
    onPointerCancel() {
      stop()
    },
    onContextMenu(e: ReactMouseEvent<HTMLElement>) {
      if ((e.target as HTMLElement).closest(CONTROL)) return
      // A held finger on a phone also raises this: one menu, never the phone's own copy bar over it.
      e.preventDefault()
      onMenu()
    },
  }
}
