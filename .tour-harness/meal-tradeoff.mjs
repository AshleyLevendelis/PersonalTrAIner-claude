// ---------------------------------------------------------------------------
// A MEAL CHANGE THAT WORKS AGAINST THE GOAL IS ASKED ABOUT — in a real browser.
//
// Ashley's ruling of 14 Sep 2026 applied to food. The exercise half shipped
// that day; measured the same day, the meal half did not exist at all: three
// of the coach's seventeen proposal builders carried the trade-off, all
// exercise, and the app held exactly ONE `shouldAsk` call site.
//
// THIS EXISTS BECAUSE NO SOURCE CHECK CAN SEE A DEAD BRANCH. Recorded in
// CLAUDE.md and measured on the exercise side: changing the guard to
// `if (false && advice)` disabled the whole step and all twelve wiring checks
// stayed green, because they read text and the text was still there. The meal
// wiring hangs off `if (!advice && built)`, which is exactly as invisible.
//
// TWO ASKS, AND THE SECOND IS THE POINT — same shape as verify:tradeoff. The
// first goal-damaging meal change must produce a QUESTION and no card; the
// second identical one must produce a CARD. That is "once per block, per
// thing" working, and it is also what proves the first outcome was a decision
// rather than the meal card path being broken.
// ---------------------------------------------------------------------------
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9423', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9423/json/list').then(r => r.json())
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
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 360)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

console.log('\nA MEAL CHANGE THAT WORKS AGAINST THE GOAL IS ASKED ABOUT\n')

// The model is stubbed at the fetch boundary. Everything after it — the meal
// builder, the real verifyProposal against the real food table, the day
// arithmetic and the verdict — is the app's own code.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (!/take|remove|drop/i.test(said)) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({
        reply: '',
        proposal: {
          kind: 'propose_meal_food_remove',
          rawArgs: { meal_slot: 'dinner', food: 'salmon', date: window.__mealDay?.today },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

const day = await ev('window.__mealDay ?? null')
check('0a. the page has a real day of meals with targets behind it',
  !!day && !!day.targets && Array.isArray(day.plan) && day.plan.length >= 3, day && { targets: day.targets, slots: day.plan?.map(m => m.meal) })
if (!day?.targets) {
  console.error('\nNo meal day on the page — nothing to drive.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}
const dinner = day.plan.find(m => m.meal === 'dinner')?.items?.[0]
console.log(`  dinner is "${dinner?.name}" at ${dinner?.protein}g protein, against a ${Math.round(day.targets.protein)}g day`)

let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0b. the chat is up', ready === true)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const ask = async words => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(words)}) })()`)
  await wait(400)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (b && !b.disabled) b.click() })()`)
  await wait(4500)
}

const READ = `(() => {
  const text = document.body.innerText
  const buttons = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  return {
    hasCard: /Proposed change/i.test(text),
    hasApply: buttons.some(t => /^Apply/.test(t)),
    chips: buttons.filter(t => t.length < 34),
    tail: text.replace(/\\s+/g, ' ').slice(-460),
  }
})()`

// --- 1. THE FIRST ASK ------------------------------------------------------
await ask('take the salmon out of my dinner')
const first = await ev(READ)
await shoot('meal-tradeoff-ask')

check('1a. it does NOT put a confirm card up', first.hasCard === false && first.hasApply === false, first)
check('1b. ...it asks a question instead', /\?/.test(first.tail), first.tail)
// THE GOAL'S OWN TERMS. A macro table already existed; the whole point is a
// sentence about what the number MEANS, so the protein has to be spoken.
check('1c. ...naming protein, in grams, against the target',
  /protein/i.test(first.tail) && /\d+\s*g/i.test(first.tail), first.tail)
check('1d. ...and offers "Do it anyway"', first.chips.some(c => /do it anyway/i.test(c)), first.chips)
check('1e. ...alongside a cheaper route, not on its own',
  first.chips.filter(c => !/do it anyway/i.test(c) && !/^(Send|Chat|Home|Nutrition|Exercise|Tools)$/i.test(c)).length >= 1, first.chips)
// It must never read as an internal explanation.
check('1f. ...and never says "score", "tier" or "dimension"',
  !/score|tier|dimension/i.test(first.tail), first.tail)

// --- 2. THE SECOND ASK -----------------------------------------------------
await ask('take the salmon out of my dinner')
const second = await ev(READ)
await shoot('meal-tradeoff-second-ask')

check('2a. asked a second time, it stops asking and shows the card', second.hasCard === true, second)
check('2b. ...so the change was never blocked, only slowed by one tap', second.hasApply === true, second)

const err = await ev('window.__err ?? null')
check('3. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA goal-damaging meal change is asked about, then allowed.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
