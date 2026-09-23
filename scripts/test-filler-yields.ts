import { generateMesocycle, setRandomSource, resetRandomSource, shortenDayTo } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import {
  estimateDaySeconds, estimateRequiredDaySeconds, optionalFillerSeconds, yieldFillerTo,
  getSessionMinimumSeconds, getSessionMaximumSeconds,
} from '../src/lib/session-duration'
import { adjustDayVolume } from '../src/lib/volume-adjust'
import { executeSessionShorten } from '../src/lib/pending-action-executor'
import { effectiveRecoveryCapacity } from '../src/lib/concurrent-activity'
import { buildProfile, comboKey, type Combination } from './quality-grid'
import type { MesocycleWeek, RecommendedCardio, UserProfile, WorkoutDay } from '../src/lib/types'

// ---------------------------------------------------------------------------
// OPTIONAL FILLER IS ELASTIC, AND EVERY SHORT DAY GETS IT — 23 Sep 2026.
//
// Two defects, found together while measuring why long sessions came out
// short (item 2 of Ashley's "work on 1 then 2 then 3"):
//
//   1. THE FILLER SKIPPED EVERY DAY THAT ALREADY HAD CARDIO. Across the
//      9,216-profile grid, 348 plans ran a day under the minimum they asked
//      for; on 346 of them every such day was one carrying the goal's
//      assigned cardio (3,838 of 3,841 days). A day holds one
//      recommendedCardio, that one was taken, so the day that got the cardio
//      was reliably the shortest of the week. Now: mobilityFiller.
//
//   2. OPTIONAL FILLER WAS TREATED AS WORK. "I've only got 58 minutes" on a
//      day of 56 minutes' lifting and a 19-minute optional mobility flow
//      dropped Hip Thrust, Pull-Ups and Plank, and kept the mobility.
//      Measured before fixing. Now: yieldFillerTo, first in every budget path.
//
// THE INTEGRATION CASES ARE MEASURED OFFENDERS, seeded with the key the grid
// used (seededRngFromKey(comboKey)), pinned to the day the grid named. They
// were chosen from the failing list, not picked as "obviously tight" — the
// habit CLAUDE.md records from test:pattern-floor, where six hand-picked
// profiles all passed with the guard switched off.
// ---------------------------------------------------------------------------

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

function plan(key: string): { profile: UserProfile; meso: MesocycleWeek[] } {
  const [equipment, inj, duration, style, experience, goal, recovery, conditioningPref] = key.split('|')
  const combo = { equipment, injuries: inj === 'none' ? [] : inj.split('+'), duration, style, experience, goal, recovery, conditioningPref } as unknown as Combination
  if (comboKey(combo) !== key) throw new Error(`key did not round-trip: ${key}`)
  const profile = buildProfile(combo)
  setRandomSource(seededRngFromKey(key))
  const meso = generateMesocycle(profile)
  resetRandomSource()
  return { profile, meso }
}

const minutes = (s: number) => Math.round(s / 60)
const exerciseShape = (d: WorkoutDay | undefined) => JSON.stringify((d?.exercises ?? []).map(e => [e.name, e.sets, e.rest, e.reps]))
const mobility = (duration: number): RecommendedCardio => ({
  activity: 'Mobility & Movement Prep Flow', duration, targetRpe: 2, timing: 'post_session', reason: 'gate', is_filler: true,
})

// --- 1. yieldFillerTo, on constructed days ---------------------------------

