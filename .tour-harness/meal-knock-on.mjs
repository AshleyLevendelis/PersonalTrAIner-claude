// ---------------------------------------------------------------------------
// ADDING A FOOD TO A MEAL: THE CARD SAYS WHAT ELSE WILL CHANGE, AND IT DOES.
//
// 9 Oct 2026, the test log's H9: 100 g of banana on a lunch replaced the
// dinner and the snack, under a card that said "The rest of the day re-fits
// around it". test:meal-knock-on holds the trial against an independent diff.
// This is what she SEES, on the real Nutrition tab at phone size:
//   1. the sheet works the knock-on out before it lets her agree (the button
//      waits), and the old assertion is gone;
//   2. the card names each other meal that will change;
//   3. after the tap, the week the app serves changed EXACTLY where the card
//      said — read from the app's own hook, compared here;
//   4. the coach's card for the same request carries the same kind of lines,
//      from the same function.
//
// The fixture chooses the food; the app's own trial writes every line.
//
// PORT 9650.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9650, page: 'real.html', name: 'meal-knock-on', timeoutMs: 300_000 })
const { origin, send, ev, check, until, wait, go, clickAt, shoot, finish } = d

const weekdayOf = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
const week = () => ev(`window.__weekMeals ? window.__weekMeals() : {}`)
const byId = t => ev(`(() => { const b = document.querySelector('[data-testid="${t}"]'); return b ? b.innerText.trim() : null })()`)
const setInput = (testid, value) => ev(`(() => {
  const n = document.querySelector('[data-testid="${testid}"]')
  if (!n) return false
  n.focus()
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(n, ${JSON.stringify(String(value))})
  n.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
const sheetState = () => ev(`(() => {
  const p = document.querySelector('[data-testid="meal-food-add-preview"]')
  const b = document.querySelector('[data-testid="meal-food-add-confirm"]')
  return { lines: p ? [...p.querySelectorAll('p')].map(x => x.innerText.trim()) : [], checking: !!document.querySelector('[data-testid="meal-food-add-checking"]'), disabled: b ? b.disabled : null }
})()`)
/** "Today's dinner becomes X, so the day still fits." / "Monday's lunch goes from 500 to 430 kcal so the day still fits." */
const parseLines = (lines, today, dates) => {
  const dateOf = day => (day.toLowerCase() === 'today' ? today : dates.find(x => weekdayOf(x) === day) ?? `?${day}`)
  const out = []
  for (const l of lines) {
    let m = /^(\w+)'s (breakfast|lunch|dinner|snack) becomes (.+?)(?:, so the day still fits\.|, the leftovers of the dinner the night before\.|, cooked fresh instead of leftovers\.)$/.exec(l)
    if (m) { out.push({ date: dateOf(m[1]), slot: m[2], kind: 'dish', to: m[3] }); continue }
    m = /^(\w+)'s (breakfast|lunch|dinner|snack) goes from ([\d,]+) to ([\d,]+) kcal so the day still fits\.$/.exec(l)
    if (m) out.push({ date: dateOf(m[1]), slot: m[2], kind: 'size' })
  }
  return out
}

await go('&tour=off&daymove=1', '#/tab/nutrition')
const w0 = await until(week, v => v && Object.keys(v).length === 7, 60)
const dates = Object.keys(w0 ?? {}).sort()
const today = dates[0]

console.log('\n1. The sheet works it out before she can agree\n')
check('1a. the week is served: seven days, each with a lunch and a dinner', dates.length === 7 && dates.every(x => w0[x].lunch && w0[x].dinner), w0)
check('1b. the lunch row opens', await clickAt(`[...document.querySelectorAll('button')].find(b => /^\\s*Lunch/i.test(b.textContent || '') && !b.hasAttribute('data-ingredient-row'))`))
await until(() => ev(`!!document.querySelector('[data-testid="meal-food-add-open"]')`), v => v === true, 20)
check('1c. ...and offers Add food', await ev(`(() => { const b = document.querySelector('[data-testid="meal-food-add-open"]'); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true })()`))
await until(() => ev(`!!document.querySelector('[data-testid="meal-food-add-search"]')`), v => v === true, 20)

// A food and an amount that moves another DISH on this fixture — found by
// asking the app's own trial, amount by amount, not assumed.
let chosen = null
let firstState = null
for (const [food, amount] of [['banana', 100], ['banana', 200], ['white rice', 150], ['banana', 300], ['white rice', 250], ['olive oil', 20]]) {
  await setInput('meal-food-add-search', food)
  await wait(350)
  const picked = await ev(`(() => { const b = [...document.querySelectorAll('[data-testid="meal-food-add-result"]')].find(x => x.textContent.trim() === ${JSON.stringify(food)}); if (!b) return false; b.click(); return true })()`)
  if (!picked) continue
  await until(() => ev(`!!document.querySelector('[data-testid="meal-food-add-amount"]')`), v => v === true, 12)
  await setInput('meal-food-add-amount', amount)
  // Read straight away: the trial has not come back yet (it waits a beat, then serves the week twice).
  const early = await sheetState()
  if (!firstState) firstState = early
  const settled = await until(sheetState, v => v.lines.length > 0 && v.checking === false, 60)
  const named = parseLines(settled.lines, today, dates)
  if (named.some(n => n.kind === 'dish')) { chosen = { food, amount, settled, named }; break }
}
check('1d. while it is working it out the card says so, and the button cannot be tapped', firstState?.checking === true && firstState?.disabled === true, firstState)
check('1e. a food was found that changes another DISH on this plan (the fixture is under pressure)', !!chosen, chosen ? `${chosen.amount} g ${chosen.food}` : 'none of six moved a dish')
const lines = chosen?.settled.lines ?? []
check('1f. once it is back, the button can be tapped', chosen?.settled.disabled === false && chosen?.settled.checking === false, chosen?.settled)

console.log('\n2. The card names what else will change\n')
check('2a. the old assertion is gone: nothing says the day "re-fits around it"', lines.length > 0 && !lines.some(l => /re-?fits? around/i.test(l)), lines)
check('2b. each other meal that changes is named with its day, its meal and the dish it becomes', (chosen?.named ?? []).filter(n => n.kind === 'dish').length >= 1 && (chosen?.named ?? []).every(n => !n.date.startsWith('?')), chosen?.named)
check('2c. it does not also claim nothing else changes', !lines.includes('No other meal on your plan changes.'), lines)
check('2d. the day is named in words, never as a stored date', lines.some(l => /Becomes your lunch for today;/.test(l)) && !lines.some(l => /\d{4}-\d{2}-\d{2}/.test(l)), lines)
const box = await ev(`(() => { const n = document.querySelector('[data-testid="meal-food-add-preview"]'); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight } })()`)
check('2e. the whole card is on screen where she is about to tap', !!box && box.top >= 0 && box.bottom <= box.h, box)
await shoot('meal-knock-on-card')

console.log('\n3. After the tap, the week changed exactly where the card said\n')
const before = await week()
check('3a. tapping Add it', await ev(`(() => { const b = document.querySelector('[data-testid="meal-food-add-confirm"]'); if (!b || b.disabled) return false; b.click(); return true })()`))
const after = await until(week, v => v && v[today] && v[today].lunch !== before[today].lunch, 60)
check('3b. today\'s lunch is now the lunch with the food in it', new RegExp(`\\+ .*${chosen?.food ?? 'zzz'}`).test(after?.[today]?.lunch ?? ''), after?.[today]?.lunch)
// INDEPENDENT OF THE CARD: every cell whose dish differs, read off the app's hook.
const moved = []
for (const date of dates) for (const slot of ['breakfast', 'lunch', 'dinner', 'snack']) {
  if (date === today && slot === 'lunch') continue
  if ((before[date] ?? {})[slot] !== (after?.[date] ?? {})[slot]) moved.push(`${date}|${slot}|${(after?.[date] ?? {})[slot]}`)
}
const said = (chosen?.named ?? []).filter(n => n.kind === 'dish').map(n => `${n.date}|${n.slot}|${n.to}`)
const sizes = (chosen?.named ?? []).filter(n => n.kind === 'size').length
// The card lists four and folds the rest into "N more meals change too."
const more = Number((/^(\d+) more meals? changes? too\.$/.exec(lines.find(l => /more meals? changes? too\.$/.test(l)) ?? '') ?? [])[1] ?? 0)
check('3c. every dish the card named did change, to the dish it named', said.length >= 1 && said.every(x => moved.includes(x)), { said, moved })
check('3d. ...and NOTHING changed that the card did not account for: the dishes it named plus the "N more" it counted cover every dish that moved',
  moved.length >= 1 && (more === 0 ? moved.length === said.length : moved.length > said.length && moved.length <= said.length + more) && said.length + sizes <= 4, { moved: moved.length, named: said.length, sizes, more, lines })
await ev(`window.scrollTo(0, 0)`)
await wait(400)
await shoot('meal-knock-on-after')

console.log('\n4. The coach\'s card for the same request\n')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
      // The model only PARSES: which meal, which food, how much. The card is the app's.
      // (The same answer to the follow-up tap: the app may ask a trade-off question before it shows the card.)
      return json({ reply: '', proposal: { kind: 'propose_meal_food_add', rawArgs: { meal_slot: 'lunch', food_lines: ['${chosen?.amount ?? 100}g ${chosen?.food ?? 'banana'}'], origin_verbatim_quote: 'add a banana to my lunch' } } })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `${origin}/.tour-harness/chat.html?daymove=1&n=1` })
await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 60)
await until(() => ev(`window.__weekMeals ? Object.keys(window.__weekMeals()).length : 0`), v => v === 7, 60)
await ev(`(() => { const t = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(t, 'add a banana to my lunch'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await wait(300)
check('4a. the request is sent', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`))
// The app may first ask what the change costs (the trade-off question, its own
// rule and its own driver). "Do it anyway" is one tap further, then the card.
const first = await until(() => ev(`document.body.innerText`), t => (/Proposed change/i.test(t) && /Apply/.test(t)) || /Do it anyway/.test(t), 60)
if (!/Proposed change/i.test(first ?? '')) {
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Do it anyway'); if (b) b.click(); return !!b })()`)
}
const chat = await until(() => ev(`document.body.innerText`), t => /Proposed change/i.test(t) && /Apply/.test(t), 60)
check('4b. a card comes back', /Proposed change/i.test(chat ?? ''), (chat ?? '').slice(-400))
check('4c. ...that does not assert the day "re-fits around it"', !/re-?fits? around/i.test(chat ?? ''))
check('4d. ...and says what the trial found: another meal named, or that none changes — never silence', /'s (breakfast|lunch|dinner|snack) (becomes|goes from) /.test(chat ?? '') || /No other meal on your plan changes\./.test(chat ?? ''), (chat ?? '').slice(-500))
check('4e. ...and not "I couldn\'t check" (the coach was handed the app\'s own trial)', !/couldn't check what this does to your other meals/.test(chat ?? ''))
await shoot('meal-knock-on-coach')

await finish('Adding a food says what else changes, and that is what changes.')
