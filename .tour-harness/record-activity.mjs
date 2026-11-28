// verify:record-activity — A CARDIO WORKOUT, STARTED FROM EXERCISE (his words 27 Nov 2026: "going to exercise, clicking
// start workout, choosing a workout, i.e. walk, jog, run, hill sprints, assault bike etc. and pressing start and it
// picks up the steps or heart rate or both depending on which suits"; the recorder itself is his 25 Nov request).
// src/components/exercise/OwnWorkoutDay.tsx, src/components/RecordActivityCard.tsx, src/lib/activity-recording.ts,
// src/lib/cardio-kinds.ts. On the whole app at phone size.
//
// The phone's health store (fake-health.ts) and the strap (fake-strap.ts) are pretended. What this proves is the app's
// half: the recorder is on Exercise's own Start and no longer on Tools; he picks a kind and presses Start; the clock
// runs and survives a reload; End reads the phone for the window; a walk shows steps and distance and an Assault Bike
// shows neither, though the phone holds steps for that time; one effort tap logs it under the name he picked and the
// summary stays; "Something else" takes his own name; Cancel asks first. It cannot prove a real watch on a real phone.
//
// Every check runs every time with a null-safe subject. PORT 9981.
import { startDriver } from './driver-kit.mjs'

const A = await startDriver({ port: 9981, page: 'app-boot.html', name: 'record-activity', timeoutMs: 300_000 })
const { ev, check, wait, go, until, shoot, clickAt, finish } = A
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const card = () => ev(`document.querySelector('[data-record-card]')?.getAttribute('data-record-card') ?? null`)
const cardText = () => ev(`document.querySelector('[data-record-card]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`)
const figure = k => ev(`document.querySelector('[data-record-card] [data-figure="${k}"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`)
const rows = () => ev(`JSON.stringify((window.__fakeDb?.cardio_logs ?? []).map(r => ({ name: r.activity_name, min: r.duration_minutes, km: r.distance_km ?? null, kcal: r.active_kcal ?? null, est: r.kcal_estimated ?? null, steps: r.steps ?? null, started: r.started_at ?? null, rpe: r.intensity_rpe })))`).then(x => JSON.parse(x ?? '[]'))
const calls = () => ev(`JSON.stringify(window.__healthCalls ?? [])`)
const boot = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
  await wait(1000)
  if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(400) }
}
const openExercise = async query => {
  await boot(query)
  await ev(`location.hash = '#/tab/exercise'`)
  await until(() => ev(`!!document.querySelector('[data-testid="own-day"]')`), v => v === true, 80)
  await wait(400)
}
const openChooser = async () => {
  await ev(`document.querySelector('[data-testid="own-start"]')?.scrollIntoView({ block: 'center' })`)
  await clickAt(`document.querySelector('[data-testid="own-start"]')`)
  await until(() => ev(`!!document.querySelector('[data-testid="own-choose-cardio"]')`), v => v === true, 30)
}
const pick = async activity => { await clickAt(`document.querySelector('[data-cardio-kind="${activity}"]')`); await wait(250) }
const startBtn = () => ev(`(() => { const b = document.querySelector('[data-testid="own-cardio-start"]'); return b ? { text: b.innerText.trim(), disabled: b.disabled } : null })()`)

console.log('\n  Z. IT IS NO LONGER ON TOOLS')
await boot('&clear-storage=1&health=android')
await ev(`location.hash = '#/tab/tools'`)
await wait(1500)
check('Z1. Tools has no "Record a walk or run" and no recording card', (await card()) === null && !/Record a walk or run|Start walk|Start run/.test((await ev(`document.body.innerText`)) ?? ''))