console.log('\n[1] the filler gives way — and only the filler')
{
  const { meso } = plan('full_gym|none|45-60|hybrid|intermediate|hypertrophy|high|tolerate')
  const src = meso[0].days.find(d => d.exercises.length >= 3)!
  const bare: WorkoutDay = { ...src, recommendedCardio: undefined, conditioning_note: undefined, mobilityFiller: undefined }
  const lift = estimateDaySeconds(bare)
  const assigned: RecommendedCardio = { activity: 'Incline Walk', duration: 20, targetRpe: 4, timing: 'post_session', reason: 'goal' }

  const roomy = { ...bare, mobilityFiller: mobility(20) }
  check('a day that fits comes back as the SAME object', yieldFillerTo(roomy, lift + 25 * 60) === roomy)

  const shrunk = yieldFillerTo(roomy, lift + 10 * 60)
  check('over by ten minutes: the mobility shrinks to what fits', shrunk.mobilityFiller?.duration === 10, shrunk.mobilityFiller)
  check('...and the day now fits', estimateDaySeconds(shrunk) <= lift + 10 * 60, minutes(estimateDaySeconds(shrunk)))
  check('...with every exercise, set, rest and rep untouched', exerciseShape(shrunk) === exerciseShape(roomy))

  const gone = yieldFillerTo(roomy, lift + 3 * 60)
  check('room for only three minutes: removed, not kept as a token', gone.mobilityFiller === undefined, gone.mobilityFiller)

  const withAssigned = { ...bare, recommendedCardio: assigned, mobilityFiller: mobility(15) }
  const a = yieldFillerTo(withAssigned, lift)
  check("the goal's assigned cardio is NEVER optional — untouched even while the day stays over", a.recommendedCardio === assigned && a.recommendedCardio.duration === 20, a.recommendedCardio)
  check('...while the mobility beside it went', a.mobilityFiller === undefined)
  check('optionalFillerSeconds counts the mobility and not the assigned cardio', optionalFillerSeconds(withAssigned) === 15 * 60, optionalFillerSeconds(withAssigned))
  check('estimateRequiredDaySeconds keeps the assigned cardio', estimateRequiredDaySeconds(withAssigned) === lift + 20 * 60, [minutes(estimateRequiredDaySeconds(withAssigned)), minutes(lift) + 20])

  const fillerCardio: WorkoutDay = { ...bare, recommendedCardio: { ...mobility(20), activity: 'Mobility & Movement Prep Flow' }, conditioning_note: 'Optional mobility flow (~20 min) — today ran under your time budget.' }
  const f1 = yieldFillerTo(fillerCardio, lift + 12 * 60)
  check('a filler finisher shrinks too', f1.recommendedCardio?.duration === 12, f1.recommendedCardio)
  check('...and its own note says the new minutes', /~12 min/.test(f1.conditioning_note ?? ''), f1.conditioning_note)
  const f2 = yieldFillerTo(fillerCardio, lift)
  check('...and when it goes, its note goes with it', f2.recommendedCardio === undefined && f2.conditioning_note === undefined, [f2.recommendedCardio, f2.conditioning_note])

  const both: WorkoutDay = { ...fillerCardio, mobilityFiller: mobility(10) }
  const b = yieldFillerTo(both, lift + 20 * 60)
  check('with both, the mobility close-out goes before the finisher', b.mobilityFiller === undefined && b.recommendedCardio?.duration === 20, [b.mobilityFiller, b.recommendedCardio?.duration])
}

// --- 2. generation: the measured offenders ----------------------------------

console.log('\n[2] a short day that already has its cardio gets the rest of its time')
const OFFENDERS: { key: string; week: number; day: string }[] = [
  // Pinned from the 23 Sep grid run: the first day the scorer failed on each.
  { key: 'full_gym|shoulders|30-45|bodybuilding|beginner|fat_loss|high|love', week: 1, day: 'Monday' },          // 19 min, cardio a separate session
  { key: 'full_gym|shoulders|60-90|bodybuilding|beginner|fat_loss|moderate|tolerate', week: 1, day: 'Monday' },  // 43 min
  { key: 'full_gym|shoulders|90+|functional|advanced|fat_loss|moderate|love', week: 1, day: 'Tuesday' },          // 52 min
  { key: 'bodyweight|none|90+|bodybuilding|beginner|fat_loss|high|love', week: 1, day: 'Monday' },               // 47 min, no injury at all
]
const offenderPlans = OFFENDERS.map(o => ({ ...o, ...plan(o.key) }))
for (const o of offenderPlans) {
  const dur = o.profile.session_duration_preference!
  const min = getSessionMinimumSeconds(dur), max = getSessionMaximumSeconds(dur)
  const day = o.meso.find(w => w.week_number === o.week)?.days.find(d => d.day === o.day)
  const tag = `${o.key} wk${o.week} ${o.day}`
  check(`${tag}: now carries a mobility close-out`, !!day?.mobilityFiller, day?.mobilityFiller)
  check(`${tag}: ...beside its assigned cardio, still there and still not filler`, !!day?.recommendedCardio && !day.recommendedCardio.is_filler, day?.recommendedCardio)
  check(`${tag}: ...and is no longer short (within the scorer's 20% of ${minutes(min)} min)`, !!day && estimateDaySeconds(day) >= min * 0.8, day && minutes(estimateDaySeconds(day)))

  const exempt = effectiveRecoveryCapacity(o.profile) === 'low'
  const training = o.meso.filter(w => !w.is_deload).flatMap(w => w.days.filter(d => d.exercises.length > 0).map(d => ({ w: w.week_number, d })))
  const short = exempt ? [] : training.filter(x => estimateDaySeconds(x.d) < min * 0.8)
  check(`${o.key}: no training day anywhere in the plan is still short`, short.length === 0, short.slice(0, 4).map(x => `wk${x.w} ${x.d.day} ${minutes(estimateDaySeconds(x.d))}m`))
  const long = training.filter(x => estimateDaySeconds(x.d) > max * 1.1)
  check(`${o.key}: ...and none runs over`, long.length === 0, long.slice(0, 4).map(x => `wk${x.w} ${x.d.day} ${minutes(estimateDaySeconds(x.d))}m`))
  const bad = training.filter(x => x.d.mobilityFiller && (
    x.d.mobilityFiller.targetRpe !== 2 || x.d.mobilityFiller.timing !== 'post_session' || !x.d.mobilityFiller.is_filler
    || !/Mobility/.test(x.d.mobilityFiller.activity) || !x.d.recommendedCardio || x.d.recommendedCardio.is_filler))
  check(`${o.key}: every close-out is optional mobility at RPE 2, and only beside assigned cardio`, bad.length === 0, bad.slice(0, 2).map(x => x.d.mobilityFiller))
}

