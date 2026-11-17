// ---------------------------------------------------------------------------
// THE MUSCLE MAP ON A REAL SCREEN: which shapes light up, on which view, in
// which colour. Mounts the real exercise Summary panel (see muscle-map.tsx).
//
// WHY A DRIVER. test:exercise-demo holds the mapping and the source. It cannot
// tell that a shape is really FILLED on a phone-sized screen, that the two
// figures sit side by side inside the viewport, or that the vendored path data
// draws a body at all. Chin-Ups is the ruling's own case: lats and upper back
// on the back view, biceps and abs on the front.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9761', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9761/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let checks = 0, failures = 0
const check = (name, ok, detail) => {
  checks++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

let loads = 0
const load = async query => {
  loads++
  // A fresh address every time: same-page navigation to the open URL reloads nothing.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/muscle-map.html?${query}&load=${loads}` })
  await wait(1500)
}

/** Every drawn shape on one view: slug, resolved fill, opacity. */
const read = view => ev(`(() => {
  const fig = document.querySelector('[data-testid="muscle-map-${view}"]')
  if (!fig) return null
  return [...fig.querySelectorAll('path[data-slug]')].map(p => {
    const cs = getComputedStyle(p)
    return { slug: p.getAttribute('data-slug'), fill: cs.fill, op: Number(p.getAttribute('fill-opacity')) }
  })
})()`)

/** The slugs drawn in the accent on a view: anything not in the unworked colour. */
const litOn = (shapes, tier) => {
  if (!shapes) return null
  const off = shapes.find(s => s.slug === 'head')?.fill   // never a muscle, so always the unworked colour
  return [...new Set(shapes.filter(s => s.fill !== off && (tier === 'secondary' ? s.op < 1 : s.op === 1)).map(s => s.slug))].sort()
}

console.log('\n1. Chin-Ups, on the real Summary tab\n')
await load('ex=Chin-Ups')
{
  const front = await read('front'), back = await read('back')
  check('both views drew a body', (front?.length ?? 0) > 40 && (back?.length ?? 0) > 40, [front?.length, back?.length])
  const f = litOn(front, 'primary'), b = litOn(back, 'primary')
  console.log('     front lit:', f?.join(', '), '| back lit:', b?.join(', '))
  check('front view: biceps, abs and obliques are lit',
    JSON.stringify(f) === JSON.stringify(['abs', 'biceps', 'obliques']), f)
  check('back view: the upper back (lats) is lit, and only that',
    JSON.stringify(b) === JSON.stringify(['upper-back']), b)
  check('the unworked shapes are drawn, in a different colour from the lit ones',
    new Set(front.map(s => s.fill)).size === 2, [...new Set(front.map(s => s.fill))])
  const layout = await ev(`(() => {
    const a = document.querySelector('[data-testid="muscle-map-front"]').getBoundingClientRect()
    const b = document.querySelector('[data-testid="muscle-map-back"]').getBoundingClientRect()
    const labels = [...document.querySelectorAll('[data-testid^="muscle-map-"] span')].map(s => s.textContent)
    return { aLeft: a.left, aRight: a.right, bLeft: b.left, aTop: a.top, bTop: b.top, bRight: b.right, labels, w: innerWidth,
             scrollX: document.documentElement.scrollWidth > innerWidth }
  })()`)
  console.log('     layout:', JSON.stringify({ frontRight: Math.round(layout.aRight), backLeft: Math.round(layout.bLeft), backRight: Math.round(layout.bRight), width: layout.w }))
  check('Front is on the left and Back on the right, side by side',
    layout.aRight <= layout.bLeft && Math.abs(layout.aTop - layout.bTop) < 2, layout)
  check('labelled Front and Back', JSON.stringify(layout.labels) === JSON.stringify(['Front', 'Back']), layout.labels)
  // 390 is the phone's width as set above, NOT innerWidth: under mobile emulation the layout viewport grows to fit
  // overflowing content, so a figure pushed off the edge reads as "inside" when measured against itself.
  check('inside the 390px phone width, no sideways scroll', layout.aLeft >= 0 && layout.bRight <= 390 && !layout.scrollX, layout)
  const caption = await ev(`document.body.innerText.includes('Lats, Biceps, Teres major, Core')`)
  check('the catalogue\'s own muscle names are still printed underneath', caption === true)
  await shoot('muscle-map-chin-ups')
}

console.log('\n2. A different lift, so the figure is not hard-wired\n')
await load('ex=Barbell%20Squats')
{
  const f = litOn(await read('front'), 'primary'), b = litOn(await read('back'), 'primary')
  console.log('     front lit:', f?.join(', '), '| back lit:', b?.join(', '))
  check('a squat lights the quads on the front', f?.includes('quadriceps') === true, f)
  check('...and the glutes on the back, and not the biceps', b?.includes('gluteal') === true && !f?.includes('biceps'), { f, b })
  await shoot('muscle-map-squat')
}

console.log('\n3. Nothing paintable is a sentence, not a blank body\n')
await load('ex=Burpees')
{
  const none = await ev(`document.querySelector('[data-testid="muscle-map-front"]') === null`)
  const said = await ev(`document.body.innerText.includes('Nothing to highlight')`)
  check('Burpees draws no figure and says why', none === true && said === true, { none, said })
}

console.log('\n4. A secondary muscle is a paler tint of the same accent\n')
await load('secondary=1')
{
  const front = await read('front')
  const chest = front.find(s => s.slug === 'chest'), tri = front.find(s => s.slug === 'triceps'), head = front.find(s => s.slug === 'head')
  const delt = front.find(s => s.slug === 'deltoids')
  check('the primary muscle is full strength', chest?.op === 1, chest)
  check('a secondary muscle uses the same accent at less than full strength', tri?.fill === chest?.fill && tri.op < 1 && tri.op > 0, { tri, chest })
  check('unworked is neither', head?.fill !== chest?.fill, { head, chest })
  check('a muscle named both primary and secondary shows as primary (chest)', chest?.op === 1)
  check('a secondary anterior deltoid lights the FRONT shoulder only',
    delt?.op < 1 && !(await read('back')).some(s => s.slug === 'deltoids' && s.fill === delt.fill && s.op < 1), delt)
  await shoot('muscle-map-secondary')
}

console.log(`\n${checks} checks ran, ${failures} failed`)
chrome.kill(); server.close()
process.exit(failures ? 1 : 0)
