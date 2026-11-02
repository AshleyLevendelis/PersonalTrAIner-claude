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
const pill = () => ev(`(() => { const s = document.querySelector('[data-testid="chat-context-strip"]'); const m = s && s.innerText.match(/(\\d+) of (\\d+) sets/); return m ? { logged: +m[1], planned: +m[2] } : null })()`)
const meter = () => ev(`(() => { const m = document.querySelector('[data-testid="week-key"]')?.textContent?.match(/(\\d+)\\/(\\d+) sets/); return m ? { logged: +m[1], planned: +m[2] } : null })()`)
const saved = () => ev(`(() => { const m = document.querySelector('[data-testid="hero-sets"]')?.textContent?.match(/^(\\d+) of/); return m ? +m[1] : null })()`)

await go('&train-today=1')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }

await ev(`location.hash = '#/tab/exercise'`); await wait(2000)
await clickAt(`document.querySelector('[data-testid="hero-start"]')`); await wait(1200)
await ev(`location.hash = '#/tab/chat'`); await wait(2000)
const p0 = await until(pill, v => !!v, 30)
check('2. mid-session, the chat pill counts sets', !!p0 && p0.logged === 0, p0)

await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
const before = await saved()
for (let i = 0; i < 2; i++) { await clickAt(`document.querySelector('button[aria-label^="Save set "]')`); await wait(900) }
const after = await saved()
check('3. two working sets are ticked: the session card itself counts 2', before === 0 && after === 2, { before, after })
const m = await until(meter, v => v && v.logged >= 2, 30)
check('4. Exercise\'s "This week" counts them without finishing the session', m?.logged === 2, m)

await ev(`location.hash = '#/tab/chat'`); await wait(800)
const p1 = await until(pill, v => v && v.logged >= 2, 30)
check('5. the chat, open since before they were logged, now says 2 sets', p1?.logged === 2, p1)
check('6. ...out of the same total Exercise uses', !!p1 && !!m && p1.planned === m.planned || (!!p1 && !!p0 && p1.planned === p0.planned), { p0, p1, m })
await shoot('live-set-count-chat')

await finish('verify:live-set-count PASSED')
