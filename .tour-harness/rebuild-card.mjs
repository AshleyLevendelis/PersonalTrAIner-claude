// ---------------------------------------------------------------------------
// THE REBUILD CARD SAYS WHEN AND WHAT, ON A REAL SCREEN — run 5, 11 Oct 2026 (H28, H27).
//
// She asked for new training days "from next week". The card said "Rebuilds 16 weeks from week 1 on. Anything
// you've already logged stays exactly as it is." and the rebuild started that day. test:rebuild-honours holds the
// rules on pure functions; this drives the real chat at phone size, with the model stubbed at the fetch boundary:
//
//   1  the card names the start date she asked for and each day of the first week it changes, and the old
//      "Rebuilds N weeks from week 1" line is gone
//   2  nothing is written before the tap; Apply rebuilds; Undo retitles the card "Put back"; an Undo tapped after
//      its ten minutes says so on the card and goes (run 7, M53)
//   3  H27: "end the knee adjustment early" with nothing running gets a reason in words, never "I couldn't find
//      that on your current plan"
//
// PORT 9471.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { anchorDate, DAY_NAMES } from './anchor.mjs'

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

const portBusy = await fetch('http://127.0.0.1:9471/json/version').then(() => true, () => false)
if (portBusy) { console.error('    ✗ port 9471 already has a browser on it — another run of this driver is still alive'); process.exit(1) }
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9471', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9471/json/list').then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// The harness profile trains today, +2, +4 and +5; the new days are three it does not.
const todayIdx = anchorDate().getDay()
const NEW_DAYS = [1, 3, 6].map(o => DAY_NAMES[(todayIdx + o) % 7])
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/next week/i.test(said)) return json({ reply: '', proposal: { kind: 'propose_schedule_change', rawArgs: { training_days: ${JSON.stringify(NEW_DAYS)}, starts: 'next_week', reason: 'new days from next week' } } })
      if (/knee/i.test(said)) return json({ reply: '', proposal: { kind: 'propose_injury_recovered', rawArgs: { affected_area: 'knees' } } })
      return json({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })

console.log('\nA REBUILD CARD SAYS WHEN AND WHAT\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
let ready = false
for (let i = 0; i < 40 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', ready === true)

const say = async text => ev(`(() => {
  const t = document.querySelector('textarea'); if (!t) return false
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(text)})
  t.dispatchEvent(new Event('input', { bubbles: true }))
  const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))
  if (!b || b.disabled) return false
  b.click(); return true
})()`)
const READ = String.raw`(() => {
  const text = document.body.innerText
  const btns = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  return { text, btns, hasCard: !!document.querySelector('[data-testid="proposal-card"][data-offer="text"]') && btns.some(b => /^Apply/.test(b)) }
})()`

check('1. she asks for new days from next week', await say(`Can we change to ${NEW_DAYS.join(', ')} from next week?`))
let r = await ev(READ)
for (let i = 0; i < 60 && !(r.hasCard && /Starts from/.test(r.text)); i++) { await wait(500); r = await ev(READ) }
check('1a. a card comes', r.hasCard === true, r.btns)
check('1b. IT SAYS THE DATE SHE ASKED FOR, in words', /Starts from \w{3} \d{1,2} \w{3}, when your next training week starts/.test(r.text), r.text.slice(-1500))
check('1c. ...and lists the first week it changes, day by day', /Week \d+: \w{3} \d{1,2} \w{3}: /.test(r.text), r.text.slice(-1500))
check('1d. ...and the old "Rebuilds N weeks from week 1 on" line is gone', !/Rebuilds \d+ weeks? from week \d+ on/.test(r.text))
// What was left of that line after its words came out was a lone full stop on its own row (seen 11 Oct).
check('1e. ...leaving no empty line behind', r.text.split('\n').every(line => !/^[.\s]+$/.test(line) || line.trim() === ''), r.text.split('\n').filter(l => /^[.\s]+$/.test(l) && l.trim() !== ''))
await shoot('rebuild-card')

check('2. Apply', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim())); if (!b || b.disabled) return false; b.click(); return true })()`))
let after = await ev(READ)
for (let i = 0; i < 60 && !after.btns.includes('Undo'); i++) { await wait(500); after = await ev(READ) }
check('2a. a receipt with an Undo', after.btns.includes('Undo'), after.btns)
await shoot('rebuild-card-applied')
check('2b. Undo', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Undo'); if (!b) return false; b.click(); return true })()`))
let undone = await ev(READ)
for (let i = 0; i < 40 && !/was taken back/.test(undone.text); i++) { await wait(500); undone = await ev(READ) }
check('2c. THE CARD SAYS IT WAS UNDONE: "Put back", and what was taken back', /Put back/.test(undone.text) && /was taken back\. Everything is as it was before\./.test(undone.text), undone.text.slice(-800))
check('2d. ...and no Undo is left to tap twice', !undone.btns.includes('Undo'), undone.btns)
await shoot('rebuild-card-undone')

