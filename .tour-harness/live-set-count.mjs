// ---------------------------------------------------------------------------
// THE SET COUNT WHILE SHE TRAINS, ON THE WHOLE APP AT 390px (1 Nov 2026, whole-app test #7). Screens that stay
// mounted (the chat, Exercise's "This week") read the week once and again only on a finish, so the chat said
// "0 of 20 sets" while the grid had three. Runs on app-boot.html, where the chat is mounted from the start the way it
// is on a phone. The chat is opened BEFORE any set is logged, so its count can only move if it re-reads.
// Every check runs every time with a null-safe subject. PORT 9535.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9535, page: 'app-boot.html', name: 'live-set-count' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
// RE-ANCHORED 12 Nov 2026 (his Exercise Week handoff): the week meter left the Exercise screen. The week reader the chat
// shares now shows on Exercise as TODAY'S MARK on the strip, part-done once a set is in, and the planned total is the
// Today card's ("2 of 18 sets").
const meter = () => ev(`(() => { const c = [...document.querySelectorAll('[data-exercise-strip] [data-strip-day]')].find(b => /^Today/i.test(b.innerText.trim())); const m = document.querySelector('[data-testid="hero-sets"]')?.textContent?.match(/(\\d+) of (\\d+) sets/); return c && m ? { mark: c.getAttribute('data-dot'), logged: +m[1], planned: +m[2] } : null })()`)
const saved = () => ev(`(() => { const m = document.querySelector('[data-testid="hero-sets"]')?.textContent?.match(/^(\\d+) of/); return m ? +m[1] : null })()`)

await go('&session-day=1')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }

await ev(`location.hash = '#/tab/exercise'`); await wait(2000)
await clickAt(`document.querySelector('[data-testid="hero-start"]')`); await wait(1200)
// 20 Nov 2026 (his request): the chat no longer shows a set count (its pills are gone), so checks 2, 5 and 6 left with
// them. What stays is the property this driver was for, on the screens that still count: the count moves live.

await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
const before = await saved()
// RE-ANCHORED 7 Nov 2026: two sets of the first WORKING exercise. Today opens with movement prep, which is a warm-up,
// not a working set, so a tick of it rightly counts 0 (the whole-app QA walk). The card says which it is.
const workTick = `[...document.querySelectorAll('[data-exercise-name]:not([data-movement-prep]) button[aria-label^="Save set "]')][0]`
const openWork = `[...document.querySelectorAll('[data-exercise-name]:not([data-movement-prep])')][0]?.querySelector('[role="button"]')`
if (!(await ev(`!!${workTick}`))) { await clickAt(openWork); await wait(800) }
for (let i = 0; i < 2; i++) { await clickAt(workTick); await wait(900) }
const after = await saved()
check('3. two working sets are ticked: the session card itself counts 2', before === 0 && after === 2, { before, after })
const m = await until(meter, v => v && v.mark === 'part', 30)
check('4. Exercise\'s week (today\'s mark on the strip) counts them without finishing the session', m?.mark === 'part' && m?.logged === 2, m)

await shoot('live-set-count-exercise')

await finish('verify:live-set-count PASSED')
