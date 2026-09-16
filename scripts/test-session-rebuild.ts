import { generateMesocycle, resetRandomSource, setRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { rebuildDayAroundMainLift } from '../src/lib/session-rebuild'
import { isMainLiftSlot } from '../src/lib/mesocycle-edit'
import type { UserProfile, MesocycleWeek, Exercise } from '../src/lib/types'

// ---------------------------------------------------------------------------
// "GIVE ME A DIFFERENT SESSION TODAY" — and the lift that carries your
// progression stays exactly where it is.
//
// Ashley's ruling, 16 Sep 2026, from three options. See
// docs/plans/a-different-session-today.md for why, and for the two reasons
// CLAUDE.md gave for this being impossible that turned out not to be true.
//
// THE CHECKS CALL THE REBUILD AND READ WHAT COMES BACK. This file never asks
// whether settleWeek APPEARS in the source — a call that is present and whose
// result is discarded satisfies that and nothing else. It hands the rebuild a
// day that already breaks a rule and asserts the rule holds afterwards, which
// is the only form of the claim a dead branch cannot satisfy. Same shape as
// test-session-edit.ts, deliberately.
// ---------------------------------------------------------------------------

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 320)}` : ''}`) }
}
function finish(): never {
  console.log('')
  if (failures > 0) { console.error(`session-rebuild: ${failures} check(s) failed`); process.exit(1) }
  console.log('session-rebuild: all checks passed')
  process.exit(0)
}

const profile = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'build_muscle', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '60',
  workout_split_preference: 'ai_recommendation',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
    { day: 'Friday', available: true }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

// SEEDED, for the reason test-session-edit records: unseeded, this file would
// generate a different plan every run, and a check that answers differently on
// a Tuesday means green is not evidence.
const quiet = console.log
console.log = () => {}
setRandomSource(seededRngFromKey('session-rebuild-fixture'))
const MESO = generateMesocycle(profile)
resetRandomSource()
console.log = quiet

const WEEK = MESO[0].week_number
const DAY = MESO[0].days.find(d => d.exercises.length >= 4 && d.exercises.some(isMainLiftSlot))!.day
const dayOf = (m: MesocycleWeek[], w: number, name = DAY) => m.find(x => x.week_number === w)!.days.find(d => d.day === name)!
/** NULL-SAFE ON PURPOSE. An edit that wrote the settled week over its siblings
 *  leaves no week with the original number, and a non-null assertion then
 *  THREW — a crash, which CLAUDE.md is explicit is not a catch. Returning a
 *  marker makes the same break fail a check with a readable value instead. */
const names = (m: MesocycleWeek[], w: number): string[] =>
  m.find(x => x.week_number === w)?.days.find(d => d.day === DAY)?.exercises.map(e => e.name) ?? ['(week missing)']

const rebuild = (m: MesocycleWeek[], day = DAY, week = WEEK, exclusions: string[] = []) =>
  rebuildDayAroundMainLift({ mesocycle: m, profile, weekNumber: week, dayName: day, exclusions })

console.log('a different session today')

// ---------------------------------------------------------------------------
console.log('\n0. The fixture')
// ---------------------------------------------------------------------------
const before = dayOf(MESO, WEEK)
// SNAPSHOTTED AS VALUES, not held as a reference. `before` points INTO MESO, so
// a rebuild that wrote through to the plan it was handed would mutate the very
// thing §7 compares against — the check would be asking a question of evidence
// the code had just rewritten. Mutation found exactly that.
const BEFORE_NAMES: string[] = before.exercises.map(e => e.name)
const BEFORE_SETS: number[] = before.exercises.map(e => e.sets)
check('a day with a main lift and accessories exists', before.exercises.length >= 4 && before.exercises.some(isMainLiftSlot),
  { day: DAY, n: before.exercises.length })
const mainBefore = before.exercises.find(isMainLiftSlot)!
check('...and exactly one slot is the main lift', before.exercises.filter(isMainLiftSlot).length === 1, mainBefore.name)

const result = await rebuild(MESO)

