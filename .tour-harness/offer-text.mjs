// ---------------------------------------------------------------------------
// AN OFFER IS A TEXT WITH SMALL BUTTONS, NOT A CARD — in the real chat.
//
// Ashley, 20 Oct 2026, from three options: "Text + small buttons always."
// In her words: "I told it i dont have bands and it offered to swap but the
// cards dont feel like a real trainer offering a swap. A real trainer
// wouldn't immediately send a card. It should be just a text question and
// then a smaller button to approve the swap." Every offer, a plan-wide one
// included, whose list of changes goes into the message.
//
// THREE OFFERS OF THREE SHAPES, because a check on "how an offer looks" with
// one offer on screen cannot tell a rule from a coincidence: an exercise swap
// (one change, two scopes), a kit change (one change repeated across many
// days, the case where a card was a stack of rows), and a meal edit (a cost
// and its alternatives). For each: the question and its facts are ONE coach
// bubble, inside the coach's group; nothing of the old card is drawn (no
// "Proposed change", no rule down the side, no big glowing button); every
// button is at least 44px to tap and its drawn pill is word-sized; the facts
// are readable BEFORE the tap and nothing is written before it; and the tap,
// a typed "yes" or "Not now" each still do what they did.
//
// The model is stubbed at the fetch boundary; everything after it is the real
// chat, the real builders and the real pending-action write.
//
// PORT 9681.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9681, page: 'chat.html', name: 'offer-text' })
const { send, ev, check, until, wait, go, shoot, finish } = d

await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const reply = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/swap/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_exercise_swap', rawArgs: { day: '', old_item: window.__swapOld, new_item: 'leg press', scope: 'today', reason: 'Rack is busy.' } } })
      if (/salmon/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_meal_food_remove', rawArgs: { meal_slot: 'dinner', food: 'salmon', date: window.__mealDay && window.__mealDay.today } } })
      if (/barbell/i.test(said)) return reply({ reply: '', proposal: { kind: 'propose_kit_change', rawArgs: { mode: 'hasnt', items: ['barbell'], origin_verbatim_quote: said } } })
      return reply({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })
await go('&kit=1')
check('0a. the chat is up', (await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 40)) === true)
const target = await until(() => ev('window.__swapTarget ?? null'), v => !!v, 40)
check('0b. today holds a lift to swap (or the swap case proves nothing)', !!target?.full && !!target?.loose, target)
await ev(`window.__swapOld = ${JSON.stringify(target?.loose ?? '')}`)
check('0c. the plan from today holds barbell work (or the kit case proves nothing)',
  ((await until(() => ev(`window.__needsFromToday ? window.__needsFromToday(['barbell', 'EZ bar', 'trap bar', 't-bar']) : null`), v => Array.isArray(v), 40)) ?? []).length >= 1)

const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}

