// ---------------------------------------------------------------------------
// COACH REMINDERS, ON THE SCREEN SHE WOULD SWITCH THEM ON.
//
// test:reach-out holds the server's half — who is nudged, when, how often,
// and what the service worker does with a push. This holds the half only a
// real screen can:
//   1. before the migration lands, the section says "not live yet" and
//      offers NO switch (nothing is offered that is not built);
//   2. after it, seven switches, all on, each saving to her profile and
//      reading back after Profile is closed and reopened;
//   3. the phone's own switch asks the browser for permission ONLY when she
//      taps it — never on load — and a yes writes this phone's address for
//      the server; a no-longer leaves nothing behind;
//   4. a refused permission and an iPhone outside the home screen each say
//      what is true and offer no dead switch;
//   5. Home sends the server the facts it cannot work out, and the streak it
//      sends is the streak Home SHOWS.
//
// WHAT IS STUBBED, so the result is not overread: the browser's push machinery
// (permission prompt, subscription) and the function's key endpoint. A
// headless browser has no push service and the harness registers no service
// worker, so those are the seams; everything the APP does around them is
// real. Whether a real phone buzzes is a real phone — the handover says so.
//
// PORT 9483.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { ANCHOR_ISO } from './anchor.mjs'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/profile.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9483', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9483/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const until = async (fn, pred, tries = 40) => { let v = await fn(); for (let i = 0; i < tries && !pred(v); i++) { await wait(250); v = await fn() } return v }
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); await wait(250); return true }

// THE SEAMS. Installed before the page's own scripts on every navigation, so
// the app finds them exactly where it would find the browser's own. `answer`
// is what the permission prompt will say when — if — it is raised.
const stubPush = ({ permission = 'default', answer = 'granted' } = {}) => send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__push = { asked: 0, subscribed: 0, permission: ${JSON.stringify(permission)}, answer: ${JSON.stringify(answer)} }
  try {
    if (!('Notification' in window)) window.Notification = function () {}
    Object.defineProperty(window.Notification, 'permission', { configurable: true, get: () => window.__push.permission })
    window.Notification.requestPermission = async () => { window.__push.asked++; window.__push.permission = window.__push.answer; return window.__push.answer }
    if (!('PushManager' in window)) window.PushManager = function () {}
    let sub = null
    const pushManager = {
      getSubscription: async () => sub,
      subscribe: async (opts) => {
        window.__push.subscribed++
        window.__push.keyBytes = opts && opts.applicationServerKey ? opts.applicationServerKey.length : 0
        sub = {
          endpoint: 'https://push.example/phone-1',
          toJSON: () => ({ endpoint: 'https://push.example/phone-1', keys: { p256dh: 'P256DH-KEY', auth: 'AUTH-SECRET' } }),
          unsubscribe: async () => { sub = null; return true },
        }
        return sub
      },
    }
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ pushManager })
    const realFetch = window.fetch.bind(window)
    window.fetch = (u, o) => String(u).includes('/functions/v1/coach-reach-out')
      ? Promise.resolve(new Response(JSON.stringify({ publicKey: 'B' + 'A'.repeat(86) }), { headers: { 'Content-Type': 'application/json' } }))
      : realFetch(u, o)
  } catch (e) { window.__pushStubError = String(e) }
