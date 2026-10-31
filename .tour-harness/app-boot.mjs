// ---------------------------------------------------------------------------
// HOW LONG THE APP TAKES TO OPEN, AND WHAT IT SHOWS MEANWHILE — 31 Oct 2026, Ashley: "When I first open the app,
// it takes a few seconds to load ... make it load quicker, and not show that loading as soon as you open it."
//
// Boots the REAL App (app-boot.html) against the fake database with every answer delayed SLOW ms (a phone on 4G),
// twice: a FIRST open on this phone (nothing kept from before), then a RE-OPEN (what the app keeps between
// visits is there, as it is every time she opens it after the first). For each it records, from navigation:
//   - when "Loading your plan..." and "Loading your day..." were first and last on screen, if ever;
//   - when Home's numbers ("19% of today's targets") first drew.
// A recorder is installed before the page's own code, so nothing the app does can be missed between two polls.
//
// The numbers are printed on every run. The checks hold her ask on the RE-OPEN, which is the open she makes every
// day: Home drawn quickly, and neither loading screen shown.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const SLOW = Number(process.env.SLOW ?? 300)
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9701
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map(); const pageErrors = []
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text) })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }

// Records, from the page's own clock, the first and last moment each thing was on screen.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__boot = { plan: null, planLast: null, day: null, dayLast: null, fill: null, fillLast: null, home: null }
  const look = () => {
    const now = performance.now(), b = window.__boot, text = document.body ? document.body.innerText : ''
    if (/Loading your plan/.test(text)) { if (b.plan == null) b.plan = now; b.planLast = now }
    // The old grey box. Home's own layout while filling (31 Oct 2026) carries the words for a screen reader only.
    const filling = !!document.querySelector('[data-home-filling]')
    if (/Loading your day/.test(text) && !filling) { if (b.day == null) b.day = now; b.dayLast = now }
    if (filling) { if (b.fill == null) b.fill = now; b.fillLast = now }
    if (b.home == null && document.querySelector('[data-testid="home-so-far"]')) b.home = now
    if (b.home == null || performance.now() < 15000) requestAnimationFrame(look)
  }
  document.addEventListener('DOMContentLoaded', () => { new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true }); look() })
` })

let loads = 0
const open = async (label, extra = '') => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/app-boot.html?slow=${SLOW}&n=${++loads}${extra}` })
  for (let i = 0; i < (extra.includes('netdown') ? 40 : 120) && !(await ev('window.__boot && window.__boot.home != null')); i++) await wait(100)
  await wait(400)
  const b = await ev('window.__boot')
  const r = n => (n == null ? '—' : `${Math.round(n)} ms`)
  console.log(`  ${label}: Home drawn at ${r(b?.home)}; "Loading your plan" ${b?.plan == null ? 'never shown' : `${r(b.plan)} to ${r(b.planLast)}`}; "Loading your day" ${b?.day == null ? 'never shown' : `${r(b.day)} to ${r(b.dayLast)}`}${b?.fill == null ? '' : `; Home's layout filling ${r(b.fill)} to ${r(b.fillLast)}`}`)
  return b
}

console.log(`\nOPENING THE APP, every database answer ${SLOW} ms\n`)
await ev(`(() => { try { localStorage.clear() } catch {} })()`)
const first = await open('first open on this phone')
const again = await open('re-open                 ')
// THE FIRST OPEN OF A NEW DAY: everything kept from before, except Home's snapshot of TODAY (it is keyed by date).
await ev(`(() => { for (const k of Object.keys(localStorage)) if (/dashboard/i.test(k)) localStorage.removeItem(k) })()`)
const newDay = await open('first open of a new day ')
// NO SIGNAL, with the copy kept from before: the plan she had, and the phone still knows whose it is.
const offline = await open('re-open with no signal  ', '&netdown=1')
const offlineKeptId = await ev(`localStorage.getItem('fitplan_profile_id')`)
const offlineText = await ev(`document.body.innerText.slice(0, 300)`)
// NO SIGNAL AND NOTHING KEPT (a phone that knows whose profile it holds, and nothing else).
await ev(`(() => { localStorage.removeItem('fitplan_boot_v1') })()`)
await open('no signal, nothing kept ', '&netdown=1')
await wait(800)
const bare = { id: await ev(`localStorage.getItem('fitplan_profile_id')`), error: await ev(`document.querySelector('[data-testid="start-error"]')?.innerText ?? null`), setup: await ev(`/what should I call you|let's get started|welcome/i.test(document.body.innerText)`) }
writeFileSync(new URL('./app-boot-timings.json', import.meta.url).pathname, JSON.stringify({ slow: SLOW, first, again, newDay, offline }, null, 1))
console.log('')
check('the first open reaches Home at all', first?.home != null, first)
check('a RE-OPEN reaches Home', again?.home != null, again)
check('a re-open never shows "Loading your plan"', again?.plan == null, again)
check('a re-open never shows "Loading your day"', again?.day == null, again)
// The page's own scripts take a few hundred ms to start before the app can draw anything; measured on this machine
// they are well under one second. A re-open that waits for the database would be at least one answer (SLOW) later.
check(`a re-open draws Home before the first database answer could have come back (${SLOW} ms after the app starts)`, again?.home != null && first?.plan != null && again.home < first.plan + SLOW, { again: again?.home, appStart: first?.plan })
check('the first open of a new day never shows "Loading your plan"', newDay?.plan == null, newDay)
check('...nor the "Loading your day" box: Home\'s own layout fills in instead', newDay?.day == null && newDay?.fill != null, newDay)
check(`...and its numbers are in within two database answers (${2 * SLOW} ms) of the app starting`, newDay?.home != null && first?.plan != null && newDay.home < first.plan + 2 * SLOW + 150, { home: newDay?.home, appStart: first?.plan })
check('a re-open with no signal still draws Home, from the copy kept on the phone', offline?.home != null && offline?.plan == null, offline)
check('...and the phone still knows whose profile it holds', offlineKeptId === '00000000-0000-4000-8000-00000000b007', { offlineKeptId, offlineText })
check('no signal and nothing kept: it says so and offers Try again, never setup', !!bare.error && /Nothing is lost/.test(bare.error) && !bare.setup, bare)
check('...and the phone still knows whose profile it holds', bare.id === '00000000-0000-4000-8000-00000000b007', bare)
check('no uncaught error on the page', pageErrors.length === 0, pageErrors)

console.log(`\n${ran} checks ran. ${failures === 0 ? 'The app opens straight onto Home.' : `${failures} check(s) FAILED.`}\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
