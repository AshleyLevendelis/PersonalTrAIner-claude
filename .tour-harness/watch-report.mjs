// verify:watch-report — THE WATCH REPORT ON PROFILE (step 0 of docs/plans/health-data-next.md, 27 Nov 2026).
//
// The phone's health store is pretended (fake-health.ts): no browser can read a real one. What this proves is the
// app's half: the section is in the phone health sheet and nowhere in a browser; nothing is read until he taps; the
// report says what the pretend phone holds, as counts and times; a kind whose switch is off is not read; a refused
// read is said and the rest still made; Copy puts the very text on the clipboard and says so; a phone that refuses
// the copy is told what to do. What it cannot prove is what a real Samsung watch shares: that is what the report is for.
//
// Every check runs every time with a null-safe subject. PORT 9989.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9989, page: 'profile.html', name: 'watch-report', timeoutMs: 300_000 })
const { send, ev, check, wait, go, until, shoot, clickAt, finish } = d

const ROW = 'Steps from your phone'
const section = () => ev(`document.querySelector('[data-watch-report-section]')?.getAttribute('data-watch-report-section') ?? null`)
const report = () => ev(`document.querySelector('[data-watch-report]')?.textContent ?? null`)
const records = () => ev(`JSON.stringify((window.__healthCalls ?? []).filter(c => c && c.records).map(c => c.records))`)
const requests = () => ev(`(window.__healthCalls ?? []).filter(c => c && c.request).length`)
let load = 0
const openSheet = async query => {
  // The switches are kept on the phone, so one load's would carry into the next: each load starts with none.
  await ev(`['steps', 'heart', 'workouts', 'sleep'].forEach(k => localStorage.removeItem('fitplan_health_' + k + '_connected'))`)
  await go(`${query}&load=${++load}`)
  await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true, 120)
  await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
  await until(() => ev(`!!document.querySelector('[data-profile-row="Schedule"]')`), v => v === true, 60)
  await wait(400)
  await ev(`document.querySelector('[data-profile-row=${JSON.stringify(ROW)}]')?.click()`)
  await wait(900)
}
const make = async () => {
  await ev(`document.querySelector('[data-watch-report-make]')?.scrollIntoView({ block: 'center' })`)
  await wait(200)
  await clickAt(`document.querySelector('[data-watch-report-make]')`)
  await until(report, v => typeof v === 'string' && v.length > 50, 60).catch(() => {})
  await wait(300)
}
// The clipboard, as the page would write it: kept on the window so the driver can read what was copied.
const grabClipboard = fails => ev(`(() => { window.__copied = null; const c = { writeText: async t => { ${fails ? "throw new Error('not allowed')" : 'window.__copied = t'} } }; try { Object.defineProperty(navigator, 'clipboard', { value: c, configurable: true }) } catch { navigator.clipboard = c } ; ${fails ? "document.execCommand = () => false;" : ''} return true })()`)

console.log('\n  1. IN A BROWSER THERE IS NOTHING TO REPORT ON')
await go(`&load=${++load}`)
await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true, 120)
await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-profile-row="Schedule"]')`), v => v === true, 60)
check('1a. no phone health row, and no report section, when the app is not the phone app', (await ev(`document.querySelector('[data-profile-row=${JSON.stringify(ROW)}]') === null`)) === true && (await section()) === null)

