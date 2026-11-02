// ---------------------------------------------------------------------------
// THE FULL-SCREEN ROUND TIMER ON THE WHOLE APP AT 390px (1 Nov 2026, whole-app test #23). The page's floating
// settings gear sat on top of the field's own "leave full screen" button, so tapping it opened Profile. Only a page
// that boots App.tsx has the gear, so this runs on app-boot.html. What is asserted is what a TAP reaches: the
// topmost element at the button's centre, and what a real pointer tap there does.
// Every check runs every time with a null-safe subject. PORT 9533.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9533, page: 'app-boot.html', name: 'round-fullscreen-gear' })
const { send, ev, check, until, wait, go, clickAt, shoot, finish } = d
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const LEAVE = `[...document.querySelectorAll('button')].find(b => /Leave full screen/.test(b.getAttribute('aria-label') || ''))`

await go('')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
await ev(`location.hash = '#/tab/tools'`); await wait(1800)
await clickAt(btn('/^Round/')); await wait(800)
await clickAt(`[...document.querySelectorAll('button')].filter(b => /^Start/.test((b.textContent || '').trim())).pop()`); await wait(1200)
await clickAt(btn('/^Full screen$/')); await wait(1000)
const hit = await ev(`(() => {
  const b = ${LEAVE}; if (!b) return null
  const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return { leave: !!b, topIsLeave: !!top && top.closest('button') === b, topLabel: top?.closest('button')?.getAttribute('aria-label') ?? top?.tagName ?? null }
})()`)
check('2. the round is running full screen, with its leave button', hit?.leave === true, hit)
check('3. ...and the leave button is the topmost thing where she taps it, not the gear', hit?.topIsLeave === true, hit)
await shoot('round-fullscreen-gear')
// A REAL TAP at the centre (pointer events), not .click() on the node: the defect was which element the tap reached.
const r = await ev(`(() => { const b = ${LEAVE}; if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 } })()`)
if (r) for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 })
await wait(800)
const after = await ev(`({ fullscreen: !!(${LEAVE}), profileOpen: /Profile and settings|Your profile/.test(document.querySelector('[role="dialog"]')?.innerText || '') || !!document.querySelector('[role="dialog"][data-state="open"]') })`)
check('4. tapping it leaves full screen', after?.fullscreen === false, after)
check('5. ...and opens nothing else (no Profile)', after?.profileOpen === false, after)

await finish('verify:round-fullscreen-gear PASSED')
