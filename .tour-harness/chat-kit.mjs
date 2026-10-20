// ---------------------------------------------------------------------------
// "I DON'T HAVE A BARBELL", TO THE COACH (the kit list's chat door).
//
// Ashley, 9 Oct 2026: "Remember what they say". The coach's
// propose_kit_change card is priced by the same controller Profile's ticks use
// (kit-change.ts makeKitController) and refused, before any card, unless the
// kit is in her own words. This holds what only the real chat can show: the
// card arrives, says the kit and what changes on the plan BEFORE the tap,
// nothing is written until Apply, Apply writes one kit row and the plan stops
// needing the thing; and a model that invents kit she never named gets no card.
//
// WHAT THIS CANNOT SEE: the model is stubbed at the fetch boundary, so the
// edge function's handler and prompt never run here. `test:kit-list` §9 holds
// the server's courier and the tool's shape by source; whether the model
// calls the tool is the coach exam's to judge.
//
// PORT 9664.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9664, page: 'chat.html', name: 'chat-kit' })
const { send, ev, check, until, wait, go, shoot, finish } = d
const BARBELL = ['barbell', 'EZ bar', 'trap bar', 't-bar']

await send('Emulation.setFocusEmulationEnabled', { enabled: true })
// THE MODEL, STUBBED. "barbell" → the honest call; "at home" → a model that
// adds a kettlebell and bands she never mentioned.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const body = JSON.parse((init && init.body) || '{}')
      window.__lastProfile = body.context && body.context.profile
      const said = String(body.message || '')
      const reply = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      // A MODEL THAT ANSWERS A KIT STATEMENT WITH A ONE-EXERCISE SWAP (live test, 19 Oct 2026).
      if (/don.t have bands/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_exercise_swap', rawArgs: { old_item: window.__bandExercise || 'Band Pull-Aparts', new_item: 'Glute Bridge', scope: 'today', origin_verbatim_quote: said } } })
      if (/at home/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_kit_change', rawArgs: { mode: 'only', items: ['dumbbells', 'kettlebell', 'bands'], origin_verbatim_quote: said } } })
      if (/barbell/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_kit_change', rawArgs: { mode: 'hasnt', items: ['barbell'], origin_verbatim_quote: said } } })
      return reply({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })
await go('&kit=1')
const ready = await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 40)
check('0a. the chat is up', ready === true)
const before = await until(() => ev(`window.__needsFromToday ? window.__needsFromToday(${JSON.stringify(BARBELL)}) : null`), v => Array.isArray(v), 40)
check('0b. the plan from today holds barbell work (or the card would prove nothing)', Array.isArray(before) && before.length >= 1, before)

const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const CARD = String.raw`(() => {
  const heads = [...document.querySelectorAll('*')].filter(e => /Proposed change/i.test(e.textContent || '') && e.children.length === 0)
  const h = heads[heads.length - 1]
  if (!h) return null
  let p = h
  for (let i = 0; i < 12 && p.parentElement; i++) {
    p = p.parentElement
    const b = [...p.querySelectorAll('button')].map(x => (x.textContent || '').trim())
    if (b.some(t => /^Apply/.test(t)) && b.includes('Keep')) break
  }
  return p.textContent.replace(/\s+/g, ' ').trim()
})()`

// 1. THE HONEST CALL: a card, priced, nothing written.
check('1a. she says it', await say("I don't have a barbell at the moment, it went back to my brother") === true)
const card = await until(() => ev(CARD), v => !!v, 40)
const leadText = await until(() => ev(`document.body.innerText`), v => /Want me to remember that — [^?\n]*\?/.test(v), 60)
check('1b. a card comes back, asking first', !!card && /Want me to remember that — no barbell and plates\?/.test(leadText), leadText.slice(leadText.indexOf('Want me') - 20, leadText.indexOf('Want me') + 120))
check('1c. ...naming the kit before and after', !!card && /Your kit/.test(card) && /barbell/.test(card), card)
check('1d. ...and what changes on the plan, from which day', !!card && /exercises? on your plan changes? from |rebuilt around that from /.test(card), card)
check('1e. NOTHING WRITTEN before the tap', JSON.stringify(await ev(`window.__kitRows()`)) === '[]')
await shoot('chat-kit-card')

// 2. APPLY: one kit row, from the chat; the plan stops needing a barbell.
await ev(`(() => { const b = [...document.querySelectorAll('button')].filter(x => /^Apply/.test((x.textContent || '').trim())).pop(); if (b) b.click() })()`)
const rows = await until(() => ev(`window.__kitRows()`), v => Array.isArray(v) && v.length > 0, 60)
check('2a. Apply writes exactly one kit row: no barbell, from the chat',
  Array.isArray(rows) && rows.length === 1 && rows[0].polarity === 'dislike' && JSON.stringify(rows[0].refs) === '["barbell"]' && rows[0].source === 'chat', rows)
const after = await until(() => ev(`window.__needsFromToday(${JSON.stringify(BARBELL)})`), v => Array.isArray(v) && v.length === 0, 40)
check('2b. from today the plan no longer needs a barbell', Array.isArray(after) && after.length === 0, after)
const receipt = await until(() => ev(`document.body.innerText`), v => /Kit saved/.test(v), 40)
check('2c. a receipt says it was saved', /Kit saved/.test(receipt))
await shoot('chat-kit-saved')

// 3. A MODEL THAT INVENTS KIT: no card, and nothing written.
const cardsBefore = await ev(`(document.body.innerText.match(/Proposed change/gi) || []).length`)
check('3a. she says something vaguer', await say('just some dumbbells at home really') === true)
const refusal = await until(() => ev(`document.body.innerText`), v => /in your own words[^\n]*update it\./i.test(v), 60)
check('3b. the coach asks her to say it in her own words instead of carding a guess', /in your own words/i.test(refusal))
check('3c. ...no new card, and no new row', (await ev(`(document.body.innerText.match(/Proposed change/gi) || []).length`)) === cardsBefore
  && (await ev(`window.__kitRows()`)).length === 1)
await shoot('chat-kit-refused')
// 5. THE KIT AND THE NAMES THE COACH IS SENT (live test, 19 Oct 2026): the kit list always, with what is NOT on it,
// and real exercise names that fit. Read off the request the chat actually sent.
const sent = await ev('window.__lastProfile ?? null')
// This page's profile is a home gym, and step 2 has just saved "no barbell": so the barbell is what is NOT on it.
// The Minimalist-with-nothing-said case (Sam's) is held by test:coach-kit-names off the same functions.
check('5a. the coach is sent the kit list with what is NOT on it, and the barbell she just said she lacks is there',
  !!sent && /^Your kit: /.test(sent.kit_said ?? '') && /NOT on it: [^.]*barbell/.test(sent.kit_said ?? '') && !/Your kit: [^.]*barbell/.test(sent.kit_said ?? ''), sent && sent.kit_said)
check('5b. ...and real exercise names that fit her, by movement, with no barbell lift among them',
  !!sent && /overhead press: [^;]*Dumbbell Shoulder Press/.test(sent.exercises_that_fit ?? '') && !/\bBarbell\b/.test(sent.exercises_that_fit ?? ''), sent && sent.exercises_that_fit)

// 6. "I DON'T HAVE BANDS" ANSWERED WITH A SWAP BY THE MODEL: the app offers the kit change instead (her own words),
// priced across the plan, and writes nothing until she taps.
await ev(`window.__bandExercise = (window.__needsFromToday(['resistance band']) || [])[0] || null`)
const bandEx = await ev('window.__bandExercise')
check('6a. the plan holds band work (or the case proves nothing)', !!bandEx, bandEx)
const rowsBefore = (await ev('window.__kitRows()')).length
check('6b. she says it', await say("I don't have bands") === true)
const lead6 = await until(() => ev(`document.body.innerText`), v => /Want me to remember that — no resistance bands\?/.test(v), 60)
check('6c. the kit change is offered, not a one-exercise swap', /Want me to remember that — no resistance bands\?/.test(lead6) && !/Want me to swap [^?]*Glute Bridge\?/.test(lead6), lead6.slice(-400))
check('6d. nothing written before the tap', (await ev('window.__kitRows()')).length === rowsBefore)
await shoot('chat-kit-bands')
check('4. no uncaught error on the page', (await ev('window.__err ?? null')) === null)

await finish('verify:chat-kit PASSED')
