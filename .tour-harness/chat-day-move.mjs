// ---------------------------------------------------------------------------
// "SWAP THURSDAY'S DINNER WITH SATURDAY'S", ASKED OF THE COACH — 29 Sep 2026.
//
// Ashley's list, item 2: "Moving a meal to another day. Neither the screen nor
// the coach can do this yet." Her ruling: THEY SWAP PLACES. The Move sheet on
// the Nutrition tab is driven by verify:meal-day-move; this holds the coach's
// half: a card that asks first, says what else in the week changes before the
// tap, writes NOTHING until the tap, and puts up a refusal in plain words where
// it must.
//
// WHICH HALF THIS PROVES. chat.tsx (?daymove=1) renders the real ChatAssistant
// with props from the app's OWN useMealDays hook — the one App.tsx calls — over
// a fake database holding five options a meal. The model (chat-gemini) is
// stubbed at the fetch boundary, here, and answers with the courier proposal
// and no prose, the live shape. So the card, the builder, the pending-action
// store, the confirm arm and the two writes are the real client. It does not
// boot App.tsx: that App hands the chat this same controller as it hands the
// Move sheet is held by test:meal-day-move.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9496', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9496/json/list').then(r => r.json())
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

// The model answers a request to swap two days' meals with the courier
// proposal and NO prose. WHICH meal and WHICH days is whatever the driver put
// in window.__dayArgs, because the days it can swap depend on the week the
// app's own hook served; a stub that hard-coded dates would swap days that
// happen to hold the same dinner.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (u.includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (/swap|trade|switch/i.test(said) && window.__dayArgs) {
        return json({ reply: '', proposal: { kind: 'propose_meal_day_move', rawArgs: { ...window.__dayArgs, origin_verbatim_quote: said } } })
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
const load = async () => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?daymove=1&n=${++loads}` })
  await wait(3500)
  let ready = await ev(`!!document.querySelector('textarea')`)
  for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
  // The week is served asynchronously (pools, then picks); wait until the app has it.
  for (let i = 0; i < 40; i++) { if (Object.keys((await ev(`window.__weekMeals ? window.__weekMeals() : {}`)) ?? {}).length === 7) break; await wait(250) }
  return ready === true
}
let loads = 0
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
const apply = () => ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim()))
  if (!b || b.disabled) return false
  b.click(); return true
})()`)
const week = () => ev(`window.__weekMeals()`)
const picks = () => ev(`window.__mealPicks()`)
const askFor = async (args, sentence) => {
  await ev(`window.__dayArgs = ${JSON.stringify(args)}`)
  return say(sentence)
}
// The coach's line is typed out, so the card can be up before its question is
// finished: wait for the question mark, not just the buttons.
const nextCard = async () => { let r = await ev(READ); for (let i = 0; i < 60 && !(r.hasCard && /Want me to [^\n]*\?/.test(r.text)); i++) { await wait(400); r = await ev(READ) } return r }
const answered = async re => { let r = await ev(READ); for (let i = 0; i < 40 && !re.test(r.text); i++) { await wait(400); r = await ev(READ) } await wait(400); return ev(READ) }
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const long = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
const TODAY = ANCHOR_ISO

