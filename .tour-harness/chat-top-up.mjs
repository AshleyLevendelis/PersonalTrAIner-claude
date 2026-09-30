// ---------------------------------------------------------------------------
// "GIVE ME MORE MEAL OPTIONS", ASKED OF THE COACH — 29 Sep 2026.
//
// The Nutrition tab's "Get more options" has been able to top every meal up to
// seven since 28 Sep (Ashley: "Button, keep today"); the coach could only find
// more for ONE meal, and only once she had run out of swaps. This holds the
// coach's half: a card that asks first, says what it will not touch and the
// day the new meals start, writes NOTHING until the tap, and reports what
// landed. It also holds the refusal: with every meal full there is no card.
//
// WHICH HALF THIS PROVES. chat.tsx (?topup=1) renders the real ChatAssistant
// with props built by the app's own topUpNeeds, previewTopUpStart and
// topUpMealPlan over a fake database. The model (chat-gemini) and the meal
// generator (generate-meals) are stubbed at the fetch boundary, here. So the
// card, the builder, the pending-action store, the confirm arm and the run are
// the real client. It does not boot App.tsx: that App hands the chat the same
// pools-derived needs and the same run as the Nutrition button is held by
// test:meal-top-up.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9495', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9495/json/list').then(r => r.json())
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

