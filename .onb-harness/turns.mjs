// ---------------------------------------------------------------------------
// WHAT HAPPENS WHEN A TURN COMES BACK — the real onboarding screen, with the
// coach scripted (see scripted.tsx for why and how).
//
// From the 9 Oct 2026 test log, all seen by a person on a phone and none
// reachable by any check before this one:
//
//   H14  the coach asked "how old are you, and what are your current height
//        and weight?" above chips reading 2 meals / 3 meals / 4 meals; two
//        turns later the real meals question arrived with no chips.
//   M2   a question was re-asked after a detour and its chips stayed on the
//        older message, off screen.
//   M4   tapping a row under "Tap anything above to change it" put the reply
//        above the summary, off screen, and stacked a duplicate per tap.
//
// Trusted input through CDP (Input.*), not el.click(): this harness has a
// history of synthetic clicks behaving differently from taps.
// ---------------------------------------------------------------------------
import { writeFileSync } from 'fs'
import { ownBrowser, wait } from './own-browser.mjs'

// The browser, the checks and the single exit all come from own-browser.mjs —
// read its header before touching how this driver starts or stops.
const { origin, send, ev, evj, check, section, finish, isGone } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.onb-harness/scripted.html',
  ports: [9700, 9729],
})

const INPUT = '.ob-composer-fade input'
const SENDBTN = 'button:has(svg.lucide-send)'

