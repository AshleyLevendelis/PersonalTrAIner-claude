// ---------------------------------------------------------------------------
// THE ALLERGY CARD IN THE CHAT (his rulings 15 Nov 2026; docs/plans/allergy-card.md). PORT 9953.
// The coach is stubbed at the fetch boundary; what is driven is the app's half: the pen line under his message
// before the coach answers, a promise sentence replaced, the refusal that names the allergy, the offer and its tap.
// What it cannot see: what the deployed coach says with the record in its context (the exam's to grade).
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9953', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9953/json/list').then(r => r.json())
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


// The coach stub: promises what it cannot check, cards a named food, and otherwise answers plainly.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  window.__ctx = null
  const realFetch = window.fetch
  const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const body = JSON.parse((init && init.body) || '{}')
      window.__ctx = body.context || body.profileContext || body
      const said = String(body.message || '')
      await new Promise(r => setTimeout(r, 1200))
      if (/is my plan safe/i.test(said)) return json({ reply: 'Good question. Everything in your plan strictly avoids cross-contamination. Your dinner tonight is chicken and rice.' })
      if (/^can you swap/i.test(said)) return json({ reply: 'Here is a swap for you.', proposal: { kind: 'propose_meal_swap', rawArgs: { meal_slot: 'lunch', origin_verbatim_quote: said } } })
      if (/lips/i.test(said)) return json({ reply: 'That sounds serious. Please get help straight away.' })
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


const bubbles = () => ev(`[...document.querySelectorAll('[data-testid="chat-bubble"]')].map(b => ({ role: b.getAttribute('data-role'), text: b.innerText.trim() }))`)
const PEN = 'Use your adrenaline pen now and call 999.'
let b, all

console.log('\n1. He carries a pen and describes a reaction: the first-aid line comes first\n')
check('1a. the chat is up, tree-nut allergy with a pen', await open('allergies=tree nuts:pen:avoid&daymove=1'))
// Read while the coach is still thinking (the stub waits 1.2 s): the line must already be there.
await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, 'my lips are swelling after that pesto') })()`)
await wait(300)
await ev(`[...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))?.click()`)
await wait(500)
all = await bubbles()
const mine = all.map(x => x.text).lastIndexOf('my lips are swelling after that pesto')
check('1b. the pen line is under his message before the coach has answered', mine >= 0 && all[mine + 1]?.role === 'assistant' && all[mine + 1]?.text === PEN, all.slice(-3))
await wait(3500)
all = await bubbles()
check('1c. the coach\'s reply comes after it, not instead of it', all.findIndex(x => x.text === PEN) >= 0 && all.findIndex(x => /get help straight away/.test(x.text)) > all.findIndex(x => x.text === PEN), all.slice(-3))
check('1d. the line is said once', all.filter(x => x.text === PEN).length === 1)
await shoot('allergy-card-reaction')

console.log('\n2. The same words with no pen recorded: the line is not said\n')
check('2a. the chat is up, tree-nut allergy, no pen', await open('allergies=tree nuts&daymove=1'))
await say('my lips are swelling after that pesto')
all = await bubbles()
check('2b. no pen line without a pen', all.every(x => x.text !== PEN) && all.some(x => /get help straight away/.test(x.text)), all.slice(-3))

console.log('\n3. The coach never promises what the app cannot check\n')
await say('is my plan safe for me?')
b = await last()
check('3a. the promise sentence is gone', typeof b.text === 'string' && !/strictly avoids/.test(b.text), b)
check('3b. the app\'s honest line is said in its place', /I can't check traces or cross-contamination\. Ingredients are filtered, not verified, so keep checking labels\./.test(b.text ?? ''), b)
check('3c. the rest of the coach\'s reply stands', /Good question\./.test(b.text ?? '') && /chicken and rice/.test(b.text ?? ''), b)
await shoot('allergy-card-no-promise')

console.log('\n4. The refusal says the allergy, and peanuts are not tree nuts\n')
await say('can you swap my snack for almond butter on toast')
b = await last()
check('4a. "you have a tree-nut allergy", never "your profile says"', /^Almond butter has tree nuts in it, and you have a tree-nut allergy, so I won't suggest it or add it to your meals\. Your allergies are on Profile, under Food, Allergies\.$/.test(b.text ?? ''), b)
check('4b. no card was built', b.cards === 0, b)
await say('is peanut butter on toast a good snack?')
b = await last()
check('4c. peanut butter is not refused for a tree-nut allergy', /Chicken and rice is a solid choice/.test(b.text ?? ''), b)
const ctx = await ev(`JSON.stringify(window.__ctx)`)
check('4d. the coach was sent the record in words', /Tree nuts/.test(ctx ?? ''), (ctx ?? '').slice(0, 200))

console.log('\n5. A promise is left alone when no allergen rule is on\n')
check('5a. the chat is up, nothing recorded', await open('daymove=1'))
await say('is my plan safe for me?')
b = await last()
check('5b. the coach\'s words are untouched with no allergen rule', /strictly avoids/.test(b.text ?? ''), b)

console.log('\n6. "I\'m allergic to tree nuts" offers the card; nothing is saved before the tap\n')
await say("I'm allergic to tree nuts")
all = await bubbles()
const offer = all.find(x => /^Shall I record your tree-nut allergy on your profile\?/.test(x.text))
check('6a. the app offers to record it', !!offer, all.slice(-2))
const stored = () => ev(`JSON.stringify((window.__fakeDb?.fitness_profiles ?? [])[0]?.allergies ?? null)`)
const before = await stored()
check('6b. nothing is recorded before the tap', before === '[]' || before === 'null', before)
await ev(`(() => { const btn = [...document.querySelectorAll('button')].filter(x => /^Apply$/i.test(x.textContent.trim())).pop(); btn?.click() })()`)
await wait(2500)
all = await bubbles()
const pageText = await ev(`document.body.innerText`)
check('6c. the receipt says it was recorded and where the details go', /Allergy recorded/.test(pageText ?? '') && /Profile, under Food, Allergies/.test(pageText ?? ''), (pageText ?? '').slice(-400))
const after = await stored()
check('6d. the record is in the profile, tree nuts only', /"allergen":"tree nuts"/.test(after ?? '') && !/peanuts/.test(after ?? ''), after)
await shoot('allergy-card-offer')

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log("The allergy card's chat half holds.\n")
