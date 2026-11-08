// ---------------------------------------------------------------------------
// AN EXERCISE CHANGED ON THE SCREEN CAN BE PUT BACK (QA walk T7, 8 Nov 2026).
//
// Moving, removing and swapping an exercise from the Exercise screen each show one line saying what happened, with an
// Undo; Undo puts the session back exactly as it was, and that is SAVED (it survives leaving the tab). The line sits
// above the fixed Start bar, never over it, and inside the screen. The put-back's refusals (changed since, too late,
// a failed save) are held by test:screen-edit-undo, where they can be constructed.
//
// THE ORDER IS READ FROM data-exercise-name, as session-edit.mjs does. Every check runs every time.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9561', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9561/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
// The line is fixed to the screen: tap it where it is, never scroll it into view.
const tapFixed = async sel => { const r = await ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })()`); if (!r) return false; for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const clickText = (scope, re) => ev(`(() => { const root = document.querySelector(${JSON.stringify(scope)}) || document; const n = [...root.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim())); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const until = async (fn, tries = 24) => { let v = await fn(); for (let i = 0; i < tries && !v; i++) { await wait(300); v = await fn() } return v }
const untilOrder = async pred => { let o = await order(); for (let i = 0; i < 20 && !pred(o); i++) { await wait(300); o = await order() } return o }
const lineText = () => ev(`document.querySelector('[data-testid="screen-edit-undo-text"]')?.textContent?.trim() ?? null`)
// Where the line is, against the screen and against the fixed Start bar (when one is showing).
const lineBox = () => ev(`(() => {
  const n = document.querySelector('[data-testid="screen-edit-undo-line"]'); if (!n) return null
  const b = n.getBoundingClientRect(); const bar = document.querySelector('[data-testid="start-bar"]')?.getBoundingClientRect() ?? null
  const u = document.querySelector('[data-testid="screen-edit-undo"]')?.getBoundingClientRect() ?? null
  return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, inView: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth,
    barTop: bar ? bar.top : null, clearOfBar: !bar || b.bottom <= bar.top + 1, undoH: u ? u.height : 0 }
})()`)
// THE SAVED PLAN, read from the database the app wrote to: a tab trip cannot prove a save, because the page keeps the
// plan in memory (found by a MISSED mutation: an Undo that never saved passed every other check).
const savedDays = () => ev(`(window.__fakeDb?.mesocycle_weeks ?? []).flatMap(r => (r.days ?? []).map(d => (d.exercises ?? []).map(e => e.name).join('|')))`)
const savedAs = async names => ((await savedDays()) ?? []).includes(names.join('|'))
const tripTab = async () => { await ev(`location.hash = '#/tab/home'`); await wait(1500); await ev(`location.hash = '#/tab/exercise'`); await wait(2500) }
const openRowMenu = async name => {
  if (await has('[role="menu"]')) await escape()
  const line = `[data-exercise-name=${JSON.stringify(name)}] [role="button"], [data-exercise-name=${JSON.stringify(name)}] .cursor-pointer`
  if (!(await has(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) { await tap(line); await wait(700) }
  if (!(await tap(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) return 'no-trigger'
  await wait(500)
  return (await has('[data-testid="remove-exercise"]')) ? 'open' : 'no-menu'
}

console.log('\nAN EXERCISE CHANGED ON THE SCREEN CAN BE PUT BACK\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)
const start = (await order()) ?? []
check('0. today shows a session with room to change', start.length >= 4, start)
check('0b. no Undo line before anything is changed', !(await has('[data-testid="screen-edit-undo-line"]')))

// --- 1. MOVE -----------------------------------------------------------------
console.log('\n1. Moving one later says so, and Undo puts the order back\n')
const mover = start[0] ?? 'NO-ROW'
const opened1 = (await openRowMenu(mover)) === 'open'
const tapped1 = opened1 && await tap('[data-testid="move-down"]')
const moved = await untilOrder(o => o?.[0] === start[1])
check('1a. the move happened (the fixture binds)', tapped1 && moved?.[0] === start[1] && moved?.[1] === mover, { start, moved })
check('1a2. ...and was saved (the read binds)', await savedAs(moved ?? ['NONE']), await savedDays())
const t1 = await until(lineText, 10)
check('1b. one line says what happened, naming the exercise', t1 === `Moved ${mover} later.`, t1)
check('1c. ...with an Undo beside it, 36px or more tall with its 44px reach', (await lineBox())?.undoH >= 36, await lineBox())
const box1 = await lineBox()
check('1d. the line is on screen', !!box1?.inView, box1)
check('1e. ...and above the Start bar, never over it', !!box1?.clearOfBar, box1)
await shoot('edit-undo-1-moved')
check('1f. tapping Undo...', await tapFixed('[data-testid="screen-edit-undo"]'))
const back1 = await untilOrder(o => o?.join('|') === start.join('|'))
check('1g. ...puts the order back exactly', back1?.join('|') === start.join('|'), { start, back1 })
const t1b = await until(async () => { const x = await lineText(); return x && x !== t1 ? x : null }, 10)
check('1h. ...and says it was taken back, in the coach card\'s words', t1b === `Moved ${mover} later was taken back. Everything is as it was before.`, t1b)
check('1i. ...with no second Undo', !(await has('[data-testid="screen-edit-undo"]')))
await shoot('edit-undo-1-undone')
await tripTab()
const trip1 = await untilOrder(o => o?.length === start.length)
check('1j. the put-back survives leaving the tab', trip1?.join('|') === start.join('|'), { start, trip1 })
check('1k. ...and was SAVED: the database holds the day as it was, not as it was moved', await savedAs(start) && !(await savedAs(moved ?? ['NONE'])), await savedDays())

// --- 2. REMOVE ---------------------------------------------------------------
console.log('\n2. Taking one out says so, and Undo puts it back where it was\n')
const victim = start[start.length - 1] ?? 'NO-ROW'
const opened2 = (await openRowMenu(victim)) === 'open' && await tap('[data-testid="remove-exercise"]')
  && (await wait(700), await clickSel('[data-testid="reason-skip"]')) && (await wait(400), await clickSel('[data-verb="drop"]'))
await wait(400)
const scoped2 = opened2 && await clickSel('[data-scope="today"]')
const dropped = await untilOrder(o => !!o && !o.includes(victim))
check('2a. the removal happened (the fixture binds)', !!scoped2 && !!dropped && !dropped.includes(victim) && dropped.length === start.length - 1, { victim, dropped })
const t2 = await until(lineText, 10)
check('2b. one line says what happened', t2 === `Removed ${victim}.`, t2)
check('2c. ...on screen', !!(await lineBox())?.inView, await lineBox())
await shoot('edit-undo-2-removed')
check('2d. tapping Undo...', await tapFixed('[data-testid="screen-edit-undo"]'))
const back2 = await untilOrder(o => o?.join('|') === start.join('|'))
check('2e. ...puts it back, in its place', back2?.join('|') === start.join('|'), { start, back2 })
await tripTab()
const trip2 = await untilOrder(o => o?.length === start.length)
check('2f. ...and that was saved', trip2?.join('|') === start.join('|') && await savedAs(start) && !(await savedAs(dropped ?? ['NONE'])), { start, trip2, saved: await savedDays() })

// --- 3. SWAP -----------------------------------------------------------------
console.log('\n3. Swapping one says what for what, and Undo puts the old one back\n')
const swapVictim = start[start.length - 1] ?? 'NO-ROW'
const opened3 = (await openRowMenu(swapVictim)) === 'open' && await tap('[data-testid="swap-exercise"]') && !!(await until(() => has('[data-testid="swap-dialog"]')))
if (await has('[data-testid="swap-dialog"] [data-testid="reason-skip"]')) { await clickSel('[data-testid="swap-dialog"] [data-testid="reason-skip"]'); await wait(800) }
const swapTo = await ev(`document.querySelector('[data-testid="swap-dialog"] [data-testid="swap-option"]')?.innerText?.split('\\n')[0]?.trim() || null`)
await clickSel('[data-testid="swap-dialog"] [data-testid="swap-option"]'); await wait(900)
const scoped3 = opened3 && await clickText('[data-testid="swap-dialog"]', '/^Just today/')
const swapped = await until(async () => { const o = await order(); return o && !o.includes(swapVictim) ? o : null })
check('3a. the swap happened (the fixture binds)', !!scoped3 && !!swapped && swapped.length === start.length, { swapVictim, swapTo, swapped })
const t3 = await until(lineText, 10)
const swappedIn = (swapped ?? []).find(n => !start.includes(n)) ?? 'NONE'
check('3b. one line names both: what went and what came in', t3 === `Swapped ${swapVictim} for ${swappedIn}.`, { t3, swappedIn })
check('3c. ...on screen, above the Start bar', !!(await lineBox())?.inView && !!(await lineBox())?.clearOfBar, await lineBox())
await shoot('edit-undo-3-swapped')
check('3d. tapping Undo...', await tapFixed('[data-testid="screen-edit-undo"]'))
const back3 = await untilOrder(o => o?.join('|') === start.join('|'))
check('3e. ...puts the old exercise back', back3?.join('|') === start.join('|'), { start, back3 })
await tripTab()
const trip3 = await untilOrder(o => o?.length === start.length)
check('3f. ...and that was saved', trip3?.join('|') === start.join('|') && await savedAs(start) && !(await savedAs(swapped ?? ['NONE'])), { start, trip3, saved: await savedDays() })

// --- 3b. ADD --------------------------------------------------------------------
console.log('\n3b. Adding one says so, and Undo takes it out again\n')
const openedAdd = await tap('[data-testid="add-exercise"]') && !!(await until(() => has('[data-testid="add-exercise-sheet"]')))
const addPick = await until(() => ev(`document.querySelector('[data-add-candidate]')?.getAttribute('data-add-candidate') ?? null`), 10)
const pickedAdd = openedAdd && !!addPick && await tap(`[data-add-candidate=${JSON.stringify(addPick)}]`) && !!(await until(() => has('[data-scope="today"]')))
const scopedAdd = pickedAdd && await tap('[data-scope="today"]')
const added = await untilOrder(o => !!o && o.includes(addPick))
check('3b-a. the addition happened (the fixture binds)', !!scopedAdd && !!added?.includes(addPick) && added.length === start.length + 1, { addPick, added })
const tAdd = await until(lineText, 10)
check('3b-b. one line says what happened', tAdd === `Added ${addPick}.`, tAdd)
await shoot('edit-undo-3b-added')
check('3b-c. tapping Undo...', await tapFixed('[data-testid="screen-edit-undo"]'))
const backAdd = await untilOrder(o => o?.join('|') === start.join('|'))
check('3b-d. ...takes it out again, the session as it was', backAdd?.join('|') === start.join('|'), { start, backAdd })
await tripTab()
const tripAdd = await untilOrder(o => o?.length === start.length)
check('3b-e. ...and that was saved', tripAdd?.join('|') === start.join('|') && await savedAs(start) && !(await savedAs(added ?? ['NONE'])), { start, tripAdd, saved: await savedDays() })

// --- 4. THE LINE GOES -----------------------------------------------------------
console.log('\n4. The line goes on its own, and only the newest change has one\n')
const opened4 = (await openRowMenu(start[0])) === 'open' && await tap('[data-testid="move-down"]')
await untilOrder(o => o?.[0] === start[1])
const opened4b = opened4 && (await openRowMenu(start[2])) === 'open' && await tap('[data-testid="move-down"]')
await untilOrder(o => o?.[3] === start[2])
const lines4 = await ev(`document.querySelectorAll('[data-testid="screen-edit-undo-line"]').length`)
check('4a. two changes in a row show one line, for the newer one', !!opened4b && lines4 === 1 && (await lineText()) === `Moved ${start[2]} later.`, { lines4, text: await lineText() })
await wait(9000)
check('4b. the line has gone after a few seconds', !(await has('[data-testid="screen-edit-undo-line"]')))

// --- 5. QA ROUND 2 (8 Nov 2026) ----------------------------------------------------
console.log('\n5. The line stays gone, and a set logged since refuses the Undo\n')
// The 8 seconds ran inside the component, so every return to the tab mounted a fresh line for the same change.
await tripTab()
await wait(1200)
check('5a. after its seconds are up, a trip away and back does not bring the line back', !(await has('[data-testid="screen-edit-undo-line"]')), await lineText())
// Left within its seconds and back after them: the line must not start its 8 seconds again on the return.
const before5a = (await order()) ?? []
const opened5a = (await openRowMenu(before5a[0])) === 'open' && await tap('[data-testid="move-down"]')
await untilOrder(o => !!o && o.join('|') !== before5a.join('|'))
const shown5a = await until(lineText, 10)
await ev(`location.hash = '#/tab/home'`); await wait(9500); await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
check('5a2. a line left before its seconds were up is gone when you come back after them', !!opened5a && !!shown5a && !(await has('[data-testid="screen-edit-undo-line"]')), { shown5a, now: await lineText() })
// A change, then a set logged, then Undo: the day is not as the change left it, so nothing is put back.
const before5 = (await order()) ?? []
const opened5 = (await openRowMenu(before5[before5.length - 1])) === 'open' && await tap('[data-testid="move-up"]')
const moved5 = await untilOrder(o => !!o && o.join('|') !== before5.join('|'))
check('5b. a move happened (the fixture binds)', !!opened5 && !!moved5 && moved5.join('|') !== before5.join('|'), { before5, moved5 })
const workTick = `[...document.querySelectorAll('[data-exercise-name]:not([data-movement-prep]) button[aria-label^="Save set "]')][0]`
const openWork = `[...document.querySelectorAll('[data-exercise-name]:not([data-movement-prep])')][0]?.querySelector('[role="button"]')`
const clickAt = async expr => { const r = await ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })()`); if (!r) return false; await wait(150); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
if (await has('[data-testid="start-bar"] button')) { await tap('[data-testid="start-bar"] button'); await wait(900) }
if (!(await ev(`!!${workTick}`))) { await clickAt(openWork); await wait(600) }
const ticked = await clickAt(workTick)
await wait(900)
const loggedNow = await ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(l => !l.is_warmup).length`)
check('5c. a working set was logged after the change (the fixture binds)', !!ticked && loggedNow > 0, { ticked, loggedNow })
check('5d. tapping Undo...', await tapFixed('[data-testid="screen-edit-undo"]'))
const t5 = await until(async () => { const x = await lineText(); return x && /logged a set/.test(x) ? x : null }, 12)
check('5e. ...refuses, saying a set has been logged since', t5 === "You've logged a set since, so nothing was changed.", await lineText())
check('5f. ...and the order is still the moved one, on screen and saved', (await order())?.join('|') === moved5?.join('|') && await savedAs(moved5 ?? ['NONE']), { now: await order(), moved5 })
await shoot('edit-undo-5-logged')

console.log(`\n${ran} checks ran`)
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
chrome.kill(); server.close(); ws.close()
process.exit(failures ? 1 : 0)