async function open(state) {
  await send('Page.navigate', { url: `${origin}/?state=${state}` })
  await wait(1500)
}
async function tapAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 })
  }
  await wait(150)
}
/** Tap the centre of the element a page-side expression returns. Refuses an element that is off screen: a person cannot tap what they cannot see. */
async function tapEl(expr, what) {
  const b = await evj(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (!b) throw new Error(`nothing to tap: ${what}`)
  if (b.y < 0 || b.y > 844) throw new Error(`${what} is off screen at y=${Math.round(b.y)}`)
  await tapAt(b.x, b.y)
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(new URL(`./turns-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}
const queue = turn => ev(`window.__onbQueue.push(${JSON.stringify(turn)})`)
/** Type into the composer and send, then wait for the scripted reply to land. */
async function say(text) {
  await tapEl(`document.querySelector(${JSON.stringify(INPUT)})`, 'the composer')
  await send('Input.insertText', { text })
  await wait(120)
  await tapEl(`document.querySelector(${JSON.stringify(SENDBTN)})`, 'the send button')
  await wait(900)
}

// Page-side helpers. `cards(key)` is every RENDERED card for a slot, with the
// words of the coach message it sits under and where it is on the screen.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__cards = key => [...document.querySelectorAll('[data-slot-card' + (key ? '="' + key + '"' : '') + ']')].map(el => {
    const r = el.getBoundingClientRect()
    const composer = document.querySelector('.ob-composer-fade input').getBoundingClientRect()
    const scroller = document.querySelector('[class*="overflow-y-auto"]').getBoundingClientRect()
    return {
      key: el.getAttribute('data-slot-card'),
      under: (el.parentElement.firstElementChild.textContent || '').trim(),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      inView: r.top >= scroller.top - 1 && r.bottom <= composer.top + 1,
      underInView: (() => { const u = el.parentElement.firstElementChild.getBoundingClientRect(); return u.top >= scroller.top - 1 && u.bottom <= composer.top + 1 })(),
      labels: [...el.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()),
    }
  })
  window.__bubble = text => {
    const el = [...document.querySelectorAll('.ob-user-bubble')].reverse().find(b => (b.textContent || '').includes(text))
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }
  window.__body = () => document.body.innerText
  window.__ticks = () => [...document.querySelectorAll('[data-testid="onboarding-tick"]')].map(el => (el.textContent || '').trim())
  window.__draft = () => JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null')
` })

// ---------------------------------------------------------------------------
await section(1, 'H14 — chips belong to the question the message asks', async () => {
  await open('h14')
  check('harness: the recovery card is on screen to begin with', (await evj(`__cards('recoveryCapacity')`)).length === 1)
  // The model's two legs, stapled: leg 1 recorded the answer and asked for
  // MEALS chips; leg 2 wrote a sentence about age, height and weight.
  await queue({
    reply: 'Decent sleep goes a long way. How old are you, and what are your current height and weight?',
    actions: [
      { name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } },
      { name: 'present_slot', args: { slot_key: 'mealsPerDay' } },
    ],
  })
  await say('I sleep fine, about seven hours, and work is not too stressful')
  const all = await evj(`__cards()`)
  const underAge = all.filter(c => /how old are you/i.test(c.under))
  check('no meals chips anywhere under the age / height / weight question',
    !underAge.some(c => c.key === 'mealsPerDay'), underAge)
  check('...and nothing on the page offers "3 meals" as an answer to it',
    !underAge.some(c => c.labels.some(l => /meals/i.test(l))), underAge.map(c => c.labels))
  check('the card that IS under it is the age / height / weight one',
    underAge.length === 1 && underAge[0].key === 'age', underAge)
  check('...on screen, where the question is', underAge.length === 1 && underAge[0].inView, underAge)
  await shot('h14-age-question')

  // Two turns later the real meals question arrives. Its chips must be there.
  await queue({
    reply: 'Thanks, that sets the numbers up. Which should I use for the maths — male or female?',
    actions: [
      { name: 'set_slot', args: { slot_key: 'age', value: '31' } },
      { name: 'set_slot', args: { slot_key: 'heightCm', value: '178' } },
      { name: 'set_slot', args: { slot_key: 'weightKg', value: '82' } },
      { name: 'present_slot', args: { slot_key: 'gender' } },
    ],
  })
  await say('31, 178cm and 82kg')
  check('the sex question carries its own two options',
    (await evj(`__cards('gender')`)).some(c => /male or female/i.test(c.under) && c.inView), await evj(`__cards()`))
  await queue({
    reply: 'On to food. How many meals a day suits you?',
    actions: [{ name: 'present_slot', args: { slot_key: 'mealsPerDay' } }],
  })
  await say('Male')
  const meals = await evj(`__cards('mealsPerDay')`)
  check('the real meals question has its chips', meals.length === 1, meals)
  check('...under the message that asks it', meals.length === 1 && /how many meals a day/i.test(meals[0].under), meals)
  check('...and on screen', meals.length === 1 && meals[0].inView, meals)
})

await section(2, 'H14 — both legs asked for chips: the ones that fit the words win', async () => {
  await open('h14')
  await queue({
    reply: 'Good, that helps. Which should I use for your calorie maths — male or female?',
    actions: [
      { name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } },
      { name: 'present_slot', args: { slot_key: 'mealsPerDay' } },
      { name: 'present_slot', args: { slot_key: 'gender' } },
    ],
  })
  await say('sleeping well, no real stress')
  const all = await evj(`__cards()`)
  const under = all.filter(c => /male or female/i.test(c.under))
  check('the sex question gets the sex options, not the first card the model named',
    under.length === 1 && under[0].key === 'gender', all)
  check('no meals chips on the page at all', !all.some(c => c.key === 'mealsPerDay'), all)
})

await section(3, 'H14 — a question the app cannot place gets no chips rather than wrong ones', async () => {
  await open('h14')
  await queue({
    reply: "Glad it's steady. What's the longest you've ever stuck with a routine?",
    actions: [
      { name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } },
      { name: 'present_slot', args: { slot_key: 'mealsPerDay' } },
    ],
  })
  await say('sleeping well, no real stress')
  const all = await evj(`__cards()`)
  check('no card at all under a question that belongs to no slot', all.length === 0, all)
  check('...and the typing box still works for it', (await ev(`document.querySelector(${JSON.stringify(INPUT)}).readOnly`)) === false)
})

