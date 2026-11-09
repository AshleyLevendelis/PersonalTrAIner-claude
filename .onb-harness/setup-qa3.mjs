// ---------------------------------------------------------------------------
// SETUP, QA ROUND 3 (8 Nov 2026): what a tester found, held on the real setup screen at 390px.
//
//   1. Reopening setup partway through keeps the open question as the headline; "Welcome back" sits above it.
//      It was the headline, and the question still waiting dropped to small grey text.
//   3. The summary's rows are 44px tall (they were 32px).
//   2. "none" typed to "anything you'd rather I left out?" answers that question only: it was filed under favourite
//      cuisines (the one open question it matched), with a tick, and cuisines was never asked.
//
// Every check runs every time.
// ---------------------------------------------------------------------------
import { writeFileSync } from 'fs'
import { ownBrowser, wait } from './own-browser.mjs'

const { origin, send, ev, evj, check, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.onb-harness/scripted.html',
  ports: [9741, 9742],
})

const INPUT = '.ob-composer-fade input'
const SENDBTN = 'button:has(svg.lucide-send)'
async function open(state) { await send('Page.navigate', { url: `${origin}/?state=${state}&n=${Math.random().toString(36).slice(2)}` }); await wait(1500) }
async function tapAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 })
  await wait(150)
}
async function tapEl(expr) {
  const b = await evj(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (b) await tapAt(b.x, b.y)
  return !!b
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(new URL(`./setup-qa3-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}
const headline = () => ev(`[...document.querySelectorAll('[data-onboarding-question]')].map(n => n.textContent.trim()).pop() ?? ''`)
const draft = () => evj(`JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null')`)

console.log('\nSETUP, QA ROUND 3, AT 390px\n')

// --- 1. Resuming ---------------------------------------------------------------------------------------------------
await open('h14')
const before = await headline()
check('1a. the fixture binds: the recovery question is the headline before closing', /sleep and stress/i.test(before), before)
await open('keep')
const after = await headline()
const body = await ev(`document.body.innerText`)
check('1b. reopened, the question still waiting is the headline, not "Welcome back"', /sleep and stress/i.test(after) && !/Welcome back/i.test(after), after)
check('1c. ...and the welcome-back line is still said (above it)', /Welcome back/i.test(body ?? ''), (body ?? '').slice(0, 200))
await shot('resumed')

// --- 2. "none" to a typed question ---------------------------------------------------------------------------------
await open('none-left')
const q = await headline()
check('2a. the fixture binds: the foods question is on screen and cuisines is not yet answered',
  /left out/i.test(q) && !((await draft())?.confirmedSlots ?? []).includes('favoriteCuisines'), { q, confirmed: (await draft())?.confirmedSlots })
const head = await ev(`document.querySelector('[data-onboarding-step]')?.textContent.trim() ?? ''`)
check('2-. the header names the foods question\'s own section, not the first unanswered one ("Food · …")', /^Food · \d+ of \d+$/.test(head), head)
await ev(`window.__onbQueue.push({ reply: 'Got it.' })`)
await tapEl(`document.querySelector(${JSON.stringify(INPUT)})`)
await send('Input.insertText', { text: 'none' })
await wait(150)
await tapEl(`document.querySelector(${JSON.stringify(SENDBTN)})`)
await wait(1500)
const d = await draft()
check('2b. "none" is not filed under favourite cuisines', !(d?.confirmedSlots ?? []).includes('favoriteCuisines'), { confirmed: d?.confirmedSlots, cuisines: d?.values?.favoriteCuisines })
check('2c. ...and no "Cuisines" tick appears', !/Cuisines/i.test(await ev(`[...document.querySelectorAll('*')].filter(n => n.children.length === 0).map(n => n.textContent).join('\\n')`) ?? ''))
check('2d. ...the message itself was sent (the fixture binds)', (await ev(`window.__onbRequests.length`)) >= 1, await ev(`window.__onbRequests.length`))
await shot('none')

// --- 3. The summary's rows are a thumb tall ---------------------------------------------------------------------------
// They were 32px and sit one under the next, so each row must itself be 44px: a hit area larger than the row would land
// on its neighbour. Read off the summary as drawn.
await open('review')
const rows = await evj(`[...document.querySelectorAll('[data-review-row]')].map(b => ({ key: b.getAttribute('data-review-row'), h: Math.round(b.getBoundingClientRect().height) }))`) ?? []
check('3a. the fixture binds: the summary is open with its rows', rows.length >= 8, rows.length)
check('3b. every summary row is at least 44px tall', rows.length >= 8 && rows.every(r => r.h >= 44), rows.filter(r => r.h < 44))
await shot('summary')

// --- 4. Every typing hint fits the box, beside the mic ------------------------------------------------------------------
// A placeholder cannot wrap, so a hint wider than the box is cut off by the mic button. Measured in the box's own font
// against the room between its own padding, with the mic drawn (the narrowest the box gets). The mic is drawn only where
// the phone can listen, so the page is given a listener first.
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.webkitSpeechRecognition = window.webkitSpeechRecognition || function () {}' })
await open('h14')
const fit = await evj(`(() => {
  const input = document.querySelector(${JSON.stringify(INPUT)}); if (!input) return null
  const mic = !!document.querySelector('button:has(svg.lucide-mic)')
  const cs = getComputedStyle(input), room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  // THE BOX'S OWN FONT, built from its parts: an input's computed shorthand is "" in Chromium, and a canvas left on its
  // default 10px measured every hint at about half its width, so this check passed while hints were cut (9 Nov 2026).
  const ph = getComputedStyle(input, '::placeholder')
  const font = [ph.fontStyle, ph.fontWeight, ph.fontSize, ph.fontFamily].join(' ')
  const ctx = document.createElement('canvas').getContext('2d'); ctx.font = font
  const hints = window.__inputHints || []
  return { mic, room: Math.round(room), n: hints.length, over: hints.map(h => ({ h, w: Math.round(ctx.measureText(h).width) })).filter(x => x.w > room), widest: hints.map(h => ({ h, w: Math.round(ctx.measureText(h).width) })).sort((a, b) => b.w - a.w).slice(0, 3), font, iw: input.clientWidth, fontOk: ctx.font.includes(ph.fontSize) }
})()`)
check('4a. the fixture binds: the box is drawn beside the mic, there are hints to measure, and they are measured in its own font', !!fit && fit.mic && fit.n >= 10 && fit.fontOk, fit && { mic: fit.mic, n: fit.n, room: fit.room })
check('4b. every typing hint fits the box, so none is cut off by the mic', !!fit && fit.over.length === 0, fit && { room: fit.room, over: fit.over })
// ONE ROUND BUTTON (his 6 Nov chat ruling, applied to setup): the mic alone while the box is empty, send alone once
// there is text. Two side by side were what left the box too narrow.
const buttons = () => evj(`({ mic: document.querySelectorAll('button:has(svg.lucide-mic)').length, send: document.querySelectorAll('button:has(svg.lucide-send)').length })`)
const empty = await buttons()
await tapEl(`document.querySelector(${JSON.stringify(INPUT)})`)
await send('Input.insertText', { text: 'eight hours' })
await wait(200)
const typed = await buttons()
check('4c. one round button beside the box: the mic while it is empty, send once there is text', empty?.mic === 1 && empty?.send === 0 && typed?.mic === 0 && typed?.send === 1, { empty, typed })

// --- 5. The header keeps the section the talk is in (QA round 3, setup finding 6) ----------------------------------
// A question in the coach's own words names no slot; the header fell back to the first unanswered one ("Body" over a
// food question). The fixture has body questions open and the talk on food.
await open('freehand-food')
const free = await ev(`document.querySelector('[data-onboarding-step]')?.textContent.trim() ?? ''`)
const bodyOpen = await evj(`(() => { const d = JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null'); return !!d && !d.confirmedSlots.includes('age') })()`)
check('5a. the fixture binds: a body question is still unanswered', bodyOpen === true, bodyOpen)
check('5b. the header reads "Food" over a food question asked in the coach\'s own words', /^Food · \d+ of \d+$/.test(free), free)

finish('Setup keeps its question on resume, "none" answers only what it was said to, and the summary rows are a thumb tall.')
