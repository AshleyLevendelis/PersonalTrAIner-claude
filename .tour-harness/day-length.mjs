// ---------------------------------------------------------------------------
// A DAY'S LENGTH SAYS WHAT IT IS MADE OF — and a separate walk is not a
// "Finisher". (docs/plans/a-shoulders-day-with-shoulder-work.md; test log H4
// "time cap", and L17.)
//
// What the tester saw: "9 sets · ~37 min" over seven working sets, because 15
// of the minutes were an OPTIONAL mobility flow and the 9 counted two warm-up
// sets; underneath, a 30-minute walk the engine had deliberately made a
// SEPARATE session, drawn as the session's "Finisher"; "Shoulders & Abs"
// carrying "not a bug, just a real gap"; and a header showing today's minutes
// while another day was open.
//
// THIS DRIVES THE REAL SCREENS: the programme list, the Exercise tab and Home,
// on two GENERATED plans — the tester's profile (?sam=1) and a day that
// carries cardio plus an optional mobility close-out (?mobility=1). The page
// publishes each day's SECONDS; the worded length is read off the screen and
// checked against them here, so a helper that worded the wrong number cannot
// agree with itself.
//
// WHAT IT CANNOT SEE: the harness page (.tour-harness/real.tsx) mounts the real
// Dashboard, ExerciseTab and ProgramBrowse, but not App.tsx — nothing here
// says anything about App's own chrome.
//
// Path-independent (reads the bundle beside this file), port 9751.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const HERE = import.meta.dirname
const DIST = join(HERE, 'dist/')
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port
const DEBUG_PORT = 9751
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--no-sandbox', '--disable-gpu', `--user-data-dir=/tmp/pt-day-length-${process.pid}`, 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value

let failures = 0, ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 420)}` : ''}`) }
}
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(HERE, name), Buffer.from(s.result.data, 'base64'))
}
// Every load gets its own address: navigating to the URL already open is a
// same-page jump to its #fragment and reloads nothing.
let loads = 0
const go = async (query, hash, settle = 3800) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${query}&n=${++loads}${hash}` })
  await wait(settle)
}
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '').replace(/\\s+/g, ' ').trim()`)
const tap = sel => ev(`(() => {
  const n = document.querySelector(${JSON.stringify(sel)})
  if (!n) return false
  n.scrollIntoView({ block: 'center' })
  const r = n.getBoundingClientRect()
  for (const type of ['mousedown', 'mouseup', 'click']) n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
  return true
})()`)
/** "…~22 min · + 15 optional" → { work: 22, optional: 15 }. Null when the text holds no length. */
const parseLength = s => {
  const m = String(s ?? '').match(/~(\d+) min(?: · \+ (\d+) optional)?/)
  return m ? { work: Number(m[1]), optional: m[2] ? Number(m[2]) : 0, worded: m[0] } : null
}
const BAND_MAX = { sam: 45 } // 30-45 minutes: the longest session the tester asked for
// The page publishes the week OF THE DATE ON SCREEN, so the targets are read
// again after every load: a weekday's nearest date can sit in the plan week
// before the anchor's, where the same day is a minute different.
const targets = () => ev('window.__dayLengthTargets ?? null')
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

console.log('\nA DAY\'S LENGTH SAYS WHAT IT IS MADE OF\n')

