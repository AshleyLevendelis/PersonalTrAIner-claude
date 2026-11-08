// ---------------------------------------------------------------------------
// PROFILE, QA ROUND 2 (8 Nov 2026): what a tester found on the Profile screen, held on a real screen at 390px.
//
//   1. The last training day cannot be unticked: it stays, the screen says why, and nothing is stored as zero days
//      (zero days was stored, a rebuild was offered, and the rebuild crashed on Home).
//   2. An exercise added to "Exercises to avoid" that the plan holds opens the ⋮ menu's own ban sheet, and saying yes
//      takes it out of the plan (it was written down and left in every session).
//   3. A like the avoid list's matcher would catch ("mushrooms" beside "mushroom") is refused, naming the entry.
//   4. Gaining kit is not told "it still asks for equipment you do not have".
//   5. The injury and diet chips, and a list's Add button, are 44px.
//   6. A number out of range says why it went back.
//   7. The Known lifts row names every lift known, not the first.
//
// Every check runs every time; the plan and the database are read from window.__meso and window.__fakeDb.
// PORT 9591.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/profile.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9591
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const until = async (fn, tries = 30) => { let v = await fn(); for (let i = 0; i < tries && !v; i++) { await wait(250); v = await fn() } return v }
const pointAt = async expr => {
  const r = await ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })()`)
  if (!r) return false
  await wait(120)
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 })
  await wait(350)
  return true
}
const q = sel => `document.querySelector(${JSON.stringify(sel)})`
const has = sel => ev(`!!${q(sel)}`)
const text = sel => ev(`(${q(sel)}?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)
const sheet = '[data-slot="dialog-content"]'
const openRow = async label => {
  await ev(`document.querySelector('[data-profile-sheet]') && document.querySelector('[data-profile-back]')?.click()`)
  await wait(300)
  const ok = await ev(`(() => { const b = document.querySelector('[data-profile-row=${JSON.stringify(label)}]'); if (!b) return false; b.click(); return true })()`)
  await wait(600)
  return ok
}
const typeInto = (expr, value) => ev(`(() => { const t = ${expr}; if (!t) return false; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(t, ${JSON.stringify(value)}); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const sheetInput = `[...document.querySelectorAll('${sheet} input')].filter(n => n.offsetParent !== null)[0]`
const addButton = `[...document.querySelectorAll('${sheet} button[aria-label="Add"]')].filter(n => n.offsetParent !== null)[0]`
const profileRow = () => ev(`window.__fakeDb.fitness_profiles[0]`)
const facts = () => ev(`(window.__fakeDb.user_facts ?? []).filter(f => f.status === 'active').map(f => ({ kind: f.kind, polarity: f.polarity, refs: f.resolved_refs }))`)

console.log('\nPROFILE, QA ROUND 2, AT 390px\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off` })
await until(() => has('[data-profile-row="Schedule"]'))

// --- 1. The last training day ----------------------------------------------------------
console.log('  1. The last training day stays')
await openRow('Schedule')
const dayItems = `[...document.querySelectorAll('${sheet} [role="group"] button, ${sheet} [data-slot="toggle-group-item"]')].filter(b => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(b.textContent.trim()))`
const onDays = () => ev(`${dayItems}.filter(b => b.getAttribute('data-state') === 'on' || b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim())`)
const startOn = (await onDays()) ?? []
check('1a. the fixture trains on more than one day', startOn.length >= 2, startOn)
for (const d of startOn) { await pointAt(`${dayItems}.find(b => b.textContent.trim() === ${JSON.stringify(d)})`); await wait(250) }
const left = await onDays()
check('1b. unticking every day leaves the last one ticked', left?.length === 1, left)
const stored = (await profileRow())?.training_days?.filter(d => d.available).length
check('1c. ...and the stored week still has a training day', stored >= 1, stored)
check('1d. ...and the screen says why', /at least one training day/.test(await text('[data-testid="days-need-one"]')), await text('[data-testid="days-need-one"]'))
await shoot('profile-fixes-1-days')

