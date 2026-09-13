/**
 * Gate: correcting a number you gave at setup, and the plan reacting to it.
 *
 * Ashley chose this on 13 Sep 2026. Six of the eight "locked" onboarding
 * answers are numbers that feed prescribed weight directly — the three known
 * lifts and the three implement ceilings — and none of them could be seen or
 * changed after setup, so a wrong one was wrong on every session until the
 * plan ended.
 *
 * HER RULING, same day, from three options: update this plan's weights NOW,
 * from this week onward, exercises unchanged, and say what moved.
 *
 * THE TWO PROPERTIES THIS FILE EXISTS FOR, and both are here because the
 * first implementation failed them on a real plan rather than in theory.
 *
 * 1. IDEMPOTENCE. Re-pricing against an UNCHANGED profile must move nothing.
 *    The first version re-prescribed every slot from scratch and moved 174
 *    weights against an unchanged profile — because a bare `prescribeLoad`
 *    cannot reproduce a stored weight that carries the block's progression.
 *    Every other property in this file is worthless without this one: a
 *    re-price that rewrites weights it was not asked to touch is not a
 *    re-price.
 *
 * 2. THE FACT'S BLAST RADIUS. A dumbbell ceiling may not move a barbell lift.
 *    The same first version raised a Barbell Bench Press from 37.5kg to
 *    57.5kg when the correction was LOWERING the dumbbell ceiling.
 *
 * Sections:
 *  1. Idempotence, and nothing but the weights.
 *  2. Lowering a ceiling lowers weights — the case every other patcher refuses.
 *  3. Raising a stated ceiling never breaks the table ceiling.
 *  4. The blast radius: the fact only moves what it bears on.
 *  5. The past is never rewritten.
 *  6. The receipt says something true and checkable.
 *  7. A corrected known lift is out of reach here, and the gate says so.
 */
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import {
  repriceForCorrectedProfile, repriceableWeekNumbers, describeReprice, headlineReprice,
} from '../src/lib/reprice-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const BASE = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'build_muscle', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  // home_gym, because the three ceilings are DISCARDED for a full-gym trainee
  // (onboarding-slots.ts:1138) — a full-gym fixture would test nothing.
  equipment_access: 'home_gym', injuries: [], training_style: 'bodybuilding',
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

const silence = <T>(fn: () => T): T => {
  const l = console.log, d = console.debug
  console.log = () => {}; console.debug = () => {}
  try { return fn() } finally { console.log = l; console.debug = d }
}

const MESO = silence(() => {
  setRandomSource(seededRngFromKey('setup-answers'))
  const m = generateMesocycle(BASE)
  resetRandomSource()
  return m
})
const LIVE = 3
const WEEKS = repriceableWeekNumbers(MESO, LIVE)
const withField = (patch: Partial<Record<string, unknown>>) =>
  ({ ...BASE, ...patch } as unknown as UserProfile)

/** Everything about a plan EXCEPT the weights — what a re-price must not touch. */
const shape = (m: MesocycleWeek[]) => JSON.stringify(m.map(w => w.days.map(d =>
  d.exercises.map(e => [e.name, e.sets, e.reps, e.rest, e.superset_label ?? null, e.tier ?? null]))))

// ---------------------------------------------------------------------------
console.log('\n0. The fixture')
// ---------------------------------------------------------------------------
check('a multi-week plan with loaded slots exists',
  MESO.length > 4 && MESO.some(w => w.days.some(d => d.exercises.some(e => e.suggested_load_kg != null))))
check('the live week is not the first, so there is a past to protect', LIVE > 1)
check('re-priceable weeks are the live week onward, and no earlier',
  Math.min(...WEEKS) === LIVE && WEEKS.length === MESO.length - (LIVE - 1), WEEKS)

// ---------------------------------------------------------------------------
console.log('\n1. Idempotence, and nothing but the weights')
// ---------------------------------------------------------------------------
// THE CHECK THAT CAUGHT THE FIRST IMPLEMENTATION. Without it every other
// assertion here passes against a function that rewrites the whole plan.
const same = repriceForCorrectedProfile(MESO, BASE, BASE, WEEKS)
check('re-pricing against an unchanged profile moves nothing at all',
  same.changes.length === 0, same.changes.slice(0, 4))
check('...and hands back the very same plan object, not a copy',
  same.mesocycle === MESO)

const lowered = withField({ max_dumbbell_kg: 10 })
const low = repriceForCorrectedProfile(MESO, BASE, lowered, WEEKS)
check('a real correction does move weights', low.changes.length > 0, low.changes.length)
check('...and changes NOTHING but the weights — same exercises, order, sets, reps, rest, supersets',
  shape(low.mesocycle) === shape(MESO))
