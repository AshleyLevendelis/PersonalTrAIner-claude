// ---------------------------------------------------------------------------
// "GIVE ME A DIFFERENT SESSION" — on the real screen.
//
// scripts/test-session-rebuild.ts holds the rules: the main lift untouched, no
// duplicate on the day or across the week, a starved slot kept and named, the
// settling tail run, today only. This holds the half no source check can —
// that on a real mount at phone width the verb is ON the day menu, that the
// promise is made BEFORE the tap, that the session visibly changes while the
// main lift keeps every set and every kilo, and that the screen says what it
// could not change rather than reporting a clean success.
//
// THE MAIN LIFT IS READ FROM ITS SECTION LABEL, not from position — the same
// reasoning shorten-today.mjs records. "The first row survived" would pass on a
// plan whose first row is a primer, and would keep passing if the protection
// were deleted and the rebuild happened to leave it alone.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9413', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9413/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// Radix menus open on pointerdown, so element.click() on the trigger is not
// enough — real pointer events at the element's centre.
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const verbs = () => ev(`[...document.querySelectorAll('[data-testid="what-happened-verbs"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
const note = () => ev(`document.querySelector('[data-testid="session-length-note"]')?.textContent?.trim() || ''`)
const headerText = () => ev(`document.querySelector('[data-testid="week-context-row"], header')?.innerText || document.body.innerText.slice(0, 400)`)

// The row the app itself calls the main lift, and everything printed on it.
// The section label is a direct child span of the group div that holds the
// row, so the row is found through the label rather than by index.
const MAIN_LIFT_JS = `(() => {
  // RE-ANCHORED 31 Oct 2026 (Exercise 2a): the label is inside the exercise's own row now.
  const row = [...document.querySelectorAll('[data-exercise-name]')].find(c => /^Main lift\\b/.test(c.querySelector('[data-testid="exercise-eyebrow"]')?.textContent.trim() ?? ''))
  if (!row) return null
  return { name: row.getAttribute('data-exercise-name'), text: row.innerText.replace(/\\s+/g, ' ').trim() }
})()`
const mainLift = () => ev(MAIN_LIFT_JS)

const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const openSheet = async () => {
  if (await has('[data-testid="what-happened-sheet"]')) await escape()
  await tap('button[aria-label="More options"]'); await wait(500)
  if (!(await has('[data-testid="what-happened-item"]'))) return 'no-menu-item'
  await tap('[data-testid="what-happened-item"]'); await wait(600)
  return (await has('[data-testid="what-happened-sheet"]')) ? 'open' : 'no-sheet'
}
const untilClosed = async () => { for (let i = 0; i < 16 && await has('[data-testid="what-happened-sheet"]'); i++) await wait(250); return !(await has('[data-testid="what-happened-sheet"]')) }
const untilOrder = async pred => { let o = await order(); for (let i = 0; i < 24 && !pred(o); i++) { await wait(300); o = await order() } return o }


console.log('\nGIVE ME A DIFFERENT SESSION — on the screen\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)

const start = await order()
check('0a. today shows a real session to rebuild', Array.isArray(start) && start.length >= 4, start)
const mainBefore = await mainLift()
check('0b. ...and the app names one of them the main lift', !!mainBefore?.name, mainBefore)

// --- the verb is on the day menu -------------------------------------------
check('1a. the day menu opens', (await openSheet()) === 'open')
const v0 = await verbs()
check('1b. today offers "give me a different session"', v0.includes('rebuild'), v0)
check('1c. ...alongside the other change-today verbs, not instead of them',
  v0.includes('shorten') && v0.includes('lighter'), v0)
await shoot('session-rebuild-menu')

// --- it promises what survives, BEFORE the tap ------------------------------
check('2a. tapping it explains rather than acting', await clickSel('[data-verb="rebuild"]') && (await wait(500), await has('[data-testid="what-happened-rebuild"]')))
const promise = await ev(`document.querySelector('[data-testid="what-happened-rebuild"]')?.innerText || ''`)
check('2b. ...naming the one thing that will not change — her ruling, 16 Sep',
  /main lift stays/i.test(promise) && /same weight/i.test(promise), promise)
check('2c. ...and that it is today only', /next week/i.test(promise), promise)
check('2d. ...and that a slot with no alternative stays put',
  /no real alternative|stays put/i.test(promise), promise)
// NOTHING HAS HAPPENED YET. A sheet that explains and has already acted is the
// shape of defect the activity-swap work was written for.
const duringPromise = await order()
check('2e. ...with the session untouched while it asks',
  JSON.stringify(duringPromise) === JSON.stringify(start), { start, duringPromise })
// EVERY SENTENCE STARTS LIKE A SENTENCE. Added after the first run of this
// driver: the screenshot read "…and I'll tell you which. today is back to the
// planned session next week." — {when} interpolated mid-paragraph at a sentence
// start. The shorten copy beside it had read that way since 13 Sep. No source
// check looks for a lowercase letter after a full stop, and no screenshot can
// miss one.
const badStarts = await ev(`(() => {
  const t = document.querySelector('[data-testid="what-happened-sheet"]')?.innerText || ''
  return [...t.matchAll(/[.!?]\\s+([a-z][a-z']+)/g)].map(m => m[1])
})()`)
check('2f. ...and every sentence in it starts like a sentence', Array.isArray(badStarts) && badStarts.length === 0, badStarts)
await shoot('session-rebuild-promise')

// --- the tap ----------------------------------------------------------------
check('3a. tapping "Rebuild it"', await clickSel('[data-testid="rebuild-confirm"]') && await untilClosed())
const after = await untilOrder(o => JSON.stringify(o) !== JSON.stringify(start))
check('3b. the session visibly changed', JSON.stringify(after) !== JSON.stringify(start), { start, after })
check('3c. ...and is the same length — this swaps, it does not trim', after.length === start.length, { start, after })
check('3d. ...with no exercise appearing twice', new Set(after).size === after.length, after)

const mainAfter = await mainLift()
check('3e. the main lift is still the main lift', mainAfter?.name === mainBefore?.name, { before: mainBefore?.name, after: mainAfter?.name })
check('3f. ...with every set, rep and kilo it had — her ruling, read off the screen',
  mainAfter?.text === mainBefore?.text, { before: mainBefore?.text, after: mainAfter?.text })
check('3g. ...and most of the rest genuinely moved',
  after.filter(n => !start.includes(n)).length >= Math.max(1, start.length - 3),
  { newOnes: after.filter(n => !start.includes(n)), start, after })
await shoot('session-rebuild-rebuilt')

// --- IT SAYS WHAT IT DID, INCLUDING WHAT IT COULD NOT ------------------------
const rebuiltNote = await ev(`document.querySelector('[data-testid="rebuild-note"]')?.textContent?.trim() || ''`)
check('4a. the screen says the session was rebuilt', /^Rebuilt today/.test(rebuiltNote), rebuiltNote)
check('4b. ...counting what actually changed', /\d+\s+(exercises?\s+)?changed/.test(rebuiltNote), rebuiltNote)
check('4c. ...and never claims a clean sweep while a slot stayed',
  !/stayed/.test(rebuiltNote) || /nothing else fits/.test(rebuiltNote), rebuiltNote)
check('4d. ...and names the lift it kept', !mainAfter?.name || rebuiltNote.includes(mainAfter.name), { note: rebuiltNote, main: mainAfter?.name })

// --- IT SURVIVES LEAVING THE TAB --------------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/home` })
await wait(1200)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(3000)
const afterReturn = await untilOrder(o => o.length === after.length)
check('5a. the rebuilt session is still the one on the screen',
  JSON.stringify(afterReturn) === JSON.stringify(after), { after, afterReturn })
const mainReturn = await mainLift()
check('5b. ...and the main lift still reads exactly as it did', mainReturn?.text === mainBefore?.text, { before: mainBefore?.text, afterReturn: mainReturn?.text })
await shoot('session-rebuild-persisted')

// --- 6. THE WAY BACK (the Exercise walk, 19 Nov 2026) ------------------------------------------------------------
// A rebuild changed most of the day on one tap and left no way to get the planned session back but the coach. The
// screen above has just been left and come back to, so 6a also proves the button outlives the screen being unmounted.
const rows = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)
const untilRows = async want => { let r = await rows(); for (let i = 0; i < 24 && JSON.stringify(r) !== JSON.stringify(want); i++) { await wait(300); r = await rows() } return r }
const undoLabel = () => ev(`document.querySelector('[data-testid="day-edit-undo"]')?.textContent.trim() ?? null`)
check('6a. the rebuilt session offers "Put my planned session back", still there after leaving the tab', (await undoLabel()) === 'Put my planned session back', await undoLabel())
await ev(`document.querySelector('[data-testid="day-edit-undo"]')?.scrollIntoView({ block: 'center' })`); await wait(300)
await shoot('session-rebuild-way-back')
const savedRebuilt = await ev(`JSON.stringify(window.__fakeDb?.mesocycle_weeks ?? [])`)
check('6b. tapping it', await clickSel('[data-testid="day-edit-undo"]'))
const back6 = await untilOrder(o => JSON.stringify(o) === JSON.stringify(start))
check('6c. ...puts the planned exercises back, in their order', JSON.stringify(back6) === JSON.stringify(start), { start, back6 })
check('6d. ...the main lift reading exactly as it did', (await mainLift())?.text === mainBefore?.text)
check('6e. ...the "Rebuilt today" line and the button gone, nothing reading as a failure',
  !(await has('[data-testid="rebuild-note"]')) && !(await has('[data-testid="day-edit-undo"]')) && !(await has('[data-testid="day-edit-error"]')),
  { note: await has('[data-testid="rebuild-note"]'), undo: await has('[data-testid="day-edit-undo"]'), err: await ev(`document.querySelector('[data-testid="day-edit-error"]')?.textContent ?? null`) })
check('6f. ...and the saved week changed with it (the put-back was written)', (await ev(`JSON.stringify(window.__fakeDb?.mesocycle_weeks ?? [])`)) !== savedRebuilt)

// --- 7. TWO CHANGES, ONE WAY BACK, AND IT GOES TO THE PLAN ---------------------------------------------------------
// Shorten, then a different session. The button says "Put my planned session back", so it must not stop at the
// shortened session (which would leave the shortening with no way back at all).
const planned7 = await rows()
const minutes7 = await (async () => {
  if ((await openSheet()) !== 'open') return null
  await clickSel('[data-verb="shorten"]'); await wait(500)
  const m = await ev(`[...document.querySelectorAll('[data-shorten-minutes]')].map(b => Number(b.getAttribute('data-shorten-minutes'))).sort((a, b) => a - b)[0] ?? null`)
  if (m == null) return null
  await clickSel(`[data-shorten-minutes="${m}"]`); await untilClosed()
  return m
})()
const short7 = await untilOrder(o => o.length < start.length)
check('7a. the planned session is shortened first (the fixture binds)', minutes7 != null && short7.length < start.length, { minutes7, start: start.length, now: short7.length })
check('7b. ...then rebuilt', (await openSheet()) === 'open' && await clickSel('[data-verb="rebuild"]') && (await wait(500), await clickSel('[data-testid="rebuild-confirm"]')) && await untilClosed())
const rebuilt7 = await untilOrder(o => JSON.stringify(o) !== JSON.stringify(short7))
check('7c. ...and the shortened session visibly changed', JSON.stringify(rebuilt7) !== JSON.stringify(short7) && rebuilt7.length === short7.length, { short7, rebuilt7 })
let label7 = null
for (let i = 0; i < 20 && (label7 = await undoLabel()) !== 'Put my planned session back'; i++) await wait(300)
check('7d. one button: "Put my planned session back"', label7 === 'Put my planned session back' && (await ev(`document.querySelectorAll('[data-testid="day-edit-undo"]').length`)) === 1, label7)
check('7e. tapping it', await clickSel('[data-testid="day-edit-undo"]'))
const back7 = await untilRows(planned7)
check('7f. ...PUTS THE WHOLE PLANNED SESSION BACK, sets and weights too, not the shortened one', JSON.stringify(back7) === JSON.stringify(planned7), { planned: planned7.length, now: back7?.length })
check('7g. ...with no "Shortened" line left behind', !/^Shortened/.test(await note()), await note())

// --- 8. THE BUTTON IS THERE ONLY WHILE IT CAN WORK -------------------------------------------------------------------
// Rebuild once more, then log a set: the day is no longer as the change left it, so the button goes and the line stays.
check('8a. rebuilt again', (await openSheet()) === 'open' && await clickSel('[data-verb="rebuild"]') && (await wait(500), await clickSel('[data-testid="rebuild-confirm"]')) && await untilClosed())
await untilOrder(o => JSON.stringify(o) !== JSON.stringify(start))
let has8 = false
for (let i = 0; i < 20 && !(has8 = await has('[data-testid="day-edit-undo"]')); i++) await wait(300)
check('8b. ...and the way back is offered', has8)
const workTick = `[...document.querySelectorAll('[data-exercise-name]:not([data-movement-prep]) button[aria-label^="Save set "]')][0]`
const openWork = `[...document.querySelectorAll('[data-exercise-name]:not([data-movement-prep])')][0]?.querySelector('[role="button"]')`
const clickAt = async expr => { const r = await ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })()`); if (!r) return false; await wait(150); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
if (await has('[data-testid="start-bar"] button')) { await tap('[data-testid="start-bar"] button'); await wait(900) }
if (!(await ev(`!!${workTick}`))) { await clickAt(openWork); await wait(600) }
const ticked8 = await clickAt(workTick)
await wait(1200)
const logged8 = await ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(l => !l.is_warmup).length`)
check('8c. a working set is logged after the rebuild (the fixture binds)', !!ticked8 && logged8 > 0, { ticked8, logged8 })
check('8d. THE BUTTON IS GONE: a session with a set logged is not redrawn', !(await has('[data-testid="day-edit-undo"]')))
check('8e. ...while the line saying what was rebuilt stays', /^Rebuilt today/.test(await ev(`document.querySelector('[data-testid="rebuild-note"]')?.textContent?.trim() || ''`)))
await shoot('session-rebuild-logged')

console.log(failures === 0 ? '\nAll rebuild checks passed.\n' : `\n${failures} rebuild check(s) failed.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
