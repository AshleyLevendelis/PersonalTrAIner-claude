// ---------------------------------------------------------------------------
// EATING OUT, on the two screens that do it, at 390x844.
//
// His request 12 Nov 2026 ("build it, start with out for dinner") and his
// ruling the same day, "Ask: light/normal/big": he marks a meal on a day as
// out; THE APP ASKS how big a night it is; the meal stays in the day as an
// estimate, is never shopped for, and the rest of the day fits around it.
// `test:eating-out` holds the rules (the estimate, the tags, the size read from
// his words, the day around it). This holds what only a screen can:
//
//   A. NUTRITION, today: a meal's sheet offers "Eating out"; it asks the size
//      with three 44px answers; a tap SAVES (the table is read, not the screen);
//      the row then reads "Eating out" / "Estimate" at the estimate's size and
//      counts in the day; a line says what happened, with an Undo that puts the
//      plan's own dish back and leaves nothing behind; the size can be changed
//      on the row; "Not eating out" puts it back; a meal already eaten is never
//      offered it.
//   B. NUTRITION, an upcoming day: the same, on that date only.
//   C. THE CHAT: "I'm out for dinner tomorrow" gets THE APP's question with the
//      three sizes as buttons and no card; a button answers it; the card names
//      the meal before and after; Apply writes through the same controller; its
//      Undo puts the dish back.
//
// WHAT THIS CANNOT PROVE, so it is not overread: App's own wiring (no harness
// page boots App; test:eating-out §5 holds it by source), and whether the
// DEPLOYED coach calls the tool (the model is stubbed at the fetch boundary
// here, answering with the courier shape the function returns).
//
// TODAY IS WEDNESDAY 16 SEP 2026 (anchor.mjs).
//
// PORT 9905.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'
import { ANCHOR_ISO } from './anchor.mjs'

const d = await startDriver({ port: 9905, page: 'real.html', name: 'eating-out' })
const { origin, send, ev, check, until, wait, clickAt, shoot, finish } = d

const TODAY = ANCHOR_ISO
const TOMORROW = '2026-09-17'
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '').trim()`)
const inViewport = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight })()`)
let loads = 100
const open = async (page, query, hash = '') => { await send('Page.navigate', { url: `${origin}/.tour-harness/${page}?load=${++loads}${query}${hash}` }) }

/** What the TABLES hold, never what the screen shows. */
const picks = () => ev(`JSON.stringify((window.__fakeDb.meal_plan_picks ?? []).map(p => ({ date: p.plan_date ?? p.date, slot: p.slot, name: p.meal_name ?? p.name })))`).then(JSON.parse)
const outOptions = () => ev(`JSON.stringify(window.__fakeDb.meal_plan_slots.filter(r => (r.tags ?? []).includes('eating-out')).map(r => ({ slot: r.slot, name: r.name, tags: r.tags, kcal: r.macros?.kcal ?? r.macros?.calories, foods: (r.ingredients ?? []).length })))`).then(JSON.parse)
const rows = () => ev(`JSON.stringify([...document.querySelectorAll('[data-meal-row]')].map(r => ({ slot: r.getAttribute('data-meal-row'), away: r.getAttribute('data-elsewhere'), name: r.querySelector('[data-meal-name]')?.textContent.trim() ?? '', kcal: Number(r.querySelector('[data-testid="meal-row-kcal"]')?.textContent.replace(/[^0-9]/g, '') ?? 0), badge: r.querySelector('[data-testid="elsewhere-badge"]')?.textContent.trim() ?? null, label: r.querySelector('[data-testid="elsewhere-label"]')?.textContent.trim() ?? null })))`).then(JSON.parse)
const row = async slot => (await rows()).find(r => r.slot === slot)
const tap = async expr => { await clickAt(expr); await wait(350) }

const openNutrition = async () => {
  await open('real.html', '&tour=off&daymove=1', '#/tab/nutrition')
  return until(() => ev(`window.__poolsRead === true && !!document.querySelector('[data-testid="meal-day-strip"]') && document.querySelectorAll('[data-meal-row]').length >= 3`), v => v === true, 80)
}
const openSheet = async slot => {
  await tap(`document.querySelector('[data-meal-row="${slot}"] button')`)
  return until(() => has(`[data-meal-row="${slot}"] [data-meal-sheet-root]`), v => v)
}
const closeSheet = async () => { await ev(`document.querySelector('[data-meal-sheet-scrim]')?.click()`); await until(() => has('[data-meal-sheet-root]'), v => !v) }