check('...and does not mutate the plan it was handed',
  MESO.some(w => w.days.some(d => d.exercises.some(e => e.suggested_load_kg != null)))
  && shape(MESO) === shape(MESO))

// THE FOUR FIELDS MOVE TOGETHER OR THE SCREEN CONTRADICTS ITSELF. A mutation
// that wrote only `suggested_load_kg` and left the printed string behind was
// invisible to every check above: the number was right and the words beside it
// still described the old weight. patchBlockFromLiftedKg's header is about
// exactly this ("the fix was to stop having a second way to write a weight").
const staleDisplay = low.changes.filter(c => {
  const slot = low.mesocycle.find(w => w.week_number === c.weekNumber)!
    .days.find(d => d.day === c.dayName)!
    .exercises.find(e => e.name === c.exerciseName)!
  const shown = String(slot.suggested_load ?? '')
  // The printed string must carry the NEW number and must not still carry the
  // old one. Compared as whole numbers so "10" does not match inside "110".
  const carriesNew = new RegExp(`(^|[^\\d.])${c.toKg}([^\\d]|$)`).test(shown)
  const carriesOld = c.fromKg !== c.toKg
    && new RegExp(`(^|[^\\d.])${c.fromKg}([^\\d]|$)`).test(shown)
  return !carriesNew || carriesOld
})
check('the printed weight moves with the number — no stale display string',
  staleDisplay.length === 0,
  staleDisplay.slice(0, 3).map(c => ({ ex: c.exerciseName, from: c.fromKg, to: c.toKg })))
check('...and so does the per-set breakdown and the basis sentence',
  low.changes.every(c => {
    const slot = low.mesocycle.find(w => w.week_number === c.weekNumber)!
      .days.find(d => d.day === c.dayName)!
      .exercises.find(e => e.name === c.exerciseName)!
    const original = MESO.find(w => w.week_number === c.weekNumber)!
      .days.find(d => d.day === c.dayName)!
      .exercises.find(e => e.name === c.exerciseName)!
    return slot.per_set_load !== original.per_set_load || slot.load_guidance !== original.load_guidance
      || original.per_set_load == null
  }))

// ---------------------------------------------------------------------------
console.log('\n2. Lowering a ceiling lowers weights')
// ---------------------------------------------------------------------------
// THE CASE EVERY OTHER PATCHER REFUSES. patchBlockFromLiftedKg is NEVER
// DOWNWARD by design; this path must be, or a trainee whose dumbbells stop at
// 10kg keeps being prescribed 30.
check('every move is downward when the ceiling comes down',
  low.changes.every(c => (c.toKg ?? 0) < (c.fromKg ?? 0)),
  low.changes.filter(c => (c.toKg ?? 0) >= (c.fromKg ?? 0)).slice(0, 3))
check('...and nothing is left above the new ceiling',
  low.mesocycle.filter(w => WEEKS.includes(w.week_number)).every(w => w.days.every(d => d.exercises.every(e => {
    const entry = getExerciseEntry(e.name)
    if (!entry || e.suggested_load_kg == null) return true
    return !entry.equipment.includes('dumbbells') || e.suggested_load_kg <= 10
  }))),
  'a dumbbell lift still prescribed above the stated 10kg')

// A SLOT WITH NO WEIGHT MUST STILL HAVE NO WEIGHT. Bodyweight work, and
// primers the plan deliberately prescribes as "Light" with no kilos even
// though the movement CAN be loaded — a re-price that put a number on one
// would be inventing a prescription the generator refused to make. The primer
// case is the one that matters: `prescribeLoad` will happily return a real
// number for it, so only the stored null stops it.
const loadlessBefore = MESO.filter(w => WEEKS.includes(w.week_number)).flatMap(w =>
  w.days.flatMap(d => d.exercises.filter(e => e.suggested_load_kg == null).map(e => `${w.week_number}|${d.day}|${e.name}`)))
const loadlessAfter = new Set(low.mesocycle.filter(w => WEEKS.includes(w.week_number)).flatMap(w =>
  w.days.flatMap(d => d.exercises.filter(e => e.suggested_load_kg == null).map(e => `${w.week_number}|${d.day}|${e.name}`))))
check('the fixture contains slots deliberately carrying no weight', loadlessBefore.length > 0, loadlessBefore.length)
check('...and every one of them still carries none after a re-price',
  loadlessBefore.every(k => loadlessAfter.has(k)),
  loadlessBefore.filter(k => !loadlessAfter.has(k)).slice(0, 3))

