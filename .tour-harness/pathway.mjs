// verify:pathway — his 13 Nov 2026 strategy, slice 3 (docs/plans/pathway.md), read off a real 390x844 screen.
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
await new Promise(r => server.listen(0, r))
const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9431', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9431/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}


await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
const URL_BASE = `http://127.0.0.1:${port}/?tour=off&walker=1`
const shot = name => send('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64')))
const text = () => ev(`document.body.innerText.replace(/\\s+/g, ' ')`)

console.log('\nTHE PATHWAY: WALKS, THEN SHORT HOME STRENGTH FROM WEEK 3 (his 13 Nov 2026 strategy, slice 3)\n')
await send('Page.navigate', { url: `${URL_BASE}#/tab/exercise` })
await wait(4500)
const target = await ev('window.__pathwayTarget ?? null')
check('0. the fixture is the walking plan, with a home strength day in week 3', !!target && !!target.date && target.names?.length >= 4, target)
const live = await text()
check('1. today (week 2) is still a walk, with no strength work', /Walk/.test(live || '') && !/Towel Row|Glute Bridge/.test(live || ''), (live || '').slice(0, 300))

await send('Page.navigate', { url: `${URL_BASE}&today=${target?.date}#/tab/exercise` })
await wait(4500)
const day = await text()
await shot('pathway-strength-day')
// ONE check, whatever the fixture holds, so the count never moves with the plan.
const names = target?.names ?? []
check('2. the strength day shows all four moves', names.length >= 4 && names.every(n => (day || '').includes(n)), { names, shown: (day || '').slice(0, 300) })
check('3. ...and the walk after it, with its minutes', (day || '').includes(`${target?.walk?.duration} min`) && /Walk/.test(day || ''), (day || '').slice(0, 500))
// The set grid's column header reads "kg BW" on a bodyweight row; a prescribed weight would read e.g. "~20 kg".
check('4. no kilogram weight is asked of a home circuit', !/~\s?\d+(\.\d+)?\s?kg/.test(day || '') && /\bBW\b/.test(day || ''), ((day || '').match(/.{30}\d+(\.\d+)?\s?kg.{20}/) || [''])[0])
check('4b. ...and the day is not told it "runs shorter than you asked for"', !/runs shorter than/.test(day || ''), ((day || '').match(/.{0,40}runs shorter.{0,60}/) || [''])[0])
check('5. the sets are two each, as prescribed', /2 ?(sets|×|x)/i.test(day || ''), (day || '').slice(0, 300))
const clipped = await ev(`[...document.querySelectorAll('[data-testid="exercise-name"], h3, h4')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent.trim().slice(0, 40))`)
check('6. no exercise name is cut off at 390px', (clipped || []).length === 0, clipped)

await send('Page.navigate', { url: `${URL_BASE}&today=${target?.walkDate}#/tab/exercise` })
await wait(4500)
const walkDay = await text()
await shot('pathway-walk-day')
check('7. the other day that week is still a plain walk', /Walk/.test(walkDay || '') && !/Towel Row/.test(walkDay || ''), (walkDay || '').slice(0, 300))

// PROFILE: "Also enjoy", only on the pathway; a tap saves and offers the rebuild (the Profile harness page).
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(150); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const openGoal = async () => {
  await tap('[data-testid="open-profile"]'); await wait(1200)
  await ev(`document.querySelector('[data-profile-row="Goal"]')?.click()`); await wait(800)
}
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/profile.html?walker=1` })
await wait(3500)
await openGoal()
const chip = await rectOf('[data-enjoyed="swimming"]')
check('P1. Profile shows "Also enjoy" on the pathway, with Swimming and Cycling', !!chip && await has('[data-enjoyed="cycling"]'))
check('P2. ...each a 44px tap target', !!chip && chip.h >= 44, chip)
await tap('[data-enjoyed="swimming"]'); await wait(1200)
const saved = await ev(`(window.__fakeDb?.fitness_profiles ?? [])[0]?.enjoyed_activities ?? null`)
const offer = await ev(`document.querySelector('[data-testid="plan-invalidation-title"]')?.textContent ?? null`)
await shot('pathway-profile')
check('P3. a tap saves it', Array.isArray(saved) && saved.includes('swimming'), saved)
check('P4. ...and offers the rebuild, naming the swim', /Swap a walk a week for a swim/.test(offer || ''), offer)
check('P5. pressed state follows the answer', await ev(`document.querySelector('[data-enjoyed="swimming"]')?.getAttribute('aria-pressed')`) === 'true')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/profile.html` })
await wait(3500)
await openGoal()
check('P6. not shown to someone who trains', !(await has('[data-testid="profile-enjoyed"]')) && await has('[data-profile-sheet]'))

const err = await ev('window.__err ?? null')
check('8. no uncaught error on the page', err === null, err)
console.log(failures === 0 ? '\nThe walks come first, then the home strength days, each on its own screen.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures > 0 ? 1 : 0)