// --- 3. shortening a day takes the padding first ----------------------------

console.log('\n[3] "I only have N minutes" takes the optional filler before any exercise')
{
  // THE CASE THAT FAILED, measured before the fix: 56 min lifting + 19 min
  // filler, shortened to 58 — three exercises dropped, filler kept.
  const { profile, meso } = plan('full_gym|none|60-90|functional|beginner|hypertrophy|high|love')
  const week = meso[0]
  const day = week.days.find(d => d.recommendedCardio?.is_filler && d.recommendedCardio.duration >= 15)
  check('the fixture has a filler day to shorten', !!day, week.days.map(d => d.recommendedCardio))
  const lift = day ? estimateRequiredDaySeconds(day) : 0
  const fill = day?.recommendedCardio?.duration ?? 0

  const target = Math.ceil(lift / 60) + 2
  const r = day ? shortenDayTo(week, day.day, profile, target) : null
  const after = r?.week.days.find(d => d.day === day?.day)
  check(`to ${target} min: nothing dropped`, r?.changed === true && r.droppedExercises.length === 0 && r.setsRemoved === 0, r && { dropped: r.droppedExercises, sets: r.setsRemoved })
  check('...every exercise, set and rest exactly as it was', !!after && exerciseShape(after) === exerciseShape(day))
  check('...the filler is what came off, and the result says how much', (r?.fillerMinutesRemoved ?? 0) === fill && after?.recommendedCardio === undefined, { removed: r?.fillerMinutesRemoved, fill })

  const roomy = Math.ceil(lift / 60) + 10
  const r2 = day ? shortenDayTo(week, day.day, profile, roomy) : null
  const after2 = r2?.week.days.find(d => d.day === day?.day)
  check(`to ${roomy} min: the filler is shrunk to fit, not thrown away`, (after2?.recommendedCardio?.duration ?? 0) >= 5 && (after2?.recommendedCardio?.duration ?? 99) < fill, after2?.recommendedCardio)
  check('...and fillerMinutesRemoved is exactly the difference', r2?.fillerMinutesRemoved === fill - (after2?.recommendedCardio?.duration ?? 0), r2?.fillerMinutesRemoved)

  const tight = Math.floor(lift / 60) - 10
  const r3 = day ? shortenDayTo(week, day.day, profile, tight) : null
  check(`to ${tight} min (the work itself must shrink): the whole filler goes first`, r3?.fillerMinutesRemoved === fill, r3?.fillerMinutesRemoved)
  check('...and then work comes out, as before', !!r3 && (r3.droppedExercises.length > 0 || r3.setsRemoved > 0), r3 && { dropped: r3.droppedExercises, sets: r3.setsRemoved })

  // A mobility close-out beside assigned cardio: the mobility goes, the cardio stays.
  const o = offenderPlans[1]
  const w1 = o.meso.find(w => w.week_number === o.week)!
  const md = w1.days.find(d => d.day === o.day)
  const keepCardio = md ? Math.ceil(estimateRequiredDaySeconds(md) / 60) : 0
  const r4 = md ? shortenDayTo(w1, md.day, o.profile, keepCardio) : null
  const a4 = r4?.week.days.find(d => d.day === md?.day)
  check('a close-out day shortened to its required time: the mobility goes', a4?.mobilityFiller === undefined && (r4?.fillerMinutesRemoved ?? 0) > 0, a4?.mobilityFiller)
  check('...its assigned cardio does not', a4?.recommendedCardio?.duration === md?.recommendedCardio?.duration, [a4?.recommendedCardio, md?.recommendedCardio])
  check('...and no exercise was touched', !!a4 && exerciseShape(a4) === exerciseShape(md))

  // The receipt, from the real executor: it must say what came off.
  const receipt = day ? (await executeSessionShorten({ ...profile, id: undefined } as UserProfile, meso, { weekNumber: week.week_number, dayName: day.day, minutes: target })).receipt : null
  check('the coach\'s receipt names the optional mobility that came off', /optional mobility came off first/.test(receipt?.landed?.[0] ?? ''), receipt?.landed)
  const receipt3 = day ? (await executeSessionShorten({ ...profile, id: undefined } as UserProfile, meso, { weekNumber: week.week_number, dayName: day.day, minutes: tight })).receipt : null
  // Measured sentence: "Monday: about 43 min — 19 min of optional mobility
  // came off first, then out came Plank, and 5 sets off what stayed".
  check('...and, when work went too, says the filler went first and THEN names the work', /\d+ min of optional mobility came off first, then out came \S/.test(receipt3?.landed?.[0] ?? ''), receipt3?.landed)
}