// FORGED, because the natural fixture cannot reach the case. Every loadless
// slot a generated plan actually contains is a bodyweight movement, for which
// `prescribeLoad` returns null anyway — so deleting the stored-null guard
// changes nothing and the check above passes either way. The case that MATTERS
// is a slot whose movement CAN be loaded but which the plan deliberately
// prescribes without a weight, which is exactly what the primer guard produces
// (a kettlebell swing at "Light", the defect applyReplacement's own header was
// written about). Forge one by stripping the weight off a real dumbbell lift.
const forgeTarget = MESO.filter(w => WEEKS.includes(w.week_number))
  .flatMap(w => w.days.flatMap(d => d.exercises.map(e => ({ w: w.week_number, d: d.day, e }))))
  // ABOVE the lowered ceiling, or the correction would not have moved this
  // slot anyway and the forge proves nothing. The first version took the first
  // dumbbell slot it found, which was already under 10kg, so the mutation that
  // deletes the guard survived — the slot was never re-priced at all.
  .find(x => (x.e.suggested_load_kg ?? 0) > 12 && (getExerciseEntry(x.e.name)?.equipment.includes('dumbbells') ?? false))!
check('a loaded dumbbell slot ABOVE the new ceiling exists to forge from',
  !!forgeTarget, { name: forgeTarget?.e.name, kg: forgeTarget?.e.suggested_load_kg })
const forged = MESO.map(w => w.week_number !== forgeTarget.w ? w : ({
  ...w,
  days: w.days.map(d => d.day !== forgeTarget.d ? d : ({
    ...d,
    exercises: d.exercises.map(e => e.name === forgeTarget.e.name
      ? { ...e, suggested_load_kg: null, suggested_load: 'Light', per_set_load: null }
      : e),
  })),
}))
const forgedOut = repriceForCorrectedProfile(forged, BASE, lowered, WEEKS)
const forgedSlot = forgedOut.mesocycle.find(w => w.week_number === forgeTarget.w)!
  .days.find(d => d.day === forgeTarget.d)!
  .exercises.find(e => e.name === forgeTarget.e.name)!
check('...and a loadable movement the plan left without a weight is not given one',
  forgedSlot.suggested_load_kg == null && forgedSlot.suggested_load === 'Light',
  { kg: forgedSlot.suggested_load_kg, shown: forgedSlot.suggested_load })

// ---------------------------------------------------------------------------
console.log('\n3. Raising a stated ceiling never breaks the table ceiling')
// ---------------------------------------------------------------------------
// effectiveLoadingCeilingKg is Math.min(table, stated) — "ONLY EVER DOWNWARD"
// (load-prescription.ts:855-866). An absurd stated number must be a no-op, not
// a licence.
const raised = withField({ max_dumbbell_kg: 500 })
const high = repriceForCorrectedProfile(MESO, BASE, raised, WEEKS)
check('an absurd stated ceiling moves nothing', high.changes.length === 0, high.changes.slice(0, 3))

// ---------------------------------------------------------------------------
console.log('\n4. The blast radius: a fact only moves what it bears on')
// ---------------------------------------------------------------------------
// A DUMBBELL CEILING MAY NOT MOVE A BARBELL LIFT. The first implementation
// raised a Barbell Bench Press from 37.5kg to 57.5kg on this exact correction.
const movedNames = new Set(low.changes.map(c => c.exerciseName))
const barbellOnlyMoved = [...movedNames].filter(n => {
  const e = getExerciseEntry(n)
  return !!e && !e.equipment.includes('dumbbells') && !e.equipment.includes('dumbbell')
})
check('a dumbbell ceiling moves only lifts that use dumbbells',
  barbellOnlyMoved.length === 0, barbellOnlyMoved.slice(0, 5))

// The mirror: the improvised-bag ceiling must not touch dumbbell work.
const bag = repriceForCorrectedProfile(MESO, BASE, withField({ max_improvised_kg: 5 }), WEEKS)
const bagMovedDumbbells = bag.changes.filter(c => {
  const e = getExerciseEntry(c.exerciseName)
  return !!e && (e.equipment.includes('dumbbells') || e.equipment.includes('dumbbell'))
})
check('the backpack ceiling never moves a dumbbell lift',
  bagMovedDumbbells.length === 0, bagMovedDumbbells.slice(0, 3).map(c => c.exerciseName))

