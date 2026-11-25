// test:cardio-days — CARDIO DAYS A WEEK (his ruling 24 Nov 2026, "A, build it"; src/lib/cardio-days.ts).
// 1. how many days and which (lifting keeps two; an interval day never the day before lifting or another interval day);
// 2. the sessions: rounds for the timer, minutes for the countdown, progression, deload, the caps;
// 3. the plan it builds (generateMesocycle) and what it leaves alone (a running goal, starting out, none asked);
// 4. the goal's conditioning is not doubled up.
import {
  cardioDaysRequested, cardioDaysFrom, chooseCardioDays, intervalDaysFor, intervalSession, steadySession, isCardioDay,
  cardioSplitFor, INTERVALS_ACTIVITY, STEADY_ACTIVITY,
} from '../src/lib/cardio-days'
import { plannedRoundsOf } from '../src/lib/planned-rounds'
import { plannedTimedMinutes } from '../src/components/exercise/PlannedRoundsStart'
import { generateMesocycle, setRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'
import { RUNNERS } from './running-personas'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const idx = (d: string) => ALL.indexOf(d)

console.log('\n1. How many cardio days, and which')
check('only 1, 2 or 3 is a request; anything else is none', cardioDaysRequested({ cardio_days_per_week: 2 }) === 2 && cardioDaysRequested({ cardio_days_per_week: 5 }) === 0
  && cardioDaysRequested({ cardio_days_per_week: null }) === 0 && cardioDaysRequested(null) === 0)
check('lifting keeps two days: 4 days and 3 asked gives 2; 3 days gives 1; 2 days gives none',
  cardioDaysFrom(3, 4) === 2 && cardioDaysFrom(3, 3) === 1 && cardioDaysFrom(2, 2) === 0 && cardioDaysFrom(1, 6) === 1, [cardioDaysFrom(3, 4), cardioDaysFrom(3, 3), cardioDaysFrom(2, 2)])
check('one day is intervals, two are one of each, three are two intervals; a beginner or low recovery one at most',
  intervalDaysFor(1, false) === 1 && intervalDaysFor(2, false) === 1 && intervalDaysFor(3, false) === 2 && intervalDaysFor(3, true) === 1 && intervalDaysFor(0, false) === 0)
let beforeLift = 0, backToBack = 0, overlap = 0, sets = 0
for (let mask = 1; mask < 128; mask++) {
  const days = ALL.filter((_, i) => mask & (1 << i))
  for (const n of [1, 2, 3]) {
    const count = cardioDaysFrom(n, days.length)
    if (count === 0) continue
    for (const intervals of new Set([intervalDaysFor(count, false), intervalDaysFor(count, true)])) {
      sets++
      const s = chooseCardioDays(days, count, intervals)
      const lift = new Set(s.liftDays.map(idx))
      const hard = s.cardioDays.filter(c => c.kind === 'intervals').map(c => idx(c.day))
      // Counted against the FEWEST any split of these days could have: some sets (six or seven days) force one.
      // An interval day followed by lifting OR by another interval day: in a seven-day week one of them is forced.
      const eves = hard.filter(h => lift.has((h + 1) % 7) || hard.includes((h + 1) % 7)).length
      if (eves > fewestEves(days, count, intervals)) beforeLift++
      for (const h of hard) if (hard.includes((h + 1) % 7) && fewestBackToBack(days, count, intervals) === 0) backToBack++
      if (s.cardioDays.some(c => s.liftDays.includes(c.day)) || s.liftDays.length + s.cardioDays.length !== days.length || s.liftDays.length < 2) overlap++
    }
  }
}
check(`an interval day is the day before lifting or another interval day only where the days force it (${sets} day sets)`, beforeLift === 0, beforeLift)
check('two interval days are never back to back where the days allow it', backToBack === 0, backToBack)
check('every chosen day is used once, and lifting keeps at least two', overlap === 0, overlap)
const s5 = chooseCardioDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], 2, 1)
check('Mon-Fri, two cardio days: three lifting days and the interval day before a cardio or rest day', s5.liftDays.length === 3
  && s5.cardioDays.filter(c => c.kind === 'intervals').every(c => !s5.liftDays.includes(ALL[(idx(c.day) + 1) % 7])), s5)

