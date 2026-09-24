// ---------------------------------------------------------------------------
// A SHORT DAY THAT ALREADY HAS ITS CARDIO GETS THE REST OF ITS TIME — AS AN
// OPTION, AFTER THE CARDIO, AND SAID TO BE OPTIONAL.
//
// 23 Sep 2026. Until then the duration filler skipped any day carrying the
// goal's cardio, because a day held one cardio block and that one was taken.
// Measured on the 9,216-profile grid: 3,838 of the 3,841 days that ran under
// the time somebody set aside were exactly those days. They now carry a
// mobility close-out in a field of their own. This drives the screen that
// shows it, at 390px, on a plan the real generator made from a measured
// offender's inputs (?mobility=1) — the page is asked which day, never told.
//
// ONE SLOT, TWO ROWS is the property: the goal's cardio is still there and
// still headed "Finisher", the mobility is a SECOND row after it headed
// "Optional", and neither clips its own text.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = '/home/user/PersonalTrAIner-claude/.tour-harness/dist/'
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9433', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9433/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&mobility=1#/tab/exercise` })
await wait(3500)
const target = await ev('window.__mobilityTarget ?? null')
check('0a. the generated plan has a day with its cardio AND a mobility close-out', !!target && !!target.mobility, target)
if (target) console.log(`  ${target.day}: "${target.cardio}" (${target.cardioMinutes}m), then "${target.mobility}" (${target.mobilityMinutes}m)`)

// Pinned to the day that HOLDS it, read off the page — never a weekday name.
// Every check below runs every time, on a null-safe subject: a driver whose
// count shrinks when the feature breaks is one whose mutations score as crashes.
if (target) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&mobility=1&today=${target.date}#/tab/exercise` })
  await wait(4000)
}

const readRows = async () => (await ev(`(() => {
  return [...document.querySelectorAll('[data-testid^="finisher-row"]')].map(card => {
    const nodes = [card, ...card.querySelectorAll('*')]
    const clipped = nodes.filter(n => n.scrollWidth > n.clientWidth + 1 && (n.textContent || '').trim().length > 0).length
    const r = card.getBoundingClientRect()
    return {
      label: (card.querySelector('p')?.textContent || '').trim(),
      text: card.innerText.replace(/\\s+/g, ' ').trim(),
      saved: !!card.querySelector('[data-testid="cardio-readback"]'),
      clipped, top: Math.round(r.top + window.scrollY), h: Math.round(r.height), w: Math.round(r.width),
    }
  })
})()`)) ?? []
const rows = await readRows()

const last = rows[rows.length - 1]
if (last) await ev(`window.scrollTo(0, ${Math.max(0, last.top - 500)})`)
await wait(400)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/mobility-filler.png', Buffer.from(shot.result.data, 'base64'))

console.log('\nA SHORT DAY WITH ITS CARDIO, AND THE OPTIONAL REST OF ITS TIME\n')
const cardioRow = rows.find(r => r.label === 'Finisher') ?? null
const mobilityRow = rows.find(r => r.label === 'Optional') ?? null
check('1. the goal\'s cardio is still on the card, headed "Finisher"', !!cardioRow && (cardioRow.text || '').includes(`${target?.cardioMinutes} min`), { rows, target })
check('2. the mobility close-out is its own row, headed "Optional"', !!mobilityRow && /Mobility/.test(mobilityRow.text || ''), rows)
check('3. ...with the minutes the plan gave it', !!mobilityRow && (mobilityRow.text || '').includes(`${target?.mobilityMinutes} min`), { shown: mobilityRow?.text, want: `${target?.mobilityMinutes} min` })
check('4. the optional row comes AFTER the cardio — the order to do them in', !!cardioRow && !!mobilityRow && mobilityRow.top > cardioRow.top, { cardio: cardioRow?.top, mobility: mobilityRow?.top })
check('5. exactly one of each — the cardio was not replaced and the mobility is not doubled', rows.filter(r => r.label === 'Finisher').length === 1 && rows.filter(r => r.label === 'Optional').length === 1, rows.map(r => r.label))
check('6. neither row cuts its own text off', rows.length > 0 && rows.every(r => r.clipped === 0), rows.map(r => ({ label: r.label, clipped: r.clipped })))
// A row is now a heading and one 44px row of boxes (Ashley's "like a lifting
// set", 24 Sep 2026), so the height bound is the whole block's, measured at
// 390px: under 170px each, never a form that pushes the session off screen.
check('7. both fit the phone', rows.length > 0 && rows.every(r => r.w <= 390 && r.h > 0 && r.h <= 170), rows.map(r => ({ w: r.w, h: r.h })))

// ONE CANDIDATE CANNOT TEST A CHOICE. Two rows are on screen, so logging the
// FINISHER must tick the finisher and leave the optional row open — a read-back
// keyed on the wrong thing would tick both, or the wrong one.
await ev(`(() => {
  const n = document.querySelector('[data-testid="finisher-row"] [data-testid="cardio-save"]')
  if (!n) return false
  const r = n.getBoundingClientRect()
  for (const type of ['mousedown', 'mouseup', 'click']) n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
  return true
})()`)
await wait(900)
const afterLog = await readRows()
check('7b. logging the finisher ticks the finisher', afterLog.find(r => r.label === 'Finisher')?.saved === true, afterLog.map(r => ({ label: r.label, saved: r.saved })))
check('7c. ...and leaves the optional row open, because it is a separate thing', afterLog.find(r => r.label === 'Optional')?.saved === false, afterLog.map(r => ({ label: r.label, saved: r.saved })))

const err = await ev('window.__err ?? null')
check('8. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? 'The cardio and the optional close-out both show, in order, at 390px.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
