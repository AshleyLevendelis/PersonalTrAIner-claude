// ---------------------------------------------------------------------------
// WHY I'M ASKING, AND THE LINE BETWEEN THE HALVES (his "build it", 22 Nov 2026; docs/plans/setup-and-tour-refresh.md).
// The real onboarding screen, the coach scripted (scripted.tsx). It proves, on screen:
//   1. a question with a "why" shows it, once, under the question, in the slot's own words;
//   2. a question without one shows none;
//   3. the first food question carries "That's the training side sorted", and a later food question does not.
// ---------------------------------------------------------------------------
import { ownBrowser, wait } from './own-browser.mjs'

const { origin, send, evj, check, section, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.onb-harness/scripted.html',
  ports: [9946, 9947],
})
const read = () => evj(`({
  why: [...document.querySelectorAll('[data-setup-why]')].map(e => e.textContent.trim()),
  half: [...document.querySelectorAll('[data-setup-half-line]')].map(e => e.textContent.trim()),
  question: document.querySelector('[data-onboarding-question]')?.textContent?.trim() ?? null,
})`)
let load = 0
const open = async state => { await send('Page.navigate', { url: `${origin}/?state=${state}&n=${++load}` }); await wait(1800) }

await section(1, 'A question with a reason says it, once, under the question', async () => {
  await open('m2')
  const r = await read()
  check('1a. the session-length question shows its reason', r.why.length === 1 && r.why[0] === "I'll fit every session into it.", r)
  check('1b. ...and no half-way line on a training question', r.half.length === 0, r)
})

await section(2, 'The diet question gives its reason; the half-way line has already been said', async () => {
  await open('diet-card')
  const r = await read()
  check('2a. the diet question says why', r.why.length === 1 && r.why[0] === "I'll filter your meals for these.", r)
  check('2b. ...and, with the meals already answered, no half-way line', r.half.length === 0, r)
})

await section(3, 'The first food question opens the food half', async () => {
  await open('meals-card')
  const r = await read()
  check('3a. "That\'s the training side sorted" is on the first food question', r.half.length === 1 && /training side sorted/.test(r.half[0]) && /food side/.test(r.half[0]), r)
  check('3b. ...and that question has no reason line of its own', r.why.length === 0, r)
})

await finish('verify:setup-why PASSED')