// The model answers "give me more options" with the courier proposal and NO
// prose, the live shape. The meal generator answers whatever it is asked for
// (`count` dishes per slot, built from the plan's own foods so they verify),
// or a 502 when the driver says it is down. Every request is counted so
// "nothing is generated before the tap" is a fact and not a hope.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__generateCalls = 0
  window.__genFail = false
  let made = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (/more (meal )?options/i.test(said)) {
        return json({ reply: '', proposal: { kind: 'propose_meal_top_up', rawArgs: { origin_verbatim_quote: 'more meal options' } } })
      }
      return json({ reply: 'Sure.' })
    }
    if (u.includes('generate-meals')) {
      window.__generateCalls++
      if (window.__genFail) return json({ error: 'simulated cut-off reply' }, 502)
      const body = JSON.parse((init && init.body) || '{}')
      // window.__genOnly: deliver ONE meal's worth and nothing for the others.
      const meals = (body.slots || []).filter(s => !window.__genOnly || s.slot === window.__genOnly).flatMap(s => Array.from({ length: s.count }, () => {
        made++
        return { slot: s.slot, name: 'Fresh ' + s.slot + ' plate ' + made, cuisine: 'British / Classic', prep: 'Grill the chicken, warm the rice, serve.',
          ingredients: ['110g chicken breast', '250g cooked basmati rice', '12g olive oil'] }
      }))
      return json({ meals })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const load = async qs => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?topup=1&${qs}` })
  await wait(3500)
  let ready = await ev(`!!document.querySelector('textarea')`)
  for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
  // The pools are read back asynchronously; wait until the app has them.
  for (let i = 0; i < 30; i++) { if (Object.keys((await ev(`window.__topUpPools ? window.__topUpPools() : {}`)) ?? {}).length > 0) break; await wait(200) }
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
    hasCard: /Proposed change/i.test(text) && btns.some(b => /^Apply/.test(b)) && btns.includes('Keep'),
    hasUndo: btns.includes('Undo') }
})()`
const rowsOnPage = () => ev(`window.__fakeDb.meal_plan_slots.length`)
const weekday = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const START = addDays(ANCHOR_ISO, 2)
const STARTS_ON = weekday(START)

console.log('\n[1] Asking the coach for more meal options')
check('the chat is up with a plan of five options a meal', await load(''))
const before = await ev(`window.__topUpPools()`)
check('the sanity check: every meal has five options', JSON.stringify(before) === JSON.stringify({ breakfast: 5, lunch: 5, dinner: 5 }), before)
check('her sentence goes', await say('Can you give me more meal options please'))
let r = await ev(READ)
for (let i = 0; i < 60 && !(r.hasCard && /\?/.test(r.text)); i++) { await wait(500); r = await ev(READ) }
check('a CARD, not a sentence: she is asked', r.hasCard === true, r.btns)
check('...it asks rather than announcing', /Want me to add more options to each of your meals\?/.test(r.text) && !/I've added|Done —/.test(r.text), r.text.slice(0, 300))
check('...one row per meal, five to seven', ['Breakfast', 'Lunch', 'Dinner'].every(m => new RegExp(`${m}[\\s\\S]{0,20}5 options[\\s\\S]{0,20}7 options`).test(r.text)), r.text.slice(0, 500))
check('...saying before the tap what it will not touch, as one clean line',
  /Unchanged: Today and every day on your shopping list, and every option you already have — nothing is removed or resized\./.test(r.text)
  && !/\.,/.test(r.text), r.text.slice(0, 600))
const order = ['Breakfast', 'Lunch', 'Dinner'].map(m => r.text.indexOf(m))
check('...the meals in the order of the day, not alphabetical', order.every(i => i >= 0) && order[0] < order[1] && order[1] < order[2], order)
check('...and the day the new meals start, worked out from her list', r.text.includes(`The new meals start on ${STARTS_ON}; every day before then stays as it was.`), { want: STARTS_ON, text: r.text.slice(0, 600) })
check('...with no Undo promised, and no number of dishes stated by the coach', !/Undo/.test(r.text) && !/\b\d+ new meals\b/.test(r.text), r.text.slice(0, 300))
await shoot('chat-top-up-card')

console.log('\n[2] Nothing is made until she taps')
check('no meal was generated', (await ev(`window.__generateCalls`)) === 0)
check('...and none was stored', (await rowsOnPage()) === 15, await rowsOnPage())

console.log('\n[3] Tapping Apply')
check('Apply', await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim()))
  if (!b || b.disabled) return false
  b.click(); return true
})()`))
let after = await ev(READ)
for (let i = 0; i < 80 && !/Added/.test(after.text); i++) { await wait(500); after = await ev(READ) }
check('a receipt says Added', /\bAdded\b/.test(after.text), after.text.slice(-400))
check('...one line per meal, two options each', ['Breakfast', 'Lunch', 'Dinner'].every(m => new RegExp(`${m}[\\s\\S]{0,12}\\+2 options`).test(after.text)), after.text.slice(-500))
check('...and the day they start', new RegExp(`Starting[\\s\\S]{0,12}${STARTS_ON}`).test(after.text), after.text.slice(-500))
check('...with no Undo (named in the code: the options can be ignored for free)', after.hasUndo === false, after.btns)
check('the generator was asked once for all three meals, not three times', (await ev(`window.__generateCalls`)) === 1, await ev(`window.__generateCalls`))
const grown = await ev(`window.__topUpPools()`)
check('every meal now has seven options, as the app reads them back', JSON.stringify(grown) === JSON.stringify({ breakfast: 7, lunch: 7, dinner: 7 }), grown)
const stamped = await ev(`window.__fakeDb.meal_plan_slots.filter(r => (r.tags || []).some(t => t === 'new-from:${START}')).length`)
check('the six new meals carry their first day; the fifteen already there carry none', stamped === 6 && (await ev(`window.__fakeDb.meal_plan_slots.filter(r => (r.tags || []).some(t => String(t).startsWith('new-from:'))).length`)) === 6, stamped)
await shoot('chat-top-up-receipt')

console.log('\n[4] Asking again when every meal is full')
check('her sentence goes', await say('Can you give me more meal options please'))
await wait(3500)
let again = await ev(READ)
for (let i = 0; i < 40 && !/Every meal already has at least 7 options/.test(again.text); i++) { await wait(500); again = await ev(READ) }
check('there is no second card: nothing left to Apply', !again.btns.some(b => /^Apply/.test(b)), again.btns)
check('...and it says why, without promising more or pointing at a control',
  /Every meal already has at least 7 options, so there's nothing to add\./.test(again.text) && !/Nutrition tab|Regenerate|button/i.test(again.text.split("nothing to add").pop() ?? ''), again.text.slice(-400))
check('nothing more was generated', (await ev(`window.__generateCalls`)) === 1)

console.log('\n[5] The meal generator is down: nothing changes, and it says so')
check('a fresh plan of five', await load('fail=1'))
await ev(`window.__genFail = true`)
check('her sentence goes', await say('Can you give me more meal options please'))
let down = await ev(READ)
for (let i = 0; i < 60 && !down.hasCard; i++) { await wait(500); down = await ev(READ) }
check('the card still asks first', down.hasCard === true)
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim())); b?.click() })()`)
let failed = await ev(READ)
for (let i = 0; i < 80 && !/Nothing was applied/i.test(failed.text); i++) { await wait(500); failed = await ev(READ) }
await wait(1500)
failed = await ev(READ)
check("the receipt says it couldn't, and gives the cause once",
  /I couldn't add more meals/.test(failed.text) && /Nothing was applied — I couldn't reach the meal generator just then\./.test(failed.text), failed.text.slice(-400))