console.log('\n2. The sessions')
const mid: Pick<UserProfile, 'training_experience' | 'health_conditions' | 'injuries'> = { training_experience: 'intermediate', health_conditions: [], injuries: [] }
const i1 = intervalSession(mid, 1, 0, false)
const i3 = intervalSession(mid, 3, 0, false)
const iDeload = intervalSession(mid, 4, 0, true)
check('intervals carry the rounds the timer runs: 8 x 30s hard, 60s easy, Hard', same(plannedRoundsOf(i1), { rounds: 8, workSeconds: 30, restSeconds: 60 }) && i1.targetRpe === 8 && i1.activity === INTERVALS_ACTIVITY, plannedRoundsOf(i1))
check('...and minutes that are the rounds plus ten easy minutes', i1.duration === Math.ceil((8 * 30 + 7 * 60) / 60) + 10, i1.duration)
check('a round more each week of the block, two at most', plannedRoundsOf(i3)?.rounds === 10, plannedRoundsOf(i3))
check('a deload week is lighter than the first week', (plannedRoundsOf(iDeload)?.rounds ?? 99) < 8 && iDeload.duration < i1.duration, plannedRoundsOf(iDeload))
check('a later block works longer, to 45s at most', plannedRoundsOf(intervalSession(mid, 1, 2, false))?.workSeconds === 40 && plannedRoundsOf(intervalSession(mid, 1, 9, false))?.workSeconds === 45)
const capped = intervalSession({ ...mid, health_conditions: ['pregnancy'] }, 1, 3, false)
check('a health condition (pregnancy too): never above RPE 7, never all-out, 30s work, 90s easy', (capped.targetRpe ?? 10) <= 7 && /never all-out/.test(capped.reason ?? '')
  && plannedRoundsOf(capped)?.workSeconds === 30 && plannedRoundsOf(capped)?.restSeconds === 90, capped)
check('a beginner starts on 6 rounds with 90s easy', same(plannedRoundsOf(intervalSession({ ...mid, training_experience: 'beginner' }, 1, 0, false)), { rounds: 6, workSeconds: 30, restSeconds: 90 }))
check('low impact: no jumping, running or heart rate in any session', [i1, i3, capped, steadySession(mid, 1, false)].every(p => !/jump|burpee|sprint|\brun\b|bpm|heart rate|max hr/i.test(`${p.activity} ${p.reason}`)))
check('a sore knee keeps off the walk and the rower', !/rower|walk/i.test(intervalSession({ ...mid, injuries: ['knees'] }, 1, 0, false).reason ?? 'rower'))
const st1 = steadySession(mid, 1, false), st3 = steadySession(mid, 3, false), stD = steadySession(mid, 4, true)
check('steady is minutes on a countdown, no rounds: 30 minutes, then 40, Steady', plannedRoundsOf(st1) === null && plannedTimedMinutes(st1) === 30 && st3.duration === 40 && st1.targetRpe === 5 && st1.activity === STEADY_ACTIVITY, [st1.duration, st3.duration])
check('...a deload week shorter', stD.duration < st1.duration, stD.duration)

console.log('\n3. The plan it builds')
const silent = console.log
const quiet = (f: () => MesocycleWeek[]) => { console.log = (...a: unknown[]) => { if (typeof a[0] === 'string' && a[0].startsWith('[weekly')) return; silent(...a) }; try { return f() } finally { console.log = silent } }
const base: UserProfile = { ...RUNNERS[1].profile, running_goal: null, cardio_days_per_week: 2 }
const four = (base.training_days ?? []).filter(d => d.available).length
setRandomSource(seededRngFromKey('cardio-2'))
const plan2 = quiet(() => generateMesocycle(base))
const cardio = (w: MesocycleWeek | undefined) => (w?.days ?? []).filter(isCardioDay)
const lifts = (w: MesocycleWeek | undefined) => (w?.days ?? []).filter(d => d.exercises.length > 0)
check(`two cardio days asked on ${four} days: every week two cardio days and ${four - 2} lifting days`, plan2.length > 0 && plan2.every(w => cardio(w).length === 2 && lifts(w).length === four - 2),
  plan2.slice(0, 3).map(w => `${cardio(w).length}c${lifts(w).length}l`))
