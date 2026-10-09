// ---------------------------------------------------------------------------
// HISTORY AND THE STREAK TELL THE TRUTH, ON THE SCREENS — M15, M30, M16, M31.
// 9 Oct 2026.
//
// The tester, after two workouts: "5 sessions · 7 PRs"; "swapped · 0m · 0kg ·
// 0 sets" and "moved · 2026-10-10" (a future date) listed as sessions;
// "training · 2026-10-09" beside "Thursday · 2026-10-08"; and a streak of
// "2 days" on both days.
//
// scripts/test-history-streak.ts holds the rules. This puts the same kinds of
// row in the database as the database would hold them (input only — four
// workouts, one of them moved to a day off; football instead of a session; a
// move to a day that has not happened; a walk from before the plan existed)
// and reads what Home, Session history and Tools then say.
//
// THE NUMBERS ARE CHOSEN SO THE OLD RULE AND THE NEW ONE DISAGREE: by weekday
// pattern this fixture scores 2 (the two moved-from days are two misses in one
// plan week, and the streak stops at the second) or more with the football and
// the pre-plan walk counted; by planned sessions on the date they ran, 4.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9605, passed: 'History lists the workouts, the streak counts planned sessions where they were done, and both say so.' })
const { ev, check, finish, tapExpr, q, byText, until, wait, load, tick, exerciseNames, shoot, escape, beforeLoad, ensureOpen, rowsExpr } = b

const goto = async tab => { await ev(`window.location.hash = '#/tab/${tab}'`); await wait(1500) }
const streak = async () => { await goto('home'); await until(`!!${q('[data-testid="home-streak"]')}`, 8000); await wait(600); return ev(`${q('[data-testid="home-streak"]')}?.innerText.replace(/\\s+/g, ' ').trim() ?? null`) }
const openHistory = async () => {
  await goto('exercise')
  await until(`!!${q('button[aria-label="More options"]')}`, 8000)
  await ev('window.scrollTo(0, 0)'); await wait(300)
  await tapExpr(q('button[aria-label="More options"]'))
  await until(`!!${byText('Session history', '[role="menuitem"]')}`, 3000)
  await ev(`${byText('Session history', '[role="menuitem"]')}?.click()`)
  await until(`document.querySelectorAll('[data-testid="history-session"], [data-testid="history-cardio-day"]').length > 0`, 6000)
  await wait(400)
  return ev(`[...document.querySelectorAll('[data-testid="history-session"], [data-testid="history-cardio-day"]')].map(n => ({ kind: n.getAttribute('data-testid'), title: n.querySelector('p')?.textContent ?? '', text: n.innerText.replace(/\\s+/g, ' ').trim() }))`)
}

// Offsets from the harness's today (a Wednesday; it trains Wed, Fri, Sun, Mon;
// the plan is nine days old, so it began on the Monday before last).
await beforeLoad(`window.__seedDb = (db, ctx) => {
  const day = n => { const d = new Date(ctx.today + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  const note = (id, n, o) => db.workout_sessions.push({ id, profile_id: ctx.profileId, date: day(n), split_type: 'training', day: null, week_number: null, duration_minutes: 0, is_completed: false, moved_to_date: null, swapped_for_activity: null, ...o })
  const workout = (id, n) => {
    // No day on the row: a session started with the button before the fix.
    note(id, n, { duration_minutes: 40, is_completed: true, started_at: day(n) + 'T12:00:00' })
    for (const s of [1, 2]) db.exercise_set_logs.push({ id: id + '-' + s, user_id: ctx.profileId, session_id: id, date: day(n), exercise_name: 'Goblet Squats', exercise_id: 'goblet-squats', set_number: s, weight_kg: 16, reps_completed: 10, is_bodyweight: false, is_warmup: false, drop_index: 0, completed_at: day(n) + 'T12:0' + s + ':00', created_at: day(n) + 'T12:0' + s + ':00' })
  }
  workout('w-mon', -2)                                        // Monday: planned, done
  note('n-sun', -3, { split_type: 'swapped', swapped_for_activity: 'Football' })   // Sunday: football instead
  db.cardio_logs.push({ id: 'c-sun', user_id: ctx.profileId, date: day(-3), activity_name: 'Football', duration_minutes: 60, intensity_rpe: 8, completed_at: day(-3) + 'T18:00:00', created_at: day(-3) + 'T18:00:00' })
  note('n-fri', -5, { split_type: 'moved', moved_to_date: day(-4) })               // Friday's session, moved to Saturday...
  workout('w-sat', -4)                                        // ...and done there
  note('n-wed', -7, { split_type: 'moved', moved_to_date: day(-6) })               // last Wednesday's, moved to Thursday...
  workout('w-thu', -6)                                        // ...and done there: TWO completed moves in one plan week
  workout('w-mon0', -9)                                       // the plan's first day: planned, done
  db.cardio_logs.push({ id: 'c-pre', user_id: ctx.profileId, date: day(-10), activity_name: 'Walk', duration_minutes: 30, intensity_rpe: 3, completed_at: day(-10) + 'T09:00:00', created_at: day(-10) + 'T09:00:00' })   // the Sunday BEFORE the plan existed
  note('n-next', 2, { split_type: 'moved', moved_to_date: day(3) })                // this Friday's, moved to Saturday: a day that has not happened
  window.__days = { mon: day(-2), sun: day(-3), fri: day(-5), sat: day(-4), wed: day(-7), thu: day(-6), mon0: day(-9), pre: day(-10), next: day(2), today: ctx.today }
}`)