// EVERYTHING ONE OFFER IS, read in one pass. Null-safe, so a missing offer
// fails every check below it rather than skipping them.
const READ = String.raw`((n) => {
  const offers = [...document.querySelectorAll('[data-testid="proposal-card"]')]
  const o = offers[offers.length - 1 - (n || 0)]
  if (!o) return null
  const bubble = o.querySelector('[data-testid="chat-bubble"]')
  const facts = o.querySelector('[data-testid="offer-facts"]')
  const group = o.closest('[data-testid="chat-group"]')
  const cs = e => e ? getComputedStyle(e) : null
  const confirmRow = [...o.querySelectorAll('[data-testid="offer-buttons"] button')]
  // The offer's own answers. Not the Listen icon on the coach's bubble (her 31 Oct 2026 ruling): it reads the
  // message aloud and answers nothing, and it is checked by verify:chat-2b and verify:chat-bubbles.
  const answers = [...o.querySelectorAll('button')].filter(b => !b.hasAttribute('data-listen'))
  const buttons = answers.map(b => {
    const r = b.getBoundingClientRect(), pill = b.firstElementChild, pr = pill ? pill.getBoundingClientRect() : null, ps = cs(pill)
    return { label: (b.textContent || '').trim(), h: r.height, w: r.width, pillH: pr ? pr.height : 999, pillFont: ps ? parseFloat(ps.fontSize) : 99, pillShadow: ps ? ps.boxShadow : '?', shadow: cs(b).boxShadow, inConfirmRow: confirmRow.includes(b) }
  })
  const bubbleTop = bubble ? bubble.getBoundingClientRect() : null
  return {
    status: o.getAttribute('data-card-status'),
    offerAttr: o.getAttribute('data-offer'),
    bubbleRole: bubble ? bubble.getAttribute('data-role') : null,
    groupRole: group ? group.getAttribute('data-role') : null,
    factsInBubble: !!(bubble && facts && bubble.contains(facts)),
    // The lead is the bubble's own words ABOVE the facts: the question, said first.
    leadInBubble: !!(bubble && facts && (bubble.textContent || '').replace(facts.textContent || '', '').trim().length > 8 && bubble.firstElementChild !== facts),
    bubbleText: bubble ? bubble.innerText.replace(/\s+/g, ' ').trim() : '',
    // RE-ANCHORED 31 Oct 2026 (design 2b): a single replacement is said on its own soft line under the bubble (the
    // preview), a list stays in the bubble. Either way it is a change line OF THIS OFFER, said before the tap.
    changeLines: [...o.querySelectorAll('[data-offer-line="change"]')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    factLines: facts ? [...facts.children].map(e => e.textContent.replace(/\s+/g, ' ').trim()) : [],
    warns: facts ? [...facts.querySelectorAll('[data-severity="warn"]')].map(e => e.textContent.trim()) : [],
    ruled: [o, facts, bubble].filter(Boolean).some(e => parseFloat(cs(e).borderLeftWidth) > 1),
    buttons,
    buttonsBelowBubble: !!bubbleTop && buttons.length > 0 && answers.every(b => b.getBoundingClientRect().top >= bubbleTop.bottom - 0.5),
    // The whole page, for the old chrome anywhere at all.
    cardHeading: /Proposed change/i.test(document.body.innerText),
    keepButton: [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Keep'),
  }
})`
const offer = (n = 0) => ev(`${READ}(${n})`)
const settle = async () => {
  // The lead types in; photograph and read it once it has stopped moving.
  let prev = ''
  for (let i = 0; i < 24; i++) {
    const now = (await offer())?.bubbleText ?? ''
    if (now && now === prev) break
    prev = now
    await wait(300)
  }
}
const looksLikeText = (tag, o, confirmLabel) => {
  check(`${tag}: the offer is on screen, live`, o?.status === 'pending' && o?.offerAttr === 'text', o && { status: o.status, attr: o.offerAttr })
  check(`${tag}: its lead and its facts are ONE coach bubble, in the coach's group`,
    o?.bubbleRole === 'assistant' && o?.groupRole === 'assistant' && o?.factsInBubble === true && o?.leadInBubble === true, o && { bubble: o.bubbleRole, group: o.groupRole, facts: o.factsInBubble, lead: o.leadInBubble })
  check(`${tag}: no card chrome — no "Proposed change", no rule down the side, no "Keep"`, !!o && o.cardHeading === false && o.ruled === false && o.keepButton === false, o && { heading: o.cardHeading, ruled: o.ruled, keep: o.keepButton })
  const btns = o?.buttons ?? []
  check(`${tag}: the buttons are "${confirmLabel}" and "Not now", under the bubble`,
    btns.some(b => b.inConfirmRow && b.label === confirmLabel) && btns.some(b => b.inConfirmRow && b.label === 'Not now') && o?.buttonsBelowBubble === true, btns.map(b => b.label))
  check(`${tag}: every button is at least 44px to tap`, btns.length >= 2 && btns.every(b => b.h >= 44 && b.w >= 44), btns.map(b => [b.label, Math.round(b.h), Math.round(b.w)]))
  // RE-ANCHORED 31 Oct 2026 (design 2b, which her plan says fits this ruling): the reply pills are drawn 36px, inside
  // the 44px button — no taller than the reply chips (40px), still word-sized, still no glow.
  check(`${tag}: ...and LOOKS small: a word-sized pill (no taller than 40px, text no bigger than 14px), no glow`,
    btns.length >= 2 && btns.every(b => b.pillH <= 40 && b.pillFont <= 14 && b.pillShadow === 'none' && b.shadow === 'none'), btns.map(b => [b.label, Math.round(b.pillH), b.pillFont, b.pillShadow]))
}

// 1. AN EXERCISE SWAP: one change, two scopes.
check('1. she asks for a swap', await say('swap this exercise, the rack is busy') === true)
await until(() => offer(), v => !!v, 60)
await settle()
const swap = await offer()
looksLikeText('1a swap', swap, 'Apply today')
check('1b swap: the facts say what changes before the tap — the lift on her plan → Leg Press',
  (swap?.changeLines ?? []).some(l => l.includes(target?.full ?? 'NO-NAME') && /→\s*Leg Press/i.test(l)), swap?.changeLines)
check('1c swap: both scopes are offered, each under its own label', (swap?.buttons ?? []).some(b => b.label === 'Rest of block'), swap?.buttons?.map(b => b.label))
await shoot('offer-text-swap')
await ev(`(() => { const b = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop()?.querySelectorAll('button'); const n = b && [...b].find(x => x.textContent.trim() === 'Not now'); if (n) n.click() })()`)
const declined = await until(() => offer(), v => v?.status === 'declined', 40)
check('1d swap: "Not now" declines it, and the offer says so in words', declined?.status === 'declined' && (await ev(`[...document.querySelectorAll('[data-testid="proposal-terminal-note"]')].pop()?.textContent ?? ''`)) === 'Left as it was.', declined?.status)

