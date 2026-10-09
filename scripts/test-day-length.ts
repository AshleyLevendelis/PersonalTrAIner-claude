// ---------------------------------------------------------------------------
// Gate: A DAY'S PRINTED LENGTH IS MADE IN ONE PLACE, AND SAYS ITS PARTS.
// (docs/plans/a-shoulders-day-with-shoulder-work.md — test log H4 "time cap",
// L17.) The screens are driven by verify:day-length; this holds the helper,
// the day gap note and the warm-up badge as functions, and that the three
// screens which printed a bare "~N min" now go through the helper.
//
// What was wrong: a day of seven working sets read "9 sets · ~37 min" — 15 of
// the minutes were an OPTIONAL mobility flow and the 9 counted two warm-up
// sets — and a 30-minute walk the engine had made a separate session was
// drawn as the session's "Finisher".
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  dayLengthParts, formatDayLength, isSeparateSession,
  estimateDaySeconds, optionalFillerSeconds, getSessionMaximumSeconds,
} from '../src/lib/session-duration'
import { describeDayGap } from '../src/lib/day-gap-note'
import { warmupBadgeText } from '../src/lib/session-derive'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildProfile, comboKey, type Combination } from './quality-grid'
import type { WorkoutDay, RecommendedCardio, UserProfile } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0, ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const src = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'))
const quiet = <T>(fn: () => T): T => {
  const log = console.log, warn = console.warn
  console.log = () => {}; console.warn = () => {}
  try { return fn() } finally { console.log = log; console.warn = warn }
}
const combo = (c: Partial<Combination>): Combination => ({
  equipment: 'full_gym', injuries: [], duration: '45-60', style: 'bodybuilding', experience: 'intermediate',
  goal: 'hypertrophy', recovery: 'moderate', conditioningPref: 'tolerate', ...c,
} as Combination)
const meso = (c: Combination) => quiet(() => {
  setRandomSource(seededRngFromKey(comboKey(c)))
  try { return generateMesocycle(buildProfile(c)) } finally { resetRandomSource() }
})
const cardio = (over: Partial<RecommendedCardio>): RecommendedCardio =>
  ({ activity: 'Brisk Walk', duration: 30, targetRpe: 3, timing: 'post_session', reason: 'gate', ...over }) as RecommendedCardio

