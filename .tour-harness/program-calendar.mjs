// ---------------------------------------------------------------------------
// THE FULL PROGRAM AS A CALENDAR (10 Nov 2026). Ashley: "I love the phases at the top, adaptation etc so dont change
// that. But I would also like the option to see my training weeks as a calendar view." Drives the real screen at 390px:
// the choice, the strip still there, real dates, today, a tap opening the day, the choice remembered, a move drawn.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { ANCHOR_ISO, anchorDate, DAY_NAMES, iso as anchorIso } from './anchor.mjs'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9791', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9791/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 340)}` : ''}`) }
}
const isoOf = n => { const d = anchorDate(); d.setDate(d.getDate() + n); return anchorIso(d) }
const TODAY = isoOf(0)
let loads = 0
const open = async (query, clearView = true) => {
  if (clearView) await ev(`(() => { try { localStorage.removeItem('program-view') } catch {} })()`)
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off${query}&n=${++loads}#/exercise/program` })
  await wait(4000)
  for (let i = 0; i < 20; i++) { if (await ev(`/FULL PROGRAM/i.test(document.body.innerText)`)) break; await wait(500) }
}
const tapText = label => ev(`(() => { const b = [...document.querySelectorAll('[data-testid="program-view-toggle"] button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`)
const cells = () => ev(`[...document.querySelectorAll('[data-calendar-date]')].map(b => ({ date: b.getAttribute('data-calendar-date'), kind: b.getAttribute('data-calendar-kind'), text: b.innerText.replace(/\\s+/g, ' ').trim(), label: b.getAttribute('aria-label'), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))`)

console.log('\nTHE FULL PROGRAM AS A CALENDAR (his 10 Nov 2026 request; the phase strip kept as it is)\n')
await open('')
check('0. the program screen is up, in the LIST by default (no calendar drawn)', (await ev(`document.querySelectorAll('[data-program-day]').length`)) >= 5 && (await ev(`!document.querySelector('[data-testid="program-calendar"]')`)))
const toggle = await ev(`[...document.querySelectorAll('[data-testid="program-view-toggle"] button')].map(b => ({ t: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), h: Math.round(b.getBoundingClientRect().height) }))`)
check('1. "List" and "Calendar" are offered, List pressed, each a 44px tap', JSON.stringify(toggle?.map(x => x.t)) === '["List","Calendar"]' && toggle?.[0].pressed === 'true' && toggle.every(x => x.h >= 44), toggle)
const stripBefore = await ev(`document.querySelectorAll('button[aria-label^="Week "]').length`)

check('2. tapping Calendar draws it', await tapText('Calendar') && !!(await ev(`(async () => { for (let i = 0; i < 20; i++) { if (document.querySelector('[data-testid="program-calendar"]')) return true; await new Promise(r => setTimeout(r, 150)) } return false })()`)))
const stripAfter = await ev(`document.querySelectorAll('button[aria-label^="Week "]').length`)
check('3. THE PHASE STRIP IS STILL THERE, every week of it, above the calendar', stripBefore > 0 && stripAfter === stripBefore && (await ev(`(() => { const s = document.querySelector('button[aria-label^="Week "]'); const c = document.querySelector('[data-testid="program-calendar"]'); return !!s && !!c && s.getBoundingClientRect().top < c.getBoundingClientRect().top })()`)), { stripBefore, stripAfter })
check('4. ...and the week list is gone while the calendar shows', (await ev(`document.querySelectorAll('[data-program-day]').length`)) === 0)
const all = await cells()
const today = all?.find(c => c.date === TODAY)
check('5. today is in the calendar, marked as today', !!today && /today/.test(today.label ?? ''), today)
check('6. every day of the calendar is a real date, each once, Monday to Sunday in rows of seven', !!all && all.length % 7 === 0 && new Set(all.map(c => c.date)).size === all.length && all.length >= 28, all?.length)
const train = all?.filter(c => c.kind === 'train') ?? []
check('7. training days show a word of their session; rest days show none', train.length >= 8 && train.every(c => /^\d+ \S+/.test(c.text)) && (all ?? []).filter(c => c.kind === 'rest').every(c => /^\d+$/.test(c.text)), { train: train.slice(0, 3), rest: (all ?? []).filter(c => c.kind === 'rest').slice(0, 2) })
check('8. every cell is a thumb-sized tap (at least 44px tall) and fits the phone', !!all && all.every(c => c.h >= 44 && c.w >= 40) && (await ev(`document.documentElement.scrollWidth <= window.innerWidth`)), (all ?? []).filter(c => c.h < 44 || c.w < 40).slice(0, 3))
check('9. the plan\'s blocks are named where each begins, and months where they change', (await ev(`document.querySelectorAll('[data-calendar-block]').length`)) >= 2 && (await ev(`document.querySelectorAll('[data-calendar-month]').length`)) >= 2)
await ev(`document.querySelector('[data-calendar-date="${TODAY}"]')?.scrollIntoView({ block: 'center' })`)
await wait(400)
await shoot('program-calendar')

// A tap opens that day in the list.
const later = train.find(c => c.date > TODAY && c.date <= isoOf(13)) ?? train[train.length - 1]
const laterDay = later ? new Date(`${later.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }) : ''
check('10. tapping a training day opens the list on that day, expanded', !!later && (await ev(`(() => { const b = document.querySelector('[data-calendar-date="${later?.date}"]'); if (!b) return false; b.click(); return true })()`)) && !!(await ev(`(async () => { for (let i = 0; i < 20; i++) { const r = document.querySelector('[data-program-day="${laterDay}"]'); if (r && r.getAttribute('aria-expanded') === 'true') return true; await new Promise(r => setTimeout(r, 150)) } return false })()`)), { later, laterDay })
const weekLine = await ev(`(document.body.innerText.match(/Week \\d+/) || [''])[0]`)
const wantWeek = /week (\d+)/.exec(later?.label ?? '')?.[1]
check('11. ...in that day\'s own plan week', !!wantWeek && weekLine === `Week ${wantWeek}`, { weekLine, wantWeek })
check('12. ...and the List is pressed again', (await ev(`[...document.querySelectorAll('[data-testid="program-view-toggle"] button')].find(b => b.textContent.trim() === 'List')?.getAttribute('aria-pressed')`)) === 'true')

// The choice is remembered on this phone.
await tapText('Calendar'); await wait(400)
const stored = await ev(`(() => { try { return localStorage.getItem('program-view') } catch (e) { return 'threw ' + e } })()`)
await open('', false)
check('13. the calendar is remembered: reopening the screen shows it', !!(await ev(`!!document.querySelector('[data-testid="program-calendar"]')`)), { stored, after: await ev(`(() => { try { return localStorage.getItem('program-view') } catch (e) { return 'threw' } })()`) })

// A move made this week is drawn where it landed, and the day it left says where it went.
await open('&moved=1', false)
const moved = await cells()
const leftDay = moved?.find(c => c.date === TODAY)
const landed = moved?.find(c => c.date === isoOf(1))
check('14. after a move, today reads as moved, naming the day it went to', leftDay?.kind === 'moved' && /^\d+ →\w{3}$/.test(leftDay?.text ?? ''), leftDay)
check('15. ...and tomorrow carries the session', landed?.kind === 'train' && /^\d+ \S+/.test(landed?.text ?? ''), landed)
await ev(`document.querySelector('[data-calendar-date="${TODAY}"]')?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('program-calendar-moved')

console.log(`\n${ran} checks ran. ${failures === 0 ? 'The program reads as a calendar, the phase strip stays, and a tap opens the day.' : `${failures} check(s) FAILED.`}\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
