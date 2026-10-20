// ---------------------------------------------------------------------------
// "MOVE SOME OF LUNCH'S CALORIES TO DINNER", ASKED OF THE COACH — 20 Oct 2026.
//
// The live test of 19 Oct: those words, both meals named, got the whole-day
// resize's "nothing to resize — tell me which". Ashley's ruling: "Ask how much
// first", with buttons, then both new sizes before Apply.
//
// WHICH HALF THIS PROVES. chat.tsx (?daymove=1) renders the real ChatAssistant
// with the controller from the app's OWN useMealDays hook — the one App.tsx
// calls and hands to the Move sheet. The model (chat-gemini) is stubbed at the
// fetch boundary, here, answering with the courier proposal and no prose (the
// live shape) — or, for the backstop, with the WRONG tool (the whole-day
// resize), which is what it did on 19 Oct. So the question, its buttons, the
// card, the pending action, the confirm, the two writes and the Undo are the
// real client. That the deployed coach reaches for the right tool is the
// exam's (meal-rebalance-not-refit).
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { ANCHOR_ISO } from './anchor.mjs'

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

const PORT = 9564
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// THE STUB, at the fetch boundary. window.__tool says which tool the "model" reaches for on the next message:
//   'rebalance' — the right one, propose_meal_rebalance, with an amount when the message carries one ("200 kcal to dinner");
//   'refit'     — the WRONG one, propose_meal_refit, which is what the coach did on 19 Oct.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  window.__tool = 'rebalance'
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (u.includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (window.__tool === 'refit') {
        return json({ reply: '', proposal: { kind: 'propose_meal_refit', rawArgs: { origin_verbatim_quote: said } } })
      }
      const amount = /(\\d+) kcal to (\\w+)/.exec(said)
      if (amount) {
        return json({ reply: '', proposal: { kind: 'propose_meal_rebalance', rawArgs: { from_slot: 'lunch', to_slot: amount[2], kcal: Number(amount[1]), origin_verbatim_quote: said } } })
      }
      if (/lunch/i.test(said) && /dinner/i.test(said)) {
        return json({ reply: '', proposal: { kind: 'propose_meal_rebalance', rawArgs: { from_slot: 'lunch', to_slot: 'dinner', origin_verbatim_quote: said } } })
      }
      return json({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
let loads = 0
const load = async () => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?daymove=1&n=${++loads}` })
  await wait(3500)
  let ready = await ev(`!!document.querySelector('textarea')`)
  for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
  for (let i = 0; i < 40; i++) { if (Object.keys((await ev(`window.__weekMeals ? window.__weekMeals() : {}`)) ?? {}).length === 7) break; await wait(250) }
  return ready === true
}
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(300)
  return ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))
    if (!b || b.disabled) return false
    b.click(); return true
  })()`)
}
const READ = String.raw`(() => {
  const text = document.body.innerText
  const btns = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  return { text, btns,
    // Offers are text with small buttons since 20 Oct: the newest offer, still open, with Apply and Not now.
    hasCard: [...document.querySelectorAll('[data-testid="proposal-card"][data-offer="text"]')].pop()?.getAttribute('data-card-status') === 'pending' && btns.some(b => /^Apply/.test(b)) && btns.includes('Not now'),
    card: [...document.querySelectorAll('[data-testid="proposal-card"]')].pop()?.innerText ?? '',
    hasUndo: btns.includes('Undo') }
})()`
const read = () => ev(READ)
/** Waits for `re` in what came AFTER `from` (her last message), so an older bubble saying the same can never satisfy it. */
const answered = async (re, from = '', tries = 50) => {
  const seen = t => re.test(from ? t.slice(t.lastIndexOf(from)) : t)
  let r = await read(); for (let i = 0; i < tries && !seen(r.text); i++) { await wait(400); r = await read() } await wait(1200); return read()
}
const tapButton = label => ev(`(() => { const b = [...document.querySelectorAll('button')].reverse().find(x => (x.textContent || '').trim() === ${JSON.stringify(label)}); if (!b || b.disabled) return false; b.click(); return true })()`)
const apply = () => ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim())); if (!b || b.disabled) return false; b.click(); return true })()`)
const week = () => ev(`window.__weekMeals()`)
const picks = () => ev(`window.__mealPicks()`)
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const TODAY = ANCHOR_ISO
/** The newest bubble's text: the reply to the last thing said. */
const tail = (r, from) => r.text.slice(r.text.lastIndexOf(from))

console.log('\n[1] Her words, both meals named: the APP asks how much, with buttons')
check('the chat is up with the week served', await load())
const w0 = await week()
const k0 = await ev(`window.__todayKcal()`)
check('today has a lunch and a dinner', !!w0[TODAY]?.lunch && !!w0[TODAY]?.dinner && k0.lunch > 0 && k0.dinner > 0, { w0: w0[TODAY], k0 })
const SAID = "move some of lunch's calories to dinner"
check('her sentence goes (her own words from 19 Oct)', await say(SAID))
let r = await answered(/How much should I move from lunch to dinner\?/)
const q = `Today's lunch is ${fmt(k0.lunch)} kcal and dinner ${fmt(k0.dinner)}. How much should I move from lunch to dinner?`
check('the reply is the app\'s question, quoting both meals at the sizes the week serves', tail(r, SAID).includes(q), tail(r, SAID).slice(0, 400))
check('...NOT the whole-day resize\'s refusal', !/nothing to resize|tell me which and I'll look/.test(r.text))
check('...with the amounts as buttons that say what they move and where',
  ['100 kcal to dinner', '200 kcal to dinner', '300 kcal to dinner'].every(b => r.btns.includes(b)), r.btns)
check('...the tag carrying them never shown', !/QUICK_REPLIES/.test(r.text))
check('...and no card yet: asked first', r.hasCard === false)
check('nothing written', (await picks()).length === 0)
await shoot('chat-rebalance-ask')

console.log('\n[2] Tapping "200 kcal to dinner": both new sizes, before Apply')
check('the button sends', await tapButton('200 kcal to dinner'))
r = await answered(/Want me to move about 200 kcal from today's lunch to dinner\?/)
check('a card, asking rather than announcing', r.hasCard === true && /Want me to move about 200 kcal from today's lunch to dinner\?/.test(r.text), r.text.slice(-700))
const card = r.card
const lunchName = w0[TODAY].lunch, dinnerName = w0[TODAY].dinner
// One line per meal: "Today's lunch · Dish: 1,199 kcal · 90 g protein → 999 kcal · 75 g protein (down 200 kcal)".
const sizeRe = slot => new RegExp(`Today's ${slot} · [^\\n]+?: ${fmt(k0[slot])} kcal · (\\d+) g protein → ([\\d,]+) kcal · (\\d+) g protein`)
const lm = sizeRe('lunch').exec(card), dm = sizeRe('dinner').exec(card)
const lAfter = lm ? Number(lm[2].replace(/,/g, '')) : NaN, dAfter = dm ? Number(dm[2].replace(/,/g, '')) : NaN
check('it names today\'s lunch by its dish, as served now and after', card.includes(`Today's lunch · ${lunchName}`) && !!lm, card.slice(0, 500))
check('...about 200 kcal lighter, protein with it', Math.abs(lAfter - (k0.lunch - 200)) <= 15 && Number(lm?.[3]) < Number(lm?.[1]), lm)
check('...and today\'s dinner about 200 kcal heavier', card.includes(`Today's dinner · ${dinnerName}`) && Math.abs(dAfter - (k0.dinner + 200)) <= 15 && Number(dm?.[3]) > Number(dm?.[1]), dm)
check('...the day\'s total said', /Your day stays at about [\d,]+ kcal|re-fitted around these two/.test(card), card.slice(-500))
check('...and the protein that moves named', /Lunch goes down about \d+ g of protein and dinner up about \d+ g\./.test(card), card.slice(-500))
check('nothing written until the tap', (await picks()).length === 0 && JSON.stringify(await week()) === JSON.stringify(w0))
await shoot('chat-rebalance-card')

console.log('\n[3] Apply')
check('Apply', await apply())
r = await answered(/Moved/)
const w1 = await week()
check('a receipt says Moved, with each meal\'s new size', /Moved/.test(r.text) && r.text.includes(`now ${fmt(lAfter)} kcal`) && r.text.includes(`now ${fmt(dAfter)} kcal`), r.text.slice(-400))
check('...and an Undo', r.hasUndo === true, r.btns)
check('today now serves the two copies', w1[TODAY].lunch === `${lunchName} (smaller)` && w1[TODAY].dinner === `${dinnerName} (bigger)`, w1[TODAY])
check('...at exactly the sizes the card said', JSON.stringify(await ev(`window.__todayKcal()`)) === JSON.stringify({ ...k0, lunch: lAfter, dinner: dAfter }), await ev(`window.__todayKcal()`))
check('...saved as today\'s two picks', (await picks()).length === 2 && (await picks()).every(p => p.date === TODAY), await picks())
check('...and no other day moved', Object.keys(w0).filter(d => d !== TODAY).every(d => JSON.stringify(w1[d]) === JSON.stringify(w0[d])))
await shoot('chat-rebalance-receipt')

console.log('\n[4] Undo puts both back exactly')
check('Undo', await tapButton('Undo'))
r = await answered(/as they were/)
check('the receipt says both are as they were', /Today's lunch and dinner are as they were\./.test(r.text), r.text.slice(-300))
check('no picks left, and today is exactly as before', (await picks()).length === 0 && JSON.stringify(await week()) === JSON.stringify(w0) && JSON.stringify(await ev(`window.__todayKcal()`)) === JSON.stringify(k0))
await shoot('chat-rebalance-undone')

console.log('\n[5] The backstop: the coach reaches for the whole-day resize, as on 19 Oct')
await ev(`window.__tool = 'refit'`)
const SAID2 = 'make lunch smaller and dinner bigger'
await say(SAID2)
r = await answered(/How much should I move from lunch to dinner\?|nothing to resize/, SAID2)
check('two meals and a direction in her words: the app asks how much, never "nothing to resize"',
  tail(r, SAID2).includes(q) && !/nothing to resize/.test(tail(r, SAID2)), tail(r, SAID2).slice(0, 300))
check('...with the same buttons', ['100 kcal to dinner', '200 kcal to dinner', '300 kcal to dinner'].every(b => r.btns.includes(b)), r.btns)
// With the amount in her words too, the backstop's card must be a calorie-move card all the way to the write.
const SAID2b = 'make lunch 100 kcal smaller and dinner bigger'
await say(SAID2b)
r = await answered(/Want me to move about 100 kcal from today's lunch to dinner\?/, SAID2b)
check('two meals, a direction AND an amount: the backstop goes straight to the card', r.hasCard === true && /Want me to move about 100 kcal from today's lunch to dinner\?/.test(tail(r, SAID2b)), tail(r, SAID2b).slice(0, 300))
check('...whose Apply writes the calorie move', await apply())
r = await answered(/Moved[\s\S]*Undo/, SAID2b)
check('...a Moved receipt and today\'s copies', /Moved/.test(tail(r, SAID2b)) && (await week())[TODAY].lunch === `${lunchName} (smaller)`, tail(r, SAID2b).slice(-300))
check('...and its Undo puts them back', await tapButton('Undo'))
r = await answered(/as they were/, SAID2b)
check('...exactly', (await picks()).length === 0 && JSON.stringify(await week()) === JSON.stringify(w0))
const SAID3 = 'can you move calories between lunch and dinner'
await say(SAID3)
r = await answered(/Which way/, SAID3)
check('two meals, no direction: asked which way, never "tell me which"', tail(r, SAID3).includes('Which way — from lunch to dinner, or from dinner to lunch?') && !/tell me which and/.test(tail(r, SAID3)), tail(r, SAID3).slice(0, 300))
check('...both ways as buttons', r.btns.includes('From lunch to dinner') && r.btns.includes('From dinner to lunch'), r.btns)
const SAID4 = 'my lunch and dinner are over my target'
await say(SAID4)
r = await answered(/nothing to resize/, SAID4)
check('two meals named, no move, a day that fits: the refusal offers the move and asks "which way", never "tell me which" meal',
  /there's nothing to resize as a whole\. If you'd like some of one meal's calories moved to the other, tell me which way/.test(tail(r, SAID4)) && !/tell me which and I'll look at that one/.test(tail(r, SAID4)), tail(r, SAID4).slice(0, 300))
check('...and no card from any of these', (await picks()).length === 0)
await shoot('chat-rebalance-backstop')

console.log('\n[6] A meal already eaten stays as eaten')
await ev(`window.__tool = 'rebalance'`)
await ev(`window.__fakeDb.meal_events.push({ profile_id: window.__fakeDb.fitness_profiles[0].id, client_id: 'eaten-lunch', date: ${JSON.stringify(TODAY)}, slot: 'lunch', event_type: 'confirmed', meal_name: 'Eaten lunch', macros: { kcal: 700, protein: 40, carbs: 80, fat: 20 }, source: 'manual', created_at: '${TODAY}T12:00:00.000Z', voided_at: null })`)
const SAID5 = 'take 200 kcal from lunch and put it on dinner'
await say(SAID5)
r = await answered(/stays as you ate it/, SAID5)
check('lunch logged as eaten: refused in plain words, no question, no card', tail(r, SAID5).includes("You've already logged today's lunch as eaten, so it stays as you ate it.") && !/How much should I move/.test(tail(r, SAID5)), tail(r, SAID5).slice(0, 300))
check('...nothing written', (await picks()).length === 0)

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'chat rebalance: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