// ---------------------------------------------------------------------------
await section(4, 'M2 — a re-asked question brings its chips with it', async () => {
  await open('m2')
  const before = await evj(`__cards('sessionDuration')`)
  check('harness: the session-length card starts on the first asking', before.length === 1 && /realistically got/i.test(before[0].under), before)
  await queue({
    reply: "Good question, and I'll give it a proper answer once I know a bit more about you, because the answer depends on how you train. Back to those three days: how long can your sessions usually run?",
    actions: [{ name: 'present_slot', args: { slot_key: 'sessionDuration' } }],
  })
  await say('what does creatine actually do, should I take it?')
  const cards = await evj(`__cards('sessionDuration')`)
  const bubble = await evj(`__bubble('creatine')`)
  check('exactly one session-length card is on the page', cards.length === 1, cards)
  check('...under the message that re-asks it', cards.length === 1 && /how long can your sessions usually run/i.test(cards[0].under), cards)
  check('...below the detour, not above it', cards.length === 1 && !!bubble && cards[0].top > bubble.bottom, { cards, bubble })
  check('...and on screen', cards.length === 1 && cards[0].inView, cards)
  await shot('m2-reasked')
  // A refresh must not bring the old copy back: the move is saved, not just drawn.
  await open('keep')
  const reloaded = await evj(`__cards('sessionDuration')`)
  check('after a reload there is still exactly one, still under the re-ask',
    reloaded.length === 1 && /how long can your sessions usually run/i.test(reloaded[0].under), reloaded)
  // The moved card is a working control, not a picture of one.
  await queue({ reply: 'Thirty to forty-five it is. How do you like to train?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingStyle' } }] })
  await tapEl(`[...document.querySelectorAll('[data-slot-card="sessionDuration"] button')].find(b => /30-45/.test(b.textContent))`, 'the 30-45 option')
  await wait(900)
  const sent = await evj(`window.__onbRequests[window.__onbRequests.length - 1]`)
  check('tapping the moved card records the answer', sent?.state?.filled?.sessionDuration !== undefined, sent?.state?.filled)
  check('...and the card goes away once answered', (await evj(`__cards('sessionDuration')`)).length === 0)
})

await section(5, 'M2 — a detour that does NOT re-ask leaves the question where it was', async () => {
  await open('m2')
  await queue({ reply: "Good question. I'll come back to it properly once we're set up.", actions: [] })
  await say('what does creatine actually do, should I take it?')
  const cards = await evj(`__cards('sessionDuration')`)
  check('the original card is still there, once', cards.length === 1 && /realistically got/i.test(cards[0].under), cards)
})

await section(6, 'M2 — the coach re-asks but forgets to ask for the chips: they still come along', async () => {
  await open('m2')
  await queue({
    reply: "Short version: it helps you squeeze out a bit more on hard sets. Now, how long can your sessions usually run?",
    actions: [],
  })
  await say('what does creatine actually do, should I take it?')
  const cards = await evj(`__cards('sessionDuration')`)
  check('still exactly one session-length card', cards.length === 1, cards)
  check('...and it has moved down to the re-asked question', cards.length === 1 && /how long can your sessions usually run/i.test(cards[0].under) && cards[0].inView, cards)
})

