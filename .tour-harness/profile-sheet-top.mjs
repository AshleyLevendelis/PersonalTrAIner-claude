// ---------------------------------------------------------------------------
// A PROFILE SHEET OPENS AT ITS TOP (1 Nov 2026, whole-app test). Appearance, the last row, opened halfway down its
// own page with its title and back button off screen, because a sheet replaces the rows in the same scroller and kept
// their scroll. Whole app (app-boot.html), real taps. PORT 9549.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9549, page: 'app-boot.html', name: 'profile-sheet-top' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btnText = re => `[...document.querySelectorAll('button,[role=menuitem]')].find(b => ${re}.test((b.getAttribute('aria-label') || '').trim()) || ${re}.test(b.textContent.trim()))`

await go('')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btnText('/^Not now$/')})`)) { await clickAt(btnText('/^Not now$/')); await wait(500) }
await clickAt(btnText('/Profile and settings/')); await wait(600)
await clickAt(btnText('/^Profile$/')); await wait(1200)
const ROW = `[...document.querySelectorAll('[data-profile-page] button')].find(b => b.textContent.trim().startsWith('Appearance'))`
await ev(`(${ROW})?.scrollIntoView({ block: 'end' })`); await wait(500)
const scrolled = await ev(`(() => { let n = (${ROW}); while (n) { const oy = getComputedStyle(n).overflowY; if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n.scrollTop; n = n.parentElement } return null })()`)
check('2. Profile is scrolled down to its last row (so the next check binds)', typeof scrolled === 'number' && scrolled > 100, scrolled)
await clickAt(ROW); await wait(900)
const top = await ev(`(() => { const sh = document.querySelector('[data-profile-sheet]'); const h = sh?.querySelector('h2'); const back = document.querySelector('[data-profile-back]'); if (!h || !back) return null; const r = h.getBoundingClientRect(), b = back.getBoundingClientRect(); return { sheet: sh.getAttribute('data-profile-sheet'), title: h.textContent, titleTop: Math.round(r.top), backTop: Math.round(b.top), vh: innerHeight } })()`)
check('3. Appearance opens', /appearance/i.test(top?.sheet ?? '') || /Appearance/.test(top?.title ?? ''), top)
check('4. ...with its title on screen', !!top && top.titleTop >= 0 && top.titleTop < top.vh, top)
check('5. ...and its back button on screen', !!top && top.backTop >= 0 && top.backTop < top.vh, top)
await shoot('profile-sheet-top')
await finish('verify:profile-sheet-top PASSED')
