// ---------------------------------------------------------------------------
// HOME'S STEPS ENTRY ON THE WHOLE APP AT 390px (1 Nov 2026). Found by the
// whole-app test: after logging 8,500 steps, re-opening the entry shows "8500"
// as the box's faint placeholder, which reads like a filled box, and tapping
// Log steps on it saved 0 — Number('') is 0 and passed every guard. An empty
// box is not a number, so Log steps now waits for one.
//
// Every check runs every time with a null-safe subject. PORT 9529.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9529, page: 'app-boot.html', name: 'home-steps' })
const { send, ev, check, until, wait, go, clickAt, shoot, finish } = d

await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)));addEventListener('unhandledrejection',e=>__errs.push(String(e.reason)))" })
await go('')
const home = await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
check('1. Home is up', home === true)
await wait(1500)
// The email prompt opens on this anonymous fixture; it is not what is under test.
const NOT_NOW = `[...document.querySelectorAll('button')].find(b => /^Not now$/.test(b.innerText.trim()))`
if (await ev(`!!(${NOT_NOW})`)) { await clickAt(NOT_NOW); await wait(600) }

const RING = `document.querySelector('[data-home-rings] > :nth-child(4) button, [data-home-rings] > :nth-child(4)')`
const BOX = `document.querySelector('[aria-label="Steps today"]')`
const LOG = `[...document.querySelectorAll('button')].find(b => /^Log steps$/.test(b.innerText.trim()))`
const setVal = v => ev(`(() => { const el = ${BOX}; if (!el) return null; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value })()`)
const stored = () => ev(`(() => { const rows = (window.__fakeDb && window.__fakeDb.daily_steps) || []; return rows.length ? rows[rows.length - 1].steps ?? rows[rows.length - 1].step_count ?? null : null })()`)

await clickAt(RING); await wait(300)
check('2. the steps entry opens from the ring', (await setVal('8500')) === '8500')
await clickAt(LOG); await wait(800)
check('3. 8,500 is saved', (await stored()) === 8500, await ev('JSON.stringify(window.__fakeDb && window.__fakeDb.daily_steps)'))

await clickAt(RING); await wait(500)
const reopened = await ev(`(() => { const el = ${BOX}; const b = ${LOG}; return el ? { value: el.value, placeholder: el.placeholder, disabled: !!(b && b.disabled) } : null })()`)
check('4. re-opened, the box is empty with the last count as its hint', !!reopened && reopened.value === '' && /8,?500/.test(reopened.placeholder), reopened)
check('5. ...and Log steps cannot be tapped on an empty box', !!reopened && reopened.disabled === true, reopened)
await clickAt(LOG); await wait(800)
check('6. tapping it anyway leaves the day at 8,500, never 0', (await stored()) === 8500, await ev('JSON.stringify(window.__fakeDb && window.__fakeDb.daily_steps)'))
await ev(`(() => { const el = ${BOX}; el && el.focus(); el && el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })()`)
await wait(800)
check('7. ...and so does Enter on the empty box', (await stored()) === 8500)
await shoot('home-steps-empty')
check('8. no uncaught error on the page', ((await ev('window.__errs')) ?? []).length === 0, await ev('window.__errs'))

await finish('verify:home-steps PASSED')