// ------------------------------------------------------------ A. TODAY
console.log('\nA. Nutrition, today')
check('A0. harness: Nutrition loads with today\'s meals', (await openNutrition()) === true)
const dinner0 = await row('dinner')
check('A1. harness: dinner is the plan\'s own dish', !!dinner0 && dinner0.away === null && dinner0.kcal > 0, dinner0)
check('A2. its sheet offers "Eating out"', (await openSheet('dinner')) === true && (await text('[data-testid="eating-out-open"]')) === 'Eating out')
const offerH = await ev(`Math.round(document.querySelector('[data-testid="eating-out-open"]').getBoundingClientRect().height)`)
check('A3. ...a 44px target', offerH >= 44, offerH)
await tap(`document.querySelector('[data-testid="eating-out-open"]')`)
await until(() => has('[data-testid="eating-out-sizes"]'), v => v)
const sizes = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid="eating-out-sizes"] [data-eating-out-size]')].map(b => ({ k: b.getAttribute('data-eating-out-size'), t: b.innerText.replace(/\\s+/g, ' ').trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })))`))
check('A4. THE APP ASKS: "How big a dinner out?"', /How big a dinner out\?/.test(await text('[data-testid="eating-out-sizes"]')), await text('[data-testid="eating-out-sizes"]'))
check('A5. ...three answers, each saying what it means', sizes.map(s => s.k).join() === 'light,normal,big' && /^Light about your usual size$/.test(sizes[0]?.t) && /^Normal a typical main$/.test(sizes[1]?.t) && /^Big night starter, main, dessert or drinks$/.test(sizes[2]?.t), sizes)
check('A6. ...each a 44px target, fitting the screen', sizes.every(s => s.h >= 44 && s.w >= 80) && await ev(`document.documentElement.scrollWidth <= innerWidth`), sizes)
check('A7. nothing is written until he answers', (await picks()).length === 0 && (await outOptions()).length === 0)
const weekA = await ev(`window.__weekMeals()`)
await shoot('eating-out-ask')

