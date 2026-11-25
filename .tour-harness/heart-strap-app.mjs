// verify:heart-strap, second half — THE LIVE NUMBER WHILE HE TRAINS, on the whole app (heart-strap.mjs has the first
// half, Profile). The pretend strap (fake-strap.ts) sends real notification bytes; the countdown and the round timer
// show "♥ N" while readings arrive and nothing once they stop. Every check runs every time. PORT 9980.
import { startDriver } from './driver-kit.mjs'

console.log('\n  D. THE LIVE NUMBER WHILE HE TRAINS (the whole app)')
const A = await startDriver({ port: 9980, page: 'app-boot.html', name: 'heart-strap-app' })
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const heart = () => A.ev(`(() => { const n = document.querySelector('[data-live-heart]'); return n ? { bpm: n.getAttribute('data-live-heart'), text: n.textContent.trim(), visible: n.getBoundingClientRect().bottom <= innerHeight && n.getBoundingClientRect().top >= 0 } : null })()`)
await A.go('&strap=1&strappaired=1')
A.check('D0. the app is up', (await A.until(() => A.ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await A.wait(1200)
if (await A.ev(`!!(${btn('/^Not now$/')})`)) { await A.clickAt(btn('/^Not now$/')); await A.wait(400) }
await A.ev(`window.__strapConnect()`)
await A.ev(`location.hash = '#/tab/tools'`); await A.wait(1500)
// The round timer first, then the countdown, the order verify:countdown-timer walks them.
await A.clickAt(`document.querySelector('[data-timer-choice="round"]')`); await A.wait(800)
await A.clickAt(`[...document.querySelectorAll('button')].filter(b => /^Start/.test((b.textContent || '').trim())).pop()`); await A.wait(1200)
await A.ev(`window.__strapSend(161)`); await A.wait(500)
const h2 = await A.ev(`(() => { const c = document.querySelector('[data-round-card]'); const n = c?.querySelector('[data-live-heart]'); return c ? { phase: c.getAttribute('data-round-phase'), bpm: n?.getAttribute('data-live-heart') ?? null } : null })()`)
A.check('D1. the round timer, running, shows "♥ 161" on its card', h2?.bpm === '161' && h2.phase !== 'idle', h2)
await A.shoot('heart-strap-3-round')
await A.ev(`window.__strapDrop()`); await A.wait(500)
A.check('D2. the strap out of range: the round card shows no number at once', (await A.ev(`!!document.querySelector('[data-round-card]')`)) === true && (await A.ev(`!!document.querySelector('[data-round-card] [data-live-heart]')`)) === false)
await A.clickAt(btn('/^Reset$/')); await A.wait(800)
await A.ev(`window.__strapConnect()`); await A.wait(300)

await A.ev(`location.hash = '#/tab/home'`); await A.wait(500)
await A.ev(`location.hash = '#/tab/tools'`); await A.wait(1500)
await A.clickAt(`document.querySelector('[data-timer-choice="countdown"]')`); await A.wait(800)
await A.clickAt(`document.querySelector('[data-countdown-chip]')`); await A.wait(900)
A.check('D3. the countdown runs with no reading: no heart shown', (await A.ev(`!!document.querySelector('[data-countdown-clock]')`)) === true && (await heart()) === null, await heart())
await A.ev(`window.__strapSend(152)`); await A.wait(500)
const h1 = await heart()
A.check('D4. a reading arrives: "♥ 152" under the countdown, on screen', h1?.bpm === '152' && /152/.test(h1.text) && h1.visible === true, h1)
await A.shoot('heart-strap-2-countdown')
await A.wait(6000)
A.check('D5. no reading for over 5 seconds: the number goes (never the last one left standing)', (await heart()) === null, await heart())
await A.clickAt(`document.querySelector('[data-countdown-reset]')`); await A.wait(600)

const tx = await A.ev(`document.body.innerText`)
A.check('D6. nothing judges the number: no zone, target or "too high" anywhere on screen', !/\b(heart rate zone|zone \d|target heart|too high|too low)\b/i.test(tx ?? ''))
const leak = /undefined|NaN|\[object Object\]/.test(tx ?? '')
A.check('Z. nothing leaked onto the page', !leak)

await A.finish('verify:heart-strap (the whole app) passed: the number is live where he trains and gone when it stops.')
