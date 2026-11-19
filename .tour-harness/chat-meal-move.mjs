// verify:chat-meal-move — A MOVE BETWEEN TWO MEALS, ASKED OF THE COACH, CAN BE PUT BACK.
//
// The chat walk of 18 Nov 2026 (finding C11): the Move sheet on Nutrition has had an Undo since 2 Nov, and the coach's
// receipt for the same move had none ("moving it back is one more move"). Both now run one function.
//
// WHICH HALF THIS PROVES. chat.html?daymove=1 renders the real ChatAssistant over the app's own week (useMealDays) and
// a fake database. The coach is stubbed at the fetch boundary and answers with the courier offer and no words, the
// live shape. So the card, the confirm, the two writes, the receipt and its Undo are the real client. THE DAY MOVED
// IS TOMORROW, on purpose: on this page today's pick goes to a stand-in that only records the call, while another
// day's goes through the app's own writer, so tomorrow is the day whose picks are really stored. That today's Undo
// goes through the same function with today's own handler is held by test:meal-move.
//
//   1. the move, and an Undo on the receipt;      2. Undo: both copies gone, the day as it was;
//   3. an earlier pick of his is put BACK, not cleared;
//   4. a meal he has changed since is left alone, and the receipt says so;
//   5. undoing a meal added to ANOTHER day leaves today's shown pick alone (it was dropped).
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9974, page: 'chat.html', name: 'chat-meal-move', timeoutMs: 280_000, openOfferDetails: true })
const { send, ev, check, wait, go, until, shoot, finish } = d
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__err = null
  addEventListener('error', e => { window.__err = String(e.message) })
  addEventListener('unhandledrejection', e => { window.__err = String(e.reason && e.reason.message || e.reason) })
  window.__offer = null
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      let said = ''; try { said = String(JSON.parse((init && init.body) || '{}').message || '') } catch {}
      const body = said && window.__offer ? { reply: '', proposal: { kind: window.__offer.kind, rawArgs: { ...window.__offer.args, origin_verbatim_quote: said } } } : { reply: said ? 'Sure.' : '' }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); t.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(250)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const week = () => ev(`window.__weekMeals ? window.__weekMeals() : {}`)
const open = async () => {
  await go('&daymove=1')
  await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 80)
  await until(() => week().then(w => Object.keys(w ?? {}).length), v => v === 7, 80)
  await wait(600)
}
/** What the store holds for a day: its picks by meal, and every option's name for the two meals moved. */
const stored = date => ev(`(() => {
  const picks = Object.fromEntries((window.__fakeDb.meal_plan_picks || []).filter(p => p.date === ${JSON.stringify(date)} || p.plan_date === ${JSON.stringify(date)}).map(p => [p.slot, p.meal_name ?? p.name]))
  const names = slot => (window.__fakeDb.meal_plan_slots || []).filter(r => r.slot === slot).map(r => r.name).sort()
  return { picks, lunch: names('lunch'), dinner: names('dinner') }
})()`)
const tapButton = re => ev(`(() => { const b = [...document.querySelectorAll('button')].filter(x => ${re}.test((x.textContent || '').trim()) && !x.disabled).pop(); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true })()`)
/** The newest receipt: its words, whether it has an Undo, and whether that Undo is on screen. */
const receipt = () => ev(`(() => {
  const lines = [...document.querySelectorAll('[data-receipt-line]')]
  const line = lines[lines.length - 1]
  const card = line?.closest('[data-testid="chat-group"]') ?? line?.parentElement?.parentElement
  const undo = card ? [...card.querySelectorAll('[data-receipt-undo]')].pop() : null
  const r = undo?.getBoundingClientRect()
  return { text: (card?.innerText || '').replace(/\\s+/g, ' ').trim().slice(-260), hasUndo: !!undo, undoOnScreen: !!r && r.top >= 0 && r.bottom <= innerHeight }
})()`)
const applied = async () => { await until(() => ev(`document.querySelectorAll('[data-receipt-line]').length`), v => v >= 1, 60); await wait(900) }
const moveIt = async (date) => {
  await ev(`window.__offer = { kind: 'propose_meal_move', args: { from_slot: 'lunch', to_slot: 'dinner', date: ${JSON.stringify(date)} } }`)
  await say('swap my lunch and dinner tomorrow')
  await until(() => ev(`!!document.querySelector('[data-testid="proposal-card"]')`), v => v === true, 60)
  await wait(700)
}

