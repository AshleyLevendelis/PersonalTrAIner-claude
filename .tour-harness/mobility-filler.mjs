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

const rows = await ev(`(() => {
  const leaves = [...document.querySelectorAll('*')].filter(x => x.children.length === 0 && /^(Finisher|Optional) ·/.test((x.textContent || '').trim()))
  return leaves.map(leaf => {
    let card = leaf
    for (let i = 0; i < 8 && card.parentElement; i++) { card = card.parentElement; if (/rounded/.test(card.className || '') && card.querySelector('button')) break }
    const nodes = [card, ...card.querySelectorAll('*')]
    const clipped = nodes.filter(n => n.scrollWidth > n.clientWidth + 1 && (n.textContent || '').trim().length > 0).length
    const r = card.getBoundingClientRect()
    return { label: (leaf.textContent || '').trim().split(' ·')[0], text: card.innerText.replace(/\\s+/g, ' ').trim(), clipped, top: Math.round(r.top + window.scrollY), h: Math.round(r.height), w: Math.round(r.width) }
  })
})()`) ?? []

const last = rows[rows.length - 1]
if (last) await ev(`window.scrollTo(0, ${Math.max(0, last.top - 500)})`)
await wait(400)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/mobility-filler.png', Buffer.from(shot.result.data, 'base64'))

console.log('\nA SHORT DAY WITH ITS CARDIO, AND THE OPTIONAL REST OF ITS TIME\n')
const cardioRow = rows.find(r => r.label === 'Finisher') ?? null
const mobilityRow = rows.find(r => r.label === 'Optional') ?? null
check('1. the goal\'s cardio is still on the card, headed "Finisher"', !!cardioRow && (cardioRow.text || '').includes(`${target?.cardioMinutes}m`), { rows, target })
check('2. the mobility close-out is its own row, headed "Optional"', !!mobilityRow && /Mobility/.test(mobilityRow.text || ''), rows)
check('3. ...with the minutes the plan gave it', !!mobilityRow && (mobilityRow.text || '').includes(`${target?.mobilityMinutes}m`), { shown: mobilityRow?.text, want: `${target?.mobilityMinutes}m` })
check('4. the optional row comes AFTER the cardio — the order to do them in', !!cardioRow && !!mobilityRow && mobilityRow.top > cardioRow.top, { cardio: cardioRow?.top, mobility: mobilityRow?.top })
check('5. exactly one of each — the cardio was not replaced and the mobility is not doubled', rows.filter(r => r.label === 'Finisher').length === 1 && rows.filter(r => r.label === 'Optional').length === 1, rows.map(r => r.label))
check('6. neither row cuts its own text off', rows.length > 0 && rows.every(r => r.clipped === 0), rows.map(r => ({ label: r.label, clipped: r.clipped })))
check('7. both fit the phone', rows.length > 0 && rows.every(r => r.w <= 390 && r.h > 0 && r.h <= 96), rows.map(r => ({ w: r.w, h: r.h })))

const err = await ev('window.__err ?? null')
check('8. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? 'The cardio and the optional close-out both show, in order, at 390px.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
