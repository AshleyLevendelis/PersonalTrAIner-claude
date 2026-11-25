// verify:record-activity — RECORD A WALK OR RUN (his request 25 Nov 2026, his ruling "A, build it";
// src/lib/activity-recording.ts, src/components/RecordActivityCard.tsx), on the whole app at phone size.
//
// The phone's health store (fake-health.ts) and the strap (fake-strap.ts) are pretended. What this proves is the app's
// half: Tools offers Start walk / Start run; Start asks the phone once and the clock runs; a recording survives the app
// being reloaded; End reads the phone for the window and shows steps, distance and calories; one effort tap logs it and
// says so with the figures; a strap alone gives calories marked "≈ ... estimate"; a watch with no calories yet says
// they will fill in; Cancel asks before throwing anything away. What it cannot prove is a real watch on a real phone.
//
// Every check runs every time with a null-safe subject. PORT 9981.
import { startDriver } from './driver-kit.mjs'

const A = await startDriver({ port: 9981, page: 'app-boot.html', name: 'record-activity', timeoutMs: 300_000 })
const { ev, check, wait, go, until, shoot, clickAt, finish } = A
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const card = () => ev(`document.querySelector('[data-record-card]')?.getAttribute('data-record-card') ?? null`)
const cardText = () => ev(`document.querySelector('[data-record-card]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`)
const figure = k => ev(`document.querySelector('[data-record-figure="${k}"] dd')?.textContent ?? null`)
const openTools = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
  await wait(1000)
  if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(400) }
  await ev(`location.hash = '#/tab/tools'`)
  await until(card, v => v != null, 60)
  await wait(300)
}

console.log('\n  A. A WALK, WITH A WATCH')
await openTools('&clear-storage=1&health=android')
check('A1. Tools offers "Record a walk or run" with Start walk and Start run', (await card()) === 'idle' && /Record a walk or run/.test((await cardText()) ?? '') && (await ev(`document.querySelectorAll('[data-record-start]').length`)) === 2, await cardText())
check('A2. it says where the numbers come from', /Steps, distance and calories come from your phone and watch/.test((await cardText()) ?? ''), await cardText())
await shoot('record-activity-1-idle')
check('A3. nothing was asked of the phone before the tap', !/distance|calories/.test((await ev(`JSON.stringify(window.__healthCalls ?? [])`)) ?? ''))
await clickAt(`document.querySelector('[data-record-start="walk"]')`)
await until(card, v => v === 'recording', 20)
check('A4. Start walk: "Recording · Walk" and a running clock', (await card()) === 'recording' && /Recording · Walk/i.test((await cardText()) ?? ''), await cardText())
const c1 = await ev(`document.querySelector('[data-record-clock]')?.textContent ?? null`)
await wait(2200)
const c2 = await ev(`document.querySelector('[data-record-clock]')?.textContent ?? null`)
check('A5. the clock moves', /^\d+:\d\d$/.test(c1 ?? '') && c1 !== c2, { c1, c2 })
check('A6. the first Start asked the phone for steps, distance, calories and heart rate', /"request":\["steps","distance","calories","heartRate"\]/.test((await ev(`JSON.stringify(window.__healthCalls ?? [])`)) ?? ''))
await shoot('record-activity-2-recording')

// THE APP CLOSED MID-WALK: a reload keeps the recording.
await go('&health=android')
await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
await ev(`location.hash = '#/tab/tools'`)
await until(card, v => v != null, 60)
check('A7. the app reloaded mid-walk: still recording', (await card()) === 'recording', await card())

await clickAt(`document.querySelector('[data-record-end]')`)
await until(card, v => v === 'ended', 20)
await until(() => ev(`!!document.querySelector('[data-record-figures]')`), v => v === true, 40)
check('A8. End shows the steps the phone read: 6,400', (await figure('steps')) === '6,400', await figure('steps'))
check('A9. ...the distance: 3.84 km', (await figure('distance')) === '3.84 km', await figure('distance'))
check('A10. ...and the watch\'s calories, not an estimate: 300 kcal', (await figure('kcal')) === '300 kcal' && (await ev(`!!document.querySelector('[data-record-estimate]')`)) === false, await figure('kcal'))
const windows = JSON.parse((await ev(`JSON.stringify((window.__healthCalls ?? []).filter(c => c && c.kcal))`)) ?? '[]')
check('A11. the phone was asked for the window from Start to End', windows.length >= 1 && Date.parse(windows[0].kcal[1]) - Date.parse(windows[0].kcal[0]) >= 2000, windows)
check('A12. effort is asked, nothing picked for him', /How hard was it\?/.test((await cardText()) ?? '') && (await ev(`[...document.querySelectorAll('[data-record-card] [role="radiogroup"] button')].filter(b => b.getAttribute('aria-checked') === 'true').length`)) === 0)
await shoot('record-activity-3-ended')
await clickAt(`[...document.querySelectorAll('[data-record-card] [role="radiogroup"] button')].find(b => /Steady/.test(b.textContent))`)
await until(card, v => v === 'idle', 20)
const banner = await ev(`[...document.querySelectorAll('button')].map(b => b.textContent).find(t => /^Logged · /.test(t || '')) ?? null`)
check('A13. one tap logs it, and the line says what was logged: "Walk · 1 min · Steady · 3.84 km · 6,400 steps · 300 kcal"', /Logged · Walk · \d+ min · Steady · 3\.84 km · 6,400 steps · 300 kcal/.test(banner ?? ''), banner)
check('A14. the card is back to Start walk / Start run', (await card()) === 'idle')
const onCard = await ev(`(() => { const n = document.querySelector('[data-record-logged]'); if (!n) return null; const r = n.getBoundingClientRect(); return { text: n.textContent, inView: r.top >= 0 && r.bottom <= innerHeight } })()`)
check('A15. ...and the logged line is on the card, on screen where he tapped', /Walk · \d+ min · Steady · 3\.84 km · 6,400 steps · 300 kcal/.test(onCard?.text ?? '') && onCard?.inView === true, onCard)
await shoot('record-activity-4-logged')

