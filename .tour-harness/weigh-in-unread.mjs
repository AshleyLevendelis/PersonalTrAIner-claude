// ---------------------------------------------------------------------------
// A WEIGH-IN READ THAT FAILS IS NOT "NEVER WEIGHED IN" (8 Nov 2026), on the whole app at 390px.
//
// Traced from QA round 2's lead: with the weigh-ins unreadable while the profile and the targets answered, the start
// fell back to the weight given at sign-up, SAVED that as a target move, announced it ("Your daily targets moved since
// you were last here"), and wrote the sign-up weight as a weigh-in on the sign-up date. After a weigh-in on a dropped
// connection, the targets fell back the same way and the current weight vanished.
//
//   A. The fixture binds: the weigh-ins (72 yesterday, 80.4 five days ago) set a different target from the sign-up
//      weight (80), so a fallback to 80 would show.
//   B. The weigh-ins unread at start: the target on screen is the one the phone kept, nothing is recorded, no notice,
//      no weigh-in written.
//   C. A weigh-in saved, then the weigh-ins cannot be read back: the target stays, nothing recorded or announced.
//
// Every check runs every time. PORT 9771.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9771, page: 'app-boot.html', name: 'weigh-in-unread', timeoutMs: 300_000 })
const { ev, wait, check, until, clickAt, go, shoot } = d

const kcalTarget = () => ev(`(() => { const n = document.querySelector('[data-testid="kcal-target"]'); return n ? Number(n.textContent.replace(/[^0-9]/g, '')) : null })()`)
const onNutrition = async () => { await ev(`location.hash = '#/tab/nutrition'`); return until(kcalTarget, v => typeof v === 'number' && v > 0, 60) }
const db = expr => ev(`(() => { const db = window.__fakeDb; return db ? (${expr}) : null })()`)
const notice = () => ev(`/targets moved/i.test(document.body.innerText)`)
const freshPhone = () => ev(`(() => { try { localStorage.clear() } catch {} })()`)
const settle = async () => { await until(() => ev(`!!window.__fakeDb && !!document.querySelector('[data-tab-root], main, #root > *')`), v => v === true, 60); await wait(2500) }

console.log('\nA FAILED WEIGH-IN READ, AT 390px\n')

// --- A. What the sign-up weight alone would give, and what the weigh-ins give -------------------------------
await go('&weigh=80')
await settle(); await freshPhone()
await go('&weigh=80'); await settle()
const kSignUp = await onNutrition()
await freshPhone()
await go('&weigh=72'); await settle()
const kWeighIns = await onNutrition()
await wait(1500) // the phone keeps its copy half a second after the targets land
const firstRows = await db(`db.daily_nutrition_targets.length`)
check('A1. the fixture binds: the weigh-ins set a different target from the sign-up weight', typeof kSignUp === 'number' && typeof kWeighIns === 'number' && kSignUp !== kWeighIns, { kSignUp, kWeighIns })
check('A2. ...and a good start records it, the way every later start compares against', firstRows === 1, firstRows)

// --- B. The next start, with the weigh-ins unreadable --------------------------------------------------------
await go('&weigh=72&fail-read=daily_metrics'); await settle()
const kUnread = await onNutrition()
await wait(1500)
check('B1. the weigh-ins unread at start: the target shown is the one already set, not the sign-up weight\'s', kUnread === kWeighIns && kUnread !== kSignUp, { kUnread, kWeighIns, kSignUp })
check('B2. ...nothing is recorded as a target move', (await db(`db.daily_nutrition_targets.length`)) === 0, await db(`db.daily_nutrition_targets`))
check('B3. ...no weigh-in is written (the sign-up weight never stands in for one)', (await db(`db.daily_metrics.length`)) === 2 && (await db(`db.daily_metrics.every(r => r.weight_kg !== 80)`)) === true, await db(`db.daily_metrics`))
await ev(`location.hash = '#/tab/dashboard'`); await wait(1500)
check('B4. ...and nothing says the targets moved', (await notice()) === false, await ev(`document.body.innerText.slice(0, 300)`))
await shoot('weigh-in-unread-start')

// --- C. A weigh-in saved, then the read back fails -----------------------------------------------------------
// The weigh-in box will not save while it cannot read the last weigh-in (it needs it to spot a surprising number), so
// the reads fail from the moment the new weigh-in is in: the connection dropping between the save and what follows.
await go('&weigh=72'); await settle()
await onNutrition(); await wait(1500)
const rowsBeforeC = await db(`db.daily_nutrition_targets.length`)
await ev(`window.__failRead = t => t === 'daily_metrics' && (window.__fakeDb?.daily_metrics ?? []).some(r => Number(r.weight_kg) === 71.6)`)
await ev(`location.hash = '#/tab/dashboard'`); await wait(1200)
const notNowBtn = `[...document.querySelectorAll('button')].find(b => /^Not now$/.test(b.innerText.trim()))`
if (await ev(`!!(${notNowBtn})`)) { await clickAt(notNowBtn); await wait(500) }
await clickAt(`document.querySelector('[data-home-progress-toggle]')`); await wait(600)
await clickAt(`document.querySelector('[data-home-weight] button')`); await wait(800)
const input = `document.querySelector('[data-testid=weigh-in-card] input')`
await ev(`(() => { const el = ${input}; if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '71.6'); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
await clickAt(`[...document.querySelectorAll('[data-testid=weigh-in-card] button')].find(b => /Sav/.test(b.innerText))`); await wait(2500)
// A surprising number asks first; a 0.4 kg move from yesterday is not one. Either way, the save is what is asked.
const saved = await db(`db.daily_metrics.some(r => Number(r.weight_kg) === 71.6)`)
check('C1. the weigh-in itself is saved (the fixture binds)', saved === true, await db(`db.daily_metrics`))
const kAfter = await onNutrition()
await wait(1500)
check('C2. ...and with the weigh-ins unreadable the target stays where it was', kAfter === kWeighIns, { kAfter, kWeighIns })
check('C3. ...nothing is recorded as a move', (await db(`db.daily_nutrition_targets.length`)) === rowsBeforeC && rowsBeforeC === 1, { rowsBeforeC, rows: await db(`db.daily_nutrition_targets`) })
await ev(`location.hash = '#/tab/dashboard'`); await wait(1500)
check('C4. ...and nothing says the targets moved', (await notice()) === false, await ev(`document.body.innerText.slice(0, 300)`))
await shoot('weigh-in-unread-after')

await d.finish('verify:weigh-in-unread')