// M53 (run 7): an OLD card's Undo. Apply again, then move the page's clock past the ten minutes without a re-render
// (the button is still drawn, as it was on her phone) and tap it. It must say it could not undo, keep the title,
// and take the dead button away. Date.now is what the window is measured on, so that is what moves.
check('2e. the same request again, applied', await say(`Can we change to ${NEW_DAYS.join(', ')} from next week?`))
let again = await ev(READ)
for (let i = 0; i < 60 && !again.hasCard; i++) { await wait(500); again = await ev(READ) }
await ev(`(() => { const b = [...document.querySelectorAll('button')].filter(x => /^Apply/.test((x.textContent || '').trim())).pop(); if (!b || b.disabled) return false; b.click(); return true })()`)
for (let i = 0; i < 60 && (again.btns.filter(b => b === 'Undo').length < 1 || !/Rescheduled/.test(again.text.slice(again.text.lastIndexOf('from next week?')))); i++) { await wait(500); again = await ev(READ) }
check('2f. a fresh receipt with its Undo', again.btns.includes('Undo') && /Rescheduled/.test(again.text.slice(again.text.lastIndexOf('from next week?'))), again.btns)
await ev(`(() => { window.__realNow = Date.now; Date.now = () => window.__realNow.call(Date) + 11 * 60_000; return true })()`)
check('2g. eleven minutes later, the Undo still drawn is tapped', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Undo'); if (!b) return false; b.click(); return true })()`))
let late = await ev(READ)
for (let i = 0; i < 40 && !/Undo only lasts/.test(late.text); i++) { await wait(500); late = await ev(READ) }
const lastCard = late.text.slice(late.text.lastIndexOf('from next week?'))
check('2h. THE CARD SAYS IT COULD NOT UNDO, and why', /Couldn't undo\s*Undo only lasts 10 minutes, so nothing was changed\./.test(lastCard), lastCard.slice(-600))
check('2i. ...keeps saying what did happen ("Rescheduled", not "Put back")', /Rescheduled/.test(lastCard) && !/was taken back/.test(lastCard), lastCard.slice(-600))
check('2j. ...and the dead Undo is gone', !late.btns.includes('Undo'), late.btns)
await shoot('rebuild-card-undo-too-late')
await ev(`(() => { Date.now = window.__realNow; return true })()`)

check('3. "end the knee adjustment early", with nothing running', await say('Please end the two-week knee adjustment early'))
let knee = await ev(READ)
// The reply types itself out; wait for its last word, not its first.
for (let i = 0; i < 60 && !/so there's nothing to end\./.test(knee.text) && !/couldn't find that/.test(knee.text); i++) { await wait(500); knee = await ev(READ) }
check('3a. A REASON IN WORDS: nothing is easing off your knees', /Nothing is easing off your knees right now and it isn't on your injuries list, so there's nothing to end\./.test(knee.text), knee.text.slice(-600))
check('3b. ...never "I couldn\'t find that on your current plan"', !/I couldn't find that on your current plan/.test(knee.text))
await shoot('rebuild-card-knee')

const err = await ev('window.__err ?? null')
check('4. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'The card says when and what, Undo says so, and the knee gets a reason.\n' : `${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