console.log('\n[1] Asking the coach to swap two days\' dinners')
check('the chat is up with the week served', await load())
const w0 = await week()
const dates = Object.keys(w0).sort()
check('the sanity check: seven days, three meals each', dates.length === 7 && dates.every(d => Object.keys(w0[d]).length === 3), w0)
check('...and today is the anchor', dates[0] === TODAY, dates[0])
// The two days: neither is today, and their dinners differ.
const pair = dates.slice(1).flatMap((a, i) => dates.slice(i + 2).map(b => [a, b])).find(([a, b]) => w0[a].dinner !== w0[b].dinner)
const [dA, dB] = pair
const dinnerA = w0[dA].dinner, dinnerB = w0[dB].dinner
check('the fixture is under pressure: two upcoming days hold different dinners', !!dA && !!dB && dinnerA !== dinnerB, pair)
check('her sentence goes', await askFor({ meal_slot: 'dinner', from_date: dA, to_date: dB }, 'can we swap those two dinners over please'))
let r = await nextCard()
check('a CARD, not a sentence: she is asked', r.hasCard === true, r.btns)
check('...it asks rather than announcing', new RegExp(`Want me to swap ${long(dA)}'s dinner with ${long(dB)}'s\\?`).test(r.text) && !/I've swapped|Done —/.test(r.text), r.text.slice(-700))
check('...it names both dinners, before and after',
  r.text.includes(dinnerA) && r.text.includes(dinnerB) && r.text.includes(`${long(dA)}'s dinner`) && r.text.includes(`${long(dB)}'s dinner`), r.text.slice(-900))
check('...says they swap places, so both days keep a dinner', /swap places, so both days keep a dinner/.test(r.text), r.text.slice(-900))
check('...saying before the tap what stays, as one clean line',
  /Unchanged: The meals themselves, their foods and their amounts — only which day each one is on/.test(r.text) && !/\.,/.test(r.text), r.text.slice(-900))
check('...with no Undo promised', !/Undo/.test(r.text) && r.hasUndo === false)
await shoot('chat-day-move-card')

console.log('\n[2] Nothing is written until she taps')
check('no pick was saved', (await picks()).length === 0, await picks())
check('...and the week is as it was', JSON.stringify(await week()) === JSON.stringify(w0))

console.log('\n[3] Tapping Apply')
check('Apply', await apply())
let after = await answered(/Swapped over/)
check('a receipt says Swapped over', /Swapped over/.test(after.text), after.text.slice(-400))
check('...one line per day, with the dinner it now holds',
  new RegExp(`${long(dA)}'s dinner[\\s\\S]{0,20}→ ${dinnerB}`).test(after.text) && new RegExp(`${long(dB)}'s dinner[\\s\\S]{0,20}→ ${dinnerA}`).test(after.text), after.text.slice(-500))
check('...and an Undo on the receipt, since the swap can be put back (30 Sep 2026)', after.hasUndo === true, after.btns)
const w1 = await week()
check('the week now has each day holding the other\'s dinner', w1[dA].dinner === dinnerB && w1[dB].dinner === dinnerA, [w1[dA].dinner, w1[dB].dinner])
check('...saved for those two dates, in the table a reload reads',
  (await picks()).length === 2 && (await picks()).some(p => p.date === dA && p.slot === 'dinner' && p.meal_name === dinnerB) && (await picks()).some(p => p.date === dB && p.slot === 'dinner' && p.meal_name === dinnerA), await picks())
await shoot('chat-day-move-receipt')

console.log('\n[4] Refusals: no card, and a reason that points at no control')
// (a) A day beyond the strip.
await askFor({ meal_slot: 'dinner', from_date: dA, to_date: addDays(TODAY, 12) }, 'swap Thursday week with that one')
let out = await answered(/only swap meals between today and the next six days/)
check('a day beyond the next six is refused in plain words', /I can only swap meals between today and the next six days — which days did you mean\?/.test(out.text), out.text.slice(-300))
check('...and no card came with it', !out.btns.some(b => /^Apply/.test(b)))
// (b) The same dish on both days: make it so through the strip's own write.
const sameName = w1[dA].dinner
await ev(`window.__applyPick(${JSON.stringify(dB)}, 'dinner', ${JSON.stringify(sameName)})`)
await wait(600)
await askFor({ meal_slot: 'dinner', from_date: dA, to_date: dB }, 'swap those two dinners again')
out = await answered(/already the same meal/)
check('the same dish on both days: nothing to swap, said so', new RegExp(`${long(dA)}'s dinner and ${long(dB)}'s are already the same meal, so there's nothing to swap\\.`).test(out.text), out.text.slice(-300))
// (c) A meal already eaten today.
const other = dates.slice(1).find(d => w1[d].dinner !== w1[TODAY].dinner)
await ev(`window.__fakeDb.meal_events.push({ profile_id: window.__fakeDb.fitness_profiles[0].id, client_id: 'eaten-1', date: ${JSON.stringify(TODAY)}, slot: 'dinner', event_type: 'confirmed', meal_name: 'Eaten dinner', macros: { kcal: 700, protein: 40, carbs: 80, fat: 20 }, source: 'manual', created_at: '${TODAY}T18:00:00.000Z', voided_at: null })`)
await askFor({ meal_slot: 'dinner', from_date: 'today', to_date: other }, 'swap tonight with that one')
out = await answered(/logged today's dinner as eaten/)
check('today\'s dinner, already logged as eaten, cannot move', /You've already logged today's dinner as eaten, so it can't move\./.test(out.text), out.text.slice(-300))
await shoot('chat-day-move-refused')
await ev(`window.__fakeDb.meal_events.length = 0`)

console.log('\n[5] The week changes under the card: the confirm refuses to write a swap she was not shown')
check('a fresh week', await load())
const w5 = await week()
const d5 = Object.keys(w5).sort()
const [pA, pB] = d5.slice(1).flatMap((a, i) => d5.slice(i + 2).map(b => [a, b])).find(([a, b]) => w5[a].dinner !== w5[b].dinner)
const third = Object.values(w5).flatMap(m => m.dinner).find(n => n !== w5[pA].dinner && n !== w5[pB].dinner)
check('her sentence goes', await askFor({ meal_slot: 'dinner', from_date: pA, to_date: pB }, 'swap those dinners please'))
r = await nextCard()
check('the card is up', r.hasCard === true, r.btns)
// Someone changes the second day's dinner while the card is on screen.
await ev(`window.__applyPick(${JSON.stringify(pB)}, 'dinner', ${JSON.stringify(third)})`)
await wait(600)
const changedUnder = (await week())[pB].dinner
check('the fixture is under pressure: the second day\'s dinner really did change', changedUnder === third && changedUnder !== w5[pB].dinner, changedUnder)
check('Apply', await apply())
let drift = await answered(/Nothing was applied/)
check('it says it did not swap, and why', /I couldn't swap those meals/.test(drift.text) && /Nothing was applied — your meals changed since I asked\./.test(drift.text), drift.text.slice(-400))
const p5 = await picks()
check('...only her own change is in the table: the swap wrote nothing', p5.length === 1 && p5[0].date === pB && p5[0].meal_name === third, p5)
check('...and the first day still has its own dinner', (await week())[pA].dinner === w5[pA].dinner)
await shoot('chat-day-move-changed')

console.log('\n[6] The second write fails: the first is taken back, and it says so')
check('a fresh week', await load())
const w6 = await week()
const d6 = Object.keys(w6).sort()
const [qA, qB] = d6.slice(1).flatMap((a, i) => d6.slice(i + 2).map(b => [a, b])).find(([a, b]) => w6[a].dinner !== w6[b].dinner)
check('her sentence goes', await askFor({ meal_slot: 'dinner', from_date: qA, to_date: qB }, 'switch those dinners please'))
r = await nextCard()
check('the card is up', r.hasCard === true, r.btns)
await ev(`window.__failWrite = (t, op, row) => t === 'meal_plan_picks' && op === 'upsert' && row.date === ${JSON.stringify(qB)}`)
check('Apply', await apply())
let fail = await answered(/Nothing was applied/)
check('a failed receipt, with the cause once', /I couldn't swap those meals/.test(fail.text) && /Nothing was applied — the swap didn't save\./.test(fail.text), fail.text.slice(-400))
check('...no doubled full stop, no internal tool name', !/\.\./.test(fail.text.slice(-400)) && !/propose_/.test(fail.text), fail.text.slice(-400))
check('...and nothing is left saved: the first day was put back', (await picks()).length === 0, await picks())
check('...so the week is exactly as it was', JSON.stringify(await week()) === JSON.stringify(w6))
await shoot('chat-day-move-failed')

console.log('\n[7] Today, by the coach\'s word')
check('a fresh week', await load())
const w7 = await week()
const d7 = Object.keys(w7).sort()
const dest = d7.slice(1).find(d => w7[d].dinner !== w7[TODAY].dinner)
check('her sentence goes', await askFor({ meal_slot: 'dinner', from_date: 'today', to_date: dest }, 'swap tonight\'s dinner with that one'))
r = await nextCard()
check('the card says "today", not a weekday', /Want me to swap today's dinner with /.test(r.text) && /Today's dinner/.test(r.text), r.text.slice(-700))
check('Apply', await apply())
await answered(/Swapped over/)
const w7b = await week()
check('today\'s own dinner is now the other day\'s', w7b[TODAY].dinner === w7[dest].dinner && w7b[dest].dinner === w7[TODAY].dinner, [w7b[TODAY].dinner, w7b[dest].dinner])
check('...today\'s pick saved under today\'s date', (await picks()).some(p => p.date === TODAY && p.slot === 'dinner' && p.meal_name === w7[dest].dinner), await picks())

console.log('\n[8] Two DIFFERENT meals, by the coach\'s word, and Undo')
check('a fresh week', await load())
const w8 = await week()
const d8 = Object.keys(w8).sort()
const [eA, eB] = [d8[1], d8[2]]
const eDinner = w8[eA].dinner, eBreakfast = w8[eB].breakfast
const options8 = await ev(`window.__fakeDb.meal_plan_slots.length`)
check('her sentence goes', await askFor({ meal_slot: 'dinner', from_date: eA, to_date: eB, to_meal_slot: 'breakfast' }, 'swap that dinner with the breakfast on the other day'))
r = await nextCard()
check('a CARD, asking which two meals', r.hasCard === true && new RegExp(`Want me to swap ${long(eA)}'s dinner with ${long(eB)}'s breakfast\\?`).test(r.text), r.text.slice(-900))
check('...it names each meal and the resized copy it becomes', r.text.includes(eDinner) && r.text.includes(eBreakfast) && r.text.includes(`${eBreakfast} (as dinner)`) && r.text.includes(`${eDinner} (as breakfast)`), r.text.slice(-1100))
check('...says they swap places AND that each is resized', new RegExp(`${long(eA)}'s dinner and ${long(eB)}'s breakfast swap places, and each is resized to fit the meal it lands in\\.`).test(r.text), r.text.slice(-1100))
check('...saying what stays: the foods, and only the amounts change', /Unchanged: The foods in each meal — only how much of each changes, to fit the meal it lands in/.test(r.text) && !/\.,/.test(r.text), r.text.slice(-1100))
await shoot('chat-day-move-across-card')
check('NOTHING IS WRITTEN before the tap: no pick, no new option, the week as it was', (await picks()).length === 0 && (await ev(`window.__fakeDb.meal_plan_slots.length`)) === options8 && JSON.stringify(await week()) === JSON.stringify(w8))
check('Apply', await apply())
after = await answered(/Swapped over/)
check('a receipt says Swapped over, a line per meal with the copy it now holds',
  /Swapped over/.test(after.text) && new RegExp(`${long(eA)}'s dinner[\\s\\S]{0,20}→ ${eBreakfast} \\(as dinner\\)`).test(after.text) && new RegExp(`${long(eB)}'s breakfast[\\s\\S]{0,20}→ ${eDinner} \\(as breakfast\\)`).test(after.text), after.text.slice(-600))
check('...with an Undo on it', after.hasUndo === true, after.btns)
const w8b = await week()
check('the week shows each day holding the other meal', w8b[eA].dinner === `${eBreakfast} (as dinner)` && w8b[eB].breakfast === `${eDinner} (as breakfast)`, [w8b[eA].dinner, w8b[eB].breakfast])
check('...saved: two picks, and the two resized copies are options', (await picks()).length === 2 && (await ev(`window.__fakeDb.meal_plan_slots.length`)) === options8 + 2, await picks())
await shoot('chat-day-move-across-receipt')
check('Undo', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Undo'); if (!b || b.disabled) return false; b.click(); return true })()`))
after = await answered(/Put back/)
check('the receipt says Put back, and the Undo is gone', /Put back/.test(after.text) && after.hasUndo === false, after.btns)
check('...naming what went back', new RegExp(`Swap\\s+${long(eA)}'s dinner and ${long(eB)}'s breakfast are as they were\\.`).test(after.text) && !/Put back:/.test(after.text), after.text.slice(-500))
check('no pick is left, the copies are gone, the week is as it was', (await picks()).length === 0 && (await ev(`window.__fakeDb.meal_plan_slots.length`)) === options8 && JSON.stringify(await week()) === JSON.stringify(w8), await picks())
await shoot('chat-day-move-across-undone')

console.log('\n[9] Undo leaves both alone once a day has changed')
check('a fresh week', await load())
const w9 = await week()
const d9 = Object.keys(w9).sort()
const [gA, gB] = [d9[1], d9[2]]
check('her sentence goes', await askFor({ meal_slot: 'dinner', from_date: gA, to_date: gB, to_meal_slot: 'breakfast' }, 'trade that dinner for the other day\'s breakfast'))
r = await nextCard()
check('the card is up', r.hasCard === true, r.btns)
check('Apply', await apply())
await answered(/Swapped over/)
// The second day's meal is changed behind the swap's back, the way a later swap would.
await ev(`window.__fakeDb.meal_plan_picks.find(p => p.slot === 'breakfast').meal_name = 'Something she chose after'`)
const held9 = JSON.stringify(await picks())
check('Undo', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Undo'); if (!b || b.disabled) return false; b.click(); return true })()`))
after = await answered(/left both as they are/)
check('it says why nothing was put back', /One of those meals has changed since, so I've left both as they are\./.test(after.text), after.text.slice(-500))
check('...neither day was touched, and the Undo stays', JSON.stringify(await picks()) === held9 && after.hasUndo === true, after.btns)
await shoot('chat-day-move-across-refused')

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)
console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'chat day move: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