// --- 2. An exercise to avoid that the plan holds ------------------------------------------
console.log('\n  2. Avoiding an exercise the plan holds takes it out, through the ban')
const target = await ev(`(() => { const counts = {}; for (const w of window.__meso) for (const d of w.days) for (const e of d.exercises) counts[e.name] = (counts[e.name] || 0) + 1; return Object.entries(counts).filter(([n]) => !/circles|swings|stretch/i.test(n)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null })()`)
const countIn = name => ev(`window.__meso.reduce((n, w) => n + w.days.reduce((m, d) => m + d.exercises.filter(e => e.name === ${JSON.stringify(name)}).length, 0), 0)`)
const before2 = target ? await countIn(target) : 0
check('2a. the plan holds an exercise to avoid (the fixture binds)', !!target && before2 > 0, { target, before2 })
await openRow('Exercises to avoid')
await typeInto(q('[data-testid="exercise-avoid-input"]'), target ?? 'NONE')
await pointAt(addButton)
const sheetUp = await until(() => has('[data-testid="ban-exercise-sheet"]'))
check('2b. adding it opens the ⋮ menu\'s own "Stop giving you…" sheet', !!sheetUp && (await text('[data-testid="ban-exercise-sheet"]')).includes(`Stop giving you ${target}?`), await text('[data-testid="ban-exercise-sheet"]'))
check('2c. ...saying how much of the plan it changes', /session/.test(await text('[data-testid="ban-confirm"]')), await text('[data-testid="ban-confirm"]'))
await shoot('profile-fixes-2-ask')
await pointAt(q('[data-testid="ban-confirm-yes"]'))
await until(() => has('[data-testid="ban-receipt"]'))
const after2 = target ? await countIn(target) : -1
check('2d. saying yes takes it out of the plan', after2 < before2, { before2, after2 })
check('2e. ...and records it as an exercise to avoid', ((await facts()) ?? []).some(f => f.kind === 'exercise_preference' && f.polarity === 'dislike' && (f.refs ?? []).includes(target)), await facts())
await pointAt(q('[data-testid="ban-done"]'))
await wait(500)
// The other door into the same list: a word that names several exercises asks which, and the one picked, if the plan
// holds it, goes through the same sheet.
const word = await ev(`(() => { const names = new Set(); for (const w of window.__meso) for (const d of w.days) for (const e of d.exercises) names.add(e.name); for (const cand of ['press', 'row', 'curl', 'squat', 'raise']) if ([...names].some(n => n.toLowerCase().includes(cand))) return cand; return null })()`)
await openRow('Exercises to avoid')
await typeInto(q('[data-testid="exercise-avoid-input"]'), word ?? 'NONE')
await pointAt(addButton)
await until(() => has('[data-testid="exercise-avoid-choice"]'))
const choice = await ev(`(() => { const names = new Set(); for (const w of window.__meso) for (const d of w.days) for (const e of d.exercises) names.add(e.name); return [...document.querySelectorAll('[data-testid="exercise-avoid-choice"]')].map(b => b.textContent.trim()).find(t => names.has(t)) ?? null })()`)
check('2f. a word naming several asks which, and offers one the plan holds (the fixture binds)', !!word && !!choice, { word, choice })
await pointAt(`[...document.querySelectorAll('[data-testid="exercise-avoid-choice"]')].find(b => b.textContent.trim() === ${JSON.stringify(choice ?? 'NONE')})`)
const sheet2 = await until(() => has('[data-testid="ban-exercise-sheet"]'))
check('2g. ...and picking it opens the same "Stop giving you…" sheet', !!sheet2 && (await text('[data-testid="ban-exercise-sheet"]')).includes(`Stop giving you ${choice}?`), await text('[data-testid="ban-exercise-sheet"]'))
await pointAt(q('[data-testid="ban-confirm-no"]'))
await wait(500)

// --- 3. A like the avoid list would catch ---------------------------------------------------
console.log('\n  3. A like caught by the avoid list is refused')
await openRow('Foods to avoid')
await typeInto(sheetInput, 'mushroom')
await pointAt(addButton)
await wait(600)
await openRow('Foods you like')
await typeInto(sheetInput, 'button mushrooms')
await pointAt(addButton)
const refused = await until(() => text('[data-testid="profile-like-refused"]'))
check('3a. "button mushrooms" beside "mushroom" on foods to avoid is refused, naming the entry', /caught by "mushroom"/.test(refused ?? ''), refused)
check('3b. ...and nothing was saved as a like', !((await facts()) ?? []).some(f => f.polarity === 'like' && (f.refs ?? []).some(r => /mushroom/.test(r))), await facts())
await typeInto(sheetInput, 'salmon')
await pointAt(addButton)
await wait(600)
check('3c. ...while an unrelated like is still taken (the check binds)', ((await facts()) ?? []).some(f => f.polarity === 'like' && (f.refs ?? []).some(r => /salmon/.test(r))), await facts())
await shoot('profile-fixes-3-like')

// --- 4. Gaining kit ------------------------------------------------------------------------
console.log('\n  4. Gaining kit is said as gaining')
const kitNow = (await profileRow())?.equipment_access
await openRow('Equipment')
const bigger = kitNow === 'full_gym' ? null : 'Full gym'
const opened4 = await pointAt(`[...document.querySelectorAll('${sheet} [role="combobox"]')].find(n => n.offsetParent !== null)`)
await wait(400)
await pointAt(`[...document.querySelectorAll('[role="option"]')].find(o => /full gym/i.test(o.textContent))`)
const detail4 = await until(() => text('[data-testid="plan-invalidation-detail"]'))
check('4a. moving to more kit offers a rebuild (the fixture binds)', !!bigger && !!opened4 && !!detail4, { kitNow, detail4 })
check('4b. ...that says the plan leaves out what you can now do, not "equipment you do not have"', /less kit than you have now/.test(detail4 ?? '') && !/do not have/.test(detail4 ?? ''), detail4)

