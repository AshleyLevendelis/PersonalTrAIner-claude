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

check('4. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('verify:next-set-now PASSED')