// ===========================================================================
console.log('  0. The fixtures')
// ===========================================================================
await go('sam=1', '#/tab/exercise')
const sam = await ev('window.__dayLengthTargets ?? null')
const samDays = sam?.days ?? []
const walkDay = samDays.find(d => d.cardio && d.cardio.timing === 'independent_session') ?? null
const gapDay = samDays.find(d => d.focus === 'Shoulders & Abs' && !d.hasOverheadPress) ?? null
check('0a. the tester\'s plan has four training days in the live week', samDays.length === 4, samDays.map(d => `${d.day} ${d.focus}`))
check('0b. …one of them carries cardio the engine made a SEPARATE session', !!walkDay, samDays.map(d => d.cardio))
check('0c. …and its "Shoulders & Abs" day has no overhead press (the flag removed every one)', !!gapDay, samDays.map(d => `${d.focus}:${d.hasOverheadPress}`))
check('0d. …and some day has warm-up sets, so "working sets" and "all sets" are different numbers', samDays.some(d => d.allSets > d.workingSets), samDays.map(d => [d.workingSets, d.allSets]))
const otherDay = walkDay ? samDays.find(d => d.day !== walkDay.day && Math.round(d.totalSeconds / 60) !== Math.round(walkDay.totalSeconds / 60)) ?? null : null
check('0e. …and another day runs a different length from the walk day\'s, so the header has a wrong answer available', !!otherDay,
  samDays.map(d => `${d.day} ${Math.round(d.totalSeconds / 60)}`))
