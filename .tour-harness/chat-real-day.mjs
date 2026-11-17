import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/chat.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9673', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9673/json/list').then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// A REAL DAY THROUGH THE CHAT (stage 2 of docs/plans/coach-reaches-everything.md, 17 Nov 2026). One conversation
// from morning to evening, the coach STUBBED to make each known kind of mistake at its point in the day: a ban off
// "today", a standing class off "tonight", a one-day shorten off "from now on", a run off a maybe. Every stage-1 rule
// must catch its one, nothing is offered for it, and the RIGHT offers made the same day still arrive with Apply.
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
      const offer = (kind, rawArgs) => json({ reply: '', proposal: { kind, rawArgs } })
      if (/squats today/i.test(said)) return offer('propose_exercise_ban', { exercise_name: 'Barbell Back Squat', reason: 'not today' })
      if (/kickboxing/i.test(said)) return offer('propose_concurrent_activity', { name: 'Kickboxing', days: ['Thursday'], time_of_day: 'evening', intensity: 0.8, movement_demands: [] })
      if (/45 minutes/i.test(said)) return offer('propose_session_shorten', { minutes: 45 })
      if (/run/i.test(said)) return offer('propose_cardio_session', { activity: 'Run', day: 'Wednesday', duration_minutes: 30, origin_verbatim_quote: said })
      return json({ reply: 'Have a good one, enjoy the session.' })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)
let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', ready === true)

const setValue = `(el, v) => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  const sent = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
  await wait(3500)
  return sent
}
const cards = () => ev(`document.querySelectorAll('[data-testid="proposal-card"]').length`)
const applies = () => ev(`[...document.querySelectorAll('button')].filter(b => /^Apply/.test((b.textContent || '').trim())).length`)
const text = () => ev('document.body.innerText')
const count = (t, re) => (t.match(re) || []).length

check('1a. a plain message goes', await say('off to the gym in twenty'))
check('1b. ...and gets the coach\'s words, nothing offered', /Have a good one/.test(await text()) && (await cards()) === 0, { cards: await cards(), tail: (await text()).slice(-300) })

check('2a. midday mistake: "squats today" goes, the model reaches for a BAN', await say("not feeling squats today, skip them"))
check('2b. ...no ban card, no Apply', (await cards()) === 0 && (await applies()) === 0, { cards: await cards() })
check('2c. ...the app says the plan is left as it is', count(await text(), /I've left your plan as it is/g) === 1, (await text()).slice(-300))

check('3a. evening mistake: a class TONIGHT, the model reaches for a standing class', await say('kickboxing class tonight after work'))
check('3b. ...no card', (await cards()) === 0)
check('3c. ...the app says how to make it weekly', /If it's every week, tell me which days/.test(await text()))

check('4a. right: the class EVERY week', await say('I do kickboxing every Thursday evening, most weeks'))
check('4b. ...gets its offer with Apply, after two refusals the same day', (await cards()) === 1 && (await applies()) === 1, { cards: await cards(), applies: await applies() })

check('5a. mistake: 45 minutes FROM NOW ON, the model reaches for today only', await say("I've only got 45 minutes from now on"))
check('5b. ...no new card', (await cards()) === 1)
check('5c. ...the app says it would only cover one day', /that change would only cover one day/.test(await text()))

check('6a. right: 45 minutes TODAY', await say("I've only got 45 minutes today"))
check('6b. ...gets the shorten offer', (await cards()) === 2, { cards: await cards() })

check('7a. mistake: a MAYBE run, the model puts it on the plan', await say('I might go for a run on Wednesday'))
check('7b. ...nothing is put on the plan', (await cards()) === 2)
check('7c. ...the app says so', /If you decide to do it, tell me/.test(await text()))

const t = await text()
check('8. three different refusals in one day, each said once (no repeats, no stacking)', count(t, /I've left your plan as it is/g) === 4, count(t, /I've left your plan as it is/g))
await shoot('chat-real-day')

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('A whole day through the chat: every known mistake caught, every right offer kept.\n')
