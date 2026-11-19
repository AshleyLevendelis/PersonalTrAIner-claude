// ---------------------------------------------------------------------------
// THE PHONE'S BACK CLOSES WHAT IS OPEN ON TOP (the Profile walk, 18 Nov 2026, finding P3).
//
// Profile and each of its sheets are drawn over the app, not at an address of their own, so the phone's Back (the
// button on Android, the edge swipe on an iPhone) knew nothing of them: with Profile open it went to the tab before,
// or left the app. Each open layer now has one step in the phone's history, and Back closes the top layer.
//
// THE RULE THAT SHAPES IT: THIS NEVER GOES BACK ON ITS OWN WHEN A LAYER IS CLOSED BY ITS OWN BUTTON. Going back is
// not instant, and Profile often closes in the same tap that sends him somewhere ("Open the list", a rebuild offer):
// a back fired at the close would land AFTER that move and undo it. So a layer closed by its own button leaves its
// step behind, spent. A spent step is never stacked on (the next layer to open takes it over), and a Back that only
// steps off one, or lands on one, is carried through, so he never presses Back and sees nothing happen.
//
// The stack is a small class over "something shaped like window.history", so the gate can drive it with a fake and
// every order of open, close and Back; the hook below binds one to the real window.
// ---------------------------------------------------------------------------
import { useEffect, useRef } from 'react'

/** The part of window.history this needs. */
export interface BackHistory {
  readonly state: unknown
  pushState(state: unknown, unused: string): void
  replaceState(state: unknown, unused: string): void
  back(): void
}

interface Layer { id: number; close: () => void }

const layerIdOf = (state: unknown): number | null => {
  const id = (state as { backLayer?: unknown } | null)?.backLayer
  return typeof id === 'number' ? id : null
}

export class BackStack {
  private layers: Layer[] = []
  private seq = 0
  /** True while he is sitting on a spent step: a layer closed by its own button, and nothing has moved since. */
  private onSpent = false
  /** A press that started on a spent step and has not yet taken its real step. */
  private owed = false
  constructor(private history: BackHistory) {}

  /** A layer opened. Returns what to call when it closes by its own button (or unmounts). */
  open(close: () => void): () => void {
    const layer: Layer = { id: ++this.seq, close }
    const state = { ...((this.history.state as object | null) ?? {}), backLayer: layer.id }
    const onTop = layerIdOf(this.history.state)
    // A spent step on top is taken over, so spent steps never pile up.
    if (onTop != null && !this.layers.some(l => l.id === onTop)) this.history.replaceState(state, '')
    else this.history.pushState(state, '')
    this.layers.push(layer)
    return () => {
      const at = this.layers.indexOf(layer)
      if (at === -1) return
      this.layers.splice(at, 1)
      if (layerIdOf(this.history.state) === layer.id) this.onSpent = true
    }
  }

  /** The app moved to another address (a tab, the shopping list): he is no longer sitting on a spent step. */
  onNavigate(): void { this.onSpent = false }

  /**
   * The phone went back one step (popstate). Closes the top layer. With nothing open, a spent step is never
   * somewhere to stop: the press walks on through them, and a press that STARTED on one still owes the step Back
   * would have taken had the layer never been there.
   */
  onBack(): void {
    const arrived = layerIdOf(this.history.state)
    const leftSpent = this.onSpent
    this.onSpent = false
    const top = this.layers.pop()
    if (top) {
      top.close()
      // He stepped off a spent step onto this layer's own. The layer is closed now, so he is sitting on a spent step
      // again. (Marked, not walked: a back fired from here would come round as a second press and close the next layer.)
      if (arrived === top.id) this.onSpent = true
      return
    }
    if (leftSpent) this.owed = true
    if (arrived != null) { this.history.back(); return }
    if (this.owed) { this.owed = false; this.history.back() }
  }

  /** How many layers are open (for the gate). */
  get depth(): number { return this.layers.length }
}

let stack: BackStack | null = null
const theStack = (): BackStack => {
  if (!stack) {
    stack = new BackStack(window.history)
    const s = stack
    // popstate fires before hashchange on a Back, so a Back is read before the move it causes clears the flag.
    window.addEventListener('popstate', () => s.onBack())
    window.addEventListener('hashchange', () => s.onNavigate())
  }
  return stack
}

/** While `open`, the phone's Back calls `close` (once, for the top layer only). */
export function useBackCloses(open: boolean, close: () => void): void {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    return theStack().open(() => closeRef.current())
  }, [open])
}