check('...one intervals and one steady, every week', plan2.every(w => cardio(w).filter(d => d.plannedActivity?.activity === INTERVALS_ACTIVITY).length === 1 && cardio(w).filter(d => d.plannedActivity?.activity === STEADY_ACTIVITY).length === 1))
check('a cardio day carries no lifting, and no day appears twice', plan2.every(w => cardio(w).every(d => d.exercises.length === 0) && new Set(w.days.map(d => d.day)).size === w.days.length))
check('the interval day starts the round timer, the steady day a countdown', plan2.every(w => cardio(w).every(d => d.plannedActivity?.activity === INTERVALS_ACTIVITY ? !!plannedRoundsOf(d.plannedActivity) : plannedTimedMinutes(d.plannedActivity) != null)))
const firstBlock = plan2.filter(w => w.block_number === 1)
const r = firstBlock.map(w => plannedRoundsOf(cardio(w).find(d => d.plannedActivity?.activity === INTERVALS_ACTIVITY)?.plannedActivity)?.rounds ?? 0)
check('the rounds climb through the block and drop in the deload', r.length >= 2 && r[1] > r[0] && (firstBlock.some(w => w.is_deload) ? r[firstBlock.findIndex(w => w.is_deload)] < r[0] : true), r)
// THE CARDIO DAYS ARE THE GOAL'S CONDITIONING, not extra to it. Measured 24 Nov 2026: a muscle-building cardio lover with
// two cardio days was also given conditioning after lifting on two days (four in a week) before this rule. The same
// person with no cardio days gets it, so the case binds.
const after = (p: UserProfile) => { setRandomSource(seededRngFromKey('m')); return (quiet(() => generateMesocycle(p))[0]?.days ?? []).filter(d => d.recommendedCardio && !d.recommendedCardio.is_filler).length }
const lover = { ...base, fitness_goal: 'hypertrophy', conditioning_preference: 'love' } as UserProfile
const withDays = after(lover), withoutDays = after({ ...lover, cardio_days_per_week: 0 })
check('the cardio days count as the goal\'s conditioning: none added after lifting on top of two (a muscle-building cardio lover)', withDays === 0 && withoutDays >= 2, { withDays, withoutDays })
check('no optional rest-day cardio on top of the goal\'s conditioning the cardio days already are', plan2.every(w => w.days.filter(d => d.recommendedCardio?.timing === 'rest_day').length <= 1), plan2[0]?.days.map(d => d.focus))
setRandomSource(seededRngFromKey('cardio-run'))
const withRun = quiet(() => generateMesocycle({ ...base, running_goal: '5k' }))
check('a running goal wins: no cardio days, the runs are the cardio', withRun.every(w => cardio(w).length === 0), withRun[0]?.days.map(d => d.focus))
setRandomSource(seededRngFromKey('cardio-none'))
const none = quiet(() => generateMesocycle({ ...base, cardio_days_per_week: 0 }))
check('none asked: every training day lifts, as before', none.every(w => cardio(w).length === 0 && lifts(w).length === four))
check('and the split is null when none is asked or a running goal is set', cardioSplitFor({ ...base, cardio_days_per_week: 0 }) === null && cardioSplitFor({ ...base, running_goal: '5k' }) === null && !!cardioSplitFor(base))

// Every way of choosing, by brute force, independent of the chooser's own scoring.
function everySplit(days: string[], count: number, intervals: number): { lift: Set<number>; hard: number[] }[] {
  const out: { lift: Set<number>; hard: number[] }[] = []
  const n = days.length
  for (let m = 0; m < 1 << n; m++) {
    const c = days.filter((_, i) => m & (1 << i)); if (c.length !== count) continue
    const lift = new Set(days.filter((_, i) => !(m & (1 << i))).map(idx))
    for (let im = 0; im < 1 << c.length; im++) {
      const hard = c.filter((_, k) => im & (1 << k)).map(idx); if (hard.length !== intervals) continue
      out.push({ lift, hard })
    }
  }
  return out
}
function fewestEves(days: string[], count: number, intervals: number): number {
  return Math.min(...everySplit(days, count, intervals).map(s => s.hard.filter(h => s.lift.has((h + 1) % 7) || s.hard.includes((h + 1) % 7)).length))
}
function fewestBackToBack(days: string[], count: number, intervals: number): number {
  return Math.min(...everySplit(days, count, intervals).map(s => s.hard.filter(h => s.hard.includes((h + 1) % 7)).length))
}
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b) }

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('test:cardio-days passed: cardio days are chosen, dosed and built into the plan, and lifting keeps two days.')
