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
  const label = [...document.querySelectorAll('span')].find(s => /^Main lift\\b/.test(s.textContent.trim()))
  if (!label) return null
  const row = label.parentElement?.querySelector('[data-exercise-name]')
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

console.log(failures === 0 ? '\nAll rebuild checks passed.\n' : `\n${failures} rebuild check(s) failed.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
