// verify:tester-report — THE TESTER TOOLKIT ON THE WHOLE APP (app-boot.html, App.tsx's own start), at 390px. His rulings
// 25 Nov 2026: "Everything" recorded once agreed, report buttons "Both", screenshot "Yes, they can untick".
//   A. Not a tester: no bug button, nothing recorded, Profile says Off.
//   B. Profile, "Help test the app": every kind of thing recorded is said BEFORE the tap, and the never line; agreeing
//      saves the date on the profile and the bug button appears.
//   C. Recording: the app opening, screens, taps, what was typed, an error, a failed request and a failure message on
//      screen all reach tester_events under this profile; a password and an email address never do.
//   D. The bug button: the sheet opens on the area he is in, with a picture of the screen; Send waits for words; a sent
//      report carries the note, the area, the screen, the picture and what he did just before.
//   E. An exercise's ⋮, "Report a problem": the report names the exercise; an unticked picture is not sent.
//   F. A report that cannot be saved says so and keeps the sheet open.
//   G. Stop recording: the profile forgets the date, the bug button goes, and nothing more is recorded.
// Every check runs every time with a null-safe subject. PORT 9991.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9991, page: 'app-boot.html', name: 'tester-report', timeoutMs: 360_000 })
const { ev, check, wait, go, until, shoot, clickAt, finish } = d

