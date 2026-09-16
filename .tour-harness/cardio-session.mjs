// ---------------------------------------------------------------------------
// MAKE WEDNESDAY A CARDIO DAY, FROM THE SCREEN.
//
// Ashley, 15 Sep 2026: *"I want the app chat to be smart... know when to
// suggest adding a session and when something is mentioned in passing"* — and
// her ruling that the coach offers only when she sounds definite.
//
// The COACH half of that is the model's judgement and cannot be driven from
// here: every turn posts to the deployed chat-gemini and needs credentials a
// cloud session does not have. test:cardio-session holds the parts that are
// code — the hedge refusal, the build-time validation, the prompt rule, what
// gets written — and the coach exam grades the judgement.
//
// THIS DRIVES THE SCREEN HALF, which is a real control a person taps and
// which writes through the SAME executor the coach's Confirm calls. So what
// this proves about the written session is true of both surfaces: the card it
// produces is a real one, on the day, in the week list — the thing Ashley
// said was "empty" before.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = '/home/user/PersonalTrAIner-claude/.tour-harness/dist/'
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


// A REST DAY, which is where the control lives. Not today's training day: the
// rest-day card is the screen that has an empty day to fill, and asking the
// page which day is a rest day beats naming a weekday that moves.
const URL_BASE = `http://127.0.0.1:${port}/?tour=off`
await send('Page.navigate', { url: `${URL_BASE}#/tab/exercise` })
await wait(4000)

console.log('\nMAKE A DAY A CARDIO DAY, FROM THE SCREEN\n')

const restDate = await ev(`(() => {
  const t = window.__restDayTarget ?? null
  return t
})()`)
check('0. the fixture has a rest day to fill', !!restDate && !!restDate.date, restDate)
if (!restDate) {
  writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/cardio-session.png',
    Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
  console.error('\nNo rest day in the fixture — nothing to add to.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}
console.log(`  rest day: ${restDate.day} (${restDate.date})`)

await send('Page.navigate', { url: `${URL_BASE}&today=${restDate.date}#/tab/exercise` })
await wait(4000)

const clickText = async (re) => ev(`(() => {
  const el = [...document.querySelectorAll('button, [role="button"]')]
    .find(b => ${re}.test((b.textContent || '').trim()))
  if (!el) return false
  el.scrollIntoView({ block: 'center' }); el.click(); return true
})()`)

// 1. THE CONTROL IS THERE AND SAYS WHAT IT DOES.
const opened = await clickText('/^Make .* a cardio day/i')
check('1. the rest day offers to become a cardio day', opened === true)
await wait(600)

const form = await ev(`(() => {
  const box = document.querySelector('[data-testid="add-cardio"]')
  if (!box) return { found: false, body: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300) }
  return {
    found: true,
    text: box.innerText.replace(/\\s+/g, ' ').trim(),
    inputs: [...box.querySelectorAll('input')].map(i => i.placeholder),
    buttons: [...box.querySelectorAll('button')].map(b => (b.textContent || '').trim()),
  }
})()`)
check('2. it opens a form rather than writing immediately', form.found === true, form)
check('3. ...which says the change reaches the rest of the block, before the tap',
  /rest of this block/i.test(form.text || ''), form.text)
check('4. ...and offers effort in words, not a number between 1 and 10',
  ['Easy', 'Steady', 'Hard'].every(l => (form.buttons || []).includes(l)), form.buttons)

// 2. FILL IT IN AND TAP. React inputs need the native setter or the value is
// set on the DOM node and the component never hears about it.
await ev(`(() => {
  const box = document.querySelector('[data-testid="add-cardio"]')
  const set = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const [activity, mins] = box.querySelectorAll('input')
  set(activity, 'Cycle'); set(mins, '35')
  return true
})()`)
await wait(300)
await clickText('/^Easy$/')
await wait(200)
const tapped = await clickText('/^Add it$/')
check('5. the Add button is reachable and enabled once it is filled in', tapped === true)
await wait(2500)

const after = await ev(`(() => {
  const title = document.querySelector('[data-testid="activity-day-title"]')
  const block = document.querySelector('[data-testid="planned-activity"]')
  let card = block
  for (let i = 0; i < 8 && card && card.parentElement; i++) { card = card.parentElement; if (/rounded/.test(String(card.className))) break }
  card?.scrollIntoView({ block: 'center' })
  return {
    rendered: !!block,
    title: (title?.textContent || '').trim(),
    prescription: block ? block.innerText.replace(/\\s+/g, ' ').trim() : null,
    // THE CARD, not the page. "active recovery" can legitimately appear
    // elsewhere on screen — another day in the week strip, the phase note —
    // and the claim here is about THIS day's own card.
    card: card ? card.innerText.replace(/\\s+/g, ' ').trim() : null,
    body: document.body.innerText.replace(/\\s+/g, ' ').trim(),
  }
})()`)

writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/cardio-session.png',
  Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

// THE WHOLE COMPLAINT, IN ONE CHECK. Before today this produced a day with
// nothing on it; the card has to be a real one.
check('6. the day is now a session, not an empty card', after.rendered === true, after.body?.slice(0, 260))
check('7. ...naming the activity, the minutes and the effort',
  /Cycle/.test(after.prescription || '') && /35m/.test(after.prescription || '') && /RPE 3/.test(after.prescription || ''),
  after.prescription)
check('8. ...and it introduces itself as the session, not as recovery',
  /Cycle/.test(after.title || '') && !/active recovery/i.test(after.card || ''), { title: after.title, card: after.card?.slice(0, 160) })

// 3. IT REACHED THE WEEK, not just this card.
const week = await ev(`(() => {
  const btn = [...document.querySelectorAll('button, [role="button"]')].find(b => /full program|see the whole program|browse/i.test((b.textContent || '').trim()))
  if (btn) btn.click()
  return new Promise(res => setTimeout(() => res(document.body.innerText.replace(/\\s+/g, ' ').trim()), 1400))
})()`)
check('9. the week list shows it too, in the same words',
  /Cycle[^]{0,20}35m/i.test(week || ''), (week || '').slice(0, 400))

const err = await ev('window.__err ?? null')
check('10. no uncaught error on the page', err === null, err)

console.log(failures === 0
  ? '\nA day you make a cardio day is a real session, on the card and in the week.\n'
  : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
