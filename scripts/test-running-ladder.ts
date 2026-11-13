// test:running-ladder — his 13 Nov 2026 strategy, slice 6 ("Build it"), docs/plans/running.md.
// The ladder (walk-run to a half), the 10% rule both ways (the week off the week before, today's run off the log), the
// lighter fourth week, the race date counting back, which days run and which lift, the plan it builds, and his two
// rulings of the day: a race date is asked by the coach only, and no pace anywhere.
import { readFileSync } from 'fs'
import {
  runningWeek, weekMinutes, weeksToGoal, reachableByRace, runningCounts, chooseRunningDays, runForToday, taperForRace,
  runningStartWeek, ladderWeekOf, withRunDays, isRunDay, runOnDay, isRunLog, RUNNING_GOAL_OPTIONS, type RunningGoal,
} from '../src/lib/running'
import { generateMesocycle, setRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { assembleProfile, initialSlotValues, ONBOARDING_SLOTS } from '../src/lib/onboarding-slots'
import { detectPlanInvalidation } from '../src/lib/plan-invalidation'
import { PATHWAY_RUN_FOCUS } from '../src/lib/pathway'
import { rebuildAgainstProfile } from '../src/lib/plan-adaptations'
import { buildDayGuard } from '../src/lib/plan-guard'
import { NO_ACTIVE_ADAPTATIONS } from '../src/lib/effective-constraints'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'
import { RUNNERS } from './running-personas'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const GOALS: RunningGoal[] = ['run_20', '5k', '10k', 'half']
const STARTS = [{}, { baseMinutes: 30 }, { age: 68 }, { age: 68, baseMinutes: 30 }]
const PACE = /pace|per (km|kilomet|mile)|\/ ?km|\/ ?mi\b|min\/|minutes? per/i

console.log('test:running-ladder\n')

console.log('1. The ladder')
const first = runningWeek('5k', 1)
check('from nothing, week 1 is walk-run, three sessions of 8 rounds: run 1 minute, walk 90 seconds',
  first.stage === 1 && first.sessions.length === 3 && first.sessions.every(s => s.kind === 'walk_run' && /8 rounds: run 1 minute, walk 90 seconds/.test(s.detail)),
  first.sessions.map(s => s.detail))
let overTen: string[] = []
let lighterBad: string[] = []
let hardInLighter: string[] = []
let tooHard: string[] = []
let paced: string[] = []
for (const goal of GOALS) {
  for (const opts of STARTS) {
    let prev = 0
    for (let w = 1; w <= 52; w++) {
      const wk = runningWeek(goal, w, opts)
      const m = weekMinutes(wk)
      if (wk.lighter !== (w % 4 === 0)) lighterBad.push(`${goal} w${w} lighter flag`)
      if (wk.lighter) {
        if (prev > 0 && m > prev * 0.85) lighterBad.push(`${goal} ${JSON.stringify(opts)} w${w}: ${m} after ${prev}`)
        if (wk.sessions.some(s => s.targetRpe >= 6)) hardInLighter.push(`${goal} w${w}`)
      } else {
        if (prev > 0 && m > prev * 1.1 + 0.5) overTen.push(`${goal} ${JSON.stringify(opts)} w${w}: ${prev} -> ${m}`)
        prev = m
      }
      // About four in five running minutes are Easy: the Steady and Hard minutes, read off each session's own words.
      const hard = wk.sessions.reduce((n, s) => {
        const steady = /(\d+) minutes Steady/.exec(s.detail)
        const reps = /(\d+) rounds: 2 minutes Hard/.exec(s.detail)
        return n + (steady ? +steady[1] : 0) + (reps ? +reps[1] * 2 : 0)
      }, 0)
      if (hard > m * 0.2) tooHard.push(`${goal} w${w}: ${hard} of ${m}`)
      for (const s of wk.sessions) if (PACE.test(s.detail) || PACE.test(s.focus)) paced.push(s.detail)
    }
  }
}
check('no week rises more than 10% on the last full week (4 goals x 4 starts x 52 weeks)', overTen.length === 0, overTen.slice(0, 5))
check('every fourth week is lighter, at most 85% of the week before it', lighterBad.length === 0, lighterBad.slice(0, 5))
check('...and a lighter week has no Steady or Hard session', hardInLighter.length === 0, hardInLighter.slice(0, 5))
check('Steady and Hard minutes are never more than a fifth of a week', tooHard.length === 0, tooHard.slice(0, 5))
check('no session ever names a pace (his ruling "No pace")', paced.length === 0, paced.slice(0, 3))
check('weeks to each goal from nothing: 20 minutes 13, 5 km 21, 10 km 29, half 38',
  GOALS.map(g => weeksToGoal(g)).join() === '13,21,29,38', GOALS.map(g => weeksToGoal(g)))
const half52 = runningWeek('half', 51).sessions.find(s => s.kind === 'long')
check('the half marathon long run holds at 2 h 15 of running (140 minutes with the warm-up walk)', half52?.minutes === 140, half52?.minutes)
const fiveK52 = runningWeek('5k', 51).sessions.find(s => s.kind === 'long')
check('the 5 km long run holds at 40 minutes of running', fiveK52?.minutes === 45, fiveK52?.minutes)
const based = runningWeek('half', 1, { baseMinutes: 30 })
check('someone who runs 30 minutes now starts at continuous running, the long run at 30', based.stage !== 1 && based.sessions.find(s => s.kind === 'long')?.minutes === 35, based.sessions.map(s => s.minutes))
const olderWalkRun = [1, 2, 3, 4, 5].map(w => runningWeek('half', w, { age: 68, baseMinutes: 30 }).stage)
check('from 65, walk-run is never skipped: four weeks of it even for someone who runs 30 minutes', olderWalkRun.slice(0, 4).every(s => s === 1), olderWalkRun)
check('...while under 65 the same answer skips it', runningWeek('half', 1, { age: 64, baseMinutes: 30 }).stage !== 1)
const run20 = runningWeek('run_20', 30)
check('the 20-minute goal holds at runs of 20 minutes or more, and never a quality session', run20.sessions.every(s => s.kind !== 'steady' && s.kind !== 'intervals' && s.minutes >= 25), run20.sessions.map(s => `${s.kind}:${s.minutes}`))

console.log('\n2. A race date counts back (told to the coach only)')
check('half in 10 weeks from nothing: not even 20 minutes is safe', reachableByRace('half', 10) === null)
check('half in 20 weeks from nothing: 20 minutes non-stop instead', reachableByRace('half', 20) === 'run_20')
check('half in 30 weeks from nothing: 5 km instead', reachableByRace('half', 30) === '5k')
check('half in 60 weeks: the half itself', reachableByRace('half', 60) === 'half')
check('10 km in 25 weeks for someone running 30 minutes: 10 km (16 weeks plus the taper fits)', reachableByRace('10k', 25, { baseMinutes: 30 }) === '10k')
const planned = { activity: 'Run', duration: 45, targetRpe: 4, reason: '' }
check('race day says so', taperForRace({ minutes: 45, heldBack: null }, '2027-04-11', '2027-04-11').heldBack?.startsWith('Race day') === true)
check('five days out: about half the minutes', taperForRace({ minutes: 45, heldBack: null }, '2027-04-06', '2027-04-11').minutes === 25)
check('ten days out: about seven tenths', taperForRace({ minutes: 45, heldBack: null }, '2027-04-01', '2027-04-11').minutes === 33)
check('three weeks out: as planned', taperForRace({ minutes: 45, heldBack: null }, '2027-03-21', '2027-04-11').minutes === 45)
check('after the race: as planned', taperForRace({ minutes: 45, heldBack: null }, '2027-04-12', '2027-04-11').minutes === 45)

console.log('\n3. Today\'s run, held to what he has run (the 10% rule off the log)')
const logs = [
  { date: '2026-11-10', minutes: 30, activity: 'Run' },
  { date: '2026-11-08', minutes: 50, activity: 'Walk' },
  { date: '2026-10-01', minutes: 60, activity: 'Run' },
]
const held = runForToday(planned, '2026-11-13', logs)
check('a 40-minute run after a longest 30 in the last 30 days is kept to 33 (38 with the warm-up)', held.minutes === 38 && /10%/.test(held.heldBack ?? ''), held)
check('...a walk is not a run, and a run 43 days ago does not count', held.minutes === 38)
const none = runForToday(planned, '2026-11-13', [])
check('with nothing logged, the first number stands: 20 minutes of running', none.minutes === 25 && !!none.heldBack, none)
const fits = runForToday({ ...planned, duration: 35 }, '2026-11-13', logs)
check('a run inside the limit is as planned, with no line', fits.minutes === 35 && fits.heldBack === null, fits)
const wr = runForToday({ activity: 'Walk-run', duration: 26, targetRpe: 4 }, '2026-11-13', [])
check('a walk-run session is left alone (its minutes stay; the running inside grows)', wr.minutes === 26 && wr.heldBack === null, wr)
check('run logs are read by their words: "Run", "jog", "parkrun", "walk-run"; never "Walk", "Bike" or a walk with a bit of running',
  ['Run', 'Easy run', 'jogging', 'parkrun', 'Walk-run'].every(isRunLog) && !['Walk', 'Bike', 'Brisk walk', 'Walk then run'].some(isRunLog))

console.log('\n4. Which days run, which lift (mine, CSCS: runs replace lifting down to two, one for a half)')
check('counts: 3 days -> 2 runs + 1 lift; 4 -> 2 + 2; 5 -> 3 + 2; a half on 4 -> 3 + 1; 1 day -> lifting only',
  JSON.stringify([3, 4, 5].map(d => runningCounts('5k', d))) === '[{"runs":2,"lifts":1},{"runs":2,"lifts":2},{"runs":3,"lifts":2}]'
  && JSON.stringify(runningCounts('half', 4)) === '{"runs":3,"lifts":1}' && JSON.stringify(runningCounts('5k', 1)) === '{"runs":0,"lifts":1}')
const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const idx = (d: string) => ALL.indexOf(d)
let beforeHard = 0, overlaps = 0, sixMax = 0, oneLong = 0, cases = 0
for (let m = 1; m < 128; m++) {
  const days = ALL.filter((_, i) => m & (1 << i))
  for (const g of ['5k', 'half'] as const) {
    cases++
    const s = chooseRunningDays(days, g)
    const lift = new Set(s.liftDays.map(idx))
    for (const r of s.runDays) if (r.role !== 'easy' && lift.has((idx(r.day) + 6) % 7)) beforeHard++
    if (s.runDays.some(r => s.liftDays.includes(r.day)) || [...s.liftDays, ...s.runDays.map(r => r.day)].some(d => !days.includes(d))) overlaps++
    if (s.liftDays.length + s.runDays.length > 6) sixMax++
    if (s.runDays.length >= 2 && s.runDays.filter(r => r.role === 'long').length !== 1) oneLong++
  }
}
check(`never a lifting day the day before the long run or the hard session (${cases} day sets x goals)`, beforeHard === 0, beforeHard)
check('a run day is never a lifting day, and only his own days are used', overlaps === 0, overlaps)
check('at most six days hold a session: one full rest day a week', sixMax === 0, sixMax)
check('exactly one long run a week', oneLong === 0, oneLong)
const five = chooseRunningDays(['Monday', 'Wednesday', 'Friday', 'Saturday', 'Sunday'], '5k')
check('Mon, Wed, Fri, Sat, Sun: lift Monday and Friday, the long run on Sunday',
  five.liftDays.join() === 'Monday,Friday' && five.runDays.find(r => r.role === 'long')?.day === 'Sunday', five)

console.log('\n5. The plan it builds')
function plan(key: string): MesocycleWeek[] {
  const r = RUNNERS.find(x => x.key === key)!
  setRandomSource(seededRngFromKey(key))
  return generateMesocycle(r.profile)
}
const silent = console.log
console.log = (...a: unknown[]) => { if (typeof a[0] === 'string' && a[0].startsWith('[weekly')) return; silent(...a) }
const r30 = plan('r30-5k')
const r45 = plan('r45-half')
const r68 = plan('r68-20')
console.log = silent
const runs = (w: MesocycleWeek | undefined) => (w?.days ?? []).filter(isRunDay)
const lifts = (w: MesocycleWeek | undefined) => (w?.days ?? []).filter(d => d.exercises.length > 0)
check('couch to 5 km on four days: every week two runs and two lifting days', r30.every(w => runs(w).length === 2 && lifts(w).length === 2),
  r30.map(w => `${runs(w).length}r${lifts(w).length}l`).join(' '))
check('the 45-year-old aiming at a half on five days: three runs and two lifting days', r45.every(w => runs(w).length === 3 && lifts(w).length === 2),
  r45.map(w => `${runs(w).length}r${lifts(w).length}l`).join(' '))
const dupes = [...r30, ...r45].filter(w => new Set(w.days.map(d => d.day)).size !== w.days.length)
check('no day appears twice in a week (a run day takes the whole day)', dupes.length === 0, dupes.map(w => w.week_number))
const runsWithWork = [...r30, ...r45].flatMap(w => runs(w)).filter(d => d.exercises.length > 0)
check('a run day carries no lifting', runsWithWork.length === 0)
const eveOfLong = [...r30, ...r45].filter(w => {
  const long = w.days.find(d => d.focus === 'Long run')
  if (!long) return false
  const before = ALL[(idx(long.day) + 6) % 7]
  return w.days.some(d => d.day === before && d.exercises.length > 0)
})
check('no lifting the day before a long run, in any week of either plan', eveOfLong.length === 0, eveOfLong.map(w => w.week_number))
check('week 1 of couch to 5 km is walk-run', runs(r30[0]).every(d => d.plannedActivity?.activity === 'Walk-run'))
check('the 45-year-old\'s week 1 is continuous running from his 30 minutes', runs(r45[0]).every(d => d.plannedActivity?.activity === 'Run')
  && runs(r45[0]).some(d => d.focus === 'Long run' && d.plannedActivity?.duration === 35))
const runSentence = (note: string | undefined) => /Running this week:[^.]*\./.exec(note ?? '')?.[0] ?? ''
check('each week\'s coaching says the running, never a pace', r45.every(w => /^Running this week: 3 runs/.test(runSentence(w.coach_note)) && !PACE.test(runSentence(w.coach_note))),
  r45[0]?.coach_note)
check('the 68-year-old starting out: weeks 1-2 walks only', [0, 1].every(i => (r68[i]?.days ?? []).every(d => !runOnDay(d))))
check('...from week 3 three runs: the walk-only day and after each home strength session', (r68[2]?.days ?? []).filter(d => runOnDay(d)).length === 3
  && (r68[2]?.days ?? []).filter(d => d.focus === PATHWAY_RUN_FOCUS).length === 2, r68[2]?.days.map(d => d.focus))
check('...and nothing on the pathway carries a weight', r68.every(w => w.days.every(d => d.exercises.every(e => !e.suggested_load_kg))))
const plain: UserProfile = { ...RUNNERS[1].profile, running_goal: null }
setRandomSource(seededRngFromKey('plain'))
console.log = (...a: unknown[]) => { if (typeof a[0] === 'string' && a[0].startsWith('[weekly')) return; silent(...a) }
const noGoal = generateMesocycle(plain)
console.log = silent
check('with no running goal there is no run anywhere and every training day lifts',
  noGoal.every(w => runs(w).length === 0 && lifts(w).length === 4), noGoal.slice(0, 2).map(w => `${runs(w).length}r${lifts(w).length}l`))

console.log('\n6. A goal added mid-plan starts at the bottom of the ladder')
check('a plan with no runs, rebuilt from week 9: the ladder starts at week 9', runningStartWeek(noGoal, 9) === 9)
check('a plan already running from week 1, rebuilt from week 9: still week 1', runningStartWeek(r30, 9) === 1)
check('plan week 9 is ladder week 1 when it started at 9; week 5 is before it (no runs)', ladderWeekOf(9, 9) === 1 && ladderWeekOf(5, 9) < 1)
const before = withRunDays(noGoal[4].days, ladderWeekOf(5, 9), { ...plain, running_goal: '5k' })
check('...so a week before the start gets no runs', before.filter(isRunDay).length === 0)
const atStart = withRunDays(noGoal[8].days, ladderWeekOf(9, 9), { ...plain, running_goal: '5k' })
check('...and the first week from it is walk-run, not the middle of the ladder', atStart.filter(isRunDay).every(d => d.plannedActivity?.activity === 'Walk-run') && atStart.some(isRunDay))

async function rebuiltFromWeek9(): Promise<MesocycleWeek[]> {
  const created = new Date(2026, 10, 16, 0, 0, 0).toISOString()
  const calendar = { planCreatedAt: created, today: '2026-11-16', moves: [] }
  const context = { isProtected: buildDayGuard(noGoal, { ...calendar, loggedDates: [], closedDates: [] }), constraints: NO_ACTIVE_ADAPTATIONS, calendar, constrainedUntil: null }
  const quiet = console.log
  console.log = (...a: unknown[]) => { if (typeof a[0] === 'string' && a[0].startsWith('[weekly')) return; quiet(...a) }
  try {
    return await rebuildAgainstProfile({ ...plain, running_goal: '5k' }, [], noGoal, noGoal.filter(w => w.week_number >= 9).map(w => w.week_number), context as never, 'run-from-9')
  } finally { console.log = quiet }
}

console.log('\n7. Setup, Profile, the rebuild offer and the coach')
const slot = ONBOARDING_SLOTS.find(s => s.key === 'runningGoal')
check('setup asks it, optional, with "Not for now" and the four goals', !!slot && slot.required === false
  && JSON.stringify((slot.options ?? []).map(o => o.value)) === JSON.stringify(['none', ...RUNNING_GOAL_OPTIONS.map(o => o.value)]))
check('...and never asks a race date (his ruling: the coach only)', !ONBOARDING_SLOTS.some(s => /race/i.test(s.question)))
const v = { ...initialSlotValues() }
check('"Not for now" saves no goal; "5 km" saves 5k', assembleProfile({ ...v, runningGoal: 'none' } as never).running_goal === null
  && assembleProfile({ ...v, runningGoal: '5k' } as never).running_goal === '5k')
const offer = detectPlanInvalidation({ running_goal: null } as UserProfile, { running_goal: '10k' })
check('choosing a goal on Profile offers the rebuild, naming it', offer?.field === 'running_goal' && /10 km/i.test(offer?.title ?? ''), offer)
check('...and taking it away offers one too', detectPlanInvalidation({ running_goal: '10k' } as UserProfile, { running_goal: null })?.field === 'running_goal')
const app = readFileSync('src/App.tsx', 'utf8')
check('the first save names the column, and drops it while its database step has not run',
  /running_goal: enrichedProfile\.running_goal/.test(app) && /PENDING_COLUMNS = \[[^\]]*'running_goal'/.test(app))
const profileScreen = readFileSync('src/components/ProfileScreen.tsx', 'utf8')
check('Profile has the row', /data-testid="profile-running-goal"/.test(profileScreen) && /savePatch\(\{ running_goal:/.test(profileScreen))
const coach = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
check('the coach has the tool, and is told never to give a pace and to ask a race date itself',
  /name: "propose_running_goal"/.test(coach) && /NEVER give a pace/.test(coach) && /ASK for the date before the card/.test(coach))
const chat = readFileSync('src/components/ChatAssistant.tsx', 'utf8')
check('the chat builds the card, applies it and can put it back',
  /buildRunningGoalProposal\(result\.proposal\.rawArgs\)/.test(chat) && /executeRunningGoal\(/.test(chat) && /row\.kind === 'propose_running_goal'\) \{\n\s+\/\/ The plan goes back/.test(chat))
const card = readFileSync('src/components/exercise/RestDayCard.tsx', 'utf8')
check('today\'s run card holds the run to the log and the race', /runForToday\(planned, date,/.test(card) && /data-testid="run-held-back"/.test(card))

void (async () => {
  console.log('\n8. A real rebuild that adds the goal at week 9')
  const rebuilt = await rebuiltFromWeek9()
  const w9 = rebuilt.find(w => w.week_number === 9)
  const w8 = rebuilt.find(w => w.week_number === 8)
  check('week 9 opens with walk-run (the bottom of the ladder), not week 9 of it', runs(w9).length === 2 && runs(w9).every(d => d.plannedActivity?.activity === 'Walk-run'),
    runs(w9).map(d => `${d.focus} ${d.plannedActivity?.duration}`))
  check('...and week 8, before the change, is left as it was', runs(w8).length === 0)
  console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
})()