// ---------------------------------------------------------------------------
// M4. Page-side: what the summary and any edit prompt look like right now.
const REVIEW = `(() => {
  const card = document.querySelector('[data-testid="onboarding-review"]')
  const composer = document.querySelector('.ob-composer-fade input').getBoundingClientRect()
  const scroller = document.querySelector('[class*="overflow-y-auto"]').getBoundingClientRect()
  const inView = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= scroller.top - 1 && r.bottom <= composer.top + 1 }
  const rows = card ? Object.fromEntries([...card.querySelectorAll('[data-review-row]')].map(b => [b.getAttribute('data-review-row'), b.textContent.trim()])) : {}
  const prompts = [...document.querySelectorAll('.ob-message-in')].filter(d => /let.s change that/i.test(d.textContent || ''))
  const generate = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Generate My Plan')
  return {
    open: !!card, rows,
    prompts: prompts.map(p => ({ text: p.textContent.trim(), inView: inView(p) })),
    generate: generate ? { disabled: generate.disabled } : null,
    requests: window.__onbRequests.length,
    placeholder: document.querySelector('.ob-composer-fade input').placeholder,
    rowInView: key => inView(card && card.querySelector('[data-review-row="' + key + '"]')),
  }
})()`
const review = () => evj(REVIEW)
const rowInView = key => ev(`(${REVIEW}).rowInView(${JSON.stringify(key)})`)
/** Scroll a summary row to where a thumb could reach it, then tap it — the row is often above the fold of a card taller than the screen. */
async function tapRow(key) {
  await ev(`document.querySelector('[data-review-row="${key}"]')?.scrollIntoView({ block: 'center' })`)
  await wait(250)
  await tapEl(`document.querySelector('[data-review-row="${key}"]')`, `the ${key} row`)
  await wait(350)
}
/** The same tap with the row sitting just above the typing box — the person has scrolled up through the summary and its top rows are low on the screen, so anything that opens "where the summary started" would open below the fold. */
async function tapRowLow(key) {
  await ev(`(() => {
    const row = document.querySelector('[data-review-row="${key}"]')
    const scroller = document.querySelector('[class*="overflow-y-auto"]')
    const composerTop = document.querySelector('.ob-composer-fade').getBoundingClientRect().top
    scroller.scrollTop += row.getBoundingClientRect().bottom - (composerTop - 8)
  })()`)
  await wait(300)
  await tapEl(`document.querySelector('[data-review-row="${key}"]')`, `the ${key} row`)
  await wait(450)
}
const tapButton = async text => {
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.scrollIntoView({ block: 'center' })`)
  await wait(200)
  await tapEl(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`, `the "${text}" button`)
  await wait(400)
}
const tapOption = async (slot, label) => {
  await tapEl(`[...document.querySelectorAll('[data-slot-card="${slot}"] button')].find(b => b.textContent.includes(${JSON.stringify(label)}))`, `the "${label}" option`)
  await wait(500)
}

await section(7, 'M4 — tapping a summary row puts its prompt where the tap was', async () => {
  // "Meals a day" on purpose: it sits low in a summary taller than the
  // screen, which is where the tester was looking when the tap looked dead —
  // the old prompt was appended ABOVE the summary, a screen away.
  await open('review')
  const start = await review()
  check('harness: the summary is open with the answers in it', start.open && /3 meals/.test(start.rows.mealsPerDay ?? ''), start.rows)
  await tapRow('mealsPerDay')
  // A second and third tap, if the row is still there to be tapped (it was,
  // before: each one stacked another copy of the prompt).
  for (let i = 0; i < 2; i++) {
    if (await ev(`!!document.querySelector('[data-review-row="mealsPerDay"]')`)) await tapRow('mealsPerDay')
  }
  let now = await review()
  let cards = await evj(`__cards('mealsPerDay')`)
  check('exactly one set of options appears, however many times the row is tapped', cards.length === 1, cards.length)
  check('...on screen', cards.length >= 1 && cards[cards.length - 1].inView, cards)
  check('...with the sentence that introduces it on screen too', cards.length >= 1 && cards[cards.length - 1].underInView, cards)
  check('...and that sentence reads as English ("pick a different meals a day" did not)',
    cards.length >= 1 && !/a different |to be instead/i.test(cards[0].under) && /How many meals a day suits you\?/.test(cards[0].under), cards.map(c => c.under))
  check('the summary is put away while one answer is being changed', !now.open)
  await shot('m4-editing')

  // Changing your mind is a way out, not a dead end.
  await tapButton('Review and build my plan')
  now = await review()
  check('"Review and build my plan" goes back with nothing changed',
    now.open && /3 meals/.test(now.rows.mealsPerDay ?? '') && (await evj(`__cards('mealsPerDay')`)).length === 0, now.rows)
  await tapRow('mealsPerDay')
  cards = await evj(`__cards('mealsPerDay')`)
  check('opening it again still shows one, not one per visit', cards.length === 1, cards.length)

  await tapOption('mealsPerDay', '4 meals')
  now = await review()
  check('answering brings the summary back', now.open, now)
  check('...with the new value in its row', /4 meals/.test(now.rows.mealsPerDay ?? ''), now.rows.mealsPerDay)
  check('...and that row on screen, not a screen above the button', await rowInView('mealsPerDay'))
  check('...Generate is there and live', now.generate && now.generate.disabled === false, now.generate)
  check('...and no trip to the coach was needed for it', now.requests === start.requests, { before: start.requests, after: now.requests })
  await shot('m4-after-edit')
})