` })

let stubId = null
const navigate = async (path, stub) => {
  if (stubId) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stubId }); stubId = null }
  if (stub) stubId = (await stubPush(stub)).result?.identifier ?? null
  await send('Page.navigate', { url: `http://127.0.0.1:${port}${path}` })
  await until(() => ev(`!!document.querySelector('[data-slot="dialog-content"]')`), v => v)
  await ev(`(() => { const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /^App$/i.test((x.textContent || '').trim())); if (b && b.getAttribute('aria-expanded') !== 'true') b.click() })()`)
  await wait(300)
}
const SECTION = '[data-testid="reminders-section"]'
const switches = () => ev(`[...document.querySelectorAll('${SECTION} [role="switch"]')].map(s => ({ id: s.id, label: s.getAttribute('aria-label'), on: s.getAttribute('aria-checked') === 'true', disabled: s.disabled }))`)
const sectionText = () => ev(`(document.querySelector('${SECTION}')?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)
const db = expr => ev(`(() => { const db = window.__fakeDb; return ${expr} })()`)

console.log('\nCOACH REMINDERS, AT 390px\n')

// --- 1. Before the migration ---------------------------------------------------------
console.log('  1. Before the migration lands')
await navigate('/', null)
const notLive = await until(sectionText, s => s.length > 20 && !/Loading/.test(s))
check('1a. the section is there, in the App group', /Coach reminders/.test(notLive), notLive)
check('1b. ...and says it is not live yet', /Not live yet/.test(notLive), notLive)
const sw0 = await switches()
check('1c. ...offering no switch that could not save', Array.isArray(sw0) && sw0.length === 0, sw0)
await ev(`document.querySelector('${SECTION}')?.scrollIntoView({ block: 'center' })`)
await shoot('reminders-not-live')

// --- 2. After it: the seven switches -----------------------------------------------------
console.log('  2. After it: which messages')
await navigate('/?reminders=live', { permission: 'default', answer: 'granted' })
const live = await until(sectionText, s => /once a day/.test(s))
check('2a. it says how often and when, in plain words', /once a day at most/.test(live) && /before 8am/.test(live) && /after 9pm/.test(live), live)
const sw1 = await until(switches, v => Array.isArray(v) && v.length >= 8)
const moments = (sw1 ?? []).filter(s => s.id.startsWith('reminder-'))
check('2b. seven message switches, each named for what arrives', moments.length === 7 && moments.every(s => s.label && s.label.length > 10), moments.map(s => s.label))
check('2c. ...all on to begin with (her ruling)', moments.length === 7 && moments.every(s => s.on), moments)
const pushAsked0 = await ev('window.__push?.asked')
check('2d. loading the screen never raised the permission prompt', pushAsked0 === 0, { asked: pushAsked0, stubError: await ev('window.__pushStubError ?? null') })
const rows = await ev(`[...document.querySelectorAll('${SECTION} [role="switch"]')].map(s => Math.round(s.closest('div').getBoundingClientRect().height))`)
check('2e. every switch row is a 44px target or taller', Array.isArray(rows) && rows.length >= 8 && rows.every(h => h >= 44), rows)
await ev(`document.querySelector('${SECTION}')?.scrollIntoView({ block: 'start' })`)
await wait(200)
await shoot('reminders-live')

await tap('#reminder-missed_yesterday')
const afterTap = await until(switches, v => v?.find(s => s.id === 'reminder-missed_yesterday')?.on === false)
check('2f. turning one off shows it off', afterTap?.find(s => s.id === 'reminder-missed_yesterday')?.on === false, afterTap)
const stored = await until(() => db(`db.fitness_profiles[0].notification_switches`), v => v && v.missed_yesterday === false)
check('2g. ...and it is SAVED on her profile, as that one key', stored?.missed_yesterday === false && Object.values(stored ?? {}).filter(v => v === false).length === 1, stored)
check('2h. ...while the others stay on', (afterTap ?? []).filter(s => s.id.startsWith('reminder-') && s.id !== 'reminder-missed_yesterday').every(s => s.on), afterTap)
// Close and reopen: the section remounts and reads the switches back from the
// profile row, so a switch that only lived in React state would come back on.
await ev(`document.querySelector('[data-slot="dialog-close"], button[aria-label="Close"]')?.click()`)
await wait(400)
await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-slot="dialog-content"]')`), v => v)
await ev(`(() => { const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /^App$/i.test((x.textContent || '').trim())); if (b && b.getAttribute('aria-expanded') !== 'true') b.click() })()`)
const reread = await until(switches, v => Array.isArray(v) && v.length >= 8)
check('2i. closing and reopening Profile reads it back off', reread?.find(s => s.id === 'reminder-missed_yesterday')?.on === false && reread.filter(s => s.id.startsWith('reminder-')).length === 7, reread)

// --- 3. This phone ---------------------------------------------------------------------------
console.log('  3. This phone')
const phone0 = (await switches())?.find(s => s.id === 'reminders-phone')
check('3a. the phone starts off, and can be switched', phone0 && phone0.on === false && phone0.disabled === false, phone0)
await tap('#reminders-phone')
const phoneOn = await until(() => switches().then(v => v?.find(s => s.id === 'reminders-phone')), v => v?.on === true)
check('3b. tapping it turns it on', phoneOn?.on === true, { phoneOn, note: await sectionText() })
const push1 = await ev('window.__push')
check('3c. ...having asked the browser exactly once, from the tap', push1?.asked === 1 && push1?.subscribed === 1, push1)
check('3d. ...subscribing with the key the function handed out', push1?.keyBytes === 65, push1)
const subs = await db(`db.push_subscriptions ?? []`)
check('3e. ...and this phone\'s address is saved for the server, with its timezone',
  subs.length === 1 && subs[0].endpoint === 'https://push.example/phone-1' && subs[0].p256dh === 'P256DH-KEY' && subs[0].auth === 'AUTH-SECRET'
    && typeof subs[0].timezone === 'string' && subs[0].timezone.length > 0 && subs[0].user_id === (await db('db.fitness_profiles[0].id')), subs)