// ---------------------------------------------------------------------------
console.log('\n5. The past is never rewritten')
// ---------------------------------------------------------------------------
check('no change lands before the live week',
  low.changes.every(c => c.weekNumber >= LIVE),
  low.changes.filter(c => c.weekNumber < LIVE).slice(0, 3))
const pastBefore = MESO.filter(w => w.week_number < LIVE)
const pastAfter = low.mesocycle.filter(w => w.week_number < LIVE)
check('...and the past weeks come back by identity, untouched',
  pastBefore.length > 0 && pastBefore.every((w, i) => w === pastAfter[i]))

// ---------------------------------------------------------------------------
console.log('\n6. The receipt says something true and checkable')
// ---------------------------------------------------------------------------
const receipt = describeReprice(low.changes)
const headline = headlineReprice(low.changes)!
check('there is a receipt when something moved', !!receipt, receipt)
check('it names a real exercise and both real numbers',
  !!receipt && receipt.includes(headline.exerciseName)
  && receipt.includes(`${headline.fromKg}kg`) && receipt.includes(`${headline.toKg}kg`), receipt)
// THE SENTENCE SAYS "FROM THIS WEEK", SO THE NUMBER MUST BE THIS WEEK'S. The
// first version quoted the largest move anywhere — a week-9 leg curl at 40kg —
// beside a live week showing 22kg.
check('the number it quotes is from the earliest week it touched, the one she will see',
  headline.weekNumber === Math.min(...low.changes.map(c => c.weekNumber)),
  { quoted: headline.weekNumber, earliest: Math.min(...low.changes.map(c => c.weekNumber)) })
check('...and that weight really is in the plan at that week',
  low.mesocycle.find(w => w.week_number === headline.weekNumber)!
    .days.find(d => d.day === headline.dayName)!
    .exercises.some(e => e.name === headline.exerciseName && e.suggested_load_kg === headline.toKg))
check('nothing moved means no receipt', describeReprice([]) === null)

// ---------------------------------------------------------------------------
console.log('\n7. A corrected KNOWN LIFT is out of this path\'s reach, and says so')
// ---------------------------------------------------------------------------
// MEASURED 13 Sep 2026, and it narrowed the work. The plan for this change
// treated the six numbers as one kind of thing. They are not:
//
//   - The three IMPLEMENT CEILINGS are read by `prescribeLoad` itself
//     (statedCeilingKg → effectiveLoadingCeilingKg), so pricing the same slot
//     against the old and new profile shows the difference. Re-pricing works.
//   - The three KNOWN LIFTS are a GENERATION-TIME seed. exercise-plan.ts:5940
//     packs them into `knownWorkingWeights` and hands them to
//     generateMesocycle; `prescribeLoad` never reads them off the profile. So
//     pricing twice gives the same number twice and this path is blind to them
//     — correctly, since it has no way to know what they should do.
//
// This section pins that, so the limitation cannot be quietly forgotten and
// re-discovered as a bug: a corrected known lift must be a NO-OP here, not a
// half-applied change. Unlocking those three needs the anchor machinery
// (patchBlockFromLiftedKg), which refuses downward moves and so cannot simply
// be reused either. Named in BACKLOG as the second slice.
const strongBase = withField({ skip_calibration_week: true, known_bench_kg: 60, known_squat_kg: 80, known_deadlift_kg: 100 })
const strongMeso = silence(() => {
  setRandomSource(seededRngFromKey('setup-answers-known'))
  const m = generateMesocycle(strongBase)
  resetRandomSource()
  return m
})
const strongWeeks = repriceableWeekNumbers(strongMeso, LIVE)
const stronger = { ...strongBase, known_bench_kg: 90 } as unknown as UserProfile
const bench = repriceForCorrectedProfile(strongMeso, strongBase, stronger, strongWeeks)
check('a corrected known lift moves nothing through this path — it is a generation seed',
  bench.changes.length === 0, bench.changes.slice(0, 3))
check('...so it never half-applies: the plan comes back by identity',
  bench.mesocycle === strongMeso)
// THE CONTRAST THAT PROVES THE FIXTURE IS LIVE. If the same profile could not
// be re-priced by ANYTHING, the check above would pass vacuously.
const strongCeiling = repriceForCorrectedProfile(
  strongMeso, strongBase, { ...strongBase, max_dumbbell_kg: 8 } as unknown as UserProfile, strongWeeks)
check('...while a ceiling correction on the SAME profile does move weights',
  strongCeiling.changes.length > 0, strongCeiling.changes.length)

console.log(failures === 0 ? '\nAll setup-answer checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
