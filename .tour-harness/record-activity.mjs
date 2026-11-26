// verify:record-activity — RECORD A WALK OR RUN (his request 25 Nov 2026, his ruling "A, build it";
// src/lib/activity-recording.ts, src/components/RecordActivityCard.tsx), on the whole app at phone size.
//
// The phone's health store (fake-health.ts) and the strap (fake-strap.ts) are pretended. What this proves is the app's
// half: Exercise (under today, since 26 Nov 2026; it was on Tools) offers Start walk / Start run; Start asks the phone once and the clock runs; a recording survives the app
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
// The figures are the summary's tiles since 26 Nov 2026 (WorkoutFigures): "6,400 STEPS", "3.84 km DISTANCE".
const figure = k => ev(`document.querySelector('[data-record-card] [data-figure="${k}"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`)
const openExercise = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
  await wait(1000)
  if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(400) }
  await ev(`location.hash = '#/tab/exercise'`)
  await until(card, v => v != null, 60)
  await wait(300)
}

console.log('\n  A. A WALK, WITH A WATCH')
await openExercise('&clear-storage=1&health=android')
check('A1. Exercise offers, under today, "Record a walk or run" with Start walk and Start run', (await card()) === 'idle' && /Record a walk or run/.test((await cardText()) ?? '') && (await ev(`document.querySelectorAll('[data-record-start]').length`)) === 2, await cardText())
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
await ev(`location.hash = '#/tab/exercise'`)
await until(card, v => v != null, 60)
check('A7. the app reloaded mid-walk: still recording', (await card()) === 'recording', await card())

await clickAt(`document.querySelector('[data-record-end]')`)
await until(card, v => v === 'ended', 20)
await until(() => ev(`!!document.querySelector('[data-record-figures]')`), v => v === true, 40)
check('A8. End shows the steps the phone read: 6,400', /^6,400 steps$/i.test((await figure('steps')) ?? ''), await figure('steps'))
check('A9. ...the distance: 3.84 km', /^3\.84 km distance$/i.test((await figure('distance')) ?? ''), await figure('distance'))
check('A10. ...and the watch\'s calories, not an estimate: 300 kcal', /^300 kcal active$/i.test((await figure('kcal')) ?? '') && (await ev(`!!document.querySelector('[data-record-estimate]')`)) === false, await figure('kcal'))
const windows = JSON.parse((await ev(`JSON.stringify((window.__healthCalls ?? []).filter(c => c && c.kcal))`)) ?? '[]')
check('A11. the phone was asked for the window from Start to End', windows.length >= 1 && Date.parse(windows[0].kcal[1]) - Date.parse(windows[0].kcal[0]) >= 2000, windows)
check('A12. effort is asked, nothing picked for him', /How hard was it\?/.test((await cardText()) ?? '') && (await ev(`[...document.querySelectorAll('[data-record-card] [role="radiogroup"] button')].filter(b => b.getAttribute('aria-checked') === 'true').length`)) === 0)
check('A12a. ...because this walk has no heart rate: no zone is offered in its place (his 26 Nov "Keep Easy/Steady/Hard")', (await ev(`!!document.querySelector('[data-record-zone]')`)) === false)
await shoot('record-activity-3-ended')
await clickAt(`[...document.querySelectorAll('[data-record-card] [role="radiogroup"] button')].find(b => /Steady/.test(b.textContent))`)
await until(card, v => v === 'idle', 20)
// Exercise has no "Logged ·" banner of its own (Tools did): the line on the card is what he reads.
const banner = await ev(`document.querySelector('[data-record-logged]')?.textContent ?? null`)
check('A13. one tap logs it, and the line says what was logged: "Walk · 1 min · Steady · 3.84 km · 6,400 steps · 300 kcal"', /Walk · \d+ min · Steady · 3\.84 km · 6,400 steps · 300 kcal/.test(banner ?? ''), banner)
check('A14. the card is back to Start walk / Start run', (await card()) === 'idle')
const onCard = await ev(`(() => { const n = document.querySelector('[data-record-logged]'); if (!n) return null; const r = n.getBoundingClientRect(); return { text: n.textContent, inView: r.top >= 0 && r.bottom <= innerHeight } })()`)
check('A15. ...and the logged line is on the card, on screen where he tapped', /Walk · \d+ min · Steady · 3\.84 km · 6,400 steps · 300 kcal/.test(onCard?.text ?? '') && onCard?.inView === true, onCard)
await shoot('record-activity-4-logged')

