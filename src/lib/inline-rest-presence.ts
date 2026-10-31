// ---------------------------------------------------------------------------
// IS THE REST ROW ON SCREEN? (tab polish, Exercise 2a, 31 Oct 2026)
//
// ONE REST TIMER, TWO PLACES TO READ IT. The engine is useActiveSession's
// (startRest / restEndsAt / adjustRest / dismissRest) and nothing here keeps
// time. The set grid draws it as a row under the set just ticked; BottomDock
// draws the same deadline above the tab bar so it can be found from any tab.
// While the row is actually in view the dock stands aside, so the screen never
// shows the same countdown twice. Scrolled away, or on another tab, the dock is
// back. A tiny external store, so the dock (another subtree) can ask.
// ---------------------------------------------------------------------------

const visible = new Set<string>()
const listeners = new Set<() => void>()

export function setInlineRestVisible(id: string, isVisible: boolean): void {
  const had = visible.has(id)
  if (isVisible === had) return
  if (isVisible) visible.add(id)
  else visible.delete(id)
  listeners.forEach(l => l())
}

export function subscribeInlineRest(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function inlineRestOnScreen(): boolean {
  return visible.size > 0
}