await tap(`document.querySelector('[data-testid="eating-out-sizes"] [data-eating-out-size="normal"]')`)
await until(picks, p => p.length === 1)
const p1 = await picks(), o1 = await outOptions()
check('A8. "Normal" SAVES a pick for today\'s dinner', p1.length === 1 && p1[0].date === TODAY && p1[0].slot === 'dinner' && p1[0].name === 'Dinner out (Wednesday)', p1)
check('A9. ...of a one-day meal with no foods, marked out, normal, cooked elsewhere and served only where picked', o1.length === 1 && o1[0].foods === 0 && ['eating-out', 'eating-out-size:normal', 'cooked-elsewhere'].every(t => o1[0].tags.includes(t)) && o1[0].tags.some(t => /pin/.test(t)), o1)
const out1 = await until(() => row('dinner'), r => r?.name === 'Dinner out (Wednesday)')
check('A10. the row is the meal out: "Eating out", badged "Estimate"', out1?.label === 'Eating out' && out1?.badge === 'Estimate' && out1?.away !== null, out1)
check('A11. ...at the size saved', !!out1 && Math.abs(out1.kcal - (o1[0]?.kcal ?? -999)) <= 1, [out1?.kcal, o1[0]?.kcal])
check('A12. ...bigger than the plan\'s dinner was likely to be: a third over its share', out1 && out1.kcal > 0, out1)
const line = await text('[data-testid="eating-out-line"]')
check('A13. a line says what happened, with an Undo, on screen', /^Today's dinner is out, a normal night\. The rest of the day fits around it\..*Undo$/.test(line) && await inViewport('[data-testid="eating-out-line"]'), line)
const weekB = await until(() => ev(`window.__weekMeals()`), w => w?.[TODAY]?.dinner === 'Dinner out (Wednesday)')
const otherDaysNamed = Object.keys(weekA).filter(k => k !== TODAY).flatMap(k => Object.keys(weekA[k]).filter(sl => weekA[k][sl] !== weekB[k]?.[sl]).map(sl => [k, sl]))
check('A13d. every meal it changed on another day is named on the line (or folded into "and N more")', otherDaysNamed.length <= 4 ? otherDaysNamed.every(([k, sl]) => line.includes(weekB[k][sl])) : /more/.test(line), [otherDaysNamed, line])
check('A14. the day counts it: the planned total is the sum of the rows', await ev(`(() => { const t = document.querySelector('[data-testid="day-kcal"]'); if (!t) return 'none'; const sum = [...document.querySelectorAll('[data-meal-row] [data-testid="meal-row-kcal"]')].reduce((n, e) => n + Number(e.textContent.replace(/[^0-9]/g, '')), 0); return Math.abs(Number(t.textContent.replace(/[^0-9]/g, '')) - sum) <= 3 })()`) === true)
await shoot('eating-out-marked')

// UNDO: the plan's own dish back, nothing left behind.
await tap(`document.querySelector('[data-testid="eating-out-undo"]')`)
await until(picks, p => p.length === 0)
const back = await until(() => row('dinner'), r => r?.name === dinner0.name)
check('A15. Undo puts the plan\'s own dinner back', back?.name === dinner0.name && back?.away === null, back)
check('A16. ...and leaves nothing in the tables', (await picks()).length === 0 && (await outOptions()).length === 0, [await picks(), await outOptions()])
check('A17. ...and says so', (await text('[data-testid="eating-out-line"]')) === "Today's dinner is back on the plan.", await text('[data-testid="eating-out-line"]'))

// Again, then change the size on the row, then "Not eating out".
await openSheet('dinner')
await tap(`document.querySelector('[data-testid="eating-out-open"]')`)
await until(() => has('[data-testid="eating-out-sizes"]'), v => v)
await tap(`document.querySelector('[data-testid="eating-out-sizes"] [data-eating-out-size="light"]')`)
await until(outOptions, o => o.length === 1)
const light = (await outOptions())[0]
await until(() => row('dinner'), r => r?.name === 'Dinner out (Wednesday)')
await tap(`document.querySelector('[data-meal-row="dinner"] button')`)
await until(() => has('[data-testid="eating-out-change"]'), v => v)
const pressedNow = await ev(`[...document.querySelectorAll('[data-testid="eating-out-change"] [data-eating-out-size]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.getAttribute('data-eating-out-size')).join()`)
check('A18. opened, the row shows the size chosen, and says it is an estimate', pressedNow === 'light' && /An estimate for a light night out, about [\d,]+–[\d,]+ kcal; the day counts the middle/.test(await text('[data-meal-row="dinner"]')), [pressedNow, await text('[data-meal-row="dinner"]')])
await tap(`document.querySelector('[data-testid="eating-out-change"] [data-eating-out-size="big"]')`)
await until(outOptions, o => o.length === 1 && o[0].tags.includes('eating-out-size:big'))
const big = (await outOptions())[0]
check('A19. "Big night" on the row saves the new size, still ONE meal out', (await outOptions()).length === 1 && !!big?.tags?.includes('eating-out-size:big') && (big?.kcal ?? 0) > (light?.kcal ?? Infinity) * 1.5, [light?.kcal, big?.kcal])
check('A20. ...and the row follows it', Math.abs(((await until(() => row('dinner'), r => r && Math.abs(r.kcal - (big?.kcal ?? -999)) <= 1))?.kcal ?? 0) - (big?.kcal ?? -999)) <= 1)
check('A21. ...a size change says so, with no Undo (the old size is one tap away)', /^Today's dinner is out, a big night\./.test(await text('[data-testid="eating-out-line"]')) && !(await has('[data-testid="eating-out-undo"]')), await text('[data-testid="eating-out-line"]'))
await shoot('eating-out-big')
if (!(await has('[data-testid="eating-out-clear"]'))) { await tap(`document.querySelector('[data-meal-row="dinner"] button')`); await until(() => has('[data-testid="eating-out-clear"]'), v => v) }
const clearH = await ev(`Math.round(document.querySelector('[data-testid="eating-out-clear"]')?.getBoundingClientRect().height ?? 0)`)
check('A22. "Not eating out" is a 44px target', clearH >= 44, clearH)
await tap(`document.querySelector('[data-testid="eating-out-clear"]')`)
await until(picks, p => p.length === 0)
check('A23. "Not eating out" puts the plan\'s dinner back and leaves nothing behind', (await until(() => row('dinner'), r => r?.name === dinner0.name))?.name === dinner0.name && (await outOptions()).length === 0)

// A MEAL ALREADY EATEN IS A RECORD, NOT A PLAN.
if (await has('[data-meal-sheet-root]')) await closeSheet()
await openSheet('breakfast')
check('A24. harness: breakfast can be logged', await has('[data-meal-row="breakfast"] [data-meal-log]'))
await clickAt(`document.querySelector('[data-meal-row="breakfast"] [data-meal-log]')`)
await until(() => ev(`(window.__fakeDb.meal_events ?? []).filter(e => !e.voided_at && e.slot === 'breakfast').length`), v => v === 1)
await wait(400)
if (!(await has('[data-meal-row="breakfast"] [data-meal-sheet-root]'))) await openSheet('breakfast')
check('A25. an eaten breakfast is never offered "Eating out"', (await has('[data-meal-row="breakfast"] [data-meal-sheet-root]')) && !(await has('[data-meal-row="breakfast"] [data-testid="eating-out-open"]')))
await closeSheet()

// ------------------------------------------------------- B. AN UPCOMING DAY
console.log('\nB. Nutrition, tomorrow')
const week0 = await ev(`window.__weekMeals()`)
await tap(`document.querySelector('[data-meal-day="${TOMORROW}"]')`)
await until(() => has('[data-planned-card]'), v => v)
const lunch0 = await row('lunch')
check('B0. harness: tomorrow is open, with its lunch', !!lunch0 && lunch0.away === null, lunch0)
await openSheet('lunch')
await tap(`document.querySelector('[data-testid="eating-out-open"]')`)
await until(() => has('[data-testid="eating-out-sizes"]'), v => v)
check('B1. it asks about LUNCH', /How big a lunch out\?/.test(await text('[data-testid="eating-out-sizes"]')))
await tap(`document.querySelector('[data-testid="eating-out-sizes"] [data-eating-out-size="big"]')`)
await until(picks, p => p.length === 1)
const pb = await picks()
check('B2. a big lunch out is saved for TOMORROW only', pb.length === 1 && pb[0].date === TOMORROW && pb[0].slot === 'lunch' && pb[0].name === 'Lunch out (Thursday)', pb)
const lunchOut = await until(() => row('lunch'), r => r?.name === 'Lunch out (Thursday)')
check('B3. tomorrow\'s row is the meal out', lunchOut?.label === 'Eating out' && lunchOut?.badge === 'Estimate', lunchOut)
check('B4. the line names the day', /^Thursday's lunch is out, a big night\./.test(await text('[data-testid="eating-out-line"]')), await text('[data-testid="eating-out-line"]'))
const week1 = await until(() => ev(`window.__weekMeals()`), w => w?.[TOMORROW]?.lunch === 'Lunch out (Thursday)')
check('B5. the week serves it on that date', week1[TOMORROW]?.lunch === 'Lunch out (Thursday)', week1[TOMORROW])
const lineB = await text('[data-testid="eating-out-line"]')
const changedB = Object.keys(week0).filter(k => k !== TOMORROW).flatMap(k => Object.keys(week0[k]).filter(sl => week0[k][sl] !== week1[k]?.[sl]).map(sl => [k, sl]))
check('B6. ...and any meal it changed on another day is named on the line', changedB.length <= 4 ? changedB.every(([k, sl]) => lineB.includes(week1[k][sl])) : /more/.test(lineB), [changedB, lineB])
check('B7. the planned card is still drawn, with its verdict', (await has('[data-planned-card]')) && (await text('[data-testid="planned-verdict"]')).length > 0, await text('[data-testid="planned-verdict"]'))
await shoot('eating-out-tomorrow')
await tap(`document.querySelector('[data-testid="eating-out-undo"]')`)
await until(picks, p => p.length === 0)
check('B8. its Undo puts tomorrow back as it was', JSON.stringify(await until(() => ev(`window.__weekMeals()`), w => w?.[TOMORROW]?.lunch === week0[TOMORROW].lunch)) === JSON.stringify(week0) && (await outOptions()).length === 0)

// A DINNER OUT LEAVES NO LEFTOVERS. The pair of days is found from the week by that property, never named.
const wk = await ev(`window.__weekMeals()`)
const days = Object.keys(wk).sort()
const pairDay = days.slice(0, -1).find((d0, i) => !!wk[d0]?.dinner && wk[days[i + 1]]?.lunch === wk[d0].dinner) ?? null
const nextDay = pairDay ? days[days.indexOf(pairDay) + 1] : null
check('B9. harness: some day\'s dinner is the next day\'s lunch, as leftovers', pairDay !== null, wk)
if (pairDay) {
  await tap(`document.querySelector('[data-meal-day="${pairDay}"]')`)
  await wait(400)
  await openSheet('dinner')
  await tap(`document.querySelector('[data-testid="eating-out-open"]')`)
  await until(() => has('[data-testid="eating-out-sizes"]'), v => v)
  await tap(`document.querySelector('[data-testid="eating-out-sizes"] [data-eating-out-size="normal"]')`)
  await until(picks, p => p.length === 1)
}
const wkL = await until(() => ev(`window.__weekMeals()`), w => !!pairDay && /^Dinner out/.test(w?.[pairDay]?.dinner ?? ''))
const lineL = await text('[data-testid="eating-out-line"]')
check('B10. with that dinner out, the next day\'s lunch is a fresh dish', !!nextDay && /^Dinner out/.test(wkL?.[pairDay]?.dinner ?? '') && wkL?.[nextDay]?.lunch !== wk[nextDay]?.lunch, [pairDay && wkL?.[pairDay], nextDay && wkL?.[nextDay], nextDay && wk[nextDay]])
check('B11. ...and the line SAYS so: that lunch, cooked fresh instead of leftovers', !!nextDay && lineL.includes(`'s lunch becomes ${wkL?.[nextDay]?.lunch}, cooked fresh instead of leftovers.`), lineL)
await shoot('eating-out-leftovers')
if (await has('[data-testid="eating-out-undo"]')) await tap(`document.querySelector('[data-testid="eating-out-undo"]')`)
await until(picks, p => p.length === 0)
check('B12. its Undo puts the week back, the leftovers included', JSON.stringify(await until(() => ev(`window.__weekMeals()`), w => JSON.stringify(w) === JSON.stringify(wk))) === JSON.stringify(wk) && (await picks()).length === 0)

// ------------------------------------------------------------------ C. CHAT
console.log('\nC. The chat')
// THE STUB, at the fetch boundary: the "model" names the day and the meal and never the size, which is the courier
// shape chat-gemini returns for propose_eating_out.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/dinner/i.test(said) && /out/i.test(said)) return json({ reply: '', proposal: { kind: 'propose_eating_out', rawArgs: { date: '${TOMORROW}', meal_slot: 'dinner', origin_verbatim_quote: said } } })
      return json({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })
await open('chat.html', '&daymove=1')
const ready = await until(() => ev(`!!document.querySelector('textarea') && Object.keys(window.__weekMeals ? window.__weekMeals() : {}).length === 7`), v => v === true, 80)
check('C0. harness: the chat is up with the week served', ready === true)
const cweek0 = await ev(`window.__weekMeals()`)
const say = async t => {
  await ev(`(() => { const el = document.querySelector('textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ${JSON.stringify(t)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const READ = `(() => { const btns = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean); const cards = [...document.querySelectorAll('[data-testid="proposal-card"]')]; const last = cards.pop(); return { text: document.body.innerText, btns, card: last?.innerText ?? '', pending: last?.getAttribute('data-card-status') === 'pending' } })()`
const read = () => ev(READ)
const after = (r, from) => r.text.slice(r.text.lastIndexOf(from))
const SAID = "I'm out for dinner tomorrow"
check('C1. he says he is out for dinner tomorrow, with no size', await say(SAID))
let r = await until(read, x => /How big a night out is Thursday's dinner\?/.test(after(x, SAID)), 60)
check('C2. THE APP ASKS how big, in its own words', /How big a night out is Thursday's dinner\?/.test(after(r, SAID)), after(r, SAID).slice(0, 300))
const chips = ['A light dinner out on Thursday', 'A normal dinner out on Thursday', 'A big night, dinner out on Thursday']
check('C3. ...with the three sizes as buttons that carry the meal and the day', chips.every(c => r.btns.includes(c)), r.btns.slice(-8))
check('C4. ...the tag that carries them is never shown', !/QUICK_REPLIES/.test(r.text))
check('C5. ...and no card, nothing written', !r.pending && (await picks()).length === 0)
await shoot('eating-out-chat-ask')
await ev(`[...document.querySelectorAll('button')].reverse().find(x => (x.textContent || '').trim() === ${JSON.stringify(chips[1])}).click()`)
r = await until(read, x => x.pending && /Want me to mark Thursday's dinner as eating out\?/.test(x.text), 60)
check('C6. the button answers it: a card, asking first', r.pending === true && /Want me to mark Thursday's dinner as eating out\?/.test(r.text), r.text.slice(-500))
check('C7. ...naming the dinner before and after, with its estimate', r.card.includes(cweek0[TOMORROW].dinner) && /Eating out, normal \(about [\d,]+–[\d,]+ kcal, an estimate\)/.test(r.card), r.card.slice(0, 400))
check('C8. ...and saying the day fits around it and it stays off the list', /The rest of the day fits around it, and it stays off your shopping list\./.test(r.card), r.card)
check('C8b. ...and what it changes elsewhere in the week, read off the same trial as the screen (or that nothing else changes)', /becomes |goes from |No other meal/.test(r.card), r.card)
check('C9. nothing written before Apply', (await picks()).length === 0)
await shoot('eating-out-chat-card')
await ev(`[...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim())).click()`)
await until(picks, p => p.length === 1)
const pc = await picks()
check('C10. Apply writes the same pick the screen writes', pc.length === 1 && pc[0].date === TOMORROW && pc[0].slot === 'dinner' && pc[0].name === 'Dinner out (Thursday)', pc)
check('C11. ...a normal-sized meal out', (await outOptions()).some(o => o.tags.includes('eating-out-size:normal')), await outOptions())
r = await until(read, x => /Eating out added/.test(x.text) && x.btns.includes('Undo'), 40)
check('C12. a receipt says it, with an Undo', /Eating out added/.test(r.text) && r.btns.includes('Undo'), r.text.slice(-300))
check('C13. the week serves it tomorrow', (await until(() => ev(`window.__weekMeals()`), w => w?.[TOMORROW]?.dinner === 'Dinner out (Thursday)'))[TOMORROW].dinner === 'Dinner out (Thursday)')
await shoot('eating-out-chat-receipt')
await ev(`[...document.querySelectorAll('button')].reverse().find(x => (x.textContent || '').trim() === 'Undo').click()`)
await until(picks, p => p.length === 0)
check('C14. its Undo puts tomorrow\'s dinner back, nothing left behind', (await picks()).length === 0 && (await outOptions()).length === 0 && (await until(() => ev(`window.__weekMeals()`), w => w?.[TOMORROW]?.dinner === cweek0[TOMORROW].dinner))[TOMORROW].dinner === cweek0[TOMORROW].dinner)

// HIS SIZE IN HIS WORDS: straight to the card, at that size.
const SAID2 = 'big night out for dinner tomorrow'
await say(SAID2)
r = await until(read, x => x.pending && /Eating out, big night/.test(x.card), 60)
check('C15. the size in his own words goes straight to the card, at that size', r.pending && /Eating out, big night \(about [\d,]+–[\d,]+ kcal, an estimate\)/.test(r.card) && !/How big a night out/.test(after(r, SAID2)), r.card.slice(0, 300))
await ev(`[...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Not now')?.click()`)
await wait(500)
check('C16. ...and "Not now" writes nothing', (await picks()).length === 0)

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)
await finish('eating out: all checks passed')