// ---------------------------------------------------------------------------
console.log('\n1. Her ruling: the main lift is untouched')
// ---------------------------------------------------------------------------
{
  check('the rebuild happened', result.changed && result.replaced.length > 0, { changed: result.changed, replaced: result.replaced.length, refusal: result.refusal })
  if (!result.changed) finish()
  const mainAfter = dayOf(result.mesocycle, WEEK).exercises.find(isMainLiftSlot)
  check('...and the main lift is still the same exercise', mainAfter?.name === mainBefore.name, { before: mainBefore.name, after: mainAfter?.name })
  check('...at the same sets and reps', mainAfter?.sets === mainBefore.sets && mainAfter?.reps === mainBefore.reps,
    { before: [mainBefore.sets, mainBefore.reps], after: [mainAfter?.sets, mainAfter?.reps] })
  check('...and the same weight, so the progression thread is intact',
    mainAfter?.suggested_load_kg === mainBefore.suggested_load_kg,
    { before: mainBefore.suggested_load_kg, after: mainAfter?.suggested_load_kg })
  check('...and the card can name it', result.mainLift === mainBefore.name, result.mainLift)
  check('the rebuild never reports the main lift as replaced',
    !result.replaced.some(r => r.from === mainBefore.name || r.to === mainBefore.name), result.replaced)
}

// ---------------------------------------------------------------------------
console.log('\n2. It really is a different session')
// ---------------------------------------------------------------------------
{
  const after = names(result.mesocycle, WEEK)
  const changedSlots = result.replaced.length
  check('most of the session changed', changedSlots >= BEFORE_NAMES.length - 1 - result.kept.length,
    { changed: changedSlots, was: BEFORE_NAMES.length, kept: result.kept.length })
  check('every replacement actually landed on the day', result.replaced.every(r => after.includes(r.to)), { after, replaced: result.replaced })
  check('...and the exercise it replaced is gone', result.replaced.every(r => !after.includes(r.from)), { after })
  check('the session is the same length', after.length === BEFORE_NAMES.length, { before: BEFORE_NAMES.length, after: after.length })

  // AN ACCESSORY IS NOT A NEW MAIN LIFT. recomputeLoad's isMainLiftReset flag
  // rewrites the guidance to "find your working weight this session, then let
  // it ramp from here" — true of a main lift being reset, a lie on an accessory
  // that has a prescribed weight. Passing true here is a one-word mistake with
  // a user-visible consequence, and nothing caught it until mutation did.
  const slots = dayOf(result.mesocycle, WEEK).exercises
  const swapped = slots.filter(e => result.replaced.some(r => r.to === e.name))
  check('every replaced slot was actually found', swapped.length === result.replaced.length, { swapped: swapped.length, replaced: result.replaced.length })
  check('...and none is described as a lift you have never done',
    swapped.every(e => !/find your working weight/i.test(e.load_guidance ?? '')),
    swapped.filter(e => /find your working weight/i.test(e.load_guidance ?? '')).map(e => ({ n: e.name, g: e.load_guidance })))
}

