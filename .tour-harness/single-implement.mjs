// ---------------------------------------------------------------------------
// ONE DUMBBELL, ON THE SCREEN SHE READ IT ON.
//
// Ashley, 10 Sep 2026, from her phone:
//
//     Dumbbell Leg Curl        3×15-18 · ~12kg per hand
//
// One dumbbell, clamped between the feet. `scripts/test-single-implement.ts`
// holds the catalogue and the arithmetic. This holds the half no source check
// can: that the corrected unit actually reaches all three places the app says
// it, on a real mount, in a real browser, at phone width.
//
// THE LOGGING HEADER IS THE ONE THAT MATTERS. It does not just tell her a
// number, it asks her for one, and `exercise_set_logs` carries no unit of its
// own to catch a 2× mistake with. It has also been misread here before — a
// page-wide search for "Weight" returns the FIRST header on screen, which
// belongs to a different exercise, so this driver scopes every read to the
// leg curl's own expanded block.
//
// The fixture (?legcurl=1) is a home-gym push/pull/legs profile, because that
// is where the generator actually chooses this movement — at full_gym a
// machine leg curl wins the slot. Nothing is hand-seeded: the number on screen
// came out of the real prescription path.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9391', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9391/json/list').then(r => r.json())
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
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

console.log('\nONE DUMBBELL, PRICED AND CAPTIONED AS ONE DUMBBELL\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&legcurl=1#/tab/exercise` })
await wait(3000); await ev(`location.hash = '#/tab/exercise'`); await wait(2000)

// THE WHOLE PROGRAM, not just today: which weekday holds this lift depends on
// the split, and pinning the driver to "it must be today" would make it fail
// on six days out of seven for reasons that are nothing to do with the fix.
// #/exercise/program/N is the route the "See the whole program" button sets.
await ev(`location.hash = '#/exercise/program/2'`)
await wait(2500)

const findRow = () => ev(`(() => {
  const hit = [...document.querySelectorAll('*')].find(n => n.children.length === 0 && n.textContent.trim() === 'Dumbbell Leg Curl')
  if (!hit) return null
  // Walk out to the nearest ancestor that carries the load text too, so the
  // assertion reads the row rather than just the name.
  let n = hit
  for (let i = 0; i < 6 && n.parentElement; i++) {
    n = n.parentElement
    const t = n.textContent || ''
    if (/kg/.test(t) && t.length < 400) return t.replace(/\\s+/g, ' ').trim()
  }
  return hit.textContent.trim()
})()`)

// Open each day in turn until the row appears. Days are collapsed on arrival,
// and their headers read "MON", "TUE" — not "Monday". The first version of
// this driver looked for the long names, matched nothing, expanded nothing,
// and reported the exercise missing from a screen it had never opened.
// The index is interpolated straight into the expression. Writing it as
// `heads[${'IDX'}]` and post-processing with .replace does NOT work: the
// template resolves to `heads[IDX]` before replace ever runs, the page throws
// a ReferenceError, `opened` comes back undefined, and the loop breaks on its
// first pass — reporting the exercise missing from a screen it never opened.
let row = await findRow()
for (let i = 0; i < 10 && row === null; i++) {
  const opened = await ev(`(() => {
    const heads = [...document.querySelectorAll('button, [role="button"], summary')]
      .filter(n => /^(MON|TUE|WED|THU|FRI|SAT|SUN)/.test((n.textContent || '').trim()))
    if (!heads[${i}]) return false
    heads[${i}].click(); return true
  })()`)
  await wait(700)
  row = await findRow()
  if (!opened && row === null) break
}

check('1. the leg curl is on screen at phone width', row !== null, row)
if (row !== null) {
  check('2. it no longer says "per hand"', !/per hand/i.test(row), row)
  check('3. ...nor "single side" — no side holds anything either', !/single side/i.test(row), row)
  check('4. it still carries a weight, in plain kg', /~?\d+(\.\d+)?kg/.test(row), row)
  // The number is the point: halved, this lift showed ~12-14kg. The whole
  // estimate is roughly double that. Pinned as a floor rather than an exact
  // figure so a plate-rounding change does not fail it.
  const shownKg = Number((row.match(/~?(\d+(?:\.\d+)?)kg/) || [])[1])
  check('5. ...and it is the WHOLE estimate, not half of it', Number.isFinite(shownKg) && shownKg >= 16, shownKg)
}
// SCROLL TO IT BEFORE SHOOTING. The assertions read the DOM, which is right,
// but a screenshot of a row below the fold proves nothing to a person reading
// the picture afterwards — and the picture is the part that gets believed.
await ev(`(() => { const n = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === 'Dumbbell Leg Curl'); if (n) n.scrollIntoView({ block: 'center' }); return !!n })()`)
await wait(800)
await shoot('single-implement-row')

// --- the logging column ----------------------------------------------------
// WHAT THIS CAN AND CANNOT PROVE, stated rather than blurred. The logging
// column only exists on the Exercise tab, for TODAY's session — the program
// view above is read-only. Which weekday holds the leg curl is decided by the
// generator, and no arrangement of available days puts it on today (checked
// across all seven rotations), so its own logging header is not reachable in a
// browser from this fixture.
//
// What IS reachable is the wiring that header depends on: SetGrid takes its
// qualifier from the plan's own formatted string and never re-derives it. So
// the contrast below is the live half — a lift whose unit is a plain "kg"
// must show no qualifier, and one whose unit is "(single side)" must show it.
// The leg curl now carries the first kind of string, which
// scripts/test-single-implement.ts §2 pins at the source.
/** Open one exercise by name and read the weight-column labels inside ITS block. */
// FRESH PAGE PER READ. Opening a second exercise while the first is still
// expanded leaves two logging grids on screen, and walking up from the name to
// "the nearest ancestor holding a weight header" then climbs past this
// exercise into a container holding the other one — which is how this check
// first came back with a bodyweight lift's header attached to a loaded lift's
// name.
const headerFor = async name => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&legcurl=1#/tab/exercise` })
  await wait(3000); await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
  await ev(`(() => {
    const hit = [...document.querySelectorAll('*')].find(n => n.children.length === 0 && n.textContent.trim() === ${JSON.stringify('NAME')})
    if (!hit) return false
    let n = hit
    for (let i = 0; i < 6 && n.parentElement; i++) { n = n.parentElement; if (n.tagName === 'BUTTON' || n.getAttribute('role') === 'button') { n.click(); return true } }
    hit.click(); return true
  })()`.replace('NAME', name))
  await wait(1200)
  return ev(`(() => {
    const hit = [...document.querySelectorAll('*')].find(n => n.children.length === 0 && n.textContent.trim() === ${JSON.stringify('NAME')})
    if (!hit) return null
    // SCOPED, NOT PAGE-WIDE: a page-wide search for a weight header returns the
    // FIRST one on screen, which belongs to a different exercise. That exact
    // mistake was made here once and reported as a missing prop.
    let block = hit
    for (let i = 0; i < 9 && block.parentElement; i++) {
      block = block.parentElement
      const t = block.textContent || ''
      if (/Log weight|Weight/.test(t) && /Reps/.test(t)) break
    }
    // If the walk overshot into a container holding more than this exercise,
    // the reading is about the wrong lift. Say so rather than returning it.
    const names = [...block.querySelectorAll('*')].filter(n => n.children.length === 0)
      .map(n => n.textContent.trim())
      .filter(x => /^(Barbell|Dumbbell|Single-Leg|Cossack|Banded|Overhead|Pallof|Clamshell|Shrugs|T-Bar)/.test(x))
    if (new Set(names).size > 1) return { overshot: names }
    // THE WHOLE HEADER ROW, not the leaves matching /weight/. It renders as
    // "Log weight · (single side)" across two elements, so a leaf filter
    // returns "Log weight" alone and the qualifier — the entire point of the
    // check — is invisible to it. That is how this came back empty on a
    // column that was rendering correctly the whole time.
    const label = [...block.querySelectorAll('*')]
      .filter(n => /^Log weight/.test((n.textContent || '').trim()) && (n.textContent || '').trim().length < 60)
      .map(n => n.textContent.replace(/\\s+/g, ' ').trim())
    return label
  })()`.replace('NAME', name))
}

const total = await headerFor('Barbell Squats')
check('6. a lift measured as a TOTAL asks for a plain weight, with no qualifier',
  Array.isArray(total) && total.length > 0 && !total.some(h => /per hand|single side/i.test(h)), total)

const perSide = await headerFor('Single-Leg Dumbbell Calf Raise')
check('7. ...while a one-sided lift still says so, so the column is genuinely wired',
  Array.isArray(perSide) && perSide.some(h => /single side|per side/i.test(h)), perSide)
await shoot('single-implement-logging')

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nOne dumbbell reads as one dumbbell.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
