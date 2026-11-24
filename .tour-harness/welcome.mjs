// verify:welcome — THE WELCOME PAGE (his request 24 Nov 2026, "Option 1, build it. Make the one line good").
//
// Boots the REAL App (app-boot.html) as a phone with no plan (?fresh: no stored profile, an account that owns none),
// which is the first open and the state after signing out. Before this, the app opened straight into the setup chat.
// Checks: the welcome page comes first, with its words and two buttons in sight; "I already have an account" opens
// sign-in and its Back returns to the welcome page; "Get started" opens setup; a setup already under way skips the
// page; a phone holding a plan never sees it.
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const SHOTS = process.env.SHOTS ?? null
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9733
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }
const shot = async name => { if (!SHOTS) return; const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64')) }

let loads = 0
const open = async extra => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/app-boot.html?slow=0&n=${++loads}${extra}` })
  await wait(300)
}
const until = async (expr, ms = 12000) => { for (let i = 0; i < ms / 100; i++) { if (await ev(expr)) return true; await wait(100) } return false }
// Where a thing is: in sight on a 390x844 phone, and at least 44px tall.
const box = sel => ev(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, text: e.innerText } })()`)
const inSight = b => !!b && b.top >= 0 && b.bottom <= 844
const tap = sel => ev(`(() => { const e = document.querySelector('${sel}'); if (!e) return false; e.click(); return true })()`)
const SETUP = `/Already have an account\\? Sign in/.test(document.body.innerText)`
const SIGN_IN = `/Sign back in/.test(document.body.innerText)`
const WELCOME = `!!document.querySelector('[data-testid="welcome"]')`
const HOME = `!!document.querySelector('[data-home-page]')`
// The words, read from the app's own source so the check cannot hold a stale copy.
const src = readFileSync(new URL('../src/components/WelcomeScreen.tsx', import.meta.url), 'utf8')
const HEADLINE = src.match(/WELCOME_HEADLINE = '([^']+)'/)?.[1] ?? '(missing)'
const LINE = src.match(/WELCOME_LINE =\s*'([^']+)'/)?.[1] ?? '(missing)'

console.log('\n1. A phone with no plan opens on the welcome page, not setup')
await ev(`(() => { try { localStorage.clear() } catch {} })()`)
await open('&fresh=1')
const seen = await until(`${WELCOME} || ${SETUP} || ${HOME}`)
await wait(400)
await shot('welcome-1-fresh')
check('1a. the welcome page is what a fresh phone shows', seen && await ev(WELCOME))
check('1b. ...and setup has not started behind it', !(await ev(SETUP)))
const text = (await ev(`document.querySelector('[data-testid="welcome"]')?.innerText ?? ''`)) ?? ''
check('1c. it says the headline', text.includes(HEADLINE), text)
check('1d. ...and the one line', text.includes(LINE), text)
const start = await box('[data-welcome-start]'), signin = await box('[data-welcome-signin]')
check('1e. Get started is in sight and at least 44px tall', inSight(start) && start.h >= 44 && /Get started/.test(start.text), start)
check('1f. I already have an account is in sight and at least 44px tall', inSight(signin) && signin.h >= 44 && /I already have an account/.test(signin.text), signin)
const words = await box('[data-testid="welcome"] h1')
check('1g. the headline sits above both buttons, nothing overlapping', !!words && !!start && words.bottom <= start.top && start.bottom <= signin.top, { words, start, signin })

console.log('\n2. I already have an account opens sign-in, and Back returns to the welcome page')
await tap('[data-welcome-signin]')
check('2a. sign-in opens', await until(SIGN_IN, 4000))
await shot('welcome-2-signin')
const back = await ev(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Back') ? true : false`)
check('2b. its way out says Back (not "I\'m new")', back)
await ev(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Back')?.click()`)
check('2c. Back returns to the welcome page', await until(WELCOME, 4000))

console.log('\n3. Get started opens setup')
await tap('[data-welcome-start]')
check('3a. setup opens', await until(SETUP, 8000))
await shot('welcome-3-setup')
check('3b. ...and the welcome page is gone', !(await ev(WELCOME)))

console.log('\n4. A setup already under way goes straight back to it')
await ev(`localStorage.setItem('fitplan_onboarding_draft', JSON.stringify({ version: 1, values: {}, confirmedSlots: [], messages: [], pendingContextFacts: [], pendingGoals: [], updatedAt: new Date(0).toISOString() }))`)
await open('&fresh=1')
const resumed = await until(`${WELCOME} || ${SETUP}`)
await wait(400)
check('4a. a phone part-way through setup opens on setup', resumed && await ev(SETUP) && !(await ev(WELCOME)))

console.log('\n5. A phone holding a plan never sees it')
await ev(`(() => { try { localStorage.clear() } catch {} })()`)
await open('')
const home = await until(`${HOME} || ${WELCOME}`)
check('5a. it opens on Home', home && await ev(HOME))
check('5b. ...with no welcome page', !(await ev(WELCOME)))

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`verify:welcome FAILED: ${failures} of ${ran}`); process.exit(1) }
console.log('verify:welcome passed: a phone with no plan opens on the welcome page, and both buttons go where they say.')
process.exit(0)