await section(8, 'M4 — an edit that opens a new question asks it at the bottom, and the summary waits', async () => {
  await open('review')
  await tapRowLow('equipment')
  const opened = await evj(`__cards('equipment')`)
  check('a row tapped from low on the screen still opens its options fully in view',
    opened.length === 1 && opened[0].inView && opened[0].underInView, opened)
  await queue({
    reply: 'A barbell at home changes things. Do you know your working weights for squat, bench and deadlift?',
    actions: [{ name: 'present_slot', args: { slot_key: 'knowsWorkingLifts' } }],
  })
  await tapOption('equipment', 'Home gym')
  await wait(700)
  let now = await review()
  const lifts = await evj(`__cards('knowsWorkingLifts')`)
  check('the summary stays away while something is still needed', !now.open, now)
  check('the new question and its options are on screen', lifts.length === 1 && lifts[0].inView, lifts)
  await queue({ reply: 'A calibration week it is, then.', actions: [] })
  await tapOption('knowsWorkingLifts', 'Not sure')
  await wait(700)
  now = await review()
  check('once it is answered the summary returns by itself', now.open && /Home gym/.test(now.rows.equipment ?? ''), now.rows)
  check('...with Generate live', now.generate && now.generate.disabled === false, now.generate)
})

await section(9, 'M4 — an answer you type rather than tap', async () => {
  await open('review')
  await tapRow('displayName')
  let now = await review()
  check('the prompt says to type it', now.prompts.length === 1 && now.prompts[0].inView && /What should I call you\? Type it in below\./.test(now.prompts[0].text), now.prompts)
  check('...and the typing box says what it is for', now.placeholder === 'Your name…', now.placeholder)
  await queue({ reply: 'Samuel it is.', actions: [{ name: 'set_slot', args: { slot_key: 'displayName', value: 'Samuel' } }] })
  await say('Samuel')
  now = await review()
  check('the summary returns with the new name', now.open && /Samuel/.test(now.rows.displayName ?? ''), now.rows.displayName)
  // If the coach does NOT record the change, the person must still get out.
  await tapRow('dislikedFoods')
  await queue({ reply: 'Got it.', actions: [] })
  await say('actually leave that as it is')
  now = await review()
  check('a typed reply the coach did not act on still returns to the summary', now.open && /mushrooms/.test(now.rows.dislikedFoods ?? '') && now.generate && now.generate.disabled === false, now)
})

await section(10, 'M4 — a reload part-way through an edit', async () => {
  await open('review')
  await tapRow('equipment')
  await open('keep')
  const now = await review()
  check('comes back to the summary, answers intact, with no orphaned prompt',
    now.open && /Minimalist/.test(now.rows.equipment ?? '') && now.prompts.length === 0 && (await evj(`__cards('equipment')`)).length === 0, now)
  // The abandoned prompt must not survive in ANY form. Left in the saved
  // conversation it comes back as a second copy of the app's closing line.
  const closers = await ev(`(document.body.innerText.match(/That's everything I need/g) || []).length`)
  check('...and the closing line is not said twice', closers === 1, closers)
})