// --- 4. "more volume" is not refused for want of room the padding holds -----

console.log('\n[4] adding volume makes the padding give way, not the request')
{
  // Searched, deterministically, for a filler day where the OLD rule refused:
  // with the filler the heavier day runs past the maximum, without it it fits.
  // Fails loudly if none is found, so it cannot pass vacuously.
  let found: { key: string; profile: UserProfile; day: WorkoutDay } | null = null
  outer: for (const dur of ['45-60', '30-45', '60-90']) {
    for (const style of ['hybrid', 'bodybuilding', 'functional']) {
      for (const goal of ['hypertrophy', 'functional', 'fat_loss']) {
        const key = `full_gym|none|${dur}|${style}|intermediate|${goal}|high|tolerate`
        const { profile, meso } = plan(key)
        const max = getSessionMaximumSeconds(dur as never)
        for (const d of meso[0].days) {
          if (!(d.recommendedCardio?.is_filler)) continue
          const bumped: WorkoutDay = { ...d, exercises: adjustDayVolume({ ...d, recommendedCardio: undefined, conditioning_note: undefined }, 'heavier', profile).day.exercises }
          const withFiller = { ...bumped, recommendedCardio: d.recommendedCardio, conditioning_note: d.conditioning_note }
          if (estimateDaySeconds(withFiller) > max && estimateRequiredDaySeconds(withFiller) <= max && bumped.exercises.some((e, i) => e.sets !== d.exercises[i].sets)) {
            found = { key, profile, day: d }; break outer
          }
        }
      }
    }
  }
  check('found a day where the padding alone decides "no room"', !!found)
  const res = found ? adjustDayVolume(found.day, 'heavier', found.profile) : null
  check('...and the heavier change now goes through', res?.changed === true, res && { changed: res.changed, blocked: res.blocked })
  check('...no exercise is refused for "no room in the session"', !!res && !res.blocked.some(b => b.reason === 'no room in the session'), res?.blocked)
  check('...the filler shrank to make the room', !!res && optionalFillerSeconds(res.day) < optionalFillerSeconds(found!.day), res && [optionalFillerSeconds(res.day) / 60, optionalFillerSeconds(found!.day) / 60])
  check('...and the day is inside the maximum', !!res && !!found && estimateDaySeconds(res.day) <= getSessionMaximumSeconds(found.profile.session_duration_preference!), res && minutes(estimateDaySeconds(res.day)))
}

// --- 5. rest is never cut to keep optional padding --------------------------

console.log('\n[5] the week-level trim to the maximum takes the filler before any rest')
{
  // MEASURED 23 Sep 2026, and the reason this section exists: the per-week
  // yield ahead of trimWeekRestForBudget fires on 72 days across the grid.
  // With it switched off, THIS plan had 18 rests cut (260 seconds) at the
  // maximum while its optional filler stood untouched; with it on, none.
  // Read off generateMesocycle's own trim log — the record the trimmer keeps
  // of every second it takes.
  const key = 'full_gym|knees+shoulders+lower_back|45-60|hybrid|beginner|hypertrophy|low|love'
  const [equipment, inj, duration, style, experience, goal, recovery, conditioningPref] = key.split('|')
  const combo = { equipment, injuries: inj.split('+'), duration, style, experience, goal, recovery, conditioningPref } as unknown as Combination
  const profile = buildProfile(combo)
  const log: { stage: string; reason: string; secondsCut?: number }[] = []
  setRandomSource(seededRngFromKey(key))
  const meso = generateMesocycle(profile, undefined, [], log as never)
  resetRandomSource()
  const maxMin = minutes(getSessionMaximumSeconds(duration as never))
  const cutsAtMax = log.filter(e => e.stage === 'time_cap' && e.reason.includes(`budget ${maxMin}min`))
  check('the trim log was written at all — so a zero below is a measurement', log.length > 0, log.length)
  check('the plan does carry optional filler somewhere — so the property has something to protect', meso.some(w => w.days.some(d => optionalFillerSeconds(d) > 0)))
  check(`no rest was cut at the ${maxMin}-minute maximum`, cutsAtMax.length === 0, cutsAtMax.slice(0, 3).map(e => e.reason))
}

console.log('')
console.log(`filler-yields: ${ran} checks ran`)
if (failures > 0) {
  console.error(`filler-yields: ${failures} check(s) failed`)
  process.exit(1)
}
console.log('filler-yields: all checks passed')
