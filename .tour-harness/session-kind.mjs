// ---------------------------------------------------------------------------
// "A DIFFERENT KIND OF SESSION TODAY" — on the real screen.
//
// Ashley's live test, 19 Oct 2026, and her ruling of 20 Oct: "Drop it, today
// only." scripts/test-session-kind.ts holds the rules (what each session
// holds, her kit and injuries, the named moves, the pricing, today only, the
// exact Undo). This holds what only a real mount at phone width can show: the
// verb is on the day menu beside the other change-today verbs; it says what
// changes BEFORE anything does; the offer lists the session and the moves it
// could not do; nothing is written until "Use this session"; the card visibly
// becomes the new session with the main lift gone and a line saying what today
// is; "Put my planned session back" puts back exactly what was there; and a
// started session is refused in words.
//
// PORT 9760.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9760, page: 'real.html', name: 'session-kind' })
const { send, ev, check, until, wait, go, shoot, finish, clickAt } = d

const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const text = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText?.replace(/\\s+/g, ' ').trim() || ''`)
const MAIN_LIFT = `(() => {
  const label = [...document.querySelectorAll('span')].find(s => /^Main lift\\b/.test(s.textContent.trim()))
  return label?.parentElement?.querySelector('[data-exercise-name]')?.getAttribute('data-exercise-name') ?? null
})()`
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const openSheet = async () => {
  if (await has('[data-testid="what-happened-sheet"]')) await escape()
  await clickAt(`document.querySelector('button[aria-label="More options"]')`); await wait(500)
  if (!(await has('[data-testid="what-happened-item"]'))) return 'no-menu-item'
  await clickAt(`document.querySelector('[data-testid="what-happened-item"]')`); await wait(600)
  return (await has('[data-testid="what-happened-sheet"]')) ? 'open' : 'no-sheet'
}
const click = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n || n.disabled) return false; n.click(); return true })()`)
const typeInto = (sel, value) => ev(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); if (!t) return false; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(t, ${JSON.stringify(value)}); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const untilClosed = () => until(() => has('[data-testid="what-happened-sheet"]'), v => v === false, 24)
const badStarts = sel => ev(`(() => { const t = document.querySelector(${JSON.stringify(sel)})?.innerText || ''; return [...t.matchAll(/[.!?]\\s+([a-z][a-z']+)/g)].map(m => m[1]) })()`)
const inViewport = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 0 })()`)

console.log('\nA DIFFERENT KIND OF SESSION TODAY — on the screen\n')
await go('&tour=off', '#/tab/exercise')
const start = await until(order, o => Array.isArray(o) && o.length >= 4, 40)
check('0a. today shows a real session', Array.isArray(start) && start.length >= 4, start)
const main = await ev(MAIN_LIFT)
check('0b. ...and the app names one of them the main lift', !!main, main)

// --- 1. the verb, beside the other change-today verbs ----------------------
check('1a. the day menu opens', (await openSheet()) === 'open')
const verbs = await ev(`[...document.querySelectorAll('[data-testid="what-happened-verbs"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
check('1b. "a different kind of session today" is on it', verbs.includes('kind'), verbs)
check('1c. ...beside "give me a different session", not instead of it (her 16 Sep ruling still stands)', verbs.includes('rebuild') && verbs.includes('shorten'), verbs)

// --- 2. it says what changes, before anything does --------------------------
check('2a. tapping it asks which kind rather than acting', await click('[data-verb="kind"]') && !!(await until(() => has('[data-testid="what-happened-kind"]'), v => v === true, 12)))
const promise = await text('[data-testid="what-happened-kind"]')
check('2b. it says the main lift goes too — her 20 Oct ruling', /main lift included/i.test(promise), promise)
check('2c. ...and that it is back next time, at its weight', /back the next time/i.test(promise) && /doesn.t change its weight/i.test(promise), promise)
const kinds = await ev(`[...document.querySelectorAll('[data-testid="what-happened-kind"] [data-kind]')].map(b => b.getAttribute('data-kind'))`)
check('2d. the kinds offered: cardio, functional, bodybuilding — not hybrid, which is how she already trains, and never combat',
  JSON.stringify(kinds) === JSON.stringify(['cardio', 'functional', 'bodybuilding']), kinds)
check('2e. ...each kind a full tap target', await ev(`[...document.querySelectorAll('[data-testid="what-happened-kind"] [data-kind]')].every(b => b.getBoundingClientRect().height >= 44)`))
check('2f. nothing changed while it asks', JSON.stringify(await order()) === JSON.stringify(start))
await shoot('session-kind-ask')

// --- 3. the offer: the session, what it could not do, nothing written -------
check('3a. she names moves', await typeInto('[data-testid="kind-moves"]', 'box jumps, sled push'))
await wait(200)
check('3b. ...and taps Functional', await click('[data-kind="functional"]'))
const offer = await until(() => text('[data-testid="what-happened-kind-offer"]'), t => t.length > 0, 40)
check('3c. an offer comes back, asking first', /^Want me to make today a functional session instead of [^?]+\?/.test(offer), offer.slice(0, 160))
const listed = await ev(`[...document.querySelectorAll('[data-testid="kind-offer-session"] li')].map(li => li.innerText)`)
check('3d. it lists the session, the box jumps she asked for first', Array.isArray(listed) && listed.length >= 5 && /^Box Jumps — /.test(listed[0]), listed)
check('3e. it says there is no sled push, and what does that job', /There's no sled push in the app's exercise list, so .+ does the loaded carrying\./.test(offer), offer)
check('3f. it names the main lift and when it is back', !!main && offer.includes(`${main} `) && /back next \w+day, as planned/.test(offer), { main, offer: offer.slice(-400) })
check('3g. it says it is just today', /Just today — \w+day is back to normal next week\./.test(offer), offer.slice(-200))
check('3h. every sentence starts like a sentence', (await badStarts('[data-testid="what-happened-kind-offer"]')).length === 0, await badStarts('[data-testid="what-happened-kind-offer"]'))
check('3i. NOTHING WRITTEN before the tap', JSON.stringify(await order()) === JSON.stringify(start))
check('3j. "Use this session" is on screen to tap', await inViewport('[data-testid="kind-confirm"]') || await ev(`(() => { const n = document.querySelector('[data-testid="kind-confirm"]'); n?.scrollIntoView({ block: 'center' }); const r = n?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight })()`))
await shoot('session-kind-offer')

// --- 4. the tap: the day becomes that session -------------------------------
const offered = listed.map(l => l.split(' — ')[0])
check('4a. tapping "Use this session"', await click('[data-testid="kind-confirm"]') && (await untilClosed()) === false)
const after = await until(order, o => JSON.stringify(o) !== JSON.stringify(start), 30)
check('4b. the card IS the offered session, in order', JSON.stringify(after) === JSON.stringify(offered), { after, offered })
check('4c. the planned main lift is gone today', !!main && !after.includes(main), after)
const note = await until(() => text('[data-testid="kind-today-note"]'), t => t.length > 0, 20)
check('4d. a line says what today is, and when the main lift is back', /Today is a functional session instead of .+, just for today\./.test(note) && note.includes(main) && /back next \w+day/.test(note), note)
check('4e. ...with the way back beside it', /Put my planned session back/.test(note))
await ev(`document.querySelector('[data-testid="kind-today-note"]')?.scrollIntoView({ block: 'center' })`)
await shoot('session-kind-applied')

// --- 5. put it back: exactly what was there --------------------------------
check('5a. tapping "Put my planned session back"', await click('[data-testid="kind-today-undo"]'))
const restored = await until(order, o => JSON.stringify(o) === JSON.stringify(start), 30)
check('5b. the planned session is back, exactly', JSON.stringify(restored) === JSON.stringify(start), { restored, start })
check('5c. ...with its main lift', (await ev(MAIN_LIFT)) === main)
check('5d. ...and the line is gone', (await until(() => has('[data-testid="kind-today-note"]'), v => v === false, 12)) === false)
await shoot('session-kind-restored')

// --- 6. cardio: conditioning blocks, drawn as rounds ------------------------
check('6a. the menu opens again', (await openSheet()) === 'open')
await click('[data-verb="kind"]'); await wait(400)
check('6b. Cardio', await click('[data-kind="cardio"]'))
const cardioOffer = await until(() => ev(`[...document.querySelectorAll('[data-testid="kind-offer-session"] li')].map(li => li.innerText)`), v => Array.isArray(v) && v.length > 0, 40)
check('6c. the cardio offer is conditioning work, in rounds or minutes, with no sets of a lift',
  Array.isArray(cardioOffer) && cardioOffer.filter(l => /rounds, \d+s on, \d+s off|min steady/.test(l)).length >= 2, cardioOffer)
await shoot('session-kind-cardio-offer')
check('6d. use it', await click('[data-testid="kind-confirm"]') && (await untilClosed()) === false)
const cardioCard = await until(order, o => JSON.stringify(o) === JSON.stringify(cardioOffer.map(l => l.split(' — ')[0])), 30)
check('6e. the card is the cardio session', JSON.stringify(cardioCard) === JSON.stringify(cardioOffer.map(l => l.split(' — ')[0])), { cardioCard, cardioOffer })
await shoot('session-kind-cardio-card')
// The rows themselves, drawn as the app draws interval work.
await ev(`document.querySelector('[data-exercise-name]')?.scrollIntoView({ block: 'start' })`); await wait(400)
await shoot('session-kind-cardio-rows')

// --- 7. a started session is not redrawn -------------------------------------
// Log one working set of today's (cardio) session with the row's own tick.
const ticked = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Save (set|round) 1\\b/.test(x.getAttribute('aria-label') || '')); if (!b) return false; b.click(); return true })()`)
check('7a. one set is logged with the row\'s own tick', ticked === true)
await wait(800)
check('7b. the menu opens', (await openSheet()) === 'open')
const verbs7 = await ev(`[...document.querySelectorAll('[data-testid="what-happened-verbs"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
if (verbs7.includes('kind')) {
  await click('[data-verb="kind"]'); await wait(300)
  await click('[data-kind="functional"]')
  const err = await until(() => text('[data-testid="what-happened-error"]'), t => t.length > 0, 30)
  check('7c. asking for another kind once a set is logged is refused, in words', /already logged sets/.test(err), err)
} else {
  check('7c. once a set is logged the verb is not offered at all', !verbs7.includes('kind'), verbs7)
}
await escape()
const undoNow = await click('[data-testid="kind-today-undo"]')
const undoErr = await until(() => text('[data-testid="kind-today-error"]'), t => t.length > 0, 20)
check('7d. and the put-back is refused once a set is logged, so the logged set keeps its session', undoNow && /logged sets/.test(undoErr), undoErr)
await shoot('session-kind-started')

check('8. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('verify:session-kind PASSED')