console.log('\n  B. A RUN WITH A STRAP AND NO WATCH: CALORIES ARE AN ESTIMATE, MARKED')
// NO clear-storage here: the page wipes storage after the pretend strap has written its pairing.
await openTools('&health=android&healthmissing=1&strap=1&strappaired=1')
await ev(`window.__strapConnect()`); await wait(300)
await clickAt(`document.querySelector('[data-record-start="run"]')`)
await until(card, v => v === 'recording', 20)
// A strap's readings are kept one a second at most (heart-strap.ts), so they go 1.1s apart, as a real strap's do.
for (const bpm of [128, 134, 140, 146, 150]) { await ev(`window.__strapSend(${bpm})`); await wait(1100) }
check('B1. the strap\'s live heart rate shows on the recording card', (await ev(`document.querySelector('[data-record-card] [data-live-heart]')?.getAttribute('data-live-heart') ?? null`)) === '150')
await clickAt(`document.querySelector('[data-record-end]')`)
await until(() => ev(`!!document.querySelector('[data-record-figures]')`), v => v === true, 40)
const kcal = await figure('kcal')
check('B2. calories are an estimate, printed with "≈"', /^≈ \d+ kcal$/.test(kcal ?? ''), kcal)
check('B3. ...and the card says it is an estimate from heart rate', /estimate from your heart rate/.test((await ev(`document.querySelector('[data-record-estimate]')?.textContent ?? ''`)) ?? ''))
check('B4. the heart rate is the strap\'s: "♥ 140 avg · 150 max"', (await ev(`document.querySelector('[data-record-heart]')?.textContent ?? null`)) === '♥ 140 avg · 150 max', await ev(`document.querySelector('[data-record-heart]')?.textContent ?? null`))
check('B5. no steps claimed when the phone had none', (await figure('steps')) === null)
await shoot('record-activity-5-estimate')
await clickAt(`document.querySelector('[data-record-discard]')`)
await until(card, v => v === 'idle', 20)
check('B6. Throw it away: back to idle, nothing logged', (await card()) === 'idle' && !(await ev(`[...document.querySelectorAll('button')].some(b => /^Logged · Run/.test(b.textContent || ''))`)))

console.log('\n  C. A WATCH THAT HAS NOT SYNCED, AND CANCEL')
await openTools('&clear-storage=1&health=android&healthkcal=0&healthsteps=0')
await clickAt(`document.querySelector('[data-record-start="walk"]')`)
await until(card, v => v === 'recording', 20)
await wait(500)
await clickAt(`document.querySelector('[data-record-end]')`)
await until(() => ev(`!!document.querySelector('[data-record-figures]')`), v => v === true, 40)
check('C1. no steps or calories yet: it says they fill in when the watch syncs', /No steps or calories on your phone for this yet\. If your watch syncs later, they fill in on their own\./.test((await ev(`document.querySelector('[data-record-waiting]')?.textContent ?? ''`)) ?? ''))
await clickAt(`document.querySelector('[data-record-resume]')`)
await until(card, v => v === 'recording', 20)
check('C2. Keep going takes End back', (await card()) === 'recording')
await clickAt(`document.querySelector('[data-record-cancel]')`)
await wait(300)
check('C3. Cancel asks before throwing anything away', (await card()) === 'recording' && /Throw this walk away\? Nothing is logged\./.test((await cardText()) ?? ''), await cardText())
await clickAt(`document.querySelector('[data-record-cancel-yes]')`)
await until(card, v => v === 'idle', 20)
check('C4. ...and on yes, it is gone', (await card()) === 'idle')

console.log('\n  D. TAP SIZE AND LEAKS')
const small = await ev(`[...document.querySelectorAll('[data-record-card] button')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent)`)
check('D1. every button on the card is at least 44px tall', Array.isArray(small) && small.length === 0, small)
const tx = await ev(`document.body.innerText`)
check('D2. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(tx ?? ''))

await finish('verify:record-activity passed: Start, End, the phone\'s figures, one tap logs it, an estimate is marked.')