console.log('\nHISTORY AND THE STREAK\n')
await load('', { tab: 'home' })
await until(`!!window.__days && !!${q('[data-testid="home-streak"]')}`, 12000)
const D = await ev('window.__days')
const rowsStored = await ev(`(window.__fakeDb?.workout_sessions ?? []).length`)
check('0. eight rows are in the sessions table: four workouts and four day notes', rowsStored === 8, rowsStored)

console.log('\n  1. HOME — the streak')
const s1 = await streak()
check('1a. FOUR: Monday, the two sessions done on the days they were moved to, the first Monday', /^4 /.test(s1 ?? ''), s1)
check('1b. ...called what it counts: "sessions in a row", not "days streak"', s1 === '4 sessions in a row', s1)
const pill = await ev(`(() => { const n = ${q('[data-testid="home-streak"]')}; const r = n.getBoundingClientRect(); return { right: Math.round(r.right), vw: innerWidth, h: Math.round(r.height), wraps: n.scrollWidth > n.clientWidth + 1 } })()`)
check('1c. the pill fits beside the greeting', !!pill && pill.right <= pill.vw && !pill.wraps && pill.h < 40, pill)
await shoot('history-streak-home')

console.log('\n  2. SESSION HISTORY')
const hist = (await openHistory()) ?? []
const sessions = hist.filter(h => h.kind === 'history-session')
check('2a. FOUR SESSIONS ARE LISTED — the four workouts', sessions.length === 4, hist.map(h => h.title))
check('2b. ...on the days they were done, the moved ones on their Saturday and Thursday', sessions.map(s => s.title.split(' · ')[1]).join() === [D.mon, D.sat, D.thu, D.mon0].join(), sessions.map(s => s.title))
check('2c. EVERY TITLE IS A WEEKDAY AND A DATE — none says "training", though no row was told its day', sessions.map(s => s.title.split(' · ')[0]).join() === 'Monday,Saturday,Thursday,Monday', sessions.map(s => s.title))
check('2d. NO "moved" ENTRY, and nothing dated after today', !hist.some(h => /moved|swapped|missed|rest ·/i.test(h.title)) && !hist.some(h => h.title.includes(D.next) || h.title.includes(D.fri) || h.title.includes(D.wed)), hist.map(h => h.title))
check('2e. no "0m · 0kg · 0 sets" anywhere', !hist.some(h => /0kg · 0 sets?/.test(h.text)), hist.map(h => h.text))
const football = hist.find(h => h.title.includes(D.sun))
check('2f. the football is there as an activity: "Football · 60 min · Hard"', football?.kind === 'history-cardio-day' && /Football · 60 min · Hard/.test(football.text), football)
check('2g. each session says "2 sets"', sessions.every(s => /· 2 sets$/.test(s.text.replace(/ (Football|Walk).*$/, ''))), sessions.map(s => s.text))
await shoot('history-streak-history')
await escape()

console.log('\n  3. TOOLS')
await goto('tools')
const tools = await until(`(document.body.innerText.match(/\\d+ sessions? · \\d+ PRs?/) ?? [null])[0]`, 6000)
check('3a. "4 sessions" — workouts, not rows (eight) and not rows plus activity days (ten)', /^4 sessions · /.test(tools ?? ''), tools)

console.log('\n  4. TODAY\'S SESSION IS DONE — the streak moves')
await goto('exercise')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(800)
const names = (await exerciseNames()) ?? []
let X = null
for (const n of names) { await ensureOpen(n); if ((await ev(`${rowsExpr(n)}.length`)) >= 1) { X = n; break } }
check('4a. a set of today\'s session is ticked', !!X && (await tick(X, 0)) === true, names)
const s2 = await streak()
check('4b. FIVE — it sat on the same number after a second day\'s training', s2 === '5 sessions in a row', s2)
const hist2 = (await openHistory()) ?? []
const todays = hist2.find(h => h.title.includes(D.today))
check('4c. today is in history, titled by its weekday, with "1 set"', todays?.kind === 'history-session' && /^Wednesday · /.test(todays.title) && /· 1 set( |$)/.test(todays.text), todays)

finish()