check('...with no doubled full stop, and "nothing" said once', !/\.\./.test(failed.text.slice(-400)) && (failed.text.slice(-400).match(/nothing/gi) ?? []).length === 1, failed.text.slice(-400))
check('...and no meal was stored', (await rowsOnPage()) === 15, await rowsOnPage())
await shoot('chat-top-up-failed')

console.log('\n[6] The generator only delivers one meal\'s worth: it lands as PARTIAL, and says so')
check('a fresh plan of five', await load('partial=1'))
await ev(`window.__genOnly = 'breakfast'`)
check('her sentence goes', await say('Can you give me more meal options please'))
let part = await ev(READ)
for (let i = 0; i < 60 && !part.hasCard; i++) { await wait(500); part = await ev(READ) }
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim())); b?.click() })()`)
for (let i = 0; i < 80 && !/\bAdded\b/.test(part.text); i++) { await wait(500); part = await ev(READ) }
await wait(600)
part = await ev(READ)
check('it is still an Added, for the meal that landed', /\bAdded\b/.test(part.text) && /Breakfast[\s\S]{0,12}\+2 options/.test(part.text), part.text.slice(-400))
check('...the meals that did not come back are not claimed', !/Lunch[\s\S]{0,12}\+2 options/.test(part.text) && !/Dinner[\s\S]{0,12}\+2 options/.test(part.text), part.text.slice(-400))
check('...and it owns up to what is missing: 4 of the 6', /4 of the 6 didn't come back, so there's room to try again/.test(part.text), part.text.slice(-500))
check('...without printing an internal tool name to her', !/propose_/.test(part.text), part.text.slice(-500))
check('the pools read back to match: breakfast seven, the others still five', JSON.stringify(await ev(`window.__topUpPools()`)) === JSON.stringify({ breakfast: 7, lunch: 5, dinner: 5 }), await ev(`window.__topUpPools()`))
await shoot('chat-top-up-partial')

console.log('\n[7] Seven dishes a meal, only two dinners that fit: the coach offers meals that do')
check('a full plan of seven a meal', await load('topfit=1'))
const fullPools = await ev(`window.__topUpPools()`)
check('the sanity check: seven of each, and the app finds only two dinners that fit', JSON.stringify(fullPools) === JSON.stringify({ breakfast: 7, lunch: 7, dinner: 7 })
  && (await ev(`window.__topUpPlan().fewFit.dinner`)) === 2 && Object.keys(await ev(`window.__topUpPlan().short`)).length === 0, [fullPools, await ev(`window.__topUpPlan()`)])
check('her sentence goes', await say('Can you give me more meal options please'))
let fit = await ev(READ)
for (let i = 0; i < 60 && !(fit.hasCard && /\?/.test(fit.text)); i++) { await wait(500); fit = await ev(READ) }
check('a CARD, not a refusal: with every meal full by count it would have said there was nothing to add', fit.hasCard === true && !/nothing to add/.test(fit.text), fit.btns)
check('...it asks for meals that fit, in the app\'s words', /Want me to add meals that fit your targets, where too few of your dishes do\?/.test(fit.text), fit.text.slice(-500))
check('...one row, for the dinner: two of seven fit, up to five of ten', /Dinner[\s\S]{0,20}2 of 7 fit[\s\S]{0,20}up to 5 of 10 fit/.test(fit.text) && !/Breakfast[\s\S]{0,20}fit/.test(fit.text) && !/Lunch[\s\S]{0,20}fit/.test(fit.text), fit.text.slice(-500))
check('...and what it will not touch, and the day the new meals start', /Unchanged: Today and every day on your shopping list/.test(fit.text) && fit.text.includes(`The new meals start on ${STARTS_ON}; every day before then stays as it was.`), fit.text.slice(-600))
check('nothing was generated before the tap', (await ev(`window.__generateCalls`)) === 0 && (await rowsOnPage()) === 21, [await ev(`window.__generateCalls`), await rowsOnPage()])
await shoot('chat-top-up-fit-card')
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim())); b?.click() })()`)
let fitDone = await ev(READ)
for (let i = 0; i < 80 && !/\bAdded\b/.test(fitDone.text); i++) { await wait(500); fitDone = await ev(READ) }
await wait(600)
fitDone = await ev(READ)
check('a receipt says Added, three dinners and nothing else', /\bAdded\b/.test(fitDone.text) && /Dinner[\s\S]{0,12}\+3 options/.test(fitDone.text) && !/Breakfast[\s\S]{0,12}\+\d options/.test(fitDone.text.split('Added').pop() ?? '') && !/Lunch[\s\S]{0,12}\+\d options/.test(fitDone.text.split('Added').pop() ?? ''), fitDone.text.slice(-400))
check('...and the app reads back ten dinners, seven of everything else, and no dinner flagged any more',
  JSON.stringify(await ev(`window.__topUpPools()`)) === JSON.stringify({ breakfast: 7, lunch: 7, dinner: 10 }) && (await ev(`window.__topUpPlan().fewFit.dinner`)) === undefined, [await ev(`window.__topUpPools()`), await ev(`window.__topUpPlan()`)])