// ---------------------------------------------------------------------------
const lastRequest = () => evj(`window.__onbRequests[window.__onbRequests.length - 1]`)

await section(11, 'L2 — ticks and summary rows carry their units', async () => {
  await open('h14')
  await queue({
    reply: 'Good to know. Which should I use for the maths — male or female?',
    actions: [
      { name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } },
      { name: 'set_slot', args: { slot_key: 'heightCm', value: '178' } },
      { name: 'set_slot', args: { slot_key: 'weightKg', value: '82' } },
      { name: 'set_slot', args: { slot_key: 'maxDumbbellKg', value: '24' } },
      { name: 'present_slot', args: { slot_key: 'gender' } },
    ],
  })
  await say("sleep is fine. I'm 178cm and 82kg, and my dumbbells go up to 24kg")
  const ticks = await evj(`__ticks()`)
  check('Heaviest dumbbells — 24 kg', ticks.includes('Heaviest dumbbells — 24 kg'), ticks)
  check('Height — 178 cm', ticks.includes('Height — 178 cm'), ticks)
  check('Weight — 82 kg', ticks.includes('Weight — 82 kg'), ticks)
  const told = await lastRequest()
  await open('review')
  const rows = (await review()).rows
  check('the summary says the same, with the same units',
    rows.heightCm === 'Height: 178 cm' && rows.weightKg === 'Weight: 82 kg' && rows.maxDumbbellKg === 'Heaviest dumbbells: 24 kg',
    { h: rows.heightCm, w: rows.weightKg, d: rows.maxDumbbellKg })
  check('harness: the turn reached the coach', !!told)
})

await section(12, 'L5 — "3 meals and one snack" records the snack and says so', async () => {
  await open('h14')
  // The coach hears the meals and forgets the snack — the miss in the log.
  await queue({
    reply: 'Three meals works well. Any allergies or dietary restrictions I should build around?',
    actions: [{ name: 'set_slot', args: { slot_key: 'mealsPerDay', value: '3' } }, { name: 'present_slot', args: { slot_key: 'dietaryPreferences' } }],
  })
  await say('3 meals and one snack')
  let ticks = await evj(`__ticks()`)
  check('the tick reads "Meals a day — 3 meals + a snack"', ticks.includes('Meals a day — 3 meals + a snack'), ticks)
  check('...once, not once from the app and again from the coach', ticks.filter(t => /^Meals a day/.test(t)).length === 1, ticks)
  let told = await lastRequest()
  check('the coach is told snacks are answered', told?.state?.filled?.includeSnacks === 'Snacks too', told?.state?.filled)
  check('...and the draft holds it as an answer, not a default', (await evj(`__draft()`))?.confirmedSlots?.includes('includeSnacks'))

  // The direction that bites: said plainly, missed by the coach, and the
  // default would have built a plan WITH a snack.
  await open('h14')
  await queue({ reply: 'Three meals it is. Any allergies or dietary restrictions I should build around?', actions: [{ name: 'set_slot', args: { slot_key: 'mealsPerDay', value: '3' } }] })
  await say('3 meals, no snacks')
  ticks = await evj(`__ticks()`)
  check('"3 meals, no snacks" is ticked as that', ticks.includes('Meals a day — 3 meals, no snacks'), ticks)
  const draft = await evj(`__draft()`)
  check('...and stored as no snacks', draft?.values?.includeSnacks === false && draft?.values?.mealsPerDay === 3, draft?.values)

  await open('h14')
  await queue({ reply: 'Noted. How many meals a day suits you?', actions: [{ name: 'present_slot', args: { slot_key: 'mealsPerDay' } }] })
  await say('no snacks for me')
  ticks = await evj(`__ticks()`)
  check('a snack answer on its own gets its own tick', ticks.includes('Snacks — No snacks'), ticks)

  await open('review')
  const rows = (await review()).rows
  check('the summary lists snacks even when nobody mentioned them, because the plan includes one by default',
    rows.includeSnacks === 'Snacks: Snacks too', rows.includeSnacks)
})