function main() {
  console.log('\n1. The parts')
  const week = meso(combo({}))[0]
  const src0 = week.days.find(d => d.exercises.length >= 4 && d.exercises.some(e => getExerciseEntry(e.name)?.mechanics_tier === 'primer'))!
  const bare: WorkoutDay = { ...src0, recommendedCardio: undefined, mobilityFiller: undefined, conditioning_note: undefined }
  const total = (d: WorkoutDay) => Math.round(estimateDaySeconds(d) / 60)
  const allSets = bare.exercises.reduce((n, e) => n + e.sets, 0)
  const primerSets = bare.exercises.filter(e => getExerciseEntry(e.name)?.mechanics_tier === 'primer').reduce((n, e) => n + e.sets, 0)

  const p0 = dayLengthParts(bare)
  check('a day with nothing optional: the work is the whole day, and the label is one number',
    p0.workMinutes === total(bare) && p0.optionalMinutes === 0 && p0.separateMinutes === 0 && formatDayLength(p0) === `~${total(bare)} min`, { p0, label: formatDayLength(p0) })
  check('working sets leave the warm-up drills out, and the two counts are the day (the fixture has warm-up sets, so they differ)',
    primerSets > 0 && p0.warmupSets === primerSets && p0.workingSets === allSets - primerSets, { p0, allSets, primerSets })

  const withMobility: WorkoutDay = { ...bare, mobilityFiller: cardio({ activity: 'Mobility & Movement Prep Flow', duration: 15, targetRpe: 2, is_filler: true }) }
  const p1 = dayLengthParts(withMobility)
  check('an optional mobility close-out is said apart: "~W min · + 15 optional", and W is the day without it',
    p1.optionalMinutes === 15 && p1.workMinutes === p0.workMinutes && formatDayLength(p1) === `~${p0.workMinutes} min · + 15 optional`, { p1, label: formatDayLength(p1) })
  check('…and the two printed numbers add up to what the day asks of an evening',
    p1.workMinutes + p1.optionalMinutes === total(withMobility), { p1, total: total(withMobility) })

  const withWalk: WorkoutDay = { ...bare, recommendedCardio: cardio({ timing: 'independent_session', duration: 30 }) }
  const p2 = dayLengthParts(withWalk)
  check('a walk the plan made a SEPARATE session is not in the session\'s length, and is named as separate',
    p2.workMinutes === p0.workMinutes && p2.optionalMinutes === 0 && p2.separateMinutes === 30 && isSeparateSession(withWalk.recommendedCardio) === true && formatDayLength(p2) === formatDayLength(p0), p2)

  const withFinisher: WorkoutDay = { ...bare, recommendedCardio: cardio({ timing: 'post_session', duration: 10 }) }
  const p3 = dayLengthParts(withFinisher)
  check('a finisher that IS part of the session is work: ten minutes longer, nothing optional, nothing separate',
    p3.workMinutes === total(withFinisher) && p3.workMinutes > p0.workMinutes && p3.optionalMinutes === 0 && p3.separateMinutes === 0 && isSeparateSession(withFinisher.recommendedCardio) === false, p3)

  const withFillerFinisher: WorkoutDay = { ...bare, recommendedCardio: cardio({ timing: 'post_session', duration: 12, is_filler: true }) }
  const p4 = dayLengthParts(withFillerFinisher)
  check('a finisher the engine added only to use spare time is optional, like the mobility',
    p4.optionalMinutes === 12 && p4.workMinutes === p0.workMinutes, p4)

  const both: WorkoutDay = { ...bare, recommendedCardio: cardio({ timing: 'independent_session', duration: 30 }), mobilityFiller: cardio({ duration: 15, is_filler: true }) }
  const p5 = dayLengthParts(both)
  check('the tester\'s day — work, a separate walk and an optional stretch — is three things, not "~37 min" and a "Finisher"',
    p5.workMinutes === p0.workMinutes && p5.optionalMinutes === 15 && p5.separateMinutes === 30, p5)
  check('a rest day has no length', formatDayLength(dayLengthParts({ ...bare, exercises: [] })) === '~0 min' && dayLengthParts({ ...bare, exercises: [] }).workingSets === 0)
  check('isSeparateSession answers for the timing, and for nothing', isSeparateSession(null) === false && isSeparateSession(undefined) === false && isSeparateSession({ timing: 'rest_day' }) === false)

  console.log('\n2. On generated plans: the parts add up, and the session fits the length asked for')
  // 4 kits x 2 flags x 4 lengths x 2 goals = 64 seeded plans, weeks 1-4.
  let days = 0, withOptional = 0, withSeparate = 0
  const wrong: string[] = [], over: string[] = []
  for (const equipment of ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as Combination['equipment'][])
    for (const injuries of [[], ['shoulders']])
      for (const duration of ['30-45', '45-60', '60-90', '90+'] as Combination['duration'][])
        for (const goal of ['hypertrophy', 'fat_loss'] as Combination['goal'][]) {
          const c = combo({ equipment, injuries, duration, goal })
          for (const w of meso(c).slice(0, 4)) for (const d of w.days) {
            if (d.exercises.length === 0) continue
            days++
            const p = dayLengthParts(d)
            if (p.optionalMinutes > 0) withOptional++
            if (p.separateMinutes > 0) withSeparate++
            if (p.workMinutes + p.optionalMinutes !== Math.round(estimateDaySeconds(d) / 60) || p.optionalMinutes !== Math.round(optionalFillerSeconds(d) / 60))
              wrong.push(`${comboKey(c)} w${w.week_number} ${d.day}: ${JSON.stringify(p)} vs total ${Math.round(estimateDaySeconds(d) / 60)}`)
            // Everything the screen labels as part of the session — the work
            // and the optional part — inside the longest session asked for.
            // (A minute of rounding either side.)
            if (!w.is_deload && p.workMinutes + p.optionalMinutes > getSessionMaximumSeconds(duration) / 60 + 1)
              over.push(`${comboKey(c)} w${w.week_number} ${d.day}: ${p.workMinutes} + ${p.optionalMinutes} > ${getSessionMaximumSeconds(duration) / 60}`)
          }
        }
  console.log(`  (${days} training days; ${withOptional} carry an optional part, ${withSeparate} a separate session)`)
  check('the sample is real and holds both kinds of day', days > 800 && withOptional > 20 && withSeparate > 5, { days, withOptional, withSeparate })
  check('on every day, the two printed numbers add up to the day and the optional one is the plan\'s own', wrong.length === 0, { count: wrong.length, first: wrong.slice(0, 2) })
  check('on every day, the session with its optional part fits the longest session asked for — a separate walk is not in it', over.length === 0, { count: over.length, first: over.slice(0, 3) })

  console.log('\n3. One helper, three screens')
  const browse = src('src/components/exercise/ProgramBrowse.tsx')
  const panel = src('src/components/exercise/TodayPanel.tsx')
  const rowSrc = src('src/components/exercise/WeekContextRow.tsx')
  const home = src('src/lib/dashboard-data.ts')
  const dash = src('src/components/Dashboard.tsx')
  check('the programme list words its length through the helper, from the parts',
    /formatDayLength\(length\)/.test(browse) && /dayLengthParts\(workout\)/.test(browse) && /length\.workingSets/.test(browse))
  check('…and no longer costs a day itself', !/estimateDaySeconds\(/.test(browse))
  check('the Exercise tab\'s header is handed a worded length, for the day that is OPEN',
    /sessionLength=\{sessionEstimate\.length\}/.test(panel) && /if \(peekDay\) \{[\s\S]{0,260}formatDayLength\(dayLengthParts\(shown\)\)/.test(panel) && /formatDayLength\(dayLengthParts\(workout\)\)/.test(panel))
  check('…and the header prints what it is handed and words nothing itself', /if \(sessionLength\) headerParts\.push\(sessionLength\)/.test(rowSrc) && !/~\$\{/.test(rowSrc))
  check('Home takes its length from the same helper', /formatDayLength\(lengthParts\)/.test(home) && /dayLengthParts\(todayWorkoutDay\)/.test(home) && !/estimateDaySeconds\(/.test(home))
  check('…and prints that string, not a number it words itself', /data\.session\.sessionLength/.test(dash) && !/~\{data\.session\.estimatedMinutes\}/.test(dash) && !/~\$\{data\.session\.estimatedMinutes\}/.test(dash))
  const finisher = src('src/components/exercise/FinisherRow.tsx')
  check('the Exercise tab draws what follows the lifting through ONE component, which asks whether it is separate before calling it a finisher',
    /<FinishSection /.test(panel) && !/<FinisherRow /.test(panel) && /isSeparateSession\(cardio\)/.test(finisher) && /label=\{SEPARATE_SESSION_LABEL\}/.test(finisher))

  console.log('\n4. The note under a day that is missing what its name promises')
  const named = (...names: string[]) => names.map(n => ({ name: n, sets: 3, reps: '10', rest: '60s' }))
  const day = (focus: string, ...names: string[]): WorkoutDay => ({ day: 'Saturday', focus, exercises: named(...names) } as unknown as WorkoutDay)
  const flagged = { injuries: ['shoulders'] } as Pick<UserProfile, 'injuries'>
  const samDay = day('Shoulders & Abs', 'Band Dislocates', 'Backpack Row', 'Rear Delt Flyes', 'Dumbbell Shrugs', 'Bird Dog', 'Single-Leg Glute Bridge')
  check('a Shoulders day with no overhead press, under a shoulder flag: the sentence, exactly',
    describeDayGap(samDay, flagged) === "No overhead pressing while your shoulder's flagged, so today is upper back and abs.", describeDayGap(samDay, flagged))
  check('the same stored day once the flag is gone: no flag is named',
    describeDayGap(samDay, { injuries: [] }) === 'No overhead press fits your kit, so today is upper back and abs.', describeDayGap(samDay, { injuries: [] }))
  check('a flag that takes no overhead press away is not blamed (ankles)',
    !/flagged/.test(describeDayGap(samDay, { injuries: ['ankles'] }) ?? ''), describeDayGap(samDay, { injuries: ['ankles'] }))
  check('two flags: the shoulder is the one named',
    /your shoulder's flagged/.test(describeDayGap(samDay, { injuries: ['wrists', 'shoulders'] }) ?? ''), describeDayGap(samDay, { injuries: ['wrists', 'shoulders'] }))
  check('a Shoulders day that has its press says nothing',
    describeDayGap(day('Shoulders & Abs', 'Landmine Press', 'Face Pulls', 'Plank'), flagged) === null)
  check('a day that carries another name says nothing — the name is the explanation',
    describeDayGap(day('Upper Pull & Core', 'Towel Row', 'Backpack Curl', 'Plank'), flagged) === null &&
    describeDayGap(day('Chest & Triceps', 'Dumbbell Floor Press', 'Band Tricep Pushdown'), flagged) === null)
  check('it describes the day from what is ON it: delt isolation is "shoulders", a day of abs only is "abs"',
    describeDayGap(day('Shoulders & Abs', 'Lateral Raises', 'Plank'), { injuries: [] }) === 'No overhead press fits your kit, so today is shoulders and abs.' &&
    describeDayGap(day('Shoulders & Abs', 'Plank', 'Hanging Leg Raises'), flagged) === "No overhead pressing while your shoulder's flagged, so today is abs.",
    [describeDayGap(day('Shoulders & Abs', 'Lateral Raises', 'Plank'), { injuries: [] }), describeDayGap(day('Shoulders & Abs', 'Plank', 'Hanging Leg Raises'), flagged)])
  const everyNote = [samDay, day('Shoulders & Abs', 'Lateral Raises', 'Plank')].flatMap(d => [[], ['shoulders'], ['wrists'], ['neck', 'elbows']].map(i => describeDayGap(d, { injuries: i }) ?? ''))
  check('never "not a bug", never a pointer to Profile, never "yet"', everyNote.every(n => !/not a bug|profile|\byet\b/i.test(n)), everyNote)
  check('an empty day says nothing', describeDayGap({ ...samDay, exercises: [] }, flagged) === null)

  console.log('\n5. The warm-up badge says which drills are only today\'s (L17)')
  check('the plan\'s own warm-up reads the same on every screen', warmupBadgeText(4, 6, 0, 0) === '4 moves · ~6 min' && warmupBadgeText(1, 2, 0, 0) === '1 move · ~2 min', [warmupBadgeText(4, 6, 0, 0), warmupBadgeText(1, 2, 0, 0)])
  check('drills added for what feels tight today are counted AND named, so the plan\'s number is still on the badge',
    warmupBadgeText(4, 6, 3, 4) === '4 moves + 3 for today · ~6 + 4 min', warmupBadgeText(4, 6, 3, 4))
  const warm = src('src/components/exercise/WarmupSection.tsx')
  check('the section prints the badge through that function, with the plan\'s moves and today\'s kept apart',
    /warmupBadgeText\(planMoves, totalMinutes, extra\.length, extraMinutes\)/.test(warm))

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) console.error(`\n${failures} day-length check(s) FAILED`)
  else console.log('\nPASSED — a day\'s length is made in one place and says its parts.')
}

main()
process.exit(failures > 0 ? 1 : 0)