console.log('\n  1. THE MOVE, AND AN UNDO ON ITS RECEIPT')
await open()
const w0 = await week()
const TOMORROW = Object.keys(w0).sort()[1]
const s0 = await stored(TOMORROW)
check('1a. tomorrow has a lunch and a dinner, two different dishes, and no pick of his yet', !!w0[TOMORROW]?.lunch && !!w0[TOMORROW]?.dinner && w0[TOMORROW].lunch !== w0[TOMORROW].dinner && !s0.picks.lunch && !s0.picks.dinner, { day: w0[TOMORROW], picks: s0.picks })
await moveIt(TOMORROW)
const card = await ev(`(document.querySelector('[data-testid="proposal-card"]')?.innerText || '').replace(/\\s+/g, ' ')`)
check('1b. the coach\'s offer names both meals, and nothing is written before the tap', /lunch/i.test(card) && /dinner/i.test(card) && JSON.stringify(await stored(TOMORROW)) === JSON.stringify(s0), card.slice(0, 200))
check('1c. Apply is tapped', await tapButton('/^Apply/'))
await applied()
const s1 = await stored(TOMORROW)
const madeLunch = s1.lunch.filter(n => !s0.lunch.includes(n)), madeDinner = s1.dinner.filter(n => !s0.dinner.includes(n))
check('1d. each meal has one new resized copy, and tomorrow\'s two picks name them', madeLunch.length === 1 && madeDinner.length === 1 && s1.picks.lunch === madeLunch[0] && s1.picks.dinner === madeDinner[0], { madeLunch, madeDinner, picks: s1.picks })
const r1 = await receipt()
check('1e. THE RECEIPT HAS AN UNDO, on screen (it had none)', r1?.hasUndo === true && r1.undoOnScreen === true, r1)
await shoot('chat-meal-move-1-moved')

console.log('\n  2. UNDO PUTS BOTH MEALS BACK')
check('2a. Undo is tapped', await ev(`(() => { const b = [...document.querySelectorAll('[data-receipt-undo]')].pop(); if (!b || b.disabled) return false; b.click(); return true })()`))
await until(() => stored(TOMORROW).then(s => s.lunch.length + s.dinner.length), v => v === s0.lunch.length + s0.dinner.length, 60)
await wait(900)
const s2 = await stored(TOMORROW)
check('2b. both copies are gone from the options and neither meal has a pick: the store is as it was', JSON.stringify(s2) === JSON.stringify(s0), { before: s0.picks, after: s2.picks, lunch: s2.lunch.length, dinner: s2.dinner.length })
const w2 = await week()
check('2c. ...and the week the app serves is the week from before the move', JSON.stringify(w2[TOMORROW]) === JSON.stringify(w0[TOMORROW]), [w0[TOMORROW], w2[TOMORROW]])
const r2 = await receipt()
check('2d. the receipt says it was put back, and the Undo is gone', /Put back/.test(r2?.text ?? '') && r2.hasUndo === false, r2)
await shoot('chat-meal-move-2-undone')

console.log('\n  3. A PICK OF HIS FROM BEFORE IS PUT BACK, NOT CLEARED')
await open()
const before3 = await stored(TOMORROW)
const served3 = (await week())[TOMORROW].lunch
const hisLunch = before3.lunch.find(n => n !== served3)
check('3a. he picks another lunch for tomorrow first (the app\'s own pick writer)', !!hisLunch && (await ev(`window.__applyPick(${JSON.stringify(TOMORROW)}, 'lunch', ${JSON.stringify(hisLunch ?? '')})`)) === true, hisLunch)
await wait(700)
const s3a = await stored(TOMORROW)
check('3b. ...so tomorrow\'s lunch is his pick, stored and served', s3a.picks.lunch === hisLunch && (await week())[TOMORROW].lunch === hisLunch, s3a.picks)
await moveIt(TOMORROW)
await tapButton('/^Apply/')
await applied()
const s3b = await stored(TOMORROW)
check('3c. the move lands (two copies, two picks)', s3b.lunch.length === s3a.lunch.length + 1 && s3b.dinner.length === s3a.dinner.length + 1 && s3b.picks.lunch !== hisLunch, s3b.picks)
await ev(`(() => { const b = [...document.querySelectorAll('[data-receipt-undo]')].pop(); if (b) b.click() })()`)
await until(() => stored(TOMORROW).then(s => s.lunch.length + s.dinner.length), v => v === s3a.lunch.length + s3a.dinner.length, 60)
await wait(900)
const s3c = await stored(TOMORROW)
check('3d. UNDO PUTS HIS LUNCH BACK (a cleared pick would have served the day\'s own choice), and dinner has none again', s3c.picks.lunch === hisLunch && !s3c.picks.dinner && JSON.stringify(s3c) === JSON.stringify(s3a), { before: s3a.picks, after: s3c.picks })