// ---------------------------------------------------------------------------
console.log('\n3. Never the same exercise twice — on the day, or across the week')
// ---------------------------------------------------------------------------
{
  const after = names(result.mesocycle, WEEK)
  check('no exercise appears twice in the session', new Set(after).size === after.length, after)
  const weekAfter = result.mesocycle.find(w => w.week_number === WEEK)!
  const everywhere = weekAfter.days.flatMap(d => d.exercises.map(e => e.name))
  for (const r of result.replaced) {
    const n = everywhere.filter(x => x === r.to).length
    if (n !== 1) { check(`the new ${r.to} appears once in the week, not ${n}`, false, { exercise: r.to, count: n }); break }
  }
  check('...and none of them collides with another day this week',
    result.replaced.every(r => everywhere.filter(x => x === r.to).length === 1))
  // TWO SLOTS MUST NOT CLAIM THE SAME NEW EXERCISE. Asserted on the list the
  // rebuild reports rather than on the day, because this is the one break that
  // the day alone cannot show: if two slots both took the same replacement the
  // day would hold it twice, but only if nothing else deduped afterwards.
  const incoming = result.replaced.map(r => r.to)
  check('no two slots were given the same replacement', new Set(incoming).size === incoming.length, incoming)

  // AND ON A POOL THIN ENOUGH FOR IT TO HAPPEN. The full-gym fixture above
  // never collides — every slot's best available alternative is different, so
  // dropping the running dedupe changed nothing and the mutation went MISSED.
  // Searched for a profile where it DOES collide rather than assuming one:
  // a beginner with no equipment, whose Tuesday has two slots both wanting
  // Air Squat and two both wanting Bodyweight Good Morning. That is not a
  // contrived case — it is the person the starting-out plan is written for.
  // The training days matter: they decide the split, which decides what is on
  // each day. My first attempt kept the full-gym fixture's four days and so
  // generated a different week from the one the search found — the mutation
  // stayed MISSED against a fixture that looked right.
  const thinProfile = {
    ...profile,
    equipment_access: 'bodyweight',
    training_experience: 'beginner',
    session_duration_preference: '30-45',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: false }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
    ],
  } as unknown as UserProfile
  console.log = () => {}
  setRandomSource(seededRngFromKey('collide-bodyweightbeginner'))
  const THIN = generateMesocycle(thinProfile)
  resetRandomSource()
  console.log = quiet
  // EVERY TRAINING DAY, not one. Which day collides depends on the split, and
  // pinning a day name is the kind of anchor that stops proving anything the
  // moment the generator changes its mind.
  let thinRebuilds = 0
  const thinDupes: { day: string; incoming: string[]; onDay: string[] }[] = []
  for (const d of THIN[0].days) {
    if (d.exercises.length < 3) continue
    const r = await rebuildDayAroundMainLift({ mesocycle: THIN, profile: thinProfile, weekNumber: THIN[0].week_number, dayName: d.day, exclusions: [] })
    if (!r.changed) continue
    thinRebuilds++
    const incoming = r.replaced.map(x => x.to)
    const onDay = r.mesocycle.find(w => w.week_number === THIN[0].week_number)!.days.find(x => x.day === d.day)!.exercises.map(e => e.name)
    if (new Set(incoming).size !== incoming.length || new Set(onDay).size !== onDay.length) thinDupes.push({ day: d.day, incoming, onDay })
  }
  check('the thin-pool fixture rebuilds at least one day', thinRebuilds > 0, { rebuilt: thinRebuilds })
  check('...and never gives two slots the same exercise, on any of them', thinDupes.length === 0, thinDupes)
}

// ---------------------------------------------------------------------------
console.log('\n4. A slot it cannot change is KEPT and NAMED, never silently left')
// ---------------------------------------------------------------------------
{
  // STARVED THE WAY THE CODE ACTUALLY STARVES — every alternative already used
  // elsewhere this week. My first version excluded the candidate LIST instead,
  // and the rebuild replaced the slot anyway: exclusions are honoured (measured
  // — excluding the whole list and re-asking returns zero of them back), the
  // list is simply not exhaustive, so shrinking the pool surfaces more. The
  // fixture could not express the defect it was named for.
  const victim = before.exercises.find(e => !isMainLiftSlot(e))!
  const { getReplacementCandidates } = await import('../src/lib/mesocycle-edit')
  const alternatives = getReplacementCandidates(victim.name, profile, []).map(c => c.exercise.name)
  check('the fixture can starve one slot of alternatives', alternatives.length > 0, { slot: victim.name, alternatives: alternatives.length })

  const otherDay = MESO[0].days.find(d => d.day !== DAY && d.exercises.length > 0)!
  const filler = alternatives.map((name, i) => ({ ...otherDay.exercises[0], id: `filler-${i}`, name }))
  const crowded: MesocycleWeek[] = MESO.map(w => w.week_number !== WEEK ? w : {
    ...w,
    days: w.days.map(d => d.day === otherDay.day ? { ...d, exercises: filler } : d),
  })
  const starved = await rebuild(crowded, DAY, WEEK)
  const keptNames = starved.kept.map(k => k.name)
  check('the starved slot is reported as kept', keptNames.includes(victim.name), { kept: starved.kept, replaced: starved.replaced })
  check('...and it is still in the session', names(starved.mesocycle, WEEK).includes(victim.name))
  check('...with a reason a person can read', starved.kept.every(k => k.reason.length > 10), starved.kept)
  check('...and it is never counted as replaced', !starved.replaced.some(r => r.from === victim.name), starved.replaced)
}

