// ---------------------------------------------------------------------------
// A WORKOUT MADE OF TIMER BLOCKS — ON THE REAL TODAY CARD (Ashley's ruling A, 8 Oct 2026,
// docs/plans/timer-circuit-log.md).
//
// The fixture (?circuit=1, real.tsx) puts two blocks on today as INPUT, the rows the round
// timer's sheet writes: Skipping rope (5 × 3 min) and Assault bike (5 × 15s, 45s rest).
// The plan's session for today is still due. Asked here: the card offers to count them as
// today's workout, names the session they would replace, and one tap swaps the day under the
// blocks' name without adding a row; "Not today" puts it away for the day; with nothing logged
// there is no offer. The timer's own half (naming the block, the Tools offer) is
// verify:round-presets.
//
// WHAT THIS DOES NOT PROVE: App.tsx's wiring (no harness page boots it), or the coach's card.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9504', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9504/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })


let loads = 0
const open = async (query, tab = 'exercise') => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${query}&n=${loads}#/tab/${tab}` })
  await wait(2500); await ev(`location.hash = '#/tab/${tab}'`); await wait(2000)
}
const readOffer = () => ev(`(() => {
  const o = document.querySelector('[data-testid="circuit-offer"]')
  const swapped = document.querySelector('[data-testid="swapped-today"]')
  const title = document.querySelector('h1, h2')
  return {
    offer: !!o,
    text: o ? o.innerText.replace(/\\s+/g, ' ').trim() : null,
    blocks: o ? [...o.querySelectorAll('[data-testid="circuit-offer-blocks"] li')].map(l => l.textContent.trim()) : [],
    swapped: swapped ? swapped.innerText.replace(/\\s+/g, ' ').trim() : null,
    focus: (window.__todayFocus ?? null),
    headings: [...document.querySelectorAll('h1,h2')].map(h => h.textContent.trim()).slice(0, 4),
  }
})()`)
const offerReady = async () => { let o = await readOffer(); for (let i = 0; i < 20 && !o.offer && !o.swapped; i++) { await wait(400); o = await readOffer() } return o }
const fake = () => ev(`({
  sessions: (window.__fakeDb?.workout_sessions ?? []).map(r => ({ date: r.date, swapped: r.swapped_for_activity ?? null })),
  cardio: (window.__fakeDb?.cardio_logs ?? []).length,
})`)
const tapTestId = id => ev(`(() => { const b = document.querySelector('[data-testid="${id}"]'); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true })()`)

console.log('\nA. Two blocks logged, the session still due')
await open('circuit=1')
const a = await offerReady()
check('1. the Today card offers to count them as today\'s workout', a.offer === true, a)
check('2. ...listing each block with its shape', JSON.stringify(a.blocks) === JSON.stringify(['Skipping rope · 5 × 3 min', 'Assault bike · 5 × 15s, 45s rest']), a.blocks)
check('3. ...and naming the session they would replace (today\'s, read off the page)', !!a.text && !!a.focus && a.text.includes(`instead of ${a.focus}?`), { text: a.text, focus: a.focus })
await shoot('circuit-offer-today')
const before = await fake()
check('4. counting it', await tapTestId('circuit-offer-yes'))
await wait(1500)
const a2 = await offerReady()
const after = await fake()
check('5. the offer goes, and the day says what replaced it', !a2.offer && /Circuit: Skipping rope and Assault bike/.test(a2.swapped ?? ''), a2)
check('6. the day is stored as swapped under the blocks\' name', after.sessions.some(s => s.swapped === 'Circuit: Skipping rope and Assault bike'), after.sessions)
check('7. ...and no extra cardio row was written for it', after.cardio === before.cardio && before.cardio === 2, { before: before.cardio, after: after.cardio })
await shoot('circuit-counted-today')

console.log('\nB. "Not today"')
await open('circuit=1')
const b = await offerReady()
check('8. the offer is back on a fresh day\'s load', b.offer === true, b)
check('9. tapping Not today', await tapTestId('circuit-offer-no'))
await wait(600)
const b2 = await readOffer()
check('10. ...puts it away, and writes nothing', !b2.offer && !b2.swapped && (await fake()).sessions.every(s => !s.swapped), b2)
await open('circuit=1')
await wait(1500)
const b3 = await readOffer()
check('11. ...for the rest of the day, across a reload', !b3.offer, b3)

console.log('\nC. Nothing logged today')
await open('plain=1')
await wait(1500)
const c = await readOffer()
check('12. no blocks, no offer', !c.offer, c)

const err = await ev('window.__err ?? null')
check('13. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? '\nA circuit of timer blocks counts as today\'s workout in one tap.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
