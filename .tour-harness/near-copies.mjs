// ---------------------------------------------------------------------------
// NEAR-COPIES ON THE LOGGING SHEET, AT PHONE SIZE (3 Nov 2026; her ruling "Searchable, log-only").
//
// test:near-copies holds the search, the lookup and every refusal. It cannot see the sheet: whether the suggestions
// are drawn at all, labelled as log-only, tappable, and whether a tap and Add really put a set row under the near-copy's
// OWN name. So this opens "I also did…" on Exercise, types her words, reads what is drawn, taps, adds, and reads the
// row. Then the same under a profile with a shoulder injury and no gym, where the marks must appear: two profiles,
// because one cannot test that a mark is conditional.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9787', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9787/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
const pageErrors = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.text)
})
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
const tapAt = async sel => {
  const at = await ev(`(() => { const n = ${sel}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (at) for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
  return !!at
}
const INPUT = `document.querySelector('input[placeholder^="Lift name"]')`
/** Open "I also did…", stay on Lift, type `words` into the box as keystrokes, and read the suggestions as drawn. */
const typeAndRead = async words => {
  const opened = await tapAt(`document.querySelector('[data-testid="add-unplanned"]')`)
  await wait(700)
  const focused = await ev(`(() => { const i = ${INPUT}; if (!i) return false; i.focus(); return true })()`)
  if (focused) await send('Input.insertText', { text: words })
  await wait(600)
  const rows = await ev(`(() => {
    const vw = window.innerWidth
    return [...document.querySelectorAll('[data-testid="log-suggestion"]')].map(n => {
      const r = n.getBoundingClientRect()
      return {
        name: n.getAttribute('data-name'), logOnly: n.getAttribute('data-log-only') === 'true',
        kind: n.querySelector('[data-testid="log-suggestion-kind"]')?.textContent ?? null,
        marks: [...n.querySelectorAll('[data-testid="log-suggestion-mark"]')].map(m => m.textContent),
        h: Math.round(r.height), inside: r.left >= 0 && r.right <= vw && r.width > 0,
        // WHERE A FINGER WOULD LAND: the row itself, not a bar floating over it (the first build's list sat under
        // the Start bar and every other check here still passed).
        tappable: (() => { const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = y > 0 && y < window.innerHeight ? document.elementFromPoint(x, y) : null; return !!hit && n.contains(hit) })(),
      }
    })
  })()`)
  return { opened, focused, rows: rows ?? [] }
}

console.log('\nNEAR-COPIES: FOUND, MARKED AND LOGGED UNDER THEIR OWN NAME\n')

// --- 1. Full gym, no injuries ----------------------------------------------------------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&load=1#/tab/exercise` })
await wait(4500)
const gym = await typeAndRead('paused bench')
check('1a. "I also did…" opens on Lift and takes typing', gym.opened && gym.focused, gym)
const paused = gym.rows.find(r => r.name === 'Paused Bench Press')
check('1b. typing "paused bench" offers Paused Bench Press', !!paused, gym.rows.map(r => r.name))
check('1c. ...labelled as one to log, and whose version it is', paused?.logOnly === true && paused?.kind === 'Log only · a version of Barbell Bench Press', paused)
check('1d. ...with no marks for somebody it suits', (paused?.marks ?? ['?']).length === 0, paused?.marks)
check('1e. every suggestion is on screen and a real tap target', gym.rows.length > 0 && gym.rows.every(r => r.inside && r.h >= 44), gym.rows)
check('1e2. ...and the one she is after is tappable where it is drawn, not under a floating bar', paused?.tappable === true, paused)
await shoot('near-copies-suggestions')
const typedPlain = await (async () => { await ev(`(() => { const i = ${INPUT}; i.select() })()`); await send('Input.insertText', { text: 'bench' }); await wait(500); return ev(`[...document.querySelectorAll('[data-testid="log-suggestion"]')].map(n => n.getAttribute('data-log-only'))`) })()
const firstCopy = (typedPlain ?? []).indexOf('true'), lastPlan = (typedPlain ?? []).lastIndexOf('false')
check('1f. typing "bench", plan exercises are drawn above every near-copy', (typedPlain ?? []).length > 0 && lastPlan >= 0 && (firstCopy === -1 || lastPlan < firstCopy), typedPlain)
// The tap fills the exact name; Add puts a row under it.
await ev(`(() => { const i = ${INPUT}; i.select() })()`)
await send('Input.insertText', { text: 'paused bench' })
await wait(500)
const tapped = await tapAt(`[...document.querySelectorAll('[data-testid="log-suggestion"]')].find(n => n.getAttribute('data-name') === 'Paused Bench Press')`)
await wait(400)
const filled = await ev(`${INPUT}?.value ?? null`)
const listGone = await ev(`document.querySelectorAll('[data-testid="log-suggestion"]').length`)
check('1g. a tap fills the box with the exact name, and the list steps aside', tapped && filled === 'Paused Bench Press' && listGone === 0, { filled, listGone })
// THE BOX KEEPS ITS FOCUS while the list comes and goes: a remounted box drops a phone's keyboard mid-word.
await ev(`(() => { const i = ${INPUT}; i.focus(); i.select() })()`)
await send('Input.insertText', { text: 'pa' })
await wait(300)
await send('Input.insertText', { text: 'used' })
await wait(400)
const kept = await ev(`(() => { const i = ${INPUT}; return { focused: document.activeElement === i, value: i?.value, rows: document.querySelectorAll('[data-testid="log-suggestion"]').length } })()`)
check('1g2. typed a few letters at a time, the box keeps focus and every letter as the list appears', kept?.focused === true && kept?.value === 'paused' && kept?.rows > 0, kept)
await ev(`(() => { const i = ${INPUT}; i.select() })()`)
await send('Input.insertText', { text: 'Paused Bench Press' })
await wait(300)
await tapAt(`[...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Add' && !b.disabled)`)
await wait(900)
const row = await ev(`(() => { const box = document.querySelector('[data-testid="additional-work"]'); return box ? box.innerText : null })()`)
check('1h. Add puts the extra lift on the page under ITS OWN name', !!row && /Paused Bench Press/.test(row) && !/^Barbell Bench Press$/m.test(row), row)
await shoot('near-copies-added')

// --- 2. A shoulder injury and no gym: the marks appear ----------------------------------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&sam=1&load=2#/tab/exercise` })
await wait(4500)
const sam = await typeAndRead('wide grip pulldown')
const wide = sam.rows.find(r => r.name === 'Wide-Grip Lat Pulldown')
check('2a. a near-copy of a machine lift is still offered to log (she may have done it elsewhere)', !!wide, sam.rows.map(r => r.name))
check('2b. ...marked for the kit, as the swap search marks the lift it is a version of', (wide?.marks ?? []).some(m => /^Needs /.test(m)), wide?.marks)
check('2c. ...and for the injury (a pulldown loads the shoulder he flagged)', (wide?.marks ?? []).some(m => /flagged an injury/.test(m)), wide?.marks)
check('2d. ...with the row and its marks in view where a finger would land', wide?.tappable === true, wide)
await shoot('near-copies-marks')
check('3. nothing on the page threw', pageErrors.length === 0, pageErrors)

console.log(failures ? `\n${failures} near-copies check(s) failed` : '\nA near-copy is found, marked, and logged under its own name.')
try { ws.close() } catch {}
chrome.kill(); server.close()
process.exit(failures ? 1 : 0)
