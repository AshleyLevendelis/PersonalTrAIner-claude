/**
 * WHATEVER A TAP PRODUCES IS BROUGHT INTO VIEW: a card, a refusal, a failure or an Undo appears below the button
 * that was tapped, and on a phone that can be under the fold, under the fixed tab bar, or (since the recipe sheet,
 * design 3b, 31 Oct 2026) under the sheet's own footer. A message is only shown if it is on screen where the tap was.
 *
 * Inside the recipe sheet the page under it does not scroll; the sheet's body (`data-meal-sheet-scroll`) does, and
 * what can be seen of it is that box. Anywhere else it is the page, down to the tab bar. Worked out by hand rather
 * than with scrollIntoView and a scroll margin, because measured in Chromium that call left the move card's Swap
 * button half behind the tab bar.
 */
export function revealBelowTap(el: HTMLElement | null): void {
  if (!el) return
  const scroller = el.closest('[data-meal-sheet-scroll]')
  if (scroller instanceof HTMLElement) {
    const box = scroller.getBoundingClientRect()
    const top = box.top + 8
    const bottom = box.bottom - 8
    const r = el.getBoundingClientRect()
    if (r.height > bottom - top || r.top < top) scroller.scrollBy({ top: r.top - top })
    else if (r.bottom > bottom) scroller.scrollBy({ top: r.bottom - bottom })
    return
  }
  const bar = document.querySelector('nav[aria-label="Primary"]')
  const floor = (bar ? bar.getBoundingClientRect().top : window.innerHeight) - 8
  const r = el.getBoundingClientRect()
  if (r.height > floor - 8 || r.top < 0) window.scrollBy({ top: r.top - 8 })
  else if (r.bottom > floor) window.scrollBy({ top: r.bottom - floor })
}