// --- 5. Tap sizes ----------------------------------------------------------------------------
console.log('\n  5. Chips and the Add button are 44px')
await openRow('Injuries')
const chipH = await ev(`Math.min(...[...document.querySelectorAll('${sheet} [data-slot="toggle-group-item"]')].filter(n => n.offsetParent !== null).map(n => n.getBoundingClientRect().height))`)
check('5a. the injury chips are 44px tall', chipH >= 44, chipH)
await openRow('Diet')
const dietH = await ev(`Math.min(...[...document.querySelectorAll('${sheet} [data-slot="toggle-group-item"]')].filter(n => n.offsetParent !== null).map(n => n.getBoundingClientRect().height))`)
check('5b. the diet chips are 44px tall', dietH >= 44, dietH)
await openRow('Foods to avoid')
const addH = await ev(`(() => { const b = ${addButton}; if (!b) return 0; const r = b.getBoundingClientRect(); return Math.min(r.width, r.height) })()`)
check('5c. a list\'s Add button is 44px', addH >= 44, addH)

// --- 6. Out of range ---------------------------------------------------------------------------
console.log('\n  6. A number out of range says why it went back')
await openRow('Height & weight')
const ageWas = (await profileRow())?.age
const numberBox = `[...document.querySelectorAll('${sheet} input[type="number"]')].filter(n => n.offsetParent !== null)[0]`
await pointAt(numberBox)
await typeInto(numberBox, '3')
await ev(`${numberBox}?.blur()`)
const note6 = await until(() => text('[data-testid="number-out-of-range"]'))
check('6a. a number outside the range says what the range is', /has to be between/.test(note6 ?? ''), note6)
check('6b. ...and nothing was saved', (await profileRow())?.age === ageWas, { ageWas, now: (await profileRow())?.age })
await shoot('profile-fixes-6-range')

// --- 8. Experience offers a rebuild (his ruling 8 Nov 2026, "Offer a rebuild") ---------------------
console.log('\n  8. Changing experience or recovery offers a rebuild')
const pickIn = async (rowLabel, optionRe) => {
  const opened = await pointAt(`[...document.querySelectorAll('${sheet} span')].find(n => n.textContent.trim() === ${JSON.stringify(rowLabel)})?.parentElement.querySelector('[role="combobox"]')`)
  await wait(400)
  const picked = await pointAt(`[...document.querySelectorAll('[role="option"]')].find(o => ${optionRe}.test(o.textContent) && o.getAttribute('data-state') !== 'checked' && o.getAttribute('aria-selected') !== 'true')`)
  await wait(500)
  return opened && picked
}
await openRow('Goal')
const expWas = (await profileRow())?.training_experience
const pickedExp = await pickIn('Experience', '/./')
const expTitle = await until(() => text('[data-testid="plan-invalidation-title"]').then(t => /experience/.test(t) ? t : null))
check('8a. changing Experience saves it (the fixture binds)', pickedExp && (await profileRow())?.training_experience !== expWas, { expWas, now: (await profileRow())?.training_experience })
check('8b. ...and offers a rebuild for the new level', /Rebuild your plan for this experience level\?/.test(expTitle ?? ''), expTitle)
await openRow('Style & recovery')
const recWas = (await profileRow())?.recovery_capacity
const pickedRec = await pickIn('Recovery capacity', '/./')
const recTitle = await until(() => text('[data-testid="plan-invalidation-title"]').then(t => /recovery/.test(t) ? t : null))
check('8c. changing Recovery capacity offers a rebuild too', pickedRec && (await profileRow())?.recovery_capacity !== recWas && /Rebuild your plan around this recovery\?/.test(recTitle ?? ''), { recWas, recTitle })

// --- 7. Known lifts ----------------------------------------------------------------------------
console.log('\n  7. Known lifts names every lift')
await ev(`document.querySelector('[data-profile-sheet]') && document.querySelector('[data-profile-back]')?.click()`)
await wait(400)
const lifts = await text('[data-profile-row="Known lifts"]')
check('7a. the row names the squat, bench and deadlift the fixture knows', /Squat 100/.test(lifts) && /Bench 60/.test(lifts) && /Deadlift 120/.test(lifts), lifts)

console.log(`\n${ran} checks ran`)
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
chrome.kill(); server.close(); ws.close()
process.exit(failures ? 1 : 0)