console.log('\n  B. A RUN WITH A STRAP AND NO WATCH: CALORIES ARE AN ESTIMATE, MARKED')
// NO clear-storage here: the page wipes storage after the pretend strap has written its pairing.
await openExercise('&health=android&healthmissing=1&strap=1&strappaired=1')
await ev(`window.__strapConnect()`); await wait(300)
await clickAt(`document.querySelector('[data-record-start="run"]')`)
await until(card, v => v === 'recording', 20)
// A strap's readings are kept one a second at most (heart-strap.ts), so they go 1.1s apart, as a real strap's do.
for (const bpm of [128, 134, 140, 146, 150]) { await ev(`window.__strapSend(${bpm})`); await wait(1100) }
check('B1. the strap\'s live heart rate shows on the recording card', (await ev(`document.querySelector('[data-record-card] [data-live-heart]')?.getAttribute('data-live-heart') ?? null`)) === '150')
await clickAt(`document.querySelector('[data-record-end]')`)
await until(() => ev(`!!document.querySelector('[data-record-figures]')`), v => v === true, 40)
const kcal = await figure('kcal')
check('B2. calories are an estimate, printed with "≈" and labelled an estimate', /^≈\d+ kcal estimate$/i.test(kcal ?? ''), kcal)
check('B3. ...and the card says it is an estimate from heart rate', /estimate from your heart rate/.test((await ev(`document.querySelector('[data-record-estimate]')?.textContent ?? ''`)) ?? ''))
check('B4. the heart rate is the strap\'s: average 140, highest 150', /^140 bpm average$/i.test((await figure('avg-heart')) ?? '') && /^150 bpm highest$/i.test((await figure('max-heart')) ?? ''), [await figure('avg-heart'), await figure('max-heart')])
const strapChart = await ev(`(() => { const c = document.querySelector('[data-record-card] [data-heart-chart]'); return c ? { pts: c.querySelector('[data-heart-chart-line]')?.getAttribute('points')?.trim().split(/\\s+/).length ?? 0, read: c.querySelector('[data-heart-chart-read]')?.textContent ?? '' } : null })()`)
check('B4a. ...and drawn as a graph from the strap\'s own readings (128 to 150)', strapChart && strapChart.pts >= 3 && strapChart.read === '128–150 bpm', strapChart)
check('B5. no steps claimed when the phone had none', (await figure('steps')) === null)
// HIS 26 NOV "it should be 5 heart rate zones": with a heart rate, End names the zone and asks no effort.
const zoneShown = await ev(`(() => { const z = document.querySelector('[data-record-zone]'); return z ? { zone: z.getAttribute('data-record-zone'), text: z.innerText.replace(/\\s+/g, ' ').trim() } : null })()`)
const summaryMostly = await ev(`document.querySelector('[data-record-card] [data-heart-zones]')?.getAttribute('data-heart-zones') ?? null`)
check('B7. with the strap\'s heart rate, End says "Mostly zone N" and N is the zone the summary\'s chart says', /^Mostly zone [1-5] · /.test(zoneShown?.text ?? '') && zoneShown?.zone === summaryMostly, { zoneShown, summaryMostly })
check('B8. ...and asks no Easy / Steady / Hard', !/How hard was it\?/.test((await cardText()) ?? '') && (await ev(`document.querySelectorAll('[data-record-card] [role="radiogroup"]').length`)) === 0, await cardText())
await shoot('record-activity-5-estimate')
await clickAt(`document.querySelector('[data-record-discard]')`)
await until(card, v => v === 'idle', 20)
check('B6. Throw it away: back to idle, nothing logged', (await card()) === 'idle' && !(await ev(`!!document.querySelector('[data-record-logged]')`)))

console.log('\n  E. A WALK WITH A STRAP: ONE TAP LOGS IT IN ITS ZONE')
await openExercise('&health=android&healthmissing=1&strap=1&strappaired=1')
await ev(`window.__strapConnect()`); await wait(300)
await clickAt(`document.querySelector('[data-record-start="walk"]')`)
await until(card, v => v === 'recording', 20)
for (const bpm of [128, 134, 140, 146, 150]) { await ev(`window.__strapSend(${bpm})`); await wait(1100) }
await clickAt(`document.querySelector('[data-record-end]')`)
await until(() => ev(`!!document.querySelector('[data-record-log]')`), v => v === true, 40)
const ez = await ev(`document.querySelector('[data-record-zone]')?.getAttribute('data-record-zone') ?? null`)
await clickAt(`document.querySelector('[data-record-log]')`)
await until(card, v => v === 'idle', 20)
const zLine = await ev(`document.querySelector('[data-record-logged]')?.textContent ?? null`)
check('E1. "Log walk" logs it, and the line names the zone, not a word: "Walk · 1 min · Zone N"', ez != null && (zLine ?? '').match(/Walk · \d+ min · Zone ([1-5])\b/)?.[1] === ez && !/Easy|Steady|Hard/.test(zLine ?? ''), { ez, zLine })
// The walk with a heart rate is the one row that has one (A's walk had none): its effort, read off the kept log.
const keptRpe = await ev(`(() => { const rows = []; for (const k of ['fitplan_cardio_lastknown_v1', 'fitplan_cardio_pending_v1']) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if ('intensity_rpe' in x || 'intensityRpe' in x) rows.push(x); else Object.values(x).forEach(walk) } }; walk(v) } catch {} } const r = rows.find(x => (x.activity_name ?? x.activityName) === 'Walk' && Number(x.avg_heart_rate ?? x.avgHeartRate) > 0); return r ? Number(r.intensity_rpe ?? r.intensityRpe) : null })()`)
check('E2. ...and the effort kept is the zone\'s own word (zones 1-2 Easy, 3 Steady, 4-5 Hard)', ez != null && keptRpe === ({ 1: 3, 2: 3, 3: 5, 4: 7, 5: 7 })[ez], { ez, keptRpe })
await shoot('record-activity-6-zone-logged')

console.log('\n  C. A WATCH THAT HAS NOT SYNCED, AND CANCEL')
await openExercise('&clear-storage=1&health=android&healthkcal=0&healthsteps=0')
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