await tap('#reminders-phone')
const phoneOff = await until(() => switches().then(v => v?.find(s => s.id === 'reminders-phone')), v => v?.on === false)
check('3f. tapping it again turns it off', phoneOff?.on === false, phoneOff)
check('3g. ...and the server no longer has this phone', (await db(`(db.push_subscriptions ?? []).length`)) === 0, await db('db.push_subscriptions'))

// --- 4. The honest dead ends --------------------------------------------------------------
console.log('  4. When the phone cannot be reached')
await navigate('/?reminders=live', { permission: 'denied', answer: 'denied' })
await until(sectionText, s => /once a day/.test(s))
const blockedPhone = await until(() => switches().then(v => v?.find(s => s.id === 'reminders-phone')), v => v?.disabled === true)
const blockedText = await sectionText()
check('4a. a refused permission: the switch is not offered as if it worked', blockedPhone?.disabled === true && blockedPhone?.on === false, blockedPhone)
check('4b. ...and it says where to change that', /blocked/i.test(blockedText) && /settings/i.test(blockedText), blockedText)
check('4c. ...without asking again', (await ev('window.__push?.asked')) === 0, await ev('window.__push'))
check('4d. ...while the message switches still work (they follow her to other phones)',
  (await switches())?.filter(s => s.id.startsWith('reminder-')).every(s => !s.disabled), await switches())

await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' })
await navigate('/?reminders=live', { permission: 'default', answer: 'granted' })
await until(sectionText, s => /once a day/.test(s))
const iosPhone = await until(() => switches().then(v => v?.find(s => s.id === 'reminders-phone')), v => v?.disabled === true)
const iosText = await sectionText()
check('4e. an iPhone in the browser: no dead switch', iosPhone?.disabled === true, iosPhone)
check('4f. ...and it says to add the app to the home screen first', /home screen/i.test(iosText) && /Add to Home Screen/.test(iosText), iosText)
await ev(`document.querySelector('[data-testid="reminders-phone-note"]')?.scrollIntoView({ block: 'center' })`)
await shoot('reminders-iphone')
await send('Emulation.setUserAgentOverride', { userAgent: '' })

// --- 5. Home sends the facts ahead ------------------------------------------------------------
console.log('  5. Home tells the server what only the plan knows')
if (stubId) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stubId }); stubId = null }
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/real.html` })
const shown = await until(() => ev(`(() => { const m = (document.body.textContent || '').match(/(\\d+)\\s*days?\\s*streak/); return m ? Number(m[1]) : null })()`), v => v !== null)
const facts = await until(() => ev(`(window.__fakeDb?.coach_moment_facts ?? [])[0] ?? null`), v => v !== null)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
check('5a. Home sent the facts once it had a plan', !!facts, facts)
check('5b. ...the weekday pattern, as real weekday names', Array.isArray(facts?.training_weekdays) && facts.training_weekdays.length >= 2 && facts.training_weekdays.every(d => WEEKDAYS.includes(d)), facts?.training_weekdays)
check('5c. ...the streak it SHOWS, not some other count', typeof shown === 'number' && facts?.streak_days === shown, { shown, sent: facts?.streak_days })
check('5d. ...counted as of the day on screen', facts?.streak_as_of === ANCHOR_ISO, facts?.streak_as_of)
check('5e. ...and a block end after today, no later than the plan end',
  typeof facts?.block_ends_on === 'string' && typeof facts?.plan_ends_on === 'string' && facts.block_ends_on > ANCHOR_ISO && facts.block_ends_on <= facts.plan_ends_on, facts)
// One row per person and no repeat sends are test:reach-out §8's: this page
// renders Home once, so a count here could not fail.

console.log(`\nreminders: ${ran} checks ran`)
console.log(failures === 0 ? 'Coach reminders: every screen check passed.\n' : `\n${failures} reminders check(s) failed.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
