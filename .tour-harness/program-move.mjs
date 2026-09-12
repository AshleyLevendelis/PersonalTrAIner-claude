// ---------------------------------------------------------------------------
// THE FULL PROGRAM SCREEN, AFTER A MOVE MADE IN CHAT.
//
// Ashley, 12 Sep 2026, with a screenshot: she moved Saturday's session to
// Sunday from the chat, the card confirmed it — and Full Program went on
// showing "Full Body Power" on Saturday with the TODAY badge, and "Rest" on
// Sunday.
//
// THE REPORT SAID A CACHE NEEDED INVALIDATING. It did not. ProgramBrowse had
// never read a move in its life: no sessionForDate, no move rows, nothing to
// invalidate, and `days.find(d => d.day === dayName)` — the sixth surviving
// instance of the naive weekday lookup — deciding every row. Re-rendering it
// any number of times would have drawn the same week.
//
// So this drives the real screen against a real move row and reads the rows
// back. The BEFORE state is checked too, in the same run: without the move
// the week must look exactly as it always did, or this "fix" is just a screen
// that always says Moved.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9441', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9441/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 340)}` : ''}`) }
}
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d }
const nameOf = n => iso(n).toLocaleDateString('en-US', { weekday: 'long' })
const TODAY = nameOf(0), TOMORROW = nameOf(1)
const SHORT = s => s.slice(0, 3).toUpperCase()

/** Every day row on the Full Program screen, as text, keyed by weekday. */
const rows = () => ev(`(() => {
  const out = {}
  const names = ['MON','TUE','WED','THU','FRI','SAT','SUN']
  for (const el of document.querySelectorAll('div')) {
    const txt = (el.innerText || '').trim()
    const m = /^(MON|TUE|WED|THU|FRI|SAT|SUN)\\n/.exec(txt)
    if (!m) continue
    // The tightest element that starts with the day tag is the row.
    if (out[m[1]] && out[m[1]].length <= txt.length) continue
    out[m[1]] = txt.replace(/\\s+/g, ' ')
  }
  return out
})()`)

const open = async (query) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off${query}#/exercise/program` })
  await wait(4500)
  for (let i = 0; i < 20; i++) {
    if (await ev(`/FULL PROGRAM/i.test(document.body.innerText)`)) break
    await wait(500)
  }
}

console.log('\nFULL PROGRAM, AFTER A MOVE MADE IN CHAT\n')

// --- BEFORE: no move. The week must be untouched. -------------------------
await open('')
const before = await rows()
check('0. the program screen is up', Object.keys(before || {}).length >= 5, Object.keys(before || {}))
check('1. with no move, no row claims one', !/Moved/i.test(JSON.stringify(before)), before?.[SHORT(TODAY)])
check('2. ...and today carries the TODAY badge', /Today/i.test(before?.[SHORT(TODAY)] ?? ''), before?.[SHORT(TODAY)])

// --- AFTER: today's session moved to tomorrow -----------------------------
await open('&moved=1')
const after = await rows()
const todayRow = after?.[SHORT(TODAY)] ?? ''
const tomorrowRow = after?.[SHORT(TOMORROW)] ?? ''
// Scroll the two rows that matter into view before the shot — the week is
// taller than the phone, and a screenshot of the rows above proves nothing.
const scrolled = await ev(`(() => {
  const el = [...document.querySelectorAll('div')].find(d => /^${SHORT(TODAY)}\\n/.test((d.innerText || '').trim()))
  if (!el) return 'row not found'
  const y = el.getBoundingClientRect().top + window.scrollY - 200
  window.scrollTo(0, y)
  return { scrollY: Math.round(window.scrollY), wanted: Math.round(y) }
})()`)
await wait(700)
check('the moved rows were scrolled into shot', !!scrolled && scrolled.scrollY > 0, scrolled)
await shoot('program-move')

check('3. the day it LEFT says the session moved', /Moved/.test(todayRow), todayRow)
check(`4. ...and names where it went (${TOMORROW})`, new RegExp(`Moved to ${TOMORROW}`).test(todayRow), todayRow)
check('5. ...and no longer offers its sets and minutes as if it were happening',
  !/\d+ sets/.test(todayRow), todayRow)

// THE BADGE DOES NOT TRAVEL. The report asked for the TODAY indicator to shift
// to Sunday; it must not. The SESSION moved, the DATE did not — today is still
// today, and every other surface (week strip, Home) already holds that line.
check('6. the TODAY badge stays on today, because today is still today',
  /Today/i.test(todayRow) && !/Today/i.test(tomorrowRow), { todayRow, tomorrowRow })

check('7. the day it LANDED on carries the session', /\d+ sets/.test(tomorrowRow), tomorrowRow)
check(`8. ...named as ${TODAY}'s, not renamed to ${TOMORROW}'s`,
  new RegExp(`${TODAY}’S|${TODAY}'S`, 'i').test(tomorrowRow), tomorrowRow)
check('9. ...and is no longer described as a rest day',
  !/Sleep, hydration/i.test(tomorrowRow), tomorrowRow)

// ONE MOVE, ONE SESSION. The whole failure was the same work appearing twice.
const sessionCount = Object.values(after ?? {}).filter(r => /\d+ sets/.test(r)).length
const beforeCount = Object.values(before ?? {}).filter(r => /\d+ sets/.test(r)).length
check('10. the week still holds the same number of sessions — one moved, none cloned',
  sessionCount === beforeCount, { beforeCount, sessionCount })

// --- AND NOT ON ANY OTHER WEEK ---------------------------------------------
// A move is a fact about DATES — "Saturday the 12th happens on Sunday the
// 13th" — not an edit to the plan. Paging to another week must show the
// template untouched. Added after a mutation (moves applied to every browsed
// week) was caught only by a source check and sailed past this driver, which
// had never left the live week.
// READ THE WEEK, DO NOT TRUST THE CLICK. The first version of this asserted
// only that a button was dispatched, and passed while the screen never left
// the live week — so checks 12 and 13 were re-reading the same rows and could
// not have failed. The harness README's standing warning, met again.
const weekNow = () => ev(`(document.body.innerText.match(/Week (\\d+)/) || [])[1] ?? null`)
const weekBefore = await weekNow()
await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /next week/i.test(x.getAttribute('aria-label') || ''))
  if (b && !b.disabled) b.click()
})()`)
await wait(1400)
const weekAfter = await weekNow()
const paged = !!weekBefore && !!weekAfter && weekBefore !== weekAfter
const other = await rows()
check('11. the screen really is on a different week now', paged, { weekBefore, weekAfter })
check('12. ...and no row there claims a move, because a move is about dates',
  paged !== true || !/Moved/i.test(JSON.stringify(other)), other?.[SHORT(TODAY)])
check('13. ...and that week still shows its own session on the day it belongs to',
  paged !== true || /\d+ sets/.test(other?.[SHORT(TODAY)] ?? ''), other?.[SHORT(TODAY)])

const err = await ev(`window.__lastError ?? null`)
check('no uncaught error on the page', err === null || err === undefined, err)

console.log(failures === 0 ? '\nA moved session shows where it went, and where it landed.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