// ---------------------------------------------------------------------------
console.log('\n5. It refuses rather than inventing a session')
// ---------------------------------------------------------------------------
{
  const restDay = MESO[0].days.find(d => d.exercises.length === 0)?.day
  if (restDay) {
    const r = await rebuild(MESO, restDay)
    check('a rest day is refused, in words', !r.changed && /rest day/i.test(r.refusal ?? ''), r.refusal)
  } else {
    check('the fixture has a rest day to refuse', false, MESO[0].days.map(d => [d.day, d.exercises.length]))
  }

  const missing = await rebuild(MESO, 'Nonesuch')
  check('a day that is not on the plan is refused', !missing.changed && !!missing.refusal, missing.refusal)

  // A day that is ONLY the main lift has nothing this ruling allows changing.
  const onlyMain: MesocycleWeek[] = MESO.map(w => w.week_number !== WEEK ? w : {
    ...w,
    days: w.days.map(d => d.day === DAY ? { ...d, exercises: [mainBefore] } : d),
  })
  const solo = await rebuild(onlyMain)
  check('a session that is only the main lift is refused, and says why',
    !solo.changed && (solo.refusal ?? '').includes(mainBefore.name), solo.refusal)
}

// ---------------------------------------------------------------------------
console.log('\n6. The shared settling tail ran')
// ---------------------------------------------------------------------------
{
  // HANDED A DAY THAT ALREADY BREAKS THE RULE. If the tail did not run, the
  // break survives — which no source check could tell you, because the call
  // would still be sitting there in the file.
  const broken: MesocycleWeek[] = MESO.map(w => w.week_number !== WEEK ? w : {
    ...w,
    days: w.days.map(d => d.day !== DAY ? d : {
      ...d,
      // An isolation slot given more sets than the main lift — exactly what
      // enforceSetHierarchy exists to pull back.
      exercises: d.exercises.map((e: Exercise) => isMainLiftSlot(e) ? e : { ...e, sets: (mainBefore.sets ?? 3) + 3 }),
    }),
  })
  const fixed = await rebuild(broken)
  check('the broken fixture rebuilt', fixed.changed, fixed.refusal)
  // ASKED OF THE RULE ITSELF, not re-derived. My first version compared every
  // non-main slot against the main lift's set count and failed on a warm-up
  // movement — enforceSetHierarchy deliberately exempts anything outside the
  // main/accessory roles, so the assertion was stricter than the rule. Running
  // the rule again and requiring it to change NOTHING says exactly "the tail
  // ran", with no second copy of which slots are exempt to drift.
  const after = dayOf(fixed.mesocycle, WEEK).exercises
  const { enforceSetHierarchy } = await import('../src/lib/exercise-plan')
  const reapplied = enforceSetHierarchy(after)
  check('re-running the set hierarchy changes nothing, so it already ran',
    JSON.stringify(reapplied.map(e => [e.name, e.sets])) === JSON.stringify(after.map(e => [e.name, e.sets])),
    after.map((e, i) => ({ n: e.name, sets: e.sets, would: reapplied[i].sets })).filter((x, i) => x.sets !== reapplied[i].sets))
  // And the detector: the same rule DOES change the broken day it was handed.
  const brokenDay = dayOf(broken, WEEK).exercises
  check('...and that rule would have changed the broken fixture',
    JSON.stringify(enforceSetHierarchy(brokenDay).map(e => e.sets)) !== JSON.stringify(brokenDay.map(e => e.sets)))
}

// ---------------------------------------------------------------------------
console.log('\n7. Today only — the rest of the block is not touched')
// ---------------------------------------------------------------------------
{
  const otherWeeks = MESO.filter(w => w.week_number !== WEEK).map(w => w.week_number)
  check('the fixture has later weeks to leave alone', otherWeeks.length > 0, otherWeeks)
  // THE SHAPE FIRST. An edit that overwrote its siblings with the settled week
  // leaves duplicate week numbers and missing ones — checked before the
  // contents, so that break reads as a failure rather than a crash downstream.
  const numbers = result.mesocycle.map(w => w.week_number)
  check('every week is still there, exactly once',
    numbers.length === MESO.length && new Set(numbers).size === numbers.length
    && MESO.every(w => numbers.includes(w.week_number)), numbers)
  const untouched = otherWeeks.every(n =>
    JSON.stringify(names(result.mesocycle, n)) === JSON.stringify(names(MESO, n)))
  check('every other week is byte-identical', untouched,
    otherWeeks.map(n => ({ week: n, before: names(MESO, n).length, after: names(result.mesocycle, n).length })))
  check('...and the input mesocycle was not written through',
    JSON.stringify(names(MESO, WEEK)) === JSON.stringify(BEFORE_NAMES),
    { now: names(MESO, WEEK), atStart: BEFORE_NAMES })
  check('...not even its set counts', JSON.stringify(dayOf(MESO, WEEK).exercises.map(e => e.sets)) === JSON.stringify(BEFORE_SETS))
}

finish()