console.log('\n  A. A WALK, WITH A WATCH: EXERCISE, START, PICK IT, START')
await openExercise('&health=android')
check('A1. Exercise has no recording card until one is started', (await card()) === null)
await openChooser()
const kinds = await ev(`[...document.querySelectorAll('[data-cardio-kind]')].map(b => b.innerText.trim())`)
check('A2. Start offers the cardio he can do: walk, jog, run, hill sprints, assault bike and the rest, and "Something else"', Array.isArray(kinds) && ['Walk', 'Jog', 'Run', 'Hill sprints', 'Assault bike', 'Rower', 'Something else'].every(k => kinds.includes(k)), kinds)
check('A3. ...with the weights choices still under them (Empty workout)', (await ev(`!!document.querySelector('[data-testid="own-choose-empty"]')`)) === true)
check('A4. nothing is picked for him and there is no Start until he picks', (await startBtn()) === null && (await ev(`[...document.querySelectorAll('[data-cardio-kind]')].filter(b => b.getAttribute('aria-checked') === 'true').length`)) === 0)
await ev(`document.querySelector('[data-testid="own-choose-cardio"]').scrollIntoView({ block: 'start' })`)
await wait(250)
await shoot('record-activity-1-chooser')
await pick('Walk')
check('A5. he picks Walk: the button says "Start Walk"', (await startBtn())?.text === 'Start Walk' && (await startBtn())?.disabled === false, await startBtn())
check('A6. nothing was asked of the phone before Start', !/"request":\["steps","distance"/.test((await calls()) ?? ''))
await clickAt(`document.querySelector('[data-testid="own-cardio-start"]')`)
await until(card, v => v === 'recording', 30)
check('A7. Start: "Recording", the name as the headline, a running clock', (await card()) === 'recording' && /^Recording/i.test((await cardText()) ?? '') && (await ev(`document.querySelector('[data-record-title]')?.innerText.trim()`)) === 'Walk', await cardText())
const c1 = await ev(`document.querySelector('[data-record-clock]')?.textContent ?? null`)
await wait(2200)
const c2 = await ev(`document.querySelector('[data-record-clock]')?.textContent ?? null`)
check('A8. the clock moves', /^\d+:\d\d$/.test(c1 ?? '') && c1 !== c2, { c1, c2 })
check('A9. the first Start asked the phone for steps, distance, calories and heart rate', /"request":\["steps","distance","calories","heartRate"\]/.test((await calls()) ?? ''))
const what = () => ev(`document.querySelector('[data-record-what]')?.textContent ?? ''`)
// HIS PHONE TEST, 27 Nov 2026: "While the exercise is running I should be able to see my heart rate and the zone and
// steps if applicable." No strap is paired here, so heart rate cannot be live, and the card says how it can be.
check('A10. no strap: it says how to get live heart rate, and that the watch\'s fills in when it syncs', /Pair your strap for live heart rate: Profile, Steps from your phone, Heart rate strap\. Your watch’s heart rate fills in when it syncs\./.test((await what()) ?? ''), await what())
check('A10b. ...the live heart tile shows a dash, never a number it does not have', (await ev(`document.querySelector('[data-record-live-heart]')?.textContent.trim() ?? null`)) === '–')
check('A10c. steps count live while the phone is on him (the phone\'s own counter was started)', /Steps count live while the phone is on you\./.test((await what()) ?? '') && /"stepCounter":"start"/.test((await calls()) ?? ''), await what())
await ev(`window.__stepsSend(250)`); await wait(200); await ev(`window.__stepsSend(187)`); await wait(400)
check('A10d. he walks 437 steps: the card shows 437 as he goes', (await ev(`document.querySelector('[data-record-live-steps]')?.textContent.trim() ?? null`)) === '437', await ev(`document.querySelector('[data-record-live]')?.innerText ?? null`))
await shoot('record-activity-2b-live-steps')
const where = await ev(`(() => { const c = document.querySelector('[data-record-card]'), o = document.querySelector('[data-testid="own-day"]'); if (!c || !o) return null; return { above: !!(c.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING), top: Math.round(c.getBoundingClientRect().top), bottom: Math.round(c.getBoundingClientRect().bottom), vh: innerHeight } })()`)
check('A10a. the workout is at the TOP of Exercise, above the day, and in sight straight after Start (End is never a scroll away)', where && where.above === true && where.top >= 0 && where.bottom <= where.vh, where)
check('A11. the chooser has closed, and the day still offers a separate workout under it', (await ev(`!!document.querySelector('[data-testid="own-chooser"]')`)) === false && (await ev(`!!document.querySelector('[data-testid="own-start"]')`)) === true)
await ev(`document.querySelector('[data-record-card]').scrollIntoView({ block: 'center' })`)
await shoot('record-activity-2-recording')

// THE APP CLOSED MID-WALK: a reload keeps the recording, on Exercise where it was started.
await openExercise('&health=android')
await until(card, v => v != null, 60)
check('A12. the app reloaded mid-walk: still recording, on Exercise', (await card()) === 'recording', await card())
// The page started again: no Start was tapped this time, so the card itself must start the counter again.
await wait(500)
await ev(`window.__stepsSend(63)`); await wait(500)
check('A12a. ...and still counting: 63 more steps after the reload show (500)', (await ev(`document.querySelector('[data-record-live-steps]')?.textContent.trim() ?? null`)) === '500', await ev(`document.querySelector('[data-record-live]')?.innerText ?? null`))
// HIS REPORT 28 NOV 2026, "The watch and phone steps disagree with each other": with the watch app recording this
// walk, the card shows the watch's count and says so, never the phone's own sensor beside it.
await ev(`window.__watchCardio(2138, 1802)`); await wait(400)
check('A12b. the watch app sends its count: the card shows the watch\'s 2,138, not the phone\'s 500', (await ev(`document.querySelector('[data-record-live-steps]')?.textContent.trim() ?? null`)) === '2,138', await ev(`document.querySelector('[data-record-live]')?.innerText ?? null`))
check('A12c. ...and says where the steps come from', /Steps live from your watch\./.test((await what()) ?? '') && !/Steps count live while the phone is on you/.test((await what()) ?? ''), await what())
await ev(`window.__stepsSend(40)`); await wait(400)
check('A12d. ...and the phone\'s own sensor moving does not take the tile back', (await ev(`document.querySelector('[data-record-live-steps]')?.textContent.trim() ?? null`)) === '2,138')
await shoot('record-activity-2b-watch-steps')
await openChooser()
check('A13. with one recording, the chooser offers no second cardio to start', (await ev(`!!document.querySelector('[data-testid="own-choose-cardio"]')`)) === true ? false : true)
await clickAt(`document.querySelector('[data-testid="own-chooser-cancel"]')`)

await ev(`document.querySelector('[data-record-end]').scrollIntoView({ block: 'center' })`)
await clickAt(`document.querySelector('[data-record-end]')`)
await until(card, v => v === 'ended', 20)
await until(() => ev(`!!document.querySelector('[data-record-figures] [data-figure="time"]')`), v => v === true, 40)
// The watch app recorded this walk (A12b), so its steps and distance are the walk's over the phone's 6,400 and 3.84 km
// (his report 28 Nov 2026, "The watch and phone steps disagree"); the phone-only path is held by test:recorded-activity.
check('A14. End shows the WATCH\'s steps, over the 6,400 the phone read: 2,138', /^2,138 steps$/i.test((await figure('steps')) ?? ''), await figure('steps'))
check('A15. ...and its distance: 1.8 km, and says they are the watch\'s', (await ev(`!!document.querySelector('[data-record-steps-watch]')`)) === true && /^1\.8 km distance$/i.test((await figure('distance')) ?? ''), await figure('distance'))
check('A16. ...and the watch\'s calories, not an estimate: 300 kcal', /^300 kcal active$/i.test((await figure('kcal')) ?? '') && (await ev(`!!document.querySelector('[data-record-estimate]')`)) === false, await figure('kcal'))
const windows = JSON.parse((await ev(`JSON.stringify((window.__healthCalls ?? []).filter(c => c && c.kcal))`)) ?? '[]')
check('A17. the phone was asked for the window from Start to End', windows.length >= 1 && Date.parse(windows[0].kcal[1]) - Date.parse(windows[0].kcal[0]) >= 2000, windows)
check('A18. effort is asked, nothing picked for him', /How hard was it\?/.test((await cardText()) ?? '') && (await ev(`[...document.querySelectorAll('[data-record-card] [role="radiogroup"] button')].filter(b => b.getAttribute('aria-checked') === 'true').length`)) === 0)
check('A18a. ...because this walk has no heart rate: no zone is offered in its place (his 26 Nov "Keep Easy/Steady/Hard")', (await ev(`!!document.querySelector('[data-record-zone]')`)) === false && (await ev(`!!document.querySelector('[data-record-log]')`)) === false)
check('A19. nothing is logged by ending it', (await rows()).filter(r => r.name === 'Walk').length === 0)
await ev(`document.querySelector('[data-record-card]').scrollIntoView({ block: 'start' })`)
await shoot('record-activity-3-ended')
await ev(`document.querySelector('[data-record-card] [role="radiogroup"]').scrollIntoView({ block: 'center' })`)
await clickAt(`[...document.querySelectorAll('[data-record-card] [role="radiogroup"] button')].find(b => /Steady/.test(b.textContent))`)
await until(card, v => v === 'logged', 20)
const saved = (await rows()).filter(r => r.name === 'Walk')
check('A20. one tap logs it: ONE row, called Walk, with its steps, distance, the watch\'s calories and its true start', saved.length === 1 && saved[0].steps === 2138 && saved[0].km === 1.8 && saved[0].kcal === 300 && saved[0].est === false && !!saved[0].started && saved[0].rpe === 5, saved)
const onCard = await ev(`(() => { const n = document.querySelector('[data-record-logged]'); if (!n) return null; const r = n.getBoundingClientRect(); return { text: n.textContent, inView: r.top >= 0 && r.bottom <= innerHeight } })()`)
check('A21. the card stays as the summary and says so, on screen where he tapped: "Logged · felt Steady"', /Logged · felt Steady\. It’s on your week and the coach can see it\./.test(onCard?.text ?? '') && onCard?.inView === true && /^2,138 steps$/i.test((await figure('steps')) ?? ''), onCard)
await ev(`document.querySelector('[data-record-card]').scrollIntoView({ block: 'start' })`)
await shoot('record-activity-4-logged')
await ev(`document.querySelector('[data-record-done]').scrollIntoView({ block: 'center' })`)
await clickAt(`document.querySelector('[data-record-done]')`)
await wait(400)
check('A22. Done puts the summary away', (await card()) === null)
check('A23. ...and the walk is on the day (the page names it)', /Walk/.test((await ev(`document.body.innerText`)) ?? ''))

console.log('\n  B. AN ASSAULT BIKE WITH A STRAP: HEART RATE AND CALORIES, NO STEPS, THOUGH THE PHONE HOLDS STEPS')
// NO clear-storage here: the page wipes storage after the pretend strap has written its pairing. The watch has no
// calories for the window (healthkcal=0), so they are an estimate; the phone DOES hold 6,400 steps for it.
await openExercise('&health=android&healthkcal=0&strap=1&strappaired=1')
await ev(`window.__strapConnect()`); await wait(300)
await openChooser()
await pick('Assault Bike')
check('B1. he picks Assault bike: "Start Assault Bike"', (await startBtn())?.text === 'Start Assault Bike', await startBtn())
await clickAt(`document.querySelector('[data-testid="own-cardio-start"]')`)
await until(card, v => v === 'recording', 30)
check('B2. it says what suits a bike: calories from the watch or strap, and nothing of steps (no steps tile)', /Calories come from your watch or strap when you end it\./.test((await ev(`document.querySelector('[data-record-what]')?.textContent ?? ''`)) ?? '') && (await ev(`!!document.querySelector('[data-record-live-steps]')`)) === false && !/steps/i.test((await ev(`document.querySelector('[data-record-what]')?.textContent ?? ''`)) ?? ''))
// Ten readings about four seconds apart, averaging 140 and peaking at 150. Long enough for a zone to hold half a
// minute (heartZones charts nothing for a session of a few seconds), which is what the zone and its Log button need.
for (const bpm of [128, 134, 136, 138, 140, 142, 144, 146, 142, 150]) { await ev(`window.__strapSend(${bpm})`); await wait(4200) }
check('B3. the strap\'s live heart rate shows on the recording card', (await ev(`document.querySelector('[data-record-card] [data-live-heart]')?.getAttribute('data-live-heart') ?? null`)) === '150')
// Age 30 on this profile: an estimated top of 187, so 150 is 80% of it, zone 4, as the summary would say.
check('B3a. ...WITH its zone: "150 · Zone 4" (his 27 Nov "my heart rate and the zone")', (await ev(`document.querySelector('[data-record-live-heart] [data-live-zone]')?.getAttribute('data-live-zone') ?? null`)) === '4' && /150\s*·\s*Zone 4/.test((await ev(`document.querySelector('[data-record-live-heart]')?.innerText ?? ''`)) ?? ''), await ev(`document.querySelector('[data-record-live-heart]')?.innerText ?? null`))
check('B3b. ...and it says the heart rate is live from the strap', /Heart rate live from your strap\./.test((await ev(`document.querySelector('[data-record-what]')?.textContent ?? ''`)) ?? ''))
await ev(`document.querySelector('[data-record-card]').scrollIntoView({ block: 'start' })`)
await shoot('record-activity-4b-live-zone')
await ev(`document.querySelector('[data-record-end]').scrollIntoView({ block: 'center' })`)
await clickAt(`document.querySelector('[data-record-end]')`)
await until(() => ev(`!!document.querySelector('[data-record-figures] [data-figure="time"]')`), v => v === true, 40)
const kcal = await figure('kcal')
check('B4. calories are an estimate, printed with "≈" and labelled an estimate', /^≈\d+ kcal estimate$/i.test(kcal ?? ''), kcal)
check('B5. ...and the card says it is an estimate from heart rate', /estimate from your heart rate/.test((await ev(`document.querySelector('[data-record-estimate]')?.textContent ?? ''`)) ?? ''))
check('B6. the heart rate is the strap\'s: average 140, highest 150', /^140 bpm average$/i.test((await figure('avg-heart')) ?? '') && /^150 bpm highest$/i.test((await figure('max-heart')) ?? ''), [await figure('avg-heart'), await figure('max-heart')])
const strapChart = await ev(`(() => { const c = document.querySelector('[data-record-card] [data-heart-chart]'); return c ? { pts: c.querySelector('[data-heart-chart-line]')?.getAttribute('points')?.trim().split(/\\s+/).length ?? 0, read: c.querySelector('[data-heart-chart-read]')?.textContent ?? '' } : null })()`)
check('B7. ...and drawn as a graph from the strap\'s own readings (128 to 150)', strapChart && strapChart.pts >= 3 && strapChart.read === '128–150 bpm', strapChart)
check('B8. NO steps, distance or pace on a bike, though the phone holds 6,400 steps for that time', (await figure('steps')) === null && (await figure('distance')) === null && (await figure('pace')) === null, [await figure('steps'), await figure('distance')])
check('B9. ...and it does not say steps are still to come', !/steps/.test((await ev(`document.querySelector('[data-record-waiting]')?.textContent ?? ''`)) ?? ''))
await ev(`document.querySelector('[data-record-card]').scrollIntoView({ block: 'start' })`)
await shoot('record-activity-5-bike')
// HIS 26 NOV "why is it still easy steady or hard, it should be 5 heart rate zones": with a heart rate, End names the
// zone he spent longest in and asks no effort; one Log tap saves it.
await until(() => ev(`!!document.querySelector('[data-record-log]')`), v => v === true, 40)
const zoneShown = await ev(`(() => { const z = document.querySelector('[data-record-zone]'); return z ? { zone: z.getAttribute('data-record-zone'), text: z.innerText.replace(/\\s+/g, ' ').trim() } : null })()`)
const summaryMostly = await ev(`document.querySelector('[data-record-card] [data-heart-zones]')?.getAttribute('data-heart-zones') ?? null`)
check('B9a. with the strap\'s heart rate, End says "Mostly zone N" and N is the zone the summary\'s chart says', /^Mostly zone [1-5] · /.test(zoneShown?.text ?? '') && zoneShown?.zone != null && zoneShown.zone === summaryMostly, { zoneShown, summaryMostly })
check('B9b. ...with one button, "Log assault bike", and no Easy / Steady / Hard', /Log assault bike$/.test(zoneShown?.text ?? '') && !/How hard was it\?/.test((await cardText()) ?? '') && (await ev(`document.querySelectorAll('[data-record-card] [role="radiogroup"]').length`)) === 0, zoneShown)
check('B9c. nothing is logged until he taps it', (await rows()).filter(r => r.name === 'Assault Bike').length === 0)
await ev(`document.querySelector('[data-record-log]').scrollIntoView({ block: 'center' })`)
await shoot('record-activity-5b-zone')
await clickAt(`document.querySelector('[data-record-log]')`)
await until(card, v => v === 'logged', 20)
const bike = (await rows()).filter(r => r.name === 'Assault Bike')
const ez = zoneShown?.zone ?? null
check('B9d. the effort kept is the zone\'s own word (zones 1-2 Easy, 3 Steady, 4-5 Hard)', ez != null && bike.length === 1 && bike[0].rpe === ({ 1: 3, 2: 3, 3: 5, 4: 7, 5: 7 })[ez], { ez, rpe: bike[0]?.rpe })
const zLine = await ev(`document.querySelector('[data-record-logged]')?.textContent ?? null`)
check('B9e. ...and the logged line names the zone, not a word: "Logged · mostly zone N"', ez != null && (zLine ?? '').match(/Logged · mostly zone ([1-5])\./)?.[1] === ez && !/felt/.test(zLine ?? ''), { ez, zLine })
check('B10. logged under the name he picked, with NO steps and NO distance saved, calories marked an estimate', bike.length === 1 && bike[0].steps === null && bike[0].km === null && bike[0].est === true && bike[0].kcal > 0, bike)
await clickAt(`document.querySelector('[data-record-done]')`)
await wait(300)

console.log('\n  C. SOMETHING ELSE, BY HIS OWN NAME; CANCEL ASKS FIRST')
await openChooser()
await pick('other')
check('C1. "Something else" asks its name, and Start waits for one', (await ev(`!!document.querySelector('[data-testid="own-cardio-name"]')`)) === true && (await startBtn())?.disabled === true, await startBtn())
await ev(`(() => { const el = document.querySelector('[data-testid="own-cardio-name"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'football'); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await wait(250)
check('C2. he types "football": "Start Football"', (await startBtn())?.text === 'Start Football' && (await startBtn())?.disabled === false, await startBtn())
await clickAt(`document.querySelector('[data-testid="own-cardio-start"]')`)
await until(card, v => v === 'recording', 30)
check('C3. it records under his name', (await ev(`document.querySelector('[data-record-title]')?.innerText.trim()`)) === 'Football')
// The card brings itself into sight with a smooth scroll just after Start: tap once the page has stopped moving.
await wait(1200)
await ev(`document.querySelector('[data-record-cancel]').scrollIntoView({ block: 'center' })`)
await wait(300)
await clickAt(`document.querySelector('[data-record-cancel]')`)
await wait(300)
check('C4. Cancel asks before throwing anything away', (await card()) === 'recording' && /Throw this football away\? Nothing is logged\./.test((await cardText()) ?? ''), await cardText())
await clickAt(`document.querySelector('[data-record-cancel-yes]')`)
await until(card, v => v === null, 20)
check('C5. ...and on yes it is gone, nothing logged', (await card()) === null && (await rows()).filter(r => r.name === 'Football').length === 0)

console.log('\n  D. A WATCH THAT HAS NOT SYNCED; KEEP GOING')
await openExercise('&clear-storage=1&health=android&healthkcal=0&healthsteps=0&healthheart=none&stepcounter=denied')
await openChooser()
await pick('Run')
await clickAt(`document.querySelector('[data-testid="own-cardio-start"]')`)
await until(card, v => v === 'recording', 30)
await wait(500)
check('D0. "Physical activity" refused: the running card says where to allow it, and that steps come from the watch', /Steps need "Physical activity" allowed for this app in your phone’s settings; they fill in from your watch when it syncs\./.test((await ev(`document.querySelector('[data-record-what]')?.textContent ?? ''`)) ?? ''), await ev(`document.querySelector('[data-record-what]')?.textContent ?? null`))
await ev(`document.querySelector('[data-record-end]').scrollIntoView({ block: 'center' })`)
await clickAt(`document.querySelector('[data-record-end]')`)
await until(() => ev(`!!document.querySelector('[data-record-figures] [data-figure="time"]')`), v => v === true, 40)
check('D1. no steps, heart rate or calories yet for a run: it says they fill in when the watch syncs', /No steps, heart rate or calories on your phone for this yet\. If your watch syncs later, they fill in on their own\./.test((await ev(`document.querySelector('[data-record-waiting]')?.textContent ?? ''`)) ?? ''))
const small = await ev(`[...document.querySelectorAll('[data-record-card] button')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent)`)
check('D2. every button on the card is at least 44px tall', Array.isArray(small) && small.length === 0, small)
await ev(`document.querySelector('[data-record-resume]').scrollIntoView({ block: 'center' })`)
await clickAt(`document.querySelector('[data-record-resume]')`)
await until(card, v => v === 'recording', 20)
check('D3. Keep going takes End back', (await card()) === 'recording')
// He logs it with no heart rate: the logged card says the watch's heart rate fills in when it syncs (his point 3).
await ev(`document.querySelector('[data-record-end]').scrollIntoView({ block: 'center' })`)
await clickAt(`document.querySelector('[data-record-end]')`)
await until(() => ev(`!!document.querySelector('[data-record-card] [role="radiogroup"]')`), v => v === true, 40)
await ev(`document.querySelector('[data-record-card] [role="radiogroup"]').scrollIntoView({ block: 'center' })`)
await clickAt(`[...document.querySelectorAll('[data-record-card] [role="radiogroup"] button')].find(b => /Easy/.test(b.textContent))`)
await until(card, v => v === 'logged', 20)
check('D5. logged with no heart rate: "Heart rate fills in when your watch syncs."', (await ev(`document.querySelector('[data-record-heart-later]')?.textContent ?? null`)) === 'Heart rate fills in when your watch syncs.')
await shoot('record-activity-6-heart-later')
const tx = await ev(`document.body.innerText`)
check('D4. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(tx ?? ''))

await finish('verify:record-activity passed: cardio starts from Exercise, End reads the phone, steps only on foot, one tap logs it.')