await section(13, 'L6 — one sentence saves one goal', async () => {
  await open('h14')
  const said = "sleep's fine. I want to get to 12% body fat and I'm struggling to lose weight"
  await queue({
    reply: 'Struggling to shift it is the most common place to be stuck. How old are you?',
    actions: [
      { name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } },
      { name: 'record_goal', args: { metric: 'directional', display_text: 'get to 12% body fat', raw_phrase: said } },
      { name: 'record_goal', args: { metric: 'directional', display_text: 'reach 12% body fat (fat loss)', raw_phrase: 'get to 12% body fat' } },
    ],
  })
  await say(said)
  const goals = (await evj(`__draft()`))?.pendingGoals ?? []
  check('two near-identical goals from one sentence are kept as one', goals.length === 1, goals.map(g => g.displayText))
})

await section(14, 'M5 — "40 minutes tops" is ticked as the setting it was stored as, with what that allows', async () => {
  await open('m2')
  await queue({
    reply: 'Forty minutes is plenty to work with. How do you like to train?',
    actions: [{ name: 'set_slot', args: { slot_key: 'sessionDuration', value: '30-45' } }, { name: 'present_slot', args: { slot_key: 'trainingStyle' } }],
  })
  await say('40 minutes tops, hard stop')
  const ticks = await evj(`__ticks()`)
  check('the tick names the 30-45 setting, the 40 they said, and the 45 it can run to',
    ticks.includes('Session length — 30-45 min (the closest setting to 40 minutes — sessions can run to 45)'), ticks)
  // A tapped chip is the setting itself: nothing to add.
  await open('m2')
  await queue({ reply: 'Good. How do you like to train?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingStyle' } }] })
  await tapOption('sessionDuration', '30-45 min')
  await wait(600)
  check('choosing the setting itself adds no note', !(await evj(`__ticks()`)).some(t => /closest setting/.test(t)), await evj(`__ticks()`))
})

await section(15, 'M3 — the combat style is not offered, and cannot be recorded by the coach either', async () => {
  await open('m2')
  await queue({ reply: 'Good. How do you like to train?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingStyle' } }] })
  await tapOption('sessionDuration', '30-45 min')
  await wait(600)
  let cards = await evj(`__cards('trainingStyle')`)
  check('the style question shows its options', cards.length === 1 && cards[0].labels.length === 3, cards)
  check('...and none of them is combat', cards.length === 1 && !cards[0].labels.some(l => /combat|fight/i.test(l)), cards[0]?.labels)
  // Someone says they box and the coach maps it onto the style it remembers.
  await queue({
    reply: 'Boxing, nice. How do you feel about cardio?',
    actions: [{ name: 'set_slot', args: { slot_key: 'trainingStyle', value: 'combat' } }, { name: 'present_slot', args: { slot_key: 'conditioningPreference' } }],
  })
  await say('I box twice a week so something that suits that')
  const draft = await evj(`__draft()`)
  check('"combat" is refused as a new answer, whatever the coach sends', draft?.values?.trainingStyle == null && !draft?.confirmedSlots?.includes('trainingStyle'), draft?.values?.trainingStyle)
  check('...with no tick claiming it was recorded', !(await evj(`__ticks()`)).some(t => /^Style/.test(t)), await evj(`__ticks()`))
  cards = await evj(`__cards('trainingStyle')`)
  check('...and the three real options put back in front of them', cards.some(c => c.labels.length === 3 && c.inView && !c.labels.some(l => /combat/i.test(l))), cards)
})

if (!isGone()) {
  try { check('harness: every request in this run was scripted', (await ev(`window.__onbUnscripted`)) === 0) } catch {}
}

finish('Every turn put its chips under the question it asked.')
