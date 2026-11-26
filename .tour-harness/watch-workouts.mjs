// verify:watch-workouts — WORKOUTS THE WATCH RECORDED (his brief 26 Nov 2026; src/lib/watch-workouts.ts,
// src/components/WatchWorkoutsCard.tsx), on the whole app at phone size.
//
// The phone's health store is pretended (fake-health.ts): a 42 minute run the watch recorded 90 minutes ago, and a
// 3 minute walk that is too short to count. What this proves is the app's half: with the switch off nothing is read
// and nothing is drawn; with it on, Home offers the run with the watch's own figures; nothing is logged until an
// effort is tapped; one tap logs it with its true start; it is not offered again; "Not mine" puts one away for good;
// Profile holds the switch. It cannot prove a real watch writes what the pretend one does.
import { startDriver } from './driver-kit.mjs'

const A = await startDriver({ port: 9986, page: 'app-boot.html', name: 'watch-workouts', timeoutMs: 300_000 })
const { send, ev, check, wait, go, until, shoot, clickAt, finish } = A
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const card = () => ev(`document.querySelector('[data-watch-card]')?.getAttribute('data-watch-card') ?? null`)
const cardText = () => ev(`document.querySelector('[data-watch-card]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`)
const offerId = () => ev(`document.querySelector('[data-watch-offer]')?.getAttribute('data-watch-offer') ?? null`)
const calls = () => ev(`JSON.stringify(window.__healthCalls ?? [])`)
const rows = () => ev(`JSON.stringify((window.__fakeDb?.cardio_logs ?? []).map(r => ({ name: r.activity_name, min: r.duration_minutes, km: r.distance_km ?? null, kcal: r.active_kcal ?? null, est: r.kcal_estimated ?? null, steps: r.steps ?? null, started: r.started_at ?? null, date: r.date, rpe: r.intensity_rpe })))`)
const openHome = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
  await wait(1200)
  if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(400) }
}

console.log('\n  A. THE SWITCH IS OFF: NOTHING IS READ, NOTHING IS DRAWN')
await openHome('&clear-storage=1&health=android')
check('A1. Home has no "From your watch" card', (await card()) === null, await card())
check('A2. the phone was not asked about workouts', !/workouts/.test((await calls()) ?? ''), await calls())

console.log('\n  B. THE SWITCH IS ON: THE RUN IS OFFERED, WITH THE WATCH\'S OWN FIGURES')
// NO clear-storage from here on: the page wipes storage AFTER the pretend phone has written the switch.
await openHome('&health=android&workoutson=1')
await until(card, v => v === 'offer', 60)
const before = JSON.parse((await rows()) ?? '[]')
check('B1. Home offers it: "From your watch"', (await card()) === 'offer' && /From your watch/i.test((await cardText()) ?? ''), await cardText())
check('B2. the watch\'s figures: "Run · 42 min · 5.2 km · 410 kcal"', /Run · 42 min · 5\.2 km · 410 kcal/.test((await cardText()) ?? ''), await cardText())
check('B3. when it was and what recorded it: "Today, HH:MM · Samsung Health"', /Today, \d\d:\d\d · Samsung Health/.test((await ev(`document.querySelector('[data-watch-when]')?.textContent ?? ''`)) ?? ''), await ev(`document.querySelector('[data-watch-when]')?.textContent ?? ''`))
check('B4. the 3 minute walk is not offered (one offer, and no "more after this")', (await offerId()) === 'w-run' && (await ev(`!!document.querySelector('[data-watch-more]')`)) === false)
check('B5. effort is asked and nothing is picked for him', /How hard was it\?/.test((await cardText()) ?? '') && (await ev(`[...document.querySelectorAll('[data-watch-card] [role="radiogroup"] button')].filter(b => b.getAttribute('aria-checked') === 'true').length`)) === 0)
check('B6. NOTHING IS LOGGED BY BEING OFFERED', before.filter(r => r.name === 'Run').length === 0, before)
const inView = await ev(`(() => { const n = document.querySelector('[data-watch-card]'); n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth })()`)
check('B7. the whole card fits on a phone screen', inView === true)
await shoot('watch-workouts-1-offer')

await clickAt(`[...document.querySelectorAll('[data-watch-card] [role="radiogroup"] button')].find(b => /Steady/.test(b.textContent))`)
await until(card, v => v === 'logged', 40)
const logged = await ev(`document.querySelector('[data-watch-logged]')?.textContent ?? null`)
check('B8. one tap logs it and the card says what was logged', /Run · 42 min · Steady · 5\.2 km · 6,400 steps · 410 kcal/.test(logged ?? ''), logged)
check('B9. ...with the heart rate the phone held for that time', /♥ \d+ avg · \d+ max/.test(logged ?? ''), logged)
await until(() => rows(), v => /"name":"Run"/.test(v ?? ''), 40)
const after = JSON.parse((await rows()) ?? '[]').filter(r => r.name === 'Run')
check('B10. ONE row was saved, the watch\'s calories not an estimate', after.length === 1 && after[0].min === 42 && after[0].km === 5.2 && after[0].kcal === 410 && after[0].est === false && after[0].steps === 6400, after)
const startedAgo = after[0]?.started ? Math.round((Date.parse(JSON.parse(await ev(`JSON.stringify(new Date(window.__healthCalls.filter(c => c && c.workouts).slice(-1)[0].workouts[1]))`))) - Date.parse(after[0].started)) / 60000) : null
check('B11. ...kept at the watch\'s own start (132 minutes before the read), not at the tap', startedAgo === 132, startedAgo)
check('B12. Home\'s own line under today\'s card shows it', /Run/.test((await ev(`document.querySelector('[data-testid="home-cardio-today"]')?.textContent ?? ''`)) ?? ''), await ev(`document.querySelector('[data-testid="home-cardio-today"]')?.textContent ?? ''`))
await shoot('watch-workouts-2-logged')

