// ---------------------------------------------------------------------------
// AN AMOUNT THE APP CANNOT READ IS ASKED ABOUT, AND ONE IT CAN READ IS COSTED
// RIGHT — in a real browser, through the real chat (1 Oct 2026).
//
// Ashley's two rulings that day: a line she types that the app cannot read is
// asked about ("how many grams?") and nothing is saved until she answers; and
// "understood" means the food AND the amount. test:ingredient-units holds the
// logic. THIS holds what she SEES, which no source check can: that the question
// is on screen where she is looking, that it quotes her own line, that no card
// with a Confirm button appeared beside it, and that a meal written in ounces,
// cups and counts reaches a card with the right numbers on it rather than a
// confident 8 grams of chicken.
//
// The model is stubbed at the fetch boundary. Everything after it (the custom
// meal builder, the real verifyProposal against the real food table, the card)
// is the app's own code. The coach's OWN half, log_meal on the edge function,
// cannot be driven from here: it is deployed code, held by source checks in
// test:ingredient-units and proven live only after the chat-gemini deploy.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9497', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9497/json/list').then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 420)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

console.log('\nAN UNREADABLE AMOUNT IS ASKED ABOUT; A READABLE ONE IS COSTED RIGHT\n')

// What the model "says" depends on what she typed, so each turn is its own case.
const CASES = {
  butter: ['150g chicken breast', '1 knob butter'],
  pint: ['150g chicken breast', '1 knob butter', '1 pint milk whole'],
  ounces: ['8 oz chicken breast', '1 cup white rice cooked', '2 carrots'],
}
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const CASES = ${JSON.stringify(CASES)}
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const key = /pint/i.test(said) ? 'pint' : /butter/i.test(said) ? 'butter' : /ounce/i.test(said) ? 'ounces' : null
      if (!key) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({
        reply: '',
        proposal: {
          kind: 'propose_custom_meal',
          rawArgs: { meal_slot: 'dinner', name: 'My dinner', food_lines: CASES[key], origin_verbatim_quote: said, date: window.__mealDay?.today },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', ready === true)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const say = async words => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(words)}) })()`)
  await wait(400)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (b && !b.disabled) b.click() })()`)
  await wait(4500)
}

// Where a phrase sits on screen: the smallest element holding it, and whether that box is inside the viewport.
const WHERE = phrase => `(() => {
  const want = ${JSON.stringify(phrase)}.toLowerCase()
  let best = null
  for (const el of document.querySelectorAll('body *')) {
    const t = (el.textContent || '').toLowerCase()
    if (!t.includes(want)) continue
    if (!best || t.length < (best.textContent || '').length) best = el
  }
  if (!best) return null
  const r = best.getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), inside: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0 && r.height > 0, text: (best.textContent || '').replace(/\\s+/g, ' ').slice(0, 300) }
})()`
const READ = `(() => {
  const text = document.body.innerText
  const buttons = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  return { hasCard: /Proposed change|Your portions, untouched/i.test(text), hasConfirm: buttons.some(t => /^(Apply|Set as your meal|Confirm)/i.test(t)), text: text.replace(/\\s+/g, ' ') }
})()`

// --- 1. ONE UNREADABLE LINE ------------------------------------------------
await say('my dinner was 150g chicken breast and a knob of butter')
const one = await ev(READ)
const oneWhere = await ev(WHERE('knob butter'))
await shoot('unit-ask-one')
check('1a. the question quotes her own line', /1 knob butter/.test(one.text), one.text.slice(-300))
check('1b. ...asks for the amount in grams', /how many grams/i.test(one.text), one.text.slice(-300))
check('1c. ...says nothing was added, of HER dinner (not "My dinner", a title in the middle of a sentence)', /haven't added your dinner/i.test(one.text) && !/added My dinner/.test(one.text), one.text.slice(-300))
check('1d. ...with NO card and no Confirm button beside it: nothing is saved until she answers', one.hasCard === false && one.hasConfirm === false, { hasCard: one.hasCard, hasConfirm: one.hasConfirm })
check('1e. ...and the question is on screen where she is looking, not a scroll away', !!oneWhere && oneWhere.inside === true, oneWhere)

// --- 2. TWO UNREADABLE LINES -----------------------------------------------
await say('my dinner was chicken, a knob of butter and a pint of milk')
const two = await ev(READ)
await shoot('unit-ask-two')
check('2a. both lines are quoted in the one question', /1 knob butter/.test(two.text) && /1 pint milk whole/.test(two.text), two.text.slice(-340))
check('2b. ...and it asks for each', /each/i.test(two.text.slice(-340)), two.text.slice(-340))
check('2c. ...still no card', two.hasCard === false || two.text.lastIndexOf('1 pint milk whole') > two.text.lastIndexOf('Your portions, untouched'), { hasCard: two.hasCard })

// --- 3. A MEAL IN OUNCES, CUPS AND COUNTS IS COSTED RIGHT ------------------
await say('my dinner was eight ounces of chicken, a cup of rice and two carrots')
const oz = await ev(READ)
const ozWhere = await ev(WHERE('Your portions, untouched'))
await shoot('unit-ask-ounces')
check('3a. a card comes up: she is not asked about what the app can read', oz.hasCard === true && oz.hasConfirm === true, oz.text.slice(-420))
// 8 oz is 227 g; the old reader put "oz chicken breast" at 8 g.
check('3b. the chicken is 227 g on the card (8 oz), not 8', /227g chicken breast/.test(ozWhere?.text ?? ''), ozWhere)
check('3c. ...and the cup of rice is "1 cup" and the carrots are "2 carrots", said as a person would, nothing re-portioned', /1 cup white rice cooked/.test(ozWhere?.text ?? '') && /2 carrots?/.test(ozWhere?.text ?? '') && !/1cup|2whole/.test(ozWhere?.text ?? ''), ozWhere)
const proteinAfter = Number((oz.text.match(/Protein\s*\d+(?:\.\d+)?g\s*budgeted\s*(\d+(?:\.\d+)?)g/i) ?? [])[1])
check('3d. ...so the protein it shows is the real chicken, over 60 g, where the misread chicken gave under 10', proteinAfter > 60, { proteinAfter, tail: oz.text.slice(-420) })

// A cup of cooked rice is 160 g (about 45 g of carbs); with the two carrots the meal is 57 g. The old cup of 240 g gave about 80.
const carbsAfter = Number((oz.text.match(/Carbs\s*\d+(?:\.\d+)?g\s*budgeted\s*(\d+(?:\.\d+)?)g/i) ?? [])[1])
check('3e. ...and the carbs are those of a 160 g cup of rice, not the old 240 g one', carbsAfter >= 50 && carbsAfter <= 66, { carbsAfter })

const err = await ev('window.__err ?? null')
check('4. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? '\nAn unreadable amount is asked about; a readable one is costed right.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