if (!sam || !walkDay || !gapDay || !otherDay) {
  console.error('\nThe fixture does not hold what this driver measures — nothing below would mean anything.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}

// ===========================================================================
console.log('\n  1. The programme list: working sets, and the length in parts')
// ===========================================================================
await go('sam=1', `#/exercise/program/${sam.liveWeek}`)
const rows = await ev(`[...document.querySelectorAll('[data-program-day]')].map(r => ({ day: r.getAttribute('data-program-day'), length: (r.querySelector('[data-testid="program-day-length"]')?.innerText ?? '').replace(/\\s+/g, ' ').trim() }))`)
const rowFor = day => (rows ?? []).find(r => r.day === day)?.length ?? ''
{
  const wrong = []
  for (const d of samDays) {
    const shown = rowFor(d.day)
    const len = parseLength(shown)
    const sets = Number((shown.match(/^(\d+) sets/) ?? [])[1])
    if (!len) { wrong.push(`${d.day}: no length in "${shown}"`); continue }
    if (sets !== d.workingSets) wrong.push(`${d.day}: says ${sets} sets, the day's work is ${d.workingSets} (all rows ${d.allSets})`)
    if (len.work + len.optional !== Math.round(d.totalSeconds / 60)) wrong.push(`${d.day}: ${len.work} + ${len.optional} is not the day's ${Math.round(d.totalSeconds / 60)} minutes`)
    if (len.optional !== Math.round(d.optionalSeconds / 60)) wrong.push(`${d.day}: optional ${len.optional}, the plan's is ${Math.round(d.optionalSeconds / 60)}`)
  }
  check('1a. every training day\'s row counts WORKING sets, and its two parts add up to the day', (rows ?? []).length >= 4 && wrong.length === 0, wrong.length ? wrong : rows)
}
await tap(`[data-program-day="${walkDay.day}"]`); await wait(700)
const programCardio = await text('[data-testid="program-day-cardio"]')
check('1b. the walk is listed as a separate session, with its minutes', /^Separate session: /.test(programCardio) && programCardio.includes(`${walkDay.cardio.minutes} min`), programCardio)
check('1c. …and the day\'s own length does not include it', (parseLength(rowFor(walkDay.day))?.work ?? 0) + walkDay.cardio.minutes > Math.round(walkDay.totalSeconds / 60) && parseLength(rowFor(walkDay.day))?.work === Math.round((walkDay.totalSeconds - walkDay.optionalSeconds) / 60), rowFor(walkDay.day))
const programWarmup = parseLength(await text('[data-testid="warmup-badge"]'))
await shot('day-length-programme.png')

// ===========================================================================
console.log('\n  2. The Exercise tab on the walk day: "Also today", never "Finisher"')
// ===========================================================================
await go(`sam=1&today=${walkDay.date}`, '#/tab/exercise', 4200)
const shown = await targets()
const walkShown = (shown?.days ?? []).find(d => d.day === walkDay.day) ?? null
const otherShown = (shown?.days ?? []).find(d => d.day === otherDay.day) ?? null
const header = await text('[data-testid="week-context-header"]')
const headerLen = parseLength(header)
check('2a. the header\'s two parts add up to the day on screen, and the walk is not in them',
  !!headerLen && !!walkShown && walkShown.cardio?.timing === 'independent_session' &&
  headerLen.work + headerLen.optional === Math.round(walkShown.totalSeconds / 60) && headerLen.optional === Math.round(walkShown.optionalSeconds / 60),
  { header, day: walkShown })
{
  // The same week, in the programme list: the row must end with the header's words.
  await go(`sam=1&today=${walkDay.date}`, `#/exercise/program/${shown?.liveWeek ?? 1}`, 3200)
  const rowNow = await text(`[data-program-day="${walkDay.day}"] [data-testid="program-day-length"]`)
  check('2a2. …and the programme row for that week ends with the very same words', !!headerLen && rowNow.endsWith(headerLen.worded), { rowNow, header: headerLen?.worded })
  await go(`sam=1&today=${walkDay.date}`, '#/tab/exercise', 4200)
}
check('2b. the lifting session, with anything optional on it, fits the 30-45 minutes asked for',
  !!headerLen && headerLen.work + headerLen.optional <= BAND_MAX.sam, headerLen)
const sep = await ev(`(() => {
  const heading = document.querySelector('[data-testid="separate-heading"]')
  const row = document.querySelector('[data-testid="separate-session-row"]')
  const note = document.querySelector('[data-testid="separate-note"]')
  row?.scrollIntoView({ block: 'center' })
  const r = row?.getBoundingClientRect()
  return {
    heading: heading?.innerText ?? null,
    row: (row?.innerText ?? '').replace(/\\s+/g, ' ').trim(),
    note: note?.innerText ?? null,
    inView: !!r && r.top >= 0 && r.bottom <= window.innerHeight,
    finisherRows: document.querySelectorAll('[data-testid="finisher-row"]').length,
    finishHeading: !!document.querySelector('[data-testid="finish-heading"]') && !document.querySelector('[data-testid="finisher-row-optional"]'),
    saysFinisher: /finisher/i.test(document.querySelector('[data-tour="extoday"]')?.parentElement?.innerText ?? document.body.innerText),
  }
})()`)
check('2c. the walk sits under "Also today", on screen', same(sep.heading, 'Also today') && sep.inView === true, sep)
check('2d. …its row is labelled a separate session and carries the plan\'s minutes', /^Separate session/i.test(sep.row) && sep.row.includes(`${walkShown?.cardio?.minutes} min`), sep.row)
check('2e. …with a line saying it is not part of the lifting time', sep.note === 'Not part of your lifting time. Do it any time today.', sep.note)
check('2f. the word "Finisher" is nowhere on the day, and no row is drawn as one', sep.finisherRows === 0 && sep.saysFinisher === false && sep.finishHeading === false, sep)
await shot('day-length-separate.png')
const todayWarmup = parseLength(await text('[data-testid="warmup-badge"]'))
check('2g. the warm-up badge reads the same minutes here as in the programme view (no drills added for today)',
  !!programWarmup && !!todayWarmup && programWarmup.work === todayWarmup.work, { programme: programWarmup, today: todayWarmup })

// ===========================================================================
console.log('\n  3. The header shows the day that is OPEN (L17)')
// ===========================================================================
check('3a. another day is tapped on the week strip', await tap(`[data-strip-day="${otherDay.day}"]`) === true)
await wait(900)
const peekHeader = parseLength(await text('[data-testid="week-context-header"]'))
check('3b. the header now carries THAT day\'s length, not today\'s',
  !!peekHeader && !!otherShown && peekHeader.work + peekHeader.optional === Math.round(otherShown.totalSeconds / 60) && peekHeader.work + peekHeader.optional !== (headerLen?.work ?? 0) + (headerLen?.optional ?? 0),
  { peek: peekHeader, today: headerLen, wantMinutes: otherShown ? Math.round(otherShown.totalSeconds / 60) : null })
check('3c. …and no "shorter than you asked for" note about a day that is not today', (await text('[data-testid="session-length-note"]')) === '')
await shot('day-length-peek.png')

// ===========================================================================
console.log('\n  4. "Shoulders & Abs" with no overhead press says what the day is')
// ===========================================================================
await go(`sam=1&today=${gapDay.date}`, '#/tab/exercise', 4200)
const gap = await ev(`(() => {
  const n = document.querySelector('[data-testid="day-gap-note"]')
  n?.scrollIntoView({ block: 'center' })
  const r = n?.getBoundingClientRect()
  return { text: n?.innerText ?? null, inView: !!r && r.top >= 0 && r.bottom <= window.innerHeight, page: document.body.innerText }
})()`)
check('4a. the note is on screen and describes the day', gap.text === "No overhead pressing while your shoulder's flagged, so today is upper back and abs." && gap.inView === true, { text: gap.text, inView: gap.inView })
check('4b. "not a bug" is nowhere on the page, and the note sends nobody to Profile', !/not a bug/i.test(gap.page) && !/profile/i.test(gap.text ?? ''), gap.text)
await shot('day-length-gap-note.png')
await go(`sam=1&today=${walkDay.date}`, '#/tab/exercise', 4200)
check('4c. a day that is what its name says carries no note', (await ev(`document.querySelectorAll('[data-testid="day-gap-note"]').length`)) === 0)

// ===========================================================================
console.log('\n  5. An optional part is said as optional — header, programme and Home agree')
// ===========================================================================
await go('mobility=1', '#/tab/exercise')
const mob = await ev('window.__dayLengthTargets ?? null')
const optDay = (mob?.days ?? []).find(d => d.optionalSeconds >= 300) ?? null
check('5a. the second fixture has a day with five minutes or more of optional filler', !!optDay, (mob?.days ?? []).map(d => [d.day, Math.round(d.optionalSeconds / 60)]))
const want = optDay ? { total: Math.round(optDay.totalSeconds / 60), optional: Math.round(optDay.optionalSeconds / 60) } : { total: -1, optional: -1 }
await go(`mobility=1&today=${optDay?.date ?? ''}`, '#/tab/exercise', 4200)
const mobShown = await targets()
const optShown = (mobShown?.days ?? []).find(d => d.day === optDay?.day) ?? null
if (optShown) { want.total = Math.round(optShown.totalSeconds / 60); want.optional = Math.round(optShown.optionalSeconds / 60) }
const optHeader = parseLength(await text('[data-testid="week-context-header"]'))
check('5b. the header says the work and the optional part apart, and they add up to the day',
  !!optHeader && optHeader.optional === want.optional && optHeader.work + optHeader.optional === want.total && / · \+ \d+ optional$/.test(optHeader.worded), { optHeader, want })
const optRows = await ev(`[...document.querySelectorAll('[data-testid^="finisher-row"]')].map(r => (r.innerText ?? '').replace(/\\s+/g, ' ').trim().slice(0, 60))`)
check('5c. every row behind that optional figure is labelled "Optional"', (optRows ?? []).some(r => /^Optional/i.test(r)), optRows)
await shot('day-length-optional.png')
await go(`mobility=1&today=${optDay?.date ?? ''}`, '#/tab/home', 3500)
const home = await text('[data-testid="home-session-length"]')
check('5d. Home prints the identical worded length', !!optHeader && home === optHeader.worded, { home, header: optHeader?.worded })
await shot('day-length-home.png')
await go(`mobility=1&today=${optDay?.date ?? ''}`, `#/exercise/program/${mobShown?.liveWeek ?? 1}`)
const optRow = await text(`[data-program-day="${optDay?.day}"] [data-testid="program-day-length"]`)
check('5e. …and so does the programme list', !!optHeader && optRow.endsWith(optHeader.worded), { optRow, header: optHeader?.worded })

console.log(`\n${ran} checks ran, ${failures} failed.`)
console.log(failures === 0 ? '\nA day\'s length says what it is made of, and a separate walk is not a finisher.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