// 2. A MEAL EDIT: a cost and its alternatives. Asked first (it works against
// the goal), then offered on the second ask — the house rule, unchanged.
check('2. she asks to take the salmon out', await say('take the salmon out of my dinner') === true)
await wait(3500)
const offersBefore = await ev(`document.querySelectorAll('[data-testid="proposal-card"]').length`)
check('2a. ...and again, so it is offered', await say('take the salmon out of my dinner') === true)
await until(() => ev(`document.querySelectorAll('[data-testid="proposal-card"]').length`), v => v > offersBefore, 60)
await settle()
const meal = await offer()
looksLikeText('2b meal', meal, 'Apply')
check('2c meal: the facts name the food coming out and what it costs, before the tap',
  (meal?.changeLines ?? []).some(l => /salmon/i.test(l)) && (meal?.factLines ?? []).some(l => /protein/i.test(l)), meal?.factLines)
check('2d meal: the alternatives are said in the text and offered as small buttons too',
  (meal?.factLines ?? []).some(l => /instead/i.test(l)) && (meal?.buttons ?? []).filter(b => !b.inConfirmRow).length >= 1, meal?.buttons?.map(b => b.label))
await shoot('offer-text-meal')
// A TYPED YES STILL ANSWERS IT, through the same path the button uses.
check('2e. she types "yes"', await say('yes') === true)
const RECEIPT = title => ev(String.raw`(() => {
  const r = [...document.querySelectorAll('[data-testid="chat-receipt"]')].pop()
  if (!r || !${title}.test(r.textContent || '')) return null
  const cs = getComputedStyle(r)
  const undo = [...r.querySelectorAll('button')].find(b => /^Undo/.test((b.textContent || '').trim()))
  const ub = undo ? undo.getBoundingClientRect() : null
  const group = r.closest('[data-testid="chat-group"]')
  return { text: r.textContent.replace(/\s+/g, ' ').trim(), ruled: parseFloat(cs.borderLeftWidth) > 1, bg: cs.backgroundColor, group: group && group.getAttribute('data-role'), undo: ub && { h: ub.height, w: ub.width, pillH: undo.firstElementChild.getBoundingClientRect().height } }
})()`)
const mealReceipt = await until(() => RECEIPT('/Taken out/'), v => !!v, 60)
check('2f meal: the typed yes applied it — its receipt is in the chat, and no offer is left open',
  !!mealReceipt && (await ev(`document.querySelectorAll('[data-testid="proposal-card"][data-card-status="pending"]').length`)) === 0, mealReceipt)
check('4a. the receipt is a line in the coach\'s group, with no rule down its side and no panel behind it',
  !!mealReceipt && mealReceipt.group === 'assistant' && mealReceipt.ruled === false && /rgba\(0, 0, 0, 0\)|transparent/.test(mealReceipt.bg), mealReceipt)
check('4b. ...and its Undo is still there, a small button with a 44px tap target', !!mealReceipt?.undo && mealReceipt.undo.h >= 44 && mealReceipt.undo.w >= 44 && mealReceipt.undo.pillH <= 32, mealReceipt?.undo)
await ev(`[...document.querySelectorAll('[data-testid="chat-receipt"]')].pop()?.scrollIntoView({ block: 'end' })`)
await wait(300)
await shoot('offer-text-receipt')

// 3. A KIT CHANGE: one change repeated across many days.
const rowsBefore = (await ev('window.__kitRows()')).length
check('3. she says she has no barbell', await say("I don't have a barbell at the moment") === true)

await until(() => offer(), v => v?.status === 'pending' && /remember/i.test(v.bubbleText), 60)
await settle()
const kit = await offer()
looksLikeText('3a kit', kit, 'Apply')
const DATED = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}\b/
check('3b kit: the days it changes are lines of the message, each with what changes on it',
  (kit?.changeLines ?? []).filter(l => DATED.test(l) && /→|adds /.test(l)).length >= 2, kit?.changeLines)
check('3c kit: ...the kit itself before and after, and the days past the list counted, not dropped',
  (kit?.changeLines ?? []).some(l => /^Your kit: /.test(l)) && (kit?.factLines ?? []).some(l => /more days?\.$/.test(l)), kit?.factLines)
check('3d kit: nothing written before the tap', (await ev('window.__kitRows()')).length === rowsBefore)
await shoot('offer-text-kit')
await ev(`(() => { const b = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop()?.querySelectorAll('[data-testid="offer-buttons"] button'); if (b && b[0]) b[0].click() })()`)
const rows = await until(() => ev('window.__kitRows()'), v => Array.isArray(v) && v.length > rowsBefore, 60)
check('3e kit: the small Apply writes it', Array.isArray(rows) && rows.length === rowsBefore + 1, rows)

const kitReceipt = await until(() => RECEIPT('/Kit saved/'), v => !!v, 40)
check('3f kit: its receipt is a light line too', !!kitReceipt && kitReceipt.ruled === false && kitReceipt.group === 'assistant', kitReceipt)
check('5. no uncaught error on the page', (await ev('window.__err ?? null')) === null)

await finish('verify:offer-text PASSED')