// The app comes back to the front (the watch syncs, he reopens it): the same run must not come back.
await ev(`document.dispatchEvent(new Event('visibilitychange'))`)
await wait(1500)
check('B13. read again, the run it now holds is NOT offered a second time', (await offerId()) === null && JSON.parse((await rows()) ?? '[]').filter(r => r.name === 'Run').length === 1, { offer: await offerId() })

console.log('\n  C. TWO WORKOUTS: "NOT MINE" PUTS ONE AWAY FOR GOOD; STRENGTH SAYS WHAT IT KEEPS')
await ev(`localStorage.removeItem('fitplan_watch_workouts_dismissed')`)
await openHome('&health=android&workoutson=1&healthworkouts=two')
await until(card, v => v === 'offer', 60)
check('C1. the newest first, and "1 more after this"', (await offerId()) === 'w-run' && /1 more after this/.test((await ev(`document.querySelector('[data-watch-more]')?.textContent ?? ''`)) ?? ''), await cardText())
await clickAt(`document.querySelector('[data-watch-dismiss]')`)
await until(offerId, v => v === 'w-lift', 20)
check('C2. "Not mine": the next one is offered, "Strength training · 55 min"', (await offerId()) === 'w-lift' && /Strength training · 55 min/.test((await cardText()) ?? ''), await cardText())
check('C3. ...with no distance or calories invented for it', !/km|kcal/.test((await ev(`document.querySelector('[data-watch-offer]')?.textContent ?? ''`)) ?? ''), await ev(`document.querySelector('[data-watch-offer]')?.textContent ?? ''`))
check('C4. ...and it says what a watch log keeps and where the exercises go', /This logs the time and your heart rate\..*Log a workout you did/.test((await ev(`document.querySelector('[data-watch-strength]')?.textContent ?? ''`)) ?? ''))
await shoot('watch-workouts-3-strength')
check('C5. nothing was logged by dismissing', JSON.parse((await rows()) ?? '[]').filter(r => r.name === 'Run' || r.name === 'Strength training').length === 0)
const small = await ev(`[...document.querySelectorAll('[data-watch-card] button')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent)`)
check('C6. every button on the card is at least 44px tall', Array.isArray(small) && small.length === 0, small)
// The app closed and opened again (same phone, nothing cleared): the dismissed run stays away.
await openHome('&health=android&workoutson=1&healthworkouts=two')
await until(card, v => v === 'offer', 60)
check('C7. after the app is reopened the dismissed run is still gone', (await offerId()) === 'w-lift' && (await ev(`!!document.querySelector('[data-watch-more]')`)) === false, await offerId())

console.log('\n  D. NOTHING ON THE WATCH: NO CARD')
await openHome('&health=android&workoutson=1&healthworkouts=none')
await wait(1500)
check('D1. the watch holds nothing: Home draws no card', (await card()) === null)
check('D2. ...though it did ask the phone', /"workouts":\[/.test((await calls()) ?? ''))
const tx = await ev(`document.body.innerText`)
check('D3. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(tx ?? ''))

console.log('\n  E. PROFILE HOLDS THE SWITCH')
await ev(`localStorage.removeItem('fitplan_health_workouts_connected')`)
// Profile has its own test page (the whole-app page has no gear); same server, same pretend phone.
await send('Page.navigate', { url: `${A.origin}/.tour-harness/profile.html?load=p1&health=android` })
await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true, 120)
await wait(800)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(400) }
await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-profile-row="Steps from your phone"]')`), v => v === true, 60)
await ev(`document.querySelector('[data-profile-row="Steps from your phone"]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-health-workouts]')`), v => v === true, 40)
const sw = () => ev(`document.querySelector('[data-health-workouts]')?.getAttribute('data-health-workouts') ?? null`)
check('E1. "Workouts from your watch" is on Profile, off until he taps', (await sw()) === 'off' && /Workouts from your watch/.test((await ev(`document.querySelector('[data-health-workouts]')?.textContent ?? ''`)) ?? ''))
check('E2. it says what it reads and that it writes nothing', /It reads workouts and writes nothing/.test((await ev(`document.querySelector('[data-health-workouts]')?.textContent ?? ''`)) ?? ''))
check('E3. nothing was asked of the phone before the tap', !/"workouts"/.test((await calls()) ?? ''))
await ev(`document.querySelector('[data-workouts-connect]')?.scrollIntoView({ block: 'center' })`)
await clickAt(`document.querySelector('[data-workouts-connect]')`)
await until(sw, v => v === 'on', 30)
check('E4. one tap asks the phone for workouts (read) and switches it on', (await sw()) === 'on' && /"request":\["workouts","distance","calories","heartRate","steps"\]/.test((await calls()) ?? ''), await calls())
check('E5. ...and it now says nothing is logged until he says how hard it was', /Nothing is logged until you say how hard it was/.test((await ev(`document.querySelector('[data-health-workouts]')?.textContent ?? ''`)) ?? ''))
await shoot('watch-workouts-4-profile')
await clickAt(`document.querySelector('[data-workouts-off]')`)
await until(sw, v => v === 'off', 20)
check('E6. and one tap switches it off again', (await sw()) === 'off')

await finish('verify:watch-workouts passed: off reads nothing, on offers the watch\'s run, one tap logs it once, Not mine stays away.')