const events = () => ev(`JSON.stringify(window.__fakeDb?.tester_events ?? [])`).then(s => JSON.parse(s ?? '[]'))
const reports = () => ev(`JSON.stringify(window.__fakeDb?.tester_reports ?? [])`).then(s => JSON.parse(s ?? '[]'))
const bug = `document.querySelector('[data-tester-report-open]')`
const setValue = (sel, v) => ev(`(() => { const t = ${sel}; if (!t) return false; const proto = t.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(t, ${JSON.stringify(v)}); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const openProfile = async () => {
  await clickAt(`document.querySelector('[aria-label="Profile and settings"]')`); await wait(400)
  await ev(`[...document.querySelectorAll('[role="menuitem"]')].find(m => /^Profile$/.test((m.textContent || '').trim()))?.click()`)
  await until(() => ev(`!!document.querySelector('[data-profile-page]')`), v => v === true, 40)
  await wait(400)
}
const closeProfile = async () => { await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await wait(500) }

console.log('\n  A. NOT A TESTER')
await go('&slow=0&clear-storage&session-day')
await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
await wait(1200)
await ev(`[...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Not now')?.click()`)
await wait(400)
check('A1. no bug button beside the gear', (await ev(`!!${bug}`)) === false)
await ev(`location.hash = '#/tab/exercise'`); await wait(800)
await ev(`location.hash = '#/tab/home'`); await wait(800)
check('A2. tapping about records nothing', (await events()).length === 0, (await events()).length)
await openProfile()
const rowOff = await ev(`document.querySelector('[data-profile-row="Help test the app"]')?.textContent ?? null`)
check('A3. Profile has "Help test the app", Off', /Help test the app/.test(rowOff ?? '') && /Off/.test(rowOff ?? ''), rowOff)

console.log('\n  B. AGREEING')
await clickAt(`document.querySelector('[data-profile-row="Help test the app"]')`)
await until(() => ev(`!!document.querySelector('[data-tester-section]')`), v => v === true, 40)
const consent = await ev(`document.querySelector('[data-tester-section]')?.innerText ?? ''`)
check('B1. before the tap it says what is recorded: crashes and failed saves, screens and taps, what is typed and the coach messages',
  /Crashes/.test(consent) && /each button you tap/.test(consent) && /What you type/.test(consent) && /messages to the coach/.test(consent), consent)
check('B2. ...that a password and an email address never are, and that it can be turned off', /Never your password or your email address/.test(consent) && /Turn it off here at any time/.test(consent), consent)
check('B3. ...and nothing is recorded yet', (await events()).length === 0)
await shoot('tester-1-consent')
await clickAt(`document.querySelector('[data-tester-toggle="turn-on"]')`)
const since = await until(() => ev(`window.__fakeDb?.fitness_profiles?.[0]?.tester_since ?? null`), v => !!v, 40)
check('B4. "I agree" saves the date on the profile', typeof since === 'string' && /^\d{4}-\d\d-\d\dT/.test(since), since)
const line = await ev(`document.querySelector('[data-tester-note-line]')?.textContent ?? null`)
check('B5. ...and says recording is on and where the bug button is', /Recording is on/.test(line ?? '') && /beside the gear/.test(line ?? ''), line)
await closeProfile()
check('B6. the bug button is now beside the gear', (await until(() => ev(`!!${bug}`), v => v === true, 20)) === true)

console.log('\n  C. WHAT IS RECORDED')
await ev(`location.hash = '#/tab/exercise'`); await wait(900)
// A box of each kind on the real page: an ordinary one, a password, an email address (INPUTS: what a person types).
await ev(`(() => { const host = document.createElement('div'); host.id = 'probe-fields'; host.innerHTML = '<input id="probe-note" aria-label="Probe note"><input id="probe-pass" type="password" aria-label="Probe password"><input id="probe-mail" type="email" aria-label="Probe email">'; document.body.appendChild(host) })()`)
await setValue(`document.getElementById('probe-note')`, 'felt heavy today')
await setValue(`document.getElementById('probe-pass')`, 'hunter2-secret')
await setValue(`document.getElementById('probe-mail')`, 'tester@example.com')
await clickAt(`[...document.querySelectorAll('button')].find(b => /Week/.test((b.textContent || '').trim()))`)
await wait(400)
await ev(`setTimeout(() => { throw new Error('tester probe crash') }, 0)`)
await ev(`fetch('/rest/v1/no_such_table').catch(() => {})`)
await ev(`(() => { const a = document.createElement('p'); a.setAttribute('role', 'alert'); a.textContent = "Couldn't save your set. Check your connection."; document.body.appendChild(a); setTimeout(() => a.remove(), 3000) })()`)
await wait(600)
await ev(`document.getElementById('probe-fields')?.remove()`)
const ev1 = await until(events, v => v.some(e => e.kind === 'network_error') && v.some(e => e.kind === 'typed'), 90)
const kinds = new Set(ev1.map(e => e.kind))
check('C1. the app opening, the screen and the taps are recorded', kinds.has('start') && kinds.has('screen') && kinds.has('tap'), [...kinds])
check('C2. every row is under this profile and this visit', ev1.length > 0 && ev1.every(e => e.profile_id === '00000000-0000-4000-8000-00000000b007' && e.session_id), ev1.slice(0, 2))
check('C3. what was typed into an ordinary box is kept, with the box\'s name', ev1.some(e => e.kind === 'typed' && e.detail?.value === 'felt heavy today' && /Probe note/.test(e.detail?.field ?? '')), ev1.filter(e => e.kind === 'typed'))
check('C4. a password and an email address are never kept', !JSON.stringify(ev1).includes('hunter2') && !JSON.stringify(ev1).includes('tester@example.com'))
check('C5. a crash is kept with its message', ev1.some(e => e.kind === 'error' && /tester probe crash/.test(e.detail?.message ?? '')), ev1.filter(e => /error/.test(e.kind)))
check('C6. a failed request is kept with its path and status', ev1.some(e => e.kind === 'network_error' && /no_such_table/.test(e.detail?.path ?? '') && e.detail?.status), ev1.filter(e => e.kind === 'network_error'))
check('C7. a failure message on screen is kept in its own words', ev1.some(e => e.kind === 'failed_save' && /Couldn't save your set/.test(e.detail?.message ?? '')), ev1.filter(e => e.kind === 'failed_save'))
check('C8. a tap is kept by the words on the button, on the screen it was on', ev1.some(e => e.kind === 'tap' && /Week/.test(e.detail?.label ?? '') && /^exercise/.test(e.screen ?? '')), ev1.filter(e => e.kind === 'tap').slice(-3))

console.log('\n  D. THE BUG BUTTON')
await ev(`window.scrollTo(0, 0)`)
await clickAt(bug)
await until(() => ev(`!!document.querySelector('[data-tester-report]')`), v => v === true, 40)
await until(() => ev(`document.querySelector('[data-tester-shot]')?.getAttribute('data-tester-shot')`), v => v === 'yes' || v === 'none', 60)
const sheet = await ev(`(() => { const s = document.querySelector('[data-tester-report]'); if (!s) return null; const r = s.getBoundingClientRect(); return { title: s.querySelector('h2')?.textContent ?? null, area: s.querySelector('[data-tester-area][aria-checked="true"]')?.getAttribute('data-tester-area') ?? null, areas: s.querySelectorAll('[data-tester-area]').length, shot: s.querySelector('[data-tester-shot]')?.getAttribute('data-tester-shot'), tick: !!s.querySelector('[data-tester-shot-tick]')?.checked, send: !!s.querySelector('[data-tester-report-send]')?.disabled, left: Math.round(r.left), right: Math.round(r.right) } })()`)
check('D1. it opens "Report a problem" with seven areas, on the one he is in (Exercise)', sheet?.title === 'Report a problem' && sheet.areas === 7 && sheet.area === 'exercise', sheet)
check('D2. ...with a picture of the screen, ticked to go', sheet?.shot === 'yes' && sheet.tick === true, sheet)
check('D3. ...Send waits for words, and the sheet fits the screen', sheet?.send === true && sheet.left >= 0 && sheet.right <= 390, sheet)
await shoot('tester-2-sheet')
await setValue(`document.getElementById('tester-report-note')`, 'The week view jumped to the top when I tapped it')
await wait(200)
await clickAt(`document.querySelector('[data-tester-report-send]')`)
const r1 = await until(reports, v => v.length === 1, 40)
const rep = r1[0] ?? {}
check('D4. one report, with the note, the area and the screen', r1.length === 1 && /week view jumped/.test(rep.note ?? '') && rep.area === 'exercise' && /^exercise/.test(rep.screen ?? ''), { ...rep, screenshot: rep.screenshot?.slice(0, 30) })
check('D5. ...the picture of the screen, as a JPEG', /^data:image\/jpeg;base64,/.test(rep.screenshot ?? '') && rep.screenshot.length > 2000, rep.screenshot?.slice(0, 40))
check('D6. ...and what he did just before, ending with his last taps', Array.isArray(rep.recent_events) && rep.recent_events.length >= 3 && rep.recent_events.some(e => e.kind === 'tap'), rep.recent_events?.length)
check('D7. ...under his profile, with the device', rep.profile_id === '00000000-0000-4000-8000-00000000b007' && /390x/.test(rep.device ?? ''), { p: rep.profile_id, d: rep.device })
check('D8. the sheet says thanks', (await ev(`document.querySelector('[data-tester-report] h2')?.textContent ?? null`)) === 'Thanks, sent')
await shoot('tester-3-sent')
await clickAt(`document.querySelector('[data-tester-report-done]')`); await wait(500)

console.log('\n  E. FROM AN EXERCISE')
// ?session-day: today is a training day (an INPUT), so today's card has exercises and their ⋮.
await ev(`location.hash = '#/tab/exercise'`); await wait(800)
const reportsBeforeE = (await reports()).length
const exName = await ev(`(() => { const b = document.querySelector('[aria-label="Exercise options"]'); return b ? (b.closest('[data-exercise-row], [data-testid="exercise-row"], li, article')?.querySelector('h3, h4, [data-exercise-name]')?.textContent ?? null) : null })()`)
await clickAt(`document.querySelector('[aria-label="Exercise options"]')`); await wait(500)
const item = await ev(`!!document.querySelector('[data-testid="tester-report-item"]')`)
const probe = await ev(`({ triggers: document.querySelectorAll('[aria-label="Exercise options"]').length, menu: [...document.querySelectorAll('[role="menuitem"]')].map(m => m.textContent.trim()), hash: location.hash })`)
check('E1. the ⋮ menu has "Report a problem"', item === true, probe)
await clickAt(`document.querySelector('[data-testid="tester-report-item"]')`)
await until(() => ev(`!!document.querySelector('[data-tester-report]')`), v => v === true, 40)
await until(() => ev(`document.querySelector('[data-tester-shot]')?.getAttribute('data-tester-shot')`), v => v === 'yes' || v === 'none', 60)
const desc = await ev(`document.querySelector('[data-tester-report] p')?.textContent ?? ''`)
check('E2. the sheet says which exercise it is about', /This is about .+\./.test(desc), { desc, exName })
await clickAt(`document.querySelector('[data-tester-shot-tick]')`); await wait(150)
await setValue(`document.getElementById('tester-report-note')`, 'The weight looks too heavy for me')
await clickAt(`document.querySelector('[data-tester-report-send]')`)
const r2 = await until(reports, v => v.length === reportsBeforeE + 1, 40)
const last = r2[r2.length - 1]
check('E3. the report names the exercise, and the unticked picture is not sent', r2.length === reportsBeforeE + 1 && !!last?.item_label && desc.includes(last.item_label) && last.area === 'exercise' && last.screenshot == null, last && { item: last.item_label, area: last.area, shot: last.screenshot })
await clickAt(`document.querySelector('[data-tester-report-done]')`); await wait(500)

console.log('\n  F. A REPORT THAT CANNOT BE SAVED')
const reportsBeforeF = (await reports()).length
await ev(`window.__failWrite = (t) => t === 'tester_reports'`)
await clickAt(bug)
await until(() => ev(`!!document.querySelector('[data-tester-report]')`), v => v === true, 40)
await until(() => ev(`document.querySelector('[data-tester-shot]')?.getAttribute('data-tester-shot')`), v => v === 'yes' || v === 'none', 60)
await setValue(`document.getElementById('tester-report-note')`, 'This one should fail')
await clickAt(`document.querySelector('[data-tester-report-send]')`)
const failed = await until(() => ev(`!!document.querySelector('[data-tester-report-failed]')`), v => v === true, 40)
check('F1. it says it could not send, and the sheet stays open with his words', failed === true && (await ev(`document.getElementById('tester-report-note')?.value ?? null`)) === 'This one should fail')
check('F2. ...and nothing was kept', (await reports()).length === reportsBeforeF && reportsBeforeF === 2, reportsBeforeF)
await ev(`window.__failWrite = undefined`)
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await wait(500)

console.log('\n  G. STOP RECORDING')
await openProfile()
await clickAt(`document.querySelector('[data-profile-row="Help test the app"]')`)
await until(() => ev(`!!document.querySelector('[data-tester-toggle="turn-off"]')`), v => v === true, 40)
await clickAt(`document.querySelector('[data-tester-toggle="turn-off"]')`)
const off = await until(() => ev(`window.__fakeDb?.fitness_profiles?.[0]?.tester_since ?? null`), v => v === null, 40)
check('G1. "Stop recording" clears the date on the profile', off === null)
await closeProfile()
check('G2. the bug button goes', (await until(() => ev(`!!${bug}`), v => v === false, 20)) === false)
const before = (await events()).length
await ev(`location.hash = '#/tab/home'`); await wait(500)
await clickAt(`[...document.querySelectorAll('button')].find(b => /^Progress/.test((b.textContent || '').trim()))`)
await wait(17000)
check('G3. nothing more is recorded after it is off', (await events()).length === before, { before, after: (await events()).length })
check('G4. ...and nothing is waiting on the phone', (await ev(`localStorage.getItem('fitplan_tester_queue')`)) === null && (await ev(`localStorage.getItem('fitplan_tester_on')`)) === null)

const txt = await ev('document.body.innerText')
check('Z. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(txt ?? ''))
await finish('verify:tester-report passed: a tester agrees, what happens is recorded (never a password or an email), and a report carries the screen, a picture and what came before.')
