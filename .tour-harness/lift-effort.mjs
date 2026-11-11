// ---------------------------------------------------------------------------
// HOW A LIFT FELT, AND TODAY'S WEIGHT AGAINST THE PLAN'S WEEK — on a real screen.
//
// Ashley, 11 Nov 2026: "If it prescribed a weight and I complete it and find it
// too easy and have lots left on reserve, will it ramp up accordingly or will
// it take many weeks". His ruling, from three options: "One tap per lift".
//
// test:lift-effort holds the rule. This holds what a gate cannot: that the
// question is on the card when the sets are done and not before, that an
// answer is shown as chosen and can be taken back, that a lift which was too
// easy really does open as a find-your-weight session, and that today's card
// reads the plan's week (a deload is lighter; a session done as written
// follows the plan).
//
// THE HARNESS CHOOSES THE INPUT ONLY (real.tsx, ?effort=): one earlier session
// of a lift that is on today's card, and the plan's age. Every number checked
// here is read off the card the app drew.
//
// Every check runs every time: a missing card gives each check a null-safe
// subject and it FAILS, so the count is the same on every run.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9419, page: 'real.html', name: 'lift-effort', timeoutMs: 420_000 })
const { ev, check, wait, go, clickAt, shoot, finish, until } = d

const cardExpr = name => `(() => {
  const leaf = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === ${JSON.stringify(name)})
  if (!leaf) return null
  let card = leaf
  for (let i = 0; i < 12 && card.parentElement; i++) { card = card.parentElement; if (card.querySelector('input') && /kg/i.test(card.innerText)) break }
  return card
})()`
const openRow = async name => {
  await ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()===${JSON.stringify(name)});
    if(!n) return false; let p=n; for(let i=0;i<6&&p.parentElement;i++){p=p.parentElement; if(p.tagName==='BUTTON'||p.getAttribute('role')==='button'){p.click();return true}} return false})()`)
  await wait(1500)
}
const read = name => ev(`(() => {
  const card = ${cardExpr(name)}
  if (!card) return { found: false, headline: [], prefills: [], text: '', cue: false, effort: null, cascade: false }
  const num = s => parseFloat(String(s).replace(/[^\\d.]/g, ''))
  const headline = [...card.querySelectorAll('[data-testid="exercise-load"]')].map(n => num(n.textContent)).filter(n => Number.isFinite(n) && n > 0)
  const boxes = [...card.querySelectorAll('input')].filter(i => /^setgrid-weight-/.test(i.id))
  const prefills = boxes.map(i => i.value || i.placeholder).map(num)
  const eff = card.querySelector('[data-testid="lift-effort"]')
  const r = eff?.getBoundingClientRect()
  return {
    found: true, headline, prefills, boxes: boxes.length,
    text: card.innerText.replace(/\\s+/g, ' '),
    cue: !!card.querySelector('[data-testid="calibration-cue"]'),
    cascade: !!card.querySelector('[data-testid="calibration-cascade"]'),
    effort: eff ? {
      question: eff.querySelector('p')?.textContent ?? '',
      buttons: [...eff.querySelectorAll('button')].map(b => ({ label: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') === 'true', h: Math.round(b.getBoundingClientRect().height) })),
      line: eff.querySelector('[data-testid="lift-effort-line"]')?.textContent ?? null,
      inView: r.top >= 0 && r.bottom <= innerHeight,
    } : null,
  }
})()`)
const NOTHING = { found: false, headline: [], prefills: [], text: '', cue: false, effort: null, cascade: false, boxes: 0 }
// A saved set draws its rest timer under it, which moves the next tick: wait for THIS set to read as saved before
// the next tap, or the tap lands where the tick was.
const saveSet = async (name, n) => {
  await clickAt(`(${cardExpr(name)})?.querySelector('[aria-label="Save set ${n}"]')`)
  await until(() => ev(`!!(${cardExpr(name)})?.querySelector('[aria-label="Set ${n} saved"]')`), v => v === true, 16)
  // ...and for the timer's row to finish opening (measured: 300 ms was not enough, 900 is).
  await wait(1000)
}
const savedCount = name => ev(`(${cardExpr(name)})?.querySelectorAll('[aria-label$=" saved"]').length ?? -1`)
const tapEffort = async (name, effort) => {
  await clickAt(`(${cardExpr(name)})?.querySelector('[data-testid="lift-effort"] [data-effort="${effort}"]')`)
  await wait(600)
}
// EVERY SCENARIO STARTS WITH AN EMPTY PHONE. The harness's server is rebuilt from its seed on every load while the
// phone's own storage survives it, so a second load believes in a session the server no longer has, and each new
// set then replaces the last on screen (measured: sets 1, 2, 3 saved one after another left only set 3). No real
// server forgets a session on a reload; here the two halves must be reset together or the driver tests the gap.
const load = async kind => {
  await go(`&tour=off&effort=${kind}`, '#/tab/exercise')
  await wait(1200)
  await ev('localStorage.clear(); sessionStorage.clear()')
  await go(`&tour=off&effort=${kind}`, '#/tab/exercise')
  await wait(4500)
  const t = (await ev(`window.__effortTarget`)) ?? null
  if (t) await openRow(t.name)
  const card = t ? ((await read(t.name)) ?? NOTHING) : NOTHING
  return { t: t ?? { name: '', sets: 0, printedNowKg: 0, printedThenKg: 0, lastKg: 0, isDeload: false, liveWeek: 0 }, card }
}

console.log('\n[1] A session done as written follows the plan')
{
  const { t, card } = await load('kept')
  check('harness: a loaded lift on today\'s card, with last week\'s session at the plan\'s number for that week', !!t.name && t.lastKg === t.printedThenKg && t.lastKg > 0, t)
  check('harness: the plan\'s number for that lift moved between the two weeks (or "follows the plan" could not be told from "held")', t.printedNowKg > t.printedThenKg, t)
  check('1a. the card is open on that lift', card.found && card.prefills.length > 0, card.text.slice(0, 160))
  check('1b. today\'s weight is the plan\'s number for THIS week, not last week\'s held', card.headline.includes(t.printedNowKg) && !card.headline.includes(t.printedThenKg), { headline: card.headline, t })
  check('1c. ...and the boxes offer the same number', card.prefills.length > 0 && card.prefills.every(p => p === t.printedNowKg), card.prefills)
  check('1d. ...and the card says why', /done as planned/i.test(card.text), card.text.slice(0, 300))
  check('1e. it is not a find-your-weight session', card.cue === false)
  await shoot('lift-effort-kept')
}

console.log('\n[2] Too easy last time: today starts heavier and finds the weight')
{
  const { t, card } = await load('easy')
  const top = Math.max(0, ...card.headline)
  check('harness: last week\'s session carried "too easy"', !!t.name && t.kind === 'easy', t)
  check('2a. today starts heavier than last time, by more than a nudge (5% or more)', top >= t.lastKg * 1.05, { headline: card.headline, last: t.lastKg })
  check('2b. the card says so', /too easy last time/i.test(card.text) && /heaviest good set becomes your weight/i.test(card.text), card.text.slice(0, 320))
  check('2c. the find-your-weight cue is on this lift', card.cue === true)
  check('2d. set 1 offers today\'s start', card.prefills[0] === top, { prefills: card.prefills, top })
  check('2e. ...and the later sets offer nothing until a set is done (they are found, not prescribed)', card.boxes >= 2 && card.prefills.slice(1).every(p => !Number.isFinite(p)), card.prefills)
  await saveSet(t.name, 1)
  const after = t.name ? ((await read(t.name)) ?? NOTHING) : NOTHING
  check('2f. once set 1 is in, the next weight is offered off what was lifted', after.cascade === true, after.text.slice(0, 200))
  await shoot('lift-effort-easy')
}

console.log('\n[3] A deload week is lighter, and nobody is asked how it felt')
{
  const { t, card } = await load('deload')
  const top = Math.max(0, ...card.headline)
  check('harness: today is a deload week, and last week\'s session was 5 kg over the plan', t.isDeload === true && t.lastKg === t.printedThenKg + 5, t)
  check('3a. today is clearly lighter than last time (three quarters of it or less)', top > 0 && top <= t.lastKg * 0.75, { headline: card.headline, last: t.lastKg })
  check('3b. ...never last time\'s weight, and never a step over it', !card.headline.some(h => h >= t.lastKg), card.headline)
  check('3c. the card says it is a deload', /deload week/i.test(card.text), card.text.slice(0, 300))
  check('3d. it is not a find-your-weight session', card.cue === false)
  for (let n = 1; n <= t.sets; n++) await saveSet(t.name, n)
  const done = t.name ? ((await read(t.name)) ?? NOTHING) : NOTHING
  const savedInDeload = t.name ? await savedCount(t.name) : -1
  check('harness: every set of the lift was saved (or "not asked" would only mean "not finished")', t.sets > 0 && savedInDeload === t.sets, { saved: savedInDeload, sets: t.sets })
  check('3e. with every set done, the question is NOT asked in a deload week', done.effort === null, done.effort)
  await shoot('lift-effort-deload')
}

console.log('\n[3b] The first session back after a deload starts from this block\'s weight')
{
  const { t, card } = await load('back')
  const top = Math.max(0, ...card.headline)
  check('harness: last week was the deload, done at the deload\'s own number, and this week\'s plan is heavier', t.lastWasDeload === true && t.isDeload === false && t.lastKg === t.printedThenKg && t.printedNowKg > t.lastKg, t)
  check('3f. today is this block\'s weight, NOT held at the deload\'s', top === t.printedNowKg && !card.headline.includes(t.lastKg), { headline: card.headline, t })
  check('3g. ...and the card says it is back from the deload', /back from your deload/i.test(card.text), card.text.slice(0, 300))
  check('3h. the boxes offer the same number', card.prefills.length > 0 && card.prefills.every(p => p === top), card.prefills)
  await shoot('lift-effort-back')
}

console.log('\n[4] One tap per lift, once its sets are done')
{
  const { t, card } = await load('ask')
  check('harness: a loaded lift with nothing logged yet', !!t.name && t.sets >= 2 && card.found, t)
  check('4a. nothing is asked before a set is logged', card.effort === null, card.effort)
  await saveSet(t.name, 1)
  const one = t.name ? ((await read(t.name)) ?? NOTHING) : NOTHING
  check('4b. ...nor after the first set', one.effort === null, one.effort)
  for (let n = 2; n <= t.sets; n++) await saveSet(t.name, n)
  const done = await until(() => (t.name ? read(t.name) : NOTHING), c => !!c?.effort, 20) ?? NOTHING
  const eff = done.effort ?? { question: '', buttons: [], line: null, inView: false }
  check('4c. with every set done the card asks "How did that feel?"', eff.question === 'How did that feel?', eff)
  check('4d. three answers, in his words', eff.buttons.map(b => b.label).join('|') === 'Too easy|About right|Too hard', eff.buttons)
  check('4e. each a full-height tap target, none chosen yet', eff.buttons.length === 3 && eff.buttons.every(b => b.h >= 44 && !b.pressed), eff.buttons)
  check('4f. no line until an answer is given', eff.line === null, eff.line)
  await ev(`(${cardExpr(t.name)})?.querySelector('[data-testid="lift-effort"]')?.scrollIntoView({ block: 'center' })`)
  await wait(400)
  await tapEffort(t.name, 'easy')
  const easy = (t.name ? (await read(t.name)) : NOTHING)?.effort ?? { buttons: [], line: null, inView: false }
  check('4g. "Too easy" shows as chosen, alone', easy.buttons.filter(b => b.pressed).map(b => b.label).join() === 'Too easy', easy.buttons)
  check('4h. ...with what it does, on screen where the tap was', easy.line === 'Next time starts heavier and finds your weight.' && easy.inView, easy)
  await shoot('lift-effort-asked')
  await tapEffort(t.name, 'easy')
  const back = (t.name ? (await read(t.name)) : NOTHING)?.effort ?? { buttons: [{ pressed: true }], line: 'x' }
  check('4i. the same answer tapped again takes it back', back.buttons.every(b => !b.pressed) && back.line === null, back)
  await tapEffort(t.name, 'hard')
  const hard = (t.name ? (await read(t.name)) : NOTHING)?.effort ?? { buttons: [], line: null }
  check('4j. a different answer replaces it', hard.buttons.filter(b => b.pressed).map(b => b.label).join() === 'Too hard' && hard.line === 'Next time holds this weight.', hard)
  // The sets are still the sets: answering never adds or removes a row.
  const rows = t.name ? await savedCount(t.name) : -1
  check('4k. answering changes no set: the same sets are still saved', rows === t.sets, { rows, sets: t.sets })
}

await finish('How a lift felt is asked once its sets are done, and today\'s weight reads the plan\'s week.')
