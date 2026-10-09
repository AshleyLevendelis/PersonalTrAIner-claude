// ---------------------------------------------------------------------------
// OPENING A DIALOG DOES NOT MOVE THE PAGE — ON A DESKTOP WINDOW.
//
// 9 Oct 2026, the test log's L25: on desktop Chrome the page jumped about
// 15px sideways each time a dialog opened. Every dialog, menu and select here
// locks page scroll while it is open; the lock hides the scrollbar, the window
// gets 15px wider, and the library pads the BODY to compensate — but anything
// `position: fixed` is measured from the window, not the body, so the tab bar
// and the gear slid across.
//
// WHY NO OTHER DRIVER SAW IT: they all run at phone size, where the scrollbar
// is drawn over the page and takes no room. This one is a 1280x800 DESKTOP
// window with a real scrollbar, and it checks that first — on a page with no
// scrollbar every check below would pass over nothing.
//
// What is measured is the app's own: the real tab bar (BottomTabBar), the real
// Nutrition tab, and the real "How it's set" dialog. The gear is the harness
// page's copy of App's wrapper (same classes); no harness page boots App.tsx.
//
// PORT 9662.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9662, page: 'real.html', name: 'dialog-shift', width: 1280, height: 800, mobile: false })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d

/** Where the fixed things and the page's own content sit, and how much room the scrollbar takes. */
const measure = () => ev(`(() => {
  const left = el => el ? Math.round(el.getBoundingClientRect().left * 100) / 100 : null
  const right = el => el ? Math.round(el.getBoundingClientRect().right * 100) / 100 : null
  const bar = document.querySelector('nav') || document.querySelector('[data-tour="tabbar"]')
  const tab = [...document.querySelectorAll('nav button, nav a')].find(b => /Nutrition/.test(b.textContent || ''))
  const gear = document.querySelector('[data-tour="settings"]')
  const main = document.querySelector('main')
  const heading = [...document.querySelectorAll('main button, main a')].find(e => /How it.s set/.test(e.textContent || ''))
  return {
    scrollbar: innerWidth - document.documentElement.clientWidth,
    scrolls: document.documentElement.scrollHeight > innerHeight,
    locked: document.body.hasAttribute('data-scroll-locked'),
    dialog: !!document.querySelector('[role="dialog"]'),
    barLeft: left(bar), barRight: right(bar), tabLeft: left(tab), gearLeft: left(gear), mainLeft: left(main), linkLeft: left(heading),
    bodyMarginRight: getComputedStyle(document.body).marginRight,
  }
})()`)

await go('&tour=off', '#/tab/nutrition')
await until(() => ev(`[...document.querySelectorAll('span')].some(e => /^target \\d/.test((e.textContent || '').trim()))`), v => v === true)
await wait(600)
const before = await measure()
await shoot('dialog-shift-before')

console.log('\n1. The window is a desktop one (or nothing below means anything)\n')
check('1a. the page is long enough to scroll', before?.scrolls === true, before)
check('1b. its scrollbar takes up room (about 15px), as on desktop Chrome', before?.scrollbar >= 10 && before?.scrollbar <= 20, before?.scrollbar)
check('1c. the tab bar, the Nutrition tab, the gear and the page were all found', [before?.barLeft, before?.tabLeft, before?.gearLeft, before?.mainLeft, before?.linkLeft].every(v => typeof v === 'number'), before)

console.log('\n2. Open a dialog: nothing moves sideways\n')
const opened = await clickAt(`[...document.querySelectorAll('main button, main a')].find(b => /How it.s set/.test(b.textContent || ''))`)
await until(() => ev(`!!document.querySelector('[role="dialog"]')`), v => v === true, 20)
await wait(500)
const open = await measure()
await shoot('dialog-shift-open')
const moved = k => (typeof before?.[k] === 'number' && typeof open?.[k] === 'number') ? Math.round((open[k] - before[k]) * 100) / 100 : null
check('2a. the dialog opened and the page is scroll-locked (the state that used to move things)', opened === true && open?.dialog === true && open?.locked === true, open)
check('2b. the gear did not move (it used to jump the scrollbar\'s width)', moved('gearLeft') === 0, { moved: moved('gearLeft'), before: before?.gearLeft, open: open?.gearLeft })
check('2c. the Nutrition tab in the tab bar did not move', moved('tabLeft') === 0, { moved: moved('tabLeft') })
check('2d. the tab bar did not get wider or shift', moved('barLeft') === 0 && moved('barRight') === 0, { left: moved('barLeft'), right: moved('barRight') })
check('2e. the page behind the dialog did not move either', moved('mainLeft') === 0 && moved('linkLeft') === 0, { main: moved('mainLeft'), link: moved('linkLeft') })
check('2f. the body is not padded to make up for the scrollbar (its room is kept instead)', open?.bodyMarginRight === '0px', open?.bodyMarginRight)

console.log('\n3. Close it: still nothing moves\n')
await d.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await d.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await until(() => ev(`!document.querySelector('[role="dialog"]')`), v => v === true, 20)
await wait(400)
const after = await measure()
check('3a. the dialog closed and the lock is off', after?.dialog === false && after?.locked === false, after)
check('3b. everything is exactly where it started', ['gearLeft', 'tabLeft', 'barLeft', 'barRight', 'mainLeft', 'linkLeft'].every(k => after?.[k] === before?.[k]), { before, after })

await finish('Opening a dialog does not move the page.')