await shoot('chat-top-up-fit-receipt')

console.log('\n[8] The dinner is already at ten and still has two that fit: it says why it cannot add')
check('a plan with ten dinners', await load('topfit=crowded'))
check('the sanity check: ten dinners, two that fit, and the app calls it crowded', (await ev(`window.__topUpPools().dinner`)) === 10 && (await ev(`window.__topUpPlan().crowded.join()`)) === 'dinner' && Object.keys(await ev(`window.__topUpPlan().needs`)).length === 0, await ev(`window.__topUpPlan()`))
check('her sentence goes', await say('Can you give me more meal options please'))
let crowded = await ev(READ)
// The reply types itself out: wait for its LAST words, not its first.
for (let i = 0; i < 40 && !/swap them\./.test(crowded.text); i++) { await wait(500); crowded = await ev(READ) }
await wait(600)
crowded = await ev(READ)
check('there is no card', !crowded.btns.some(b => /^Apply/.test(b)), crowded.btns)
check('...and it says the truth: plenty of dishes, few that fit, and why nothing is added', /Some of your meals have plenty of dishes but few that fit your targets, and adding more would slow the app down, so I can't top them up\./.test(crowded.text), crowded.text.slice(crowded.text.indexOf('Some of your meals') - 5, crowded.text.indexOf('Some of your meals') + 320))
check('...without the false "nothing to add" claim, or a control to press', !/nothing to add/.test(crowded.text) && !/Nutrition tab|Regenerate|button/i.test(crowded.text.split("top them up").pop() ?? ''), crowded.text.slice(-300))
check('nothing was generated', (await ev(`window.__generateCalls`)) === 0)
await shoot('chat-top-up-crowded')

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)
console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'chat top-up: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
