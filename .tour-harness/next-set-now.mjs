// ---------------------------------------------------------------------------
// THE RUNNING "LOG SET" BUTTON LOGS THE LIFT MARKED NOW, ONCE PER TAP (QA walk, 10 Nov 2026). Found on the training
// screens: with Seated Machine Row marked "NOW" and its set 1 ticked, the button read "Log set 1 · Chin-Ups × 10" (the
// first open card in the list) and one tap saved a Chin-Up set never done. It also reported two taps 250 ms apart logging
// two sets; on the whole app that did not reproduce at 100, 300 or 450 ms (the tick's own save already holds), so no
// lockout was added and check 2 holds the property instead.
// On the whole app (app-boot.html, ?session-day), a real session. PORT 9792.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9792, page: 'app-boot.html', name: 'next-set-now' })
const { ev, check, until, wait, go, clickAt, shoot, finish, send } = d
// A SUPERSET MEMBER goes in rounds with its partner (27 Nov 2026): after its set the partner is "now". Sections 1 and 5
// are about ONE lift, so their subject is never a superset member; section 2b holds the superset's own bounce.
const inSuperset = n => `[...document.querySelectorAll('[data-testid="superset-alternation"]')].some(p => p.parentElement.contains(document.querySelector('[data-exercise-name=${JSON.stringify(n)}]')))`
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`

await go('&session-day=1')
check('0a. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
await ev(`location.hash = '#/tab/exercise'`); await wait(2000)
if (await ev(`!!document.querySelector('[data-testid="hero-start"]')`)) { await clickAt(`document.querySelector('[data-testid="hero-start"]')`); await wait(1500) }
const saved = () => ev(`(() => { const m = document.querySelector('[data-testid="hero-sets"]')?.textContent?.match(/^(\\d+) of/); return m ? +m[1] : null })()`)
const label = () => ev(`document.querySelector('[data-next-set-button]')?.getAttribute('aria-label') ?? null`)
const names = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const first = await label()
check('0b. a session is running and the button names a set to log', typeof first === 'string' && /^Log /.test(first), first)

// --- 1. Open a LATER exercise and tick its set 1 with its own tick: that lift is now the one she is on.
const firstOpen = await ev(`document.querySelector('[data-exercise-open]')?.getAttribute('data-exercise-name') ?? null`)
const later = (names ?? []).filter((n, i, a) => a.indexOf(n) === i).filter(n => n !== firstOpen)
let other = null
for (const n of later.slice(1)) {
  if (await ev(inSuperset(n))) continue
  await clickAt(`document.querySelector('[data-exercise-name=${JSON.stringify(n)}]')`); await wait(800)
  const hasTick = await ev(`!!document.querySelector('[data-exercise-open][data-exercise-name=${JSON.stringify(n)}] [data-next-set]')`)
  if (!hasTick) continue
  const w = await ev(`document.querySelector('[data-exercise-open][data-exercise-name=${JSON.stringify(n)}] [data-next-set]')?.dataset.nextWeight ?? ''`)
  if (w === '') continue
  other = n; break
}
check('1a. fixture: a later exercise opened, with a tick that can log without typing', !!other, { firstOpen, later })
const before = await saved()
await clickAt(`document.querySelector('[data-exercise-open][data-exercise-name=${JSON.stringify(other)}] [data-next-set]')`); await wait(1200)
const nowName = await ev(`document.querySelector('[data-exercise-now]')?.getAttribute('data-exercise-name') ?? null`)
check('1b. its set 1 saved, and it is the lift marked NOW', (await saved()) === (before ?? 0) + 1 && nowName === other, { before, after: await saved(), nowName, other })
const after1 = await label()
check('1c. the running button now names THAT lift\'s next set, not the first open card\'s', typeof after1 === 'string' && after1.includes(other ?? '@@') && !after1.includes(firstOpen ?? '@@'), { after1, other, firstOpen })
await shoot('next-set-now')

// --- 2. A thumb bounce is one set: two presses 100 ms apart save one.
const b2 = await saved()
await ev(`(() => { const b = document.querySelector('[data-next-set-button]'); b.click(); setTimeout(() => b.click(), 300) })()`)
await wait(1800)
check('2. two presses 300 ms apart (a thumb bounce) log ONE set', (await saved()) === (b2 ?? 0) + 1, { before: b2, after: await saved() })
// ...and a real next press, a moment later, logs the next one (read off the button moving on: the next set can be a
// movement-prep move, which the working-set count rightly does not count).
await wait(600)
const l3 = await label()
await clickAt(`document.querySelector('[data-next-set-button]')`)
const l4 = await until(label, v => v !== l3, 20)
check('3. ...while a press a moment later logs the next set (the button moves on)', typeof l3 === 'string' && l4 !== l3, { l3, l4 })

// --- 2b. A SUPERSET'S BOUNCE (28 Nov 2026): there the first press moves the button to the PARTNER's set at once, so a
// bounce used to log a set of the other exercise that was never done. Tick a superset member's set by hand (it becomes
// the round's first), then bounce the button, which now names the partner: one set, not two.
const ssMember = await ev(`(() => { const ps = [...document.querySelectorAll('[data-testid="superset-alternation"]')]; for (const p of ps) { const rows = [...p.parentElement.querySelectorAll('[data-exercise-name]')].map(r => r.getAttribute('data-exercise-name')); if (rows.length >= 2) return rows[0] } return null })()`)
check('2b0. fixture: the session holds a superset', !!ssMember, ssMember)
await wait(1200)
await clickAt(`document.querySelector('[data-exercise-name=${JSON.stringify(ssMember)}]')`); await wait(800)
const ssTick = `document.querySelector('[data-exercise-open][data-exercise-name=${JSON.stringify(ssMember)}] [data-next-set]')`
const bS = await saved()
await clickAt(ssTick); await wait(1500)
const labelS = await label()
check('2b1. ticking a superset member\'s set hands the button to its partner', (await saved()) === (bS ?? 0) + 1 && typeof labelS === 'string' && !labelS.includes(ssMember ?? '@@'), { labelS, ssMember, before: bS, after: await saved() })
const bS2 = await saved()
await ev(`(() => { const b = document.querySelector('[data-next-set-button]'); b.click(); setTimeout(() => b.click(), 300) })()`)
await wait(1800)
check('2b2. two presses 300 ms apart on a superset log ONE set, never the partner\'s too', (await saved()) === (bS2 ?? 0) + 1, { before: bS2, after: await saved() })
await shoot('next-set-superset-bounce')

// --- 5. FOLLOW WHAT HE IS DOING (Marcus, 15 Nov 2026): he skips a set and ticks the one after it by hand; the button
// goes on from there and does not go back to the one he skipped.
// Its subject is chosen, not inherited: an untouched lift outside any superset, with three open sets.
const ticksOf = n => ev(`[...document.querySelectorAll('[data-exercise-name=${JSON.stringify(n)}] [data-set-tick]')].map(t => ({ open: t.dataset.setTick === 'open', set: t.dataset.nextSet ?? null, w: t.dataset.nextWeight ?? '' }))`)
let subj5 = null, open = [], ot = []
for (const n of (names ?? []).filter((x, i, a) => a.indexOf(x) === i)) {
  if (n === other || await ev(inSuperset(n))) continue
  await clickAt(`document.querySelector('[data-exercise-name=${JSON.stringify(n)}]')`); await wait(800)
  ot = (await ticksOf(n)) ?? []
  open = ot.filter(t => t.open && /^Set /.test(t.set ?? ''))
  if (open.length >= 3 && ot.filter(t => /^Set /.test(t.set ?? '')).every(t => t.open) && open[1].w !== '') { subj5 = n; break }
}
check('5a. fixture: an untouched lift outside any superset, three open working sets, the second loggable without typing', !!subj5, { subj5, ot })
await clickAt(`[...document.querySelectorAll('[data-exercise-name=${JSON.stringify(subj5)}] [data-set-tick="open"]')].filter(t => /^Set /.test(t.dataset.nextSet ?? ''))[1]`)
await wait(1200)
const l5 = await label()
check('5b. after he ticks the set AFTER the next one, the button names the set after that, not the one he skipped', typeof l5 === 'string' && !!open[2] && !l5.includes(other ?? '@@') && l5.toLowerCase().includes(open[2].set.toLowerCase()) && !l5.toLowerCase().includes(`log ${open[0].set.toLowerCase()} `), { l5, subj5, skipped: open[0]?.set, expected: open[2]?.set })
await shoot('next-set-follows')

check('4. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('verify:next-set-now PASSED')
