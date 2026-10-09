// ---------------------------------------------------------------------------
// WHAT HAPPENS WHEN A TURN COMES BACK — the real onboarding screen, with the
// coach scripted (see scripted.tsx for why and how).
//
// From the 9 Oct 2026 test log, all seen by a person on a phone and none
// reachable by any check before this one:
//
//   H14  the coach asked "how old are you, and what are your current height
//        and weight?" above chips reading 2 meals / 3 meals / 4 meals; two
//        turns later the real meals question arrived with no chips.
//   M2   a question was re-asked after a detour and its chips stayed on the
//        older message, off screen.
//   M4   tapping a row under "Tap anything above to change it" put the reply
//        above the summary, off screen, and stacked a duplicate per tap.
//
// Trusted input through CDP (Input.*), not el.click(): this harness has a
// history of synthetic clicks behaving differently from taps.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const PORT = 9700
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.onb-harness/scripted.html' : p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium',
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'],
  { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 60; i++) {
  try {
    const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
})
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = x => send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }).then(r => r.result?.result?.value)
const evj = async x => JSON.parse(await ev(`JSON.stringify(${x})`) ?? 'null')

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

let failures = 0, ran = 0
const check = (label, ok, extra) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`) }
}

const INPUT = '.ob-composer-fade input'
const SENDBTN = 'button:has(svg.lucide-send)'

async function open(state) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?state=${state}` })
  await wait(1500)
}
async function tapAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 })
  }
  await wait(150)
}
/** Tap the centre of the element a page-side expression returns. Refuses an element that is off screen: a person cannot tap what they cannot see. */
async function tapEl(expr, what) {
  const b = await evj(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (!b) throw new Error(`nothing to tap: ${what}`)
  if (b.y < 0 || b.y > 844) throw new Error(`${what} is off screen at y=${Math.round(b.y)}`)
  await tapAt(b.x, b.y)
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(new URL(`./turns-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}
const queue = turn => ev(`window.__onbQueue.push(${JSON.stringify(turn)})`)
/** Type into the composer and send, then wait for the scripted reply to land. */
async function say(text) {
  await tapEl(`document.querySelector(${JSON.stringify(INPUT)})`, 'the composer')
  await send('Input.insertText', { text })
  await wait(120)
  await tapEl(`document.querySelector(${JSON.stringify(SENDBTN)})`, 'the send button')
  await wait(900)
}

// Page-side helpers. `cards(key)` is every RENDERED card for a slot, with the
// words of the coach message it sits under and where it is on the screen.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__cards = key => [...document.querySelectorAll('[data-slot-card' + (key ? '="' + key + '"' : '') + ']')].map(el => {
    const r = el.getBoundingClientRect()
    const composer = document.querySelector('.ob-composer-fade input').getBoundingClientRect()
    const scroller = document.querySelector('[class*="overflow-y-auto"]').getBoundingClientRect()
    return {
      key: el.getAttribute('data-slot-card'),
      under: (el.parentElement.firstElementChild.textContent || '').trim(),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      inView: r.top >= scroller.top - 1 && r.bottom <= composer.top + 1,
      labels: [...el.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()),
    }
  })
  window.__bubble = text => {
    const el = [...document.querySelectorAll('.ob-user-bubble')].reverse().find(b => (b.textContent || '').includes(text))
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }
  window.__body = () => document.body.innerText
` })

// A step that throws (an element missing or off screen) is a FAILED check, not
// a crash: one exit, and the browser is always closed on the way out.
try {
// ---------------------------------------------------------------------------
console.log('\n[1] H14 — chips belong to the question the message asks')
{
  await open('h14')
  check('harness: the recovery card is on screen to begin with', (await evj(`__cards('recoveryCapacity')`)).length === 1)
  // The model's two legs, stapled: leg 1 recorded the answer and asked for
  // MEALS chips; leg 2 wrote a sentence about age, height and weight.
  await queue({
    reply: 'Decent sleep goes a long way. How old are you, and what are your current height and weight?',
    actions: [
      { name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } },
      { name: 'present_slot', args: { slot_key: 'mealsPerDay' } },
    ],
  })
  await say('I sleep fine, about seven hours, and work is not too stressful')
  const all = await evj(`__cards()`)
  const underAge = all.filter(c => /how old are you/i.test(c.under))
  check('no meals chips anywhere under the age / height / weight question',
    !underAge.some(c => c.key === 'mealsPerDay'), underAge)
  check('...and nothing on the page offers "3 meals" as an answer to it',
    !underAge.some(c => c.labels.some(l => /meals/i.test(l))), underAge.map(c => c.labels))
  check('the card that IS under it is the age / height / weight one',
    underAge.length === 1 && underAge[0].key === 'age', underAge)
  check('...on screen, where the question is', underAge.length === 1 && underAge[0].inView, underAge)
  await shot('h14-age-question')

  // Two turns later the real meals question arrives. Its chips must be there.
  await queue({
    reply: 'Thanks, that sets the numbers up. Which should I use for the maths — male or female?',
    actions: [
      { name: 'set_slot', args: { slot_key: 'age', value: '31' } },
      { name: 'set_slot', args: { slot_key: 'heightCm', value: '178' } },
      { name: 'set_slot', args: { slot_key: 'weightKg', value: '82' } },
      { name: 'present_slot', args: { slot_key: 'gender' } },
    ],
  })
  await say('31, 178cm and 82kg')
  check('the sex question carries its own two options',
    (await evj(`__cards('gender')`)).some(c => /male or female/i.test(c.under) && c.inView), await evj(`__cards()`))
  await queue({
    reply: 'On to food. How many meals a day suits you?',
    actions: [{ name: 'present_slot', args: { slot_key: 'mealsPerDay' } }],
  })
  await say('Male')
  const meals = await evj(`__cards('mealsPerDay')`)
  check('the real meals question has its chips', meals.length === 1, meals)
  check('...under the message that asks it', meals.length === 1 && /how many meals a day/i.test(meals[0].under), meals)
  check('...and on screen', meals.length === 1 && meals[0].inView, meals)
}

console.log('\n[2] H14 — both legs asked for chips: the ones that fit the words win')
{
  await open('h14')
  await queue({
    reply: 'Good, that helps. Which should I use for your calorie maths — male or female?',
    actions: [
      { name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } },
      { name: 'present_slot', args: { slot_key: 'mealsPerDay' } },
      { name: 'present_slot', args: { slot_key: 'gender' } },
    ],
  })
  await say('sleeping well, no real stress')
  const all = await evj(`__cards()`)
  const under = all.filter(c => /male or female/i.test(c.under))
  check('the sex question gets the sex options, not the first card the model named',
    under.length === 1 && under[0].key === 'gender', all)
  check('no meals chips on the page at all', !all.some(c => c.key === 'mealsPerDay'), all)
}

console.log('\n[3] H14 — a question the app cannot place gets no chips rather than wrong ones')
{
  await open('h14')
  await queue({
    reply: "Glad it's steady. What's the longest you've ever stuck with a routine?",
    actions: [
      { name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } },
      { name: 'present_slot', args: { slot_key: 'mealsPerDay' } },
    ],
  })
  await say('sleeping well, no real stress')
  const all = await evj(`__cards()`)
  check('no card at all under a question that belongs to no slot', all.length === 0, all)
  check('...and the typing box still works for it', (await ev(`document.querySelector(${JSON.stringify(INPUT)}).readOnly`)) === false)
}

