// ---------------------------------------------------------------------------
// test:layout-revamp — Home (2a), Nutrition (2b) and setup (2e) from the
// design handoff of 10 Oct 2026, run rather than read where it can be.
//
//  1. Home's coach note: the tips in the brief's order (the day's pick, then
//     "what's left", then the rest), rotating every 6s, held while touched or
//     focused, and still under reduced motion (WCAG 2.2.2).
//  2. Home's week volume: working sets Monday to today, against last week's
//     SAME days — never last week's whole week against part of this one.
//  3. Home's finished day keeps the lift line, and its summary is the card
//     from this day only.
//  4. Nutrition's meals: Eaten, then one Up next (the first meal not eaten
//     that has a dish), then Later; an upcoming day has no Eaten or Up next.
//  5. Setup: the question is the last sentence that asks, and the lead-in is
//     everything before it, so nothing the coach said is dropped.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { eligibleCoachTips, selectCoachTipWithKey } from '../src/lib/coach-tips'
import { weekVolume } from '../src/lib/week-volume'
import { mealSections } from '../src/lib/meal-sections'
import { splitQuestion } from '../src/lib/onboarding-question'
import { saveSessionSummary, readSessionSummary } from '../src/lib/session-summary-store'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`) }
}
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n1. Home\'s coach note')
{
  const dash = code('src/components/Dashboard.tsx')
  const noteAt = dash.indexOf('export function HomeCoachNote')
  const note = noteAt >= 0 ? dash.slice(noteAt, noteAt + 3000) : ''
  check('the note exists', note.length > 200)
  check('it moves on every 6 seconds', /window\.setTimeout\(\(\) => go\(i \+ 1\), 6000\)/.test(note))
  check('...but never under reduced motion — the user can stop it (WCAG 2.2.2)', /prefers-reduced-motion: reduce/.test(note) && /if \([^)]*reduced[^)]*\) return/.test(note), note.slice(0, 600))
  check('...and it holds while touched or focused', /onFocusCapture=\{\(\) => setHeld\(true\)\}/.test(note) && /onPointerDown=\{\(\) => setHeld\(true\)\}/.test(note) && /if \([^)]*held[^)]*\) return/.test(note))
  check('an adaptation nudge with its actions is shown alone, never rotated away', /\? <TrainerNudge \{\.\.\.trainerNudge\} \/>\s*: plainTips\.length > 0 && <HomeCoachNote tips=\{plainTips\} \/>/.test(dash))
  // The order the brief gives: the day's pick, then what's left, then the rest.
  // A day where several tips are true at once, so their ORDER is a question.
  const ctx: Parameters<typeof eligibleCoachTips>[0] = {
    today: '2026-10-08', proteinAdherenceStreakDays: 5,
    knownLiftProgress: [{ name: 'Squat', deltaKg: 10 }],
    sessionsThisWeekSoFar: 3, sessionsLastWeekSameSpan: 1,
    scheduledSoFarThisWeek: 3, loggedOfScheduledSoFarThisWeek: 3,
    weightTrend: { ratePerWeekKg: -0.4, towardGoal: true }, recentPRs: [],
    waterMl: 0, waterTargetMl: 2500, hourOfDay: 20, firstDay: false,
  }
  const tips = eligibleCoachTips(ctx)
  const keys = tips.map(t => t.key)
  check('every eligible tip is offered once', new Set(keys).size === keys.length, keys)
  check('...in the brief\'s order: the pick, then what\'s left, then the others',
    /const plainTips: HomeTip\[\] = \[\.\.\.allTips\.slice\(0, 1\), \.\.\.whatsLeftTip, \.\.\.allTips\.slice\(1\)\]/.test(dash))
  check('...where the first of them is the day\'s own pick (eligibleCoachTips puts it first)',
    /coachTips[^\n]*eligibleCoachTips\(/.test(code('src/lib/dashboard-data.ts')) && tips.length > 1 && tips[0]?.key === selectCoachTipWithKey(ctx)?.key, keys)
}

console.log('\n2. Home\'s week volume')
{
  // Wednesday 7 Oct 2026 (measured: the 5th is the Monday, 28 Sep the Monday
  // before). Last week's same days are 28-30 Sep.
  const today = '2026-10-07'
  const logs = [
    { date: '2026-10-05' }, { date: '2026-10-06' }, { date: '2026-10-07' }, // this week, three
    { date: '2026-10-04' },                                                   // last Sunday: last week, after the same point
    { date: '2026-09-28' }, { date: '2026-09-29' }, { date: '2026-09-30' }, { date: '2026-09-30' }, // last Mon-Wed, four
    { date: '2026-10-01' }, { date: '2026-10-02' },                           // last Thu-Fri: after the same point
    { date: '2026-09-27' },                                                   // the Sunday before: outside both
    { date: '2026-10-08' },                                                   // tomorrow (a clock skew, a bad row): never counted
  ]
  const v = weekVolume(logs, today)
  check('this week counts Monday to today', v.thisWeek === 3, v)
  check('last week counts only the same days, Monday to last Wednesday', v.lastWeekSoFar === 4, v)
  const sunday = weekVolume([{ date: '2026-10-11' }, { date: '2026-10-05' }, { date: '2026-10-04' }], '2026-10-11')
  check('on a Sunday the week is Monday to Sunday', sunday.thisWeek === 2 && sunday.lastWeekSoFar === 1, sunday)
  check('Home asks this function', /weekVolume\(workingLogs, todayStr\)/.test(code('src/lib/dashboard-data.ts')))
}

console.log('\n3. Home\'s finished day')
{
  const dash = code('src/components/Dashboard.tsx')
  // RE-ANCHORED 17 Oct 2026 (one-page Home, 5c·5): the session is a row; its done branch keeps the lift
  // line and the summary, which is offered only when the finish card exists.
  const doneAt = dash.indexOf('} else if (done) {')
  // Up to the next branch, so the not-yet-done branch's own glance line cannot answer for it.
  const done = doneAt >= 0 ? dash.slice(doneAt, dash.indexOf('} else {', doneAt + 1)) : ''
  check('the Done panel keeps the lift line (L9: what she lifted, today)', /<span data-testid="home-session-glance">\{sessionGlance\}<\/span>/.test(done))
  check('...and offers the summary only when there is one',
    /onSummary=\{card \? \(\) => setSummaryOpen\(true\) : undefined\}/.test(dash) && /\{done && onSummary \? \([\s\S]{0,200}data-home-summary/.test(dash))
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, String(v)) }, removeItem: k => { store.delete(k) },
    clear: () => store.clear(), key: () => null, length: 0,
  } as Storage
  const card = { summary: { totalSets: 12 } } as unknown as Parameters<typeof saveSessionSummary>[2]
  saveSessionSummary('p1', '2026-10-08', card)
  check('the card is read back on the day it was made', readSessionSummary('p1', '2026-10-08') !== null)
  check('...and never on another day', readSessionSummary('p1', '2026-10-09') === null)
  check('...nor for another person', readSessionSummary('p2', '2026-10-08') === null)
}

console.log('\n4. Nutrition\'s meals: Eaten, Up next, Later')
{
  const slots = ['breakfast', 'lunch', 'dinner', 'snack']
  const s1 = mealSections({ slots, eaten: sl => sl === 'breakfast', hasDish: () => true, upcoming: false })
  check('a logged meal is Eaten', s1.eaten.join() === 'breakfast', s1)
  check('...the first one not eaten is Up next', s1.upNext === 'lunch', s1)
  check('...and the rest are Later, in slot order', s1.later.join() === 'dinner,snack', s1)
  const s2 = mealSections({ slots, eaten: () => false, hasDish: sl => sl !== 'breakfast', upcoming: false })
  check('a meal with no dish to serve is never Up next', s2.upNext === 'lunch' && s2.later.includes('breakfast'), s2)
  const s3 = mealSections({ slots, eaten: () => true, hasDish: () => true, upcoming: false })
  check('a day all eaten has no Up next and no Later', s3.upNext === null && s3.later.length === 0 && s3.eaten.length === 4, s3)
  const s4 = mealSections({ slots, eaten: sl => sl === 'breakfast', hasDish: () => true, upcoming: true })
  check('an upcoming day has nothing eaten and nothing up next — every meal is Later', s4.eaten.length === 0 && s4.upNext === null && s4.later.join() === slots.join(), s4)
  check('every slot is in exactly one section', [s1, s2, s3, s4].every(s => [...s.eaten, ...(s.upNext ? [s.upNext] : []), ...s.later].sort().join() === [...slots].sort().join()))
  check('the Nutrition tab asks this function', /mealSections\(\{/.test(code('src/components/MealPlan.tsx')))
}

console.log('\n5. Setup: the question and its lead-in')
{
  const cases: [string, string, string][] = [
    ["Nice — four days works. How long can your sessions usually run?", 'Nice — four days works.', 'How long can your sessions usually run?'],
    ['How old are you?', '', 'How old are you?'],
    ["That's everything I need.", '', "That's everything I need."],
    ['Got it, 4 days! Which days suit?\n', 'Got it, 4 days!', 'Which days suit?'],
    ['Line one.\nAnd what do you weigh right now?', 'Line one.', 'And what do you weigh right now?'],
    ['Thanks, that sets the numbers up\nWhat do you weigh right now?', 'Thanks, that sets the numbers up', 'What do you weigh right now?'],
  ]
  for (const [text, lead, ask] of cases) {
    const [l, a] = splitQuestion(text)
    check(`"${text.trim().slice(0, 40)}" → lead "${lead}", question "${ask}"`, l === lead && a === ask, [l, a])
  }
  const long = 'I can build around that. Before I do, which of these sounds most like your week, given everything you told me?'
  const [l, a] = splitQuestion(long)
  check('nothing is dropped: the two halves join back into the whole message', `${l} ${a}`.trim() === long, [l, a])
  const ui = code('src/components/onboarding/ConversationalOnboarding.tsx')
  check('the screen asks this function for the question', /splitQuestion\(msg\.content\)/.test(ui))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} check(s) failed`); process.exit(1) }
console.log('All passed.')
