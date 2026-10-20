// ---------------------------------------------------------------------------
// A FOOD SHE NAMES THAT HER PROFILE KEEPS OUT IS SAID FIRST, AND NEVER CARDED (runs 7-10, H41, 18 Oct 2026).
//
// Sam (tree-nut allergy, stored as nut-free) asked to swap his snack for almond butter on toast and was handed a
// protein-shake swap card with nothing said; asked why not, the coach offered to add it as a custom dish. Her two
// rulings give the words: "Say 'nut-free'", then "Refuse and say if they dont have an allergy they should go to the
// settings and update the allergy". The coach is stubbed AT
// THE FETCH BOUNDARY with the WORST behaviour the live coach showed, so what is driven is the app's own half
// (ChatAssistant's processResponse wrapper over namedFoodClash):
//   1. a swap card for the named food is not built: the bubble is her sentence, and no card is on screen;
//   2. a prose reply that offers to build it is replaced by the same refusal: the offer never reaches him;
//   3. a food her profile does not keep out is untouched: the coach's own words, unchanged;
//   4. the same message from a profile with no restriction is untouched (the restriction is what binds).
// What it cannot see: whether the deployed coach obeys its new prompt line (the exam's to grade).
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9519', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9519/json/list').then(r => r.json())
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

let ran = 0
let failures = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// The coach at its worst: carding the named food, then offering to build it.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (/^can you swap/i.test(said)) {
        // What Sam got: a swap to the NEXT saved lunch, the almond butter silently dropped. The lunch IS one of his
        // saved options, so without the block a real card would be built and drawn.
        return json({ reply: 'Here is a swap for you.', proposal: { kind: 'propose_meal_swap', rawArgs: { meal_slot: 'lunch', origin_verbatim_quote: said } } })
      }
      if (/why not/i.test(said)) return json({ reply: 'I can add it as a custom dish if you like.' })
      return json({ reply: 'Chicken and rice is a solid choice before training.' })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
// daymove=1 seeds five saved options a meal, so a swap card CAN be built and the block is what stops it (section 6).
let load = 0
async function open(query) {
  // Each load its own address, so a second load is never a same-page jump.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?load=${++load}${query ? `&${query}` : ''}` })
  await wait(3000)
  let ready = await ev(`!!document.querySelector('textarea')`)
  for (let i = 0; i < 30 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
  return ready === true
}
async function say(text) {
  const before = await ev(`window.__chatCalls`)
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(300)
  const sent = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))
    if (!b || b.disabled) return false
    b.click(); return true
  })()`)
  for (let i = 0; i < 20; i++) { await wait(250); if ((await ev(`window.__chatCalls`)) > before) break }
  await wait(2500)
  return sent === true
}
/** The last coach bubble's words, where it sits on screen, and how many cards the chat holds. */
const last = () => ev(`(() => {
  const bs = [...document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]')]
  const b = bs[bs.length - 1]
  const r = b ? b.getBoundingClientRect() : null
  // Offers count too: since 20 Oct 2026 ("text + small buttons always") an offer is the coach's bubble with its
  // buttons, outside the cards column, so the cards column alone would read zero with an offer on screen.
  const cards = [...document.querySelectorAll('[data-testid="chat-cards"]')].reduce((n, c) => n + c.children.length, 0)
    + document.querySelectorAll('[data-testid="proposal-card"]').length
  return { text: b ? b.innerText.trim() : null, inView: !!r && r.top >= 0 && r.bottom <= 844, cards }
})()`)

const SENTENCE = "Almond butter has tree nuts in it, and your profile says nut-free, so I won't suggest it or add it to your meals. If you don't have a nut allergy, change it on Profile, under Food, Diet."

console.log('\n1. Nut-free: a swap card for almond butter is not built; the refusal is the reply\n')
check('1a. the chat is up, nut-free', await open('diet=nut-free&daymove=1'))
check('1b. said it', await say("can you swap today's lunch for almond butter on toast?"))
let b = await last()
check('1c. the bubble is the refusal, word for word', b.text === SENTENCE, b)
check('1d. ...on screen where the reply is', b.inView, b)
check('1e. no card: nothing to tap that would put almond butter on his plate', b.cards === 0, b)
await shoot('named-food-clash-swap')

console.log('\n2. A prose reply offering to build it is replaced by the refusal\n')
check('2a. said it', await say('why not the almond butter?'))
b = await last()
check('2b. the reply is the refusal, word for word', b.text === SENTENCE, b)
check("2c. ...the coach's offer to build it never reaches him", typeof b.text === 'string' && !/custom dish/i.test(b.text), b)
await shoot('named-food-clash-why-not')

console.log('\n3. A food the profile does not keep out is untouched\n')
check('3a. said it', await say('is chicken and rice ok before training?'))
b = await last()
check("3b. the coach's words, unchanged", b.text === 'Chicken and rice is a solid choice before training.', b)

console.log('\n4. The same request with no restriction: the restriction is what binds\n')
check('4a. the chat is up, no restriction', await open('daymove=1'))
check('4b. said it', await say('why not the almond butter?'))
b = await last()
check("4c. the coach's words, with no nut sentence", b.text === 'I can add it as a custom dish if you like.', b)
check('4d. the coach was asked once on the fresh load (one message, one call)', (await ev(`window.__chatCalls`)) === 1, await ev(`window.__chatCalls`))

console.log('\n5. A diet that is not an allergy: the coach keeps its words (her ruling was about allergies)\n')
check('5a. the chat is up, vegetarian', await open('diet=vegetarian&daymove=1'))
check('5b. said it', await say('is chicken and rice ok before training?'))
b = await last()
check("5c. the coach's words, unchanged", b.text === 'Chicken and rice is a solid choice before training.', b)
check('5d. ...but a swap card for it is still not built', await say("can you swap today's lunch for chicken and rice?") && (await last()).cards === 0 && /has meat or fish in it, and your profile says vegetarian/.test((await last()).text ?? ''), await last())

console.log('\n6. The block binds: the same swap with no restriction IS carded\n')
check('6a. the chat is up, no restriction', await open('daymove=1'))
check('6b. said it', await say("can you swap today's lunch for almond butter on toast?"))
b = await last()
check('6c. a card is drawn (so 1e is not passing on a harness that cannot draw one)', b.cards > 0, b)

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log("A food his profile keeps out is said first, in her words, and never carded.\n")