// ---------------------------------------------------------------------------
console.log('\n[4] M2 — a re-asked question brings its chips with it')
{
  await open('m2')
  const before = await evj(`__cards('sessionDuration')`)
  check('harness: the session-length card starts on the first asking', before.length === 1 && /realistically got/i.test(before[0].under), before)
  await queue({
    reply: "Good question, and I'll give it a proper answer once I know a bit more about you, because the answer depends on how you train. Back to those three days: how long can your sessions usually run?",
    actions: [{ name: 'present_slot', args: { slot_key: 'sessionDuration' } }],
  })
  await say('what does creatine actually do, should I take it?')
  const cards = await evj(`__cards('sessionDuration')`)
  const bubble = await evj(`__bubble('creatine')`)
  check('exactly one session-length card is on the page', cards.length === 1, cards)
  check('...under the message that re-asks it', cards.length === 1 && /how long can your sessions usually run/i.test(cards[0].under), cards)
  check('...below the detour, not above it', cards.length === 1 && !!bubble && cards[0].top > bubble.bottom, { cards, bubble })
  check('...and on screen', cards.length === 1 && cards[0].inView, cards)
  await shot('m2-reasked')
  // A refresh must not bring the old copy back: the move is saved, not just drawn.
  await open('keep')
  const reloaded = await evj(`__cards('sessionDuration')`)
  check('after a reload there is still exactly one, still under the re-ask',
    reloaded.length === 1 && /how long can your sessions usually run/i.test(reloaded[0].under), reloaded)
  // The moved card is a working control, not a picture of one.
  await queue({ reply: 'Thirty to forty-five it is. How do you like to train?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingStyle' } }] })
  await tapEl(`[...document.querySelectorAll('[data-slot-card="sessionDuration"] button')].find(b => /30-45/.test(b.textContent))`, 'the 30-45 option')
  await wait(900)
  const sent = await evj(`window.__onbRequests[window.__onbRequests.length - 1]`)
  check('tapping the moved card records the answer', sent?.state?.filled?.sessionDuration !== undefined, sent?.state?.filled)
  check('...and the card goes away once answered', (await evj(`__cards('sessionDuration')`)).length === 0)
}

console.log('\n[5] M2 — a detour that does NOT re-ask leaves the question where it was')
{
  await open('m2')
  await queue({ reply: "Good question. I'll come back to it properly once we're set up.", actions: [] })
  await say('what does creatine actually do, should I take it?')
  const cards = await evj(`__cards('sessionDuration')`)
  check('the original card is still there, once', cards.length === 1 && /realistically got/i.test(cards[0].under), cards)
}

console.log('\n[6] M2 — the coach re-asks but forgets to ask for the chips: they still come along')
{
  await open('m2')
  await queue({
    reply: "Short version: it helps you squeeze out a bit more on hard sets. Now, how long can your sessions usually run?",
    actions: [],
  })
  await say('what does creatine actually do, should I take it?')
  const cards = await evj(`__cards('sessionDuration')`)
  check('still exactly one session-length card', cards.length === 1, cards)
  check('...and it has moved down to the re-asked question', cards.length === 1 && /how long can your sessions usually run/i.test(cards[0].under) && cards[0].inView, cards)
}

check('harness: every request in this run was scripted', (await ev(`window.__onbUnscripted`)) === 0)
} catch (e) {
  check(`the run reached its end — ${e instanceof Error ? e.message : String(e)}`, false)
}

chrome.kill(); server.close()
console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) failed.\n`); process.exit(1) }
console.log('Every turn put its chips under the question it asked.\n')