console.log('\n  2. IN THE PHONE APP: OFFERED, AND NOTHING READ UNTIL HE TAPS')
await openSheet('&health=android&healthon=1&hearton=1&workoutson=1')
check('2a. the section is in the phone health sheet, under the others', (await section()) === 'none' && (await ev(`(() => { const s = document.querySelector('[data-profile-sheet="health"]'); const r = s?.querySelector('[data-watch-report-section]'); const strap = s?.querySelector('[data-heart-strap]'); return !!(r && strap && (strap.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING)) })()`)) === true)
const words = await ev(`document.querySelector('[data-watch-report-section]')?.innerText ?? ''`)
check('2b. it says what it is, that no readings are in it, and that nothing is saved or sent', /Check what your watch shares/.test(words) && /No step counts, heart rates or sleep times are in it\. Nothing is saved or sent\./.test(words), words)
check('2c. opening the sheet read no records from the phone', (await records()) === '[]', await records())
const before = await requests()
await ev(`document.querySelector('[data-watch-report-section]')?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('watch-report-1-offered')

console.log('\n  3. HE TAPS: THE REPORT, AS COUNTS AND TIMES')
await make()
const text = (await report()) ?? ''
check('3a. the report is on the screen and opens by saying what it is', (await section()) === 'made' && text.startsWith('WATCH REPORT (counts and times only, no readings)'), text.slice(0, 80))
check('3b. it names the phone, the health store, and each switch as it stands (sleep off)', /· Android · Health Connect available/.test(text) && /Switches: steps on, heart rate on, workouts on, sleep off, strap not paired/.test(text), text.split('\n').slice(1, 3))
check('3c. steps: a record a minute from the watch and one every five from the phone', /STEPS, last 24 hours\n today's total: came back\n records: [\d,]+ · each about 1 min long · about (\d+ s|1 min) apart · newest .*\n from: Samsung Health, watch 1,4\d\d, Google Fit, phone 28\d/.test(text), text.split('\n').slice(4, 8))
check('3d. heart rate: readings every 30 seconds, with no length', /HEART RATE, last 24 hours\n readings: 2,88\d · about 30 s apart · newest/.test(text), text.match(/HEART RATE[^\n]*\n[^\n]*/)?.[0])
check('3e. workouts: found, by kind in the store\'s own words, and the latest real one with how finely it is shared', /WORKOUTS, last 14 days\n found: 2\n kinds: running 1, walking 1\n from: Samsung Health 2\n latest: running · .* · 42 min\n  its own distance: yes · its own calories: yes\n  heart readings inside it: 85 \(2\.0 a minute\)\n  distance records inside it: 42 \(1\.0 a minute\)\n  step records inside it: 5\d \(1\.\d a minute\)/.test(text), text.slice(text.indexOf('WORKOUTS')))
check('3f. sleep is off, so it says so', /SLEEP, last 16 nights\n not read: its switch is off$/.test(text), text.slice(-70))
const asked = JSON.parse((await records()) ?? '[]')
check('3g. the phone was asked for records of the kinds his switches allow, and never for sleep', ['steps', 'distance', 'calories', 'heartRate', 'restingHeartRate'].every(k => asked.includes(k)) && !(await ev(`(window.__healthCalls ?? []).some(c => c && c.sleep)`)), asked)
check('3h. making it showed no permission sheet', (await requests()) === before, [before, await requests()])
check('3i. the phone\'s own figures are not in it (6,400 steps, 3,840 m, 300 kcal, 172 bpm)', !/6,?400|3,?840|\b300\b|\b172\b/.test(text))
const box = await ev(`(() => { const p = document.querySelector('[data-watch-report]'); if (!p) return null; const r = p.getBoundingClientRect(); return { w: Math.round(r.width), over: p.scrollWidth > p.clientWidth + 1, vw: innerWidth } })()`)
check('3j. the report fits the phone\'s width (no sideways scroll inside it)', box && box.over === false && box.w <= box.vw, box)
const whole = await ev(`(() => { const p = document.querySelector('[data-watch-report]'); return p ? p.scrollHeight <= p.clientHeight + 1 : null })()`)
check('3k. the whole report is drawn at its full length (no box that scrolls inside the sheet)', whole === true, whole)
await ev(`document.querySelector('[data-watch-report-section]')?.scrollIntoView({ block: 'start' })`)
await wait(300)
await shoot('watch-report-2-made')
await ev(`document.querySelector('[data-watch-report]')?.scrollIntoView({ block: 'end' })`)
await wait(300)
await shoot('watch-report-2b-made-end')

console.log('\n  4. COPY')
await grabClipboard(false)
await ev(`document.querySelector('[data-watch-report-copy]')?.scrollIntoView({ block: 'center' })`)
await wait(200)
await clickAt(`document.querySelector('[data-watch-report-copy]')`)
await wait(500)
check('4a. Copy puts the very text on the clipboard', (await ev(`window.__copied`)) === text && text.length > 200)
const said = await ev(`(() => { const n = document.querySelector('[data-watch-report-copied]'); if (!n) return null; const r = n.getBoundingClientRect(); return { text: n.textContent, inView: r.top >= 0 && r.bottom <= innerHeight } })()`)
check('4b. ...and says so, on screen where he tapped', said?.text === 'Copied. Paste it into your message.' && said.inView === true && (await ev(`document.querySelector('[data-watch-report-copy]')?.textContent`)) === 'Copied', said)
const small = await ev(`[...document.querySelectorAll('[data-watch-report-section] button')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent)`)
check('4c. both buttons are at least 44px tall', Array.isArray(small) && small.length === 0, small)
await shoot('watch-report-3-copied')

console.log('\n  5. A PHONE THAT REFUSES THE COPY')
await grabClipboard(true)
await clickAt(`document.querySelector('[data-watch-report-make]')`)
await wait(900)
await clickAt(`document.querySelector('[data-watch-report-copy]')`)
await wait(500)
const refused = await ev(`document.querySelector('[data-watch-report-note]')?.textContent ?? null`)
check('5a. it says it could not copy and what to do instead, and never says Copied', refused === 'Couldn’t copy it. Press and hold the text to select it, or take a screenshot.' && (await ev(`!!document.querySelector('[data-watch-report-copied]')`)) === false, refused)
check('5b. the report is still on screen to select', ((await report()) ?? '').startsWith('WATCH REPORT'))

console.log('\n  6. A READ THE PHONE REFUSES, AND A WATCH THAT SHARES LITTLE')
await openSheet('&health=android&healthon=1&workoutson=1&healthrecords=denied')
await make()
const denied = (await report()) ?? ''
check('6a. the refused kind says so in the phone\'s own words', /DISTANCE, last 24 hours\n could not be read: SecurityException: the app has no android\.permission\.health\.READ_DISTANCE/.test(denied), denied.match(/DISTANCE[^\n]*\n[^\n]*/)?.[0])
check('6b. the rest of the report is still made, and inside the workout that kind reads "could not be read"', /STEPS, last 24 hours\n today's total: came back\n records: /.test(denied) && /  distance records inside it: could not be read/.test(denied), denied.slice(denied.indexOf('WORKOUTS')))
check('6c. heart rate is off here, so resting heart rate is not read (workouts still allow heart readings)', /RESTING HEART RATE, last 14 days\n not read: its switch is off/.test(denied) && /HEART RATE, last 24 hours\n readings: /.test(denied))
await ev(`document.querySelector('[data-watch-report]')?.scrollIntoView({ block: 'start' })`)
await wait(300)
await shoot('watch-report-4-refused')

await openSheet('&health=android&healthon=1&workoutson=1&sleepon=1&healthrecords=coarse')
await make()
const coarse = (await report()) ?? ''
check('6d. a watch sharing an hour at a time: "each about 1 h long", and under one distance record a minute in the workout', /DISTANCE, last 24 hours\n records: 2[34] · each about 1 h long · about 1 h apart/.test(coarse) && /  distance records inside it: 0 \(0\.0 a minute\)/.test(coarse), [coarse.match(/DISTANCE[^\n]*\n[^\n]*/)?.[0], coarse.match(/distance records inside[^\n]*/)?.[0]])
check('6e. sleep on: sessions, stages by name, and the nights the app counts', /SLEEP, last 16 nights\n sessions: 1[56] · with stages: 1[56] \(awake, deep, light, rem\)\n nights the app counts: 1[56] · newest ended /.test(coarse), coarse.slice(coarse.indexOf('SLEEP')))
check('6f. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test((await ev(`document.querySelector('[data-profile-sheet="health"]')?.innerText ?? ''`)) ?? ''))

await finish()