console.log('\n  4. A MEAL HE HAS CHANGED SINCE IS LEFT ALONE')
await open()
const s4a = await stored(TOMORROW)
await moveIt(TOMORROW)
await tapButton('/^Apply/')
await applied()
const s4b = await stored(TOMORROW)
const later = s4a.lunch.find(n => n !== s4b.picks.lunch)
check('4a. after the move he swaps tomorrow\'s lunch again, to another dish', !!later && (await ev(`window.__applyPick(${JSON.stringify(TOMORROW)}, 'lunch', ${JSON.stringify(later ?? '')})`)) === true, later)
await wait(700)
const s4c = await stored(TOMORROW)
await ev(`(() => { const b = [...document.querySelectorAll('[data-receipt-undo]')].pop(); if (b) b.click() })()`)
await wait(1800)
const s4d = await stored(TOMORROW)
const r4 = await receipt()
check('4b. UNDO CHANGES NOTHING: his later lunch stays, the dinner stays, both copies stay', JSON.stringify(s4d) === JSON.stringify(s4c) && s4d.picks.lunch === later, { before: s4c.picks, after: s4d.picks })
check('4c. ...and the receipt says why, in words', /One of those meals has changed since, so I've left both as they are\./.test(r4?.text ?? ''), r4)
await shoot('chat-meal-move-4-changed-since')

console.log('\n  5. UNDOING A MEAL ADDED TO ANOTHER DAY LEAVES TODAY\'S SHOWN PICK ALONE')
await open()
const s5a = await stored(TOMORROW)
await ev(`window.__mealSwapsApplied = []; window.__offer = { kind: 'propose_meal_addition', args: { meal_name: 'Chicken and rice bowl', meal_slot: 'dinner', ingredients: ['150g chicken breast', '70g white rice', '100g broccoli'], prep: '', cuisine: '', date: ${JSON.stringify(TOMORROW)} } }`)
await say('add a chicken and rice bowl to tomorrow\'s dinner')
await until(() => ev(`!!document.querySelector('[data-testid="proposal-card"]')`), v => v === true, 60)
await wait(700)
console.log('      page tail:', await ev(`document.body.innerText.replace(/\\s+/g, ' ').slice(-420)`))
check('5a. the meal is offered and applied', await tapButton('/^Apply/'))
await applied()
const s5b = await stored(TOMORROW)
check('5b. tomorrow\'s dinner has the new copy, picked', s5b.dinner.length === s5a.dinner.length + 1 && !!s5b.picks.dinner && !s5a.dinner.includes(s5b.picks.dinner), s5b.picks)
await ev(`(() => { const b = [...document.querySelectorAll('[data-receipt-undo]')].pop(); if (b) b.click() })()`)
await until(() => stored(TOMORROW).then(s => s.dinner.length), v => v === s5a.dinner.length, 60)
await wait(900)
const todayCalls = await ev(`(window.__mealSwapsApplied || []).map(c => c.slot + ':' + (c.name || '(cleared)'))`)
check('5c. the copy is gone and tomorrow\'s dinner has no pick again', JSON.stringify(await stored(TOMORROW)) === JSON.stringify(s5a))
check('5d. TODAY\'S PICK HANDLER WAS NEVER TOLD TO CLEAR DINNER (it was, for a meal of another day)', Array.isArray(todayCalls) && !todayCalls.some(c => /cleared/.test(c)), todayCalls)

check('6. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('A move between two meals asked of the coach can be put back, by the Move sheet\'s own function.')
