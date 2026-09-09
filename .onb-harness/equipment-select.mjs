// ---------------------------------------------------------------------------
// Drives .onb-harness/equipment-select.html at phone size and asserts the two
// halves of the Profile equipment picker: the CLOSED control shows the label
// alone, and the OPEN list shows each tier's description underneath it.
//
// The closed half is the one that needs a browser. Radix mirrors ItemText into
// the trigger, so a description nested inside ItemText would render the whole
// sentence on a 28px inline control — a regression no source grep catches and
// no static render shows, because the list only exists once the control opens.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = p === '/' ? join(DIST, '.onb-harness/equipment-select.html') : join(DIST, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium',
  ['--headless=new', '--remote-debugging-port=9388', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 60; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9388/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0
const pend = new Map()
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
})
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = x => send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }).then(r => r.result?.result?.value)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(1600)

let failures = 0
const check = (label, ok, detail) => {
  if (ok) { console.log(`  ✓ ${label}`); return }
  failures++
  console.log(`  ✗ ${label}${detail === undefined ? '' : `\n      ${JSON.stringify(detail)}`}`)
}

console.log('\nEQUIPMENT PICKER — Profile, 390x844\n')

const closed = await ev(`document.querySelector('[data-testid="trigger"]').innerText.trim()`)
check('the closed control names the tier', closed === 'Minimalist', closed)
check('...and does NOT print the description on it', !/dumbbell/i.test(closed || ''), closed)
const h = await ev(`Math.round(document.querySelector('[data-testid="trigger"]').getBoundingClientRect().height)`)
check('...and stays a compact inline control (<= 32px tall)', h <= 32, h)

// Radix opens on pointerdown, not click.
await ev(`(()=>{const t=document.querySelector('[data-testid="trigger"]');
  for (const type of ['pointerdown','mousedown','pointerup','mouseup','click'])
    t.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,button:0,pointerId:1}));
  return true})()`)
await wait(700)

const items = await ev(`JSON.stringify([...document.querySelectorAll('[data-slot="select-item"]')].map(e=>e.innerText.replace(/\\n+/g,' | ').trim()))`)
const list = JSON.parse(items || '[]')
console.log('  open list:')
for (const l of list) console.log(`      ${l}`)
check('the open list offers all four tiers', list.length === 4, list.length)
check('Minimalist shows what it really includes', /Minimalist \| Dumbbells, kettlebells, bands, pull-up bar, weighted bag/.test(list.join('\n')), list)
check('Home gym shows the rack and bench', /Home gym \| Barbell, rack, bench/.test(list.join('\n')), list)
check('Bodyweight admits the pull-up bar', /Bodyweight only \| Bodyweight, a pull-up bar/.test(list.join('\n')), list)
check('no option is still label-only', list.every(l => l.includes(' | ')), list)

const overflow = await ev(`(()=>{const es=[...document.querySelectorAll('[data-slot="select-item"]')];
  return es.some(e=>e.scrollWidth > e.clientWidth + 2)})()`)
check('no description is clipped horizontally', overflow === false, overflow)

chrome.kill(); server.close()
console.log(failures === 0 ? '\nEquipment picker reads true on both states.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
