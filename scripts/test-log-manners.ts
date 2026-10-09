/**
 * Gate: the small manners of logging a session (tester's M11, M9, M13, L10,
 * L11, L13, L27, L32 tab order, and the day menu before the plan began) —
 * 9 Oct 2026.
 *
 * Every rule here is ASKED of the function that decides it, not read off the
 * JSX. What a person SEES is driven in a real browser by verify:log-manners
 * and verify:tap-targets; the few source checks at the end only hold the
 * wiring between the two, and say so.
 *
 * Sections:
 *  1. M11 — the set just done carries down; a plan that steps the load wins.
 *  2. L13 — focusing a box only moves the page when a keyboard would cover it.
 *  3. L11 — a header tap is let go when the work it was made for is done.
 *  4. M9  — a tight area never adds a drill the warm-up already holds.
 *  5. M13 — leg day offers leg work: prep is not work, purpose first, a
 *           flagged joint is not a gap to fill, and the sentence is grammatical.
 *  6. The day menu offers nothing for a day before the plan began.
 *  7. Wiring (source): the screen calls the functions above.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { carriedWeightFor, shouldCentreOnFocus, overridesToRelease } from '../src/lib/set-row'
import { sameAsSetAbove } from '../src/lib/coach-voice'
import { tightnessWarmup, uncoveredNote, TIGHT_AREAS, AREA_JOINTS, MAX_TIGHTNESS_DRILLS } from '../src/lib/tightness'
import { drillsPreparing } from '../src/lib/warmup'
import { getAdditionCandidates, leastWorkVerb } from '../src/lib/exercise-add-candidates'
import { generateMesocycle, setRandomSource, resetRandomSource, dayHoldsDefiningWork, getConstrainedPool } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, muscleGroupsOf, MUSCLE_GROUPS } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { dayVerbs, type DayVerbInput } from '../src/lib/day-verbs'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const silence = <T>(fn: () => T): T => {
  const l = console.log, d = console.debug
  console.log = () => {}; console.debug = () => {}
  try { return fn() } finally { console.log = l; console.debug = d }
}

// ---------------------------------------------------------------------------
console.log('\n1. M11 — the set just done carries down')
// ---------------------------------------------------------------------------
{
  // The tester's own sequence: Box Squat, no planned weight, set 1 at 22.5kg.
  const set1 = [{ set_number: 1, weight_kg: 22.5, is_bodyweight: false }]
  const c2 = carriedWeightFor(2, set1)
  check('set 2 carries set 1\'s 22.5kg, not bodyweight', c2?.kg === 22.5 && c2.isBodyweight === false && c2.fromSet === 1, c2)
  check('set 3 carries it too while set 2 is still blank', carriedWeightFor(3, set1)?.kg === 22.5)
  check('nothing carries INTO set 1', carriedWeightFor(1, set1) === null)
  check('nothing carries when nothing is logged', carriedWeightFor(2, []) === null)

  // "A new entry carries down until changed": the NEAREST logged set above.
  const two = [...set1, { set_number: 2, weight_kg: 25, is_bodyweight: false }]
  check('a changed weight on set 2 is what set 3 carries', carriedWeightFor(3, two)?.kg === 25 && carriedWeightFor(3, two)?.fromSet === 2, carriedWeightFor(3, two))
  check('...and set 2 itself still reads set 1', carriedWeightFor(2, two)?.kg === 22.5)
  check('a set logged BELOW this row is never carried up', carriedWeightFor(2, [{ set_number: 3, weight_kg: 40 }]) === null)

  // Straight sets in the plan: what she actually lifted beats the printed number.
  check('a straight prescription (20/20/20) still carries the 22.5 she lifted',
    carriedWeightFor(2, set1, [20, 20, 20])?.kg === 22.5)
  // A plan that STEPS the load between the two sets keeps its own number.
  check('a stepped prescription (20/25/30) is not flattened by the carry',
    carriedWeightFor(2, set1, [20, 25, 30]) === null)
  check('...but carries across two sets the plan made equal (20/25/25, set 2 → 3)',
    carriedWeightFor(3, [{ set_number: 2, weight_kg: 27.5 }], [20, 25, 25])?.kg === 27.5)

  // The bodyweight flag carries with it; a belt carries the ADDED weight.
  const bw = carriedWeightFor(2, [{ set_number: 1, weight_kg: 0, is_bodyweight: true }])
  check('a bodyweight set carries as bodyweight', bw?.isBodyweight === true && bw.kg === 0, bw)
  const belt = carriedWeightFor(2, [{ set_number: 1, weight_kg: 0, is_bodyweight: true, added_load_kg: 10 }])
  check('a belted set carries the ADDED 10kg, not "bodyweight"', belt?.kg === 10 && belt.isBodyweight === false && belt.added === true, belt)

  // The marker says whose number it is, with its unit.
  check('the marker names the set and the weight', sameAsSetAbove(c2!) === 'same as set 1 · 22.5kg', sameAsSetAbove(c2!))
  check('...a belt keeps its plus', sameAsSetAbove(belt!) === 'same as set 1 · +10kg', sameAsSetAbove(belt!))
  check('...and bodyweight is a word, never "0kg"', sameAsSetAbove(bw!) === 'same as set 1 · bodyweight', sameAsSetAbove(bw!))
}

// ---------------------------------------------------------------------------
console.log('\n2. L13 — focusing a box moves the page only when a keyboard would cover it')
// ---------------------------------------------------------------------------
{
  const vh = 844
  check('never with a fine pointer (no soft keyboard), wherever the box is',
    [10, 300, 500, 800].every(top => !shouldCentreOnFocus({ coarsePointer: false, top, bottom: top + 44, viewportHeight: vh })))
  check('...not even when it is off the top of the screen',
    !shouldCentreOnFocus({ coarsePointer: false, top: -200, bottom: -156, viewportHeight: vh }))
  check('on a touch screen, a box in the upper half stays put',
    !shouldCentreOnFocus({ coarsePointer: true, top: 200, bottom: 244, viewportHeight: vh }))
  check('on a touch screen, a box in the lower half is lifted clear of the keyboard',
    shouldCentreOnFocus({ coarsePointer: true, top: 600, bottom: 644, viewportHeight: vh }))
  check('...the line is the middle of the screen (421 stays, 423 moves)',
    !shouldCentreOnFocus({ coarsePointer: true, top: 377, bottom: 421, viewportHeight: vh })
    && shouldCentreOnFocus({ coarsePointer: true, top: 379, bottom: 423, viewportHeight: vh }))
  check('...and one scrolled off the top is brought back',
    shouldCentreOnFocus({ coarsePointer: true, top: -30, bottom: 14, viewportHeight: vh }))
}

// ---------------------------------------------------------------------------
console.log('\n3. L11 — a header tap is let go when the work it was made for is done')
// ---------------------------------------------------------------------------
{
  const P = (complete: boolean, logged: number, added: number) => ({ complete, logged, added })
  check('finishing the last planned set releases it',
    JSON.stringify(overridesToRelease({ 0: P(false, 2, 0) }, { 0: P(true, 3, 0) })) === '[0]')
  check('a finished exercise re-opened to log a drop is released when the drop is logged',
    JSON.stringify(overridesToRelease({ 0: P(true, 3, 1) }, { 0: P(true, 4, 1) })) === '[0]')
  check('...and when the empty drop row is taken away instead',
    JSON.stringify(overridesToRelease({ 0: P(true, 3, 1) }, { 0: P(true, 3, 0) })) === '[0]')
  check('ADDING a row never releases it — she is about to use it',
    overridesToRelease({ 0: P(true, 3, 0) }, { 0: P(true, 3, 1) }).length === 0)
  check('nothing changing releases nothing', overridesToRelease({ 0: P(true, 3, 1) }, { 0: P(true, 3, 1) }).length === 0)
  check('an unfinished exercise is never released, whatever is logged',
    overridesToRelease({ 0: P(false, 1, 0) }, { 0: P(false, 2, 0) }).length === 0)
  check('deleting a set from a finished exercise does not shut the card on her',
    overridesToRelease({ 0: P(true, 4, 0) }, { 0: P(true, 3, 0) }).length === 0)
  check('only the exercise that changed is released',
    JSON.stringify(overridesToRelease({ 0: P(true, 3, 0), 1: P(false, 1, 0), 2: P(true, 3, 0) }, { 0: P(true, 3, 0), 1: P(true, 3, 0), 2: P(true, 3, 0) })) === '[1]')
}

// ---------------------------------------------------------------------------
console.log('\n4. M9 — a tight area never adds a drill the warm-up already holds')
// ---------------------------------------------------------------------------
{
  // The tester's morning: leg day, whose warm-up already opens the hips twice.
  const legDayWarmup = { general: ['Light Cardio'], mobility: ["World's Greatest Stretch", 'Bodyweight Squat to Stand'] }
  const hipDrills = drillsPreparing(AREA_JOINTS.hips, []).map(d => d.name)
  check('the catalogue really does rank those two for the hips (the fixture is the bug\'s own)',
    hipDrills.includes("World's Greatest Stretch") && hipDrills.includes('Bodyweight Squat to Stand'), hipDrills)
  const unaware = tightnessWarmup(['hips'], [])
  check('...and with no warm-up to compare against, at least one of them is what "Hips" adds',
    unaware.items.some(i => legDayWarmup.mobility.includes(i.name)), unaware.items.map(i => i.name))

  const r = tightnessWarmup(['hips'], [], legDayWarmup)
  const inWarmup = new Set([...legDayWarmup.general, ...legDayWarmup.mobility])
  check('no drill is added twice', r.items.every(i => !inWarmup.has(i.name)), r.items.map(i => i.name))
  check('the next best hip drill is added instead — exactly one, for an area already prepared',
    r.items.length === 1 && hipDrills.includes(r.items[0]?.name), r.items.map(i => i.name))
  check('...the best-ranked one the warm-up does not hold',
    r.items[0]?.name === hipDrills.find(n => !inWarmup.has(n)), { got: r.items[0]?.name, want: hipDrills.find(n => !inWarmup.has(n)) })
  check('what is already there is reported, by name',
    r.already.length === 1 && r.already[0].area === 'hips'
    && r.already[0].drills.includes("World's Greatest Stretch") && r.already[0].drills.includes('Bodyweight Squat to Stand'), r.already)
  const said = uncoveredNote(r) ?? ''
  check('...and said: "Your warm-up already has … for your hips."',
    /^Your warm-up already has .*World's Greatest Stretch.* and .*Bodyweight Squat to Stand.* for your hips\.$/.test(said), said)
  check('the line says where they are listed — after the general warm-up, not "first"',
    /straight after the general warm-up\.$/.test(r.note ?? '') && !/first/.test(r.note ?? ''), r.note)
  check('...and one drill is "this", not "these"', /do this straight after/.test(r.note ?? ''), r.note)
  check('with no general block they lead the warm-up and the line says "first"',
    /do this first\.$/.test(tightnessWarmup(['hips'], [], { mobility: legDayWarmup.mobility }).note ?? ''),
    tightnessWarmup(['hips'], [], { mobility: legDayWarmup.mobility }).note)

  // A warm-up that already holds EVERY drill for the area adds nothing and says so.
  const everything = tightnessWarmup(['hips'], [], { general: ['Light Cardio'], mobility: hipDrills })
  check('a warm-up holding every hip drill adds none', everything.items.length === 0, everything.items.map(i => i.name))
  check('...is not reported as "will have to wait" or "haven\'t got one"',
    everything.notThisTime.length === 0 && everything.noDrill.length === 0, everything)
  check('...and still says the warm-up has it covered', /already has/.test(uncoveredNote(everything) ?? ''), uncoveredNote(everything))

  // An area the warm-up does NOT prepare is unaffected by the cap of one.
  const ankles = tightnessWarmup(['ankles'], [], legDayWarmup)
  const anklesAlone = tightnessWarmup(['ankles'], [])
  const ankleNew = anklesAlone.items.filter(i => !inWarmup.has(i.name)).map(i => i.name)
  check('an area the warm-up does not prepare still gets its drills',
    ankles.items.length > 0 && ankles.items.length === Math.min(MAX_TIGHTNESS_DRILLS, drillsPreparing(AREA_JOINTS.ankles, []).filter(d => !inWarmup.has(d.name)).length),
    { got: ankles.items.map(i => i.name), alone: ankleNew })
  // The property, for every area: never a duplicate, never over the cap.
  const dupes: string[] = []
  for (const a of TIGHT_AREAS) {
    const top = drillsPreparing(AREA_JOINTS[a.value], []).slice(0, 2).map(d => d.name)
    const out = tightnessWarmup([a.value], [], { general: ['Light Cardio'], mobility: top })
    if (out.items.some(i => top.includes(i.name)) || out.items.length > MAX_TIGHTNESS_DRILLS) dupes.push(a.value)
  }
  check('for each of the eight areas: its top two drills in the warm-up are never added again', dupes.length === 0, dupes)
  check('a name is matched whatever its case or padding',
    tightnessWarmup(['hips'], [], { mobility: ["  world's greatest stretch ", 'BODYWEIGHT SQUAT TO STAND'] }).items.every(i => !inWarmup.has(i.name)))
  check('no area named still answers with nothing at all', tightnessWarmup([], [], legDayWarmup).note === null && tightnessWarmup([], [], legDayWarmup).already.length === 0)
}

// ---------------------------------------------------------------------------
console.log('\n5. M13 — "Add an exercise" on leg day offers leg work')
// ---------------------------------------------------------------------------
{
  // The tester's profile, as the tracer replayed it: limited kit, a shoulder
  // flag, four days. The flag puts a shoulder-care primer on every day, which
  // is what made "shoulders" the least-worked muscle of leg day.
  const sam = {
    age: 34, gender: 'male', height_cm: 178, weight_kg: 82, activity_level: 'sedentary',
    fitness_goal: 'lose_fat', preferred_time: 'evening', bmr: 1780, tdee: 2140,
    equipment_access: 'minimalist', injuries: ['shoulders'], training_style: 'bodybuilding',
    training_experience: 'intermediate', session_duration_preference: '30-45',
    workout_split_preference: 'ai_recommendation',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(day) })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate', max_dumbbell_kg: 24,
  } as unknown as UserProfile
  const LEG = new Set(['quads', 'hamstrings', 'glutes', 'calves'])
  const legDays: WorkoutDay[] = []
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    setRandomSource(seededRngFromKey(`sam-${seed}`))
    const meso = silence(() => generateMesocycle(sam))
    resetRandomSource()
    const day = meso[0].days.find(d => /leg/i.test(d.focus))
    if (day) legDays.push(day)
  }
  check('the eight seeded plans each have a leg day to ask about', legDays.length === 8, legDays.length)
  const withPrimer = legDays.filter(d => d.exercises.some(e => {
    const entry = getExerciseEntry(e.name)
    return entry?.mechanics_tier === 'primer' && muscleGroupsOf(entry).includes('shoulders')
  }))
  check('...and the shoulder-care primer is on them (the fixture is under pressure)', withPrimer.length > 0, withPrimer.length)

  const all = legDays.map(d => getAdditionCandidates(d, sam, [], 8))
  const top3 = legDays.map(d => getAdditionCandidates(d, sam, [], 3))
  check('every leg day gets suggestions', all.every(c => c.length > 0), all.map(c => c.length))
  check('the top three on every leg day lead with a leg muscle',
    top3.every(c => c.every(x => LEG.has(muscleGroupsOf(x.exercise)[0]))),
    top3.map(c => c.map(x => `${x.exercise.name}:${muscleGroupsOf(x.exercise)[0]}`)))
  check('...and are the day\'s own defining work wherever its name makes a claim',
    legDays.every((d, i) => dayHoldsDefiningWork(d.focus, []) || top3[i].every(x => dayHoldsDefiningWork(d.focus, [x.exercise]))),
    legDays.map((d, i) => `${d.focus}: ${top3[i].map(x => x.exercise.name).join(', ')}`))
  check('no movement-prep drill is ever suggested',
    all.every(c => c.every(x => x.exercise.mechanics_tier !== 'primer')),
    all.flat().filter(x => x.exercise.mechanics_tier === 'primer').map(x => x.exercise.name))
  check('nothing leading with the flagged shoulders is suggested',
    all.every(c => c.every(x => muscleGroupsOf(x.exercise)[0] !== 'shoulders')),
    all.flat().filter(x => muscleGroupsOf(x.exercise)[0] === 'shoulders').map(x => x.exercise.name))
  // THE LEAD-MUSCLE RULE ON A FIXTURE WHERE IT BINDS. On Sam's kit nothing
  // that leads with the shoulders survives to be offered anyway, so removing
  // the rule changed nothing there (a mutation said so). A full gym does hold
  // one: Face Pulls lead with the rear delts and share the back with a back
  // day. Found by measuring, then pinned with its seed.
  const gymFlagged = { ...sam, equipment_access: 'full_gym', fitness_goal: 'build_muscle', session_duration_preference: '60',
    training_days: sam.training_days.map(t => ({ ...t, available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(t.day) })) } as unknown as UserProfile
  setRandomSource(seededRngFromKey('lead-a'))
  const gymMeso = silence(() => generateMesocycle(gymFlagged))
  resetRandomSource()
  const gymPool = getConstrainedPool(gymFlagged, [])
  const pressured: string[] = []
  const gymShoulderLed: string[] = []
  for (const d of gymMeso[0].days.filter(x => x.exercises.length > 0)) {
    const work = new Set(d.exercises.map(e => getExerciseEntry(e.name)).filter(e => !!e && e.mechanics_tier !== 'primer').flatMap(e => muscleGroupsOf(e!)))
    const here = new Set(d.exercises.map(e => e.name))
    for (const e of gymPool) {
      const g = muscleGroupsOf(e)
      if (!here.has(e.name) && e.mechanics_tier !== 'primer' && g[0] === 'shoulders' && g.some(x => x !== 'shoulders' && work.has(x))) pressured.push(`${d.focus}: ${e.name}`)
    }
    for (const c of getAdditionCandidates(d, gymFlagged, [], 200)) if (muscleGroupsOf(c.exercise)[0] === 'shoulders') gymShoulderLed.push(`${d.focus}: ${c.exercise.name}`)
  }
  check('in a full gym the pool holds shoulder-led work that shares a muscle with the day (the fixture binds)', pressured.length > 0, pressured)
  check('...and with the shoulder flagged none of it is suggested', gymShoulderLed.length === 0, gymShoulderLed)

  // The other half of the flag rule, so it cannot quietly widen: a bad knee
  // still gets leg work offered on leg day — the catalogue's own tags have
  // already taken out what the knee should not do.
  const knee = { ...sam, injuries: ['knees'] } as unknown as UserProfile
  setRandomSource(seededRngFromKey('sam-knee'))
  const kneeMeso = silence(() => generateMesocycle(knee))
  resetRandomSource()
  const kneeLegDay = kneeMeso[0].days.find(d => /leg/i.test(d.focus))
  const kneeOffers = kneeLegDay ? getAdditionCandidates(kneeLegDay, knee, [], 8) : []
  check('a knee flag does not empty leg day\'s list: hamstring and glute work is still offered',
    kneeOffers.length >= 3 && kneeOffers.some(x => ['hamstrings', 'glutes'].includes(muscleGroupsOf(x.exercise)[0])),
    { focus: kneeLegDay?.focus, offers: kneeOffers.map(x => x.exercise.name) })
  check('no sentence calls the shoulders the least-worked part of leg day',
    all.every(c => c.every(x => !/shoulders/.test(x.note) || !/least work/.test(x.note))),
    all.flat().filter(x => /shoulders.*least work/.test(x.note)).map(x => x.note))

  // The whole list, not just leg day: every day of four of the plans.
  const everyNote: string[] = []
  const legLedOffLegDay: string[] = []
  const falseLeast: string[] = []
  const unloadedFirst: string[] = []
  const shoulderLed: string[] = []
  let nonLegDays = 0
  for (const seed of ['a', 'b', 'c', 'd']) {
    setRandomSource(seededRngFromKey(`sam-${seed}`))
    const meso = silence(() => generateMesocycle(sam))
    resetRandomSource()
    for (const d of meso[0].days.filter(x => x.exercises.length > 0)) {
      const list = getAdditionCandidates(d, sam, [], 50)
      for (const c of list) everyNote.push(c.note)
      for (const c of list) if (muscleGroupsOf(c.exercise)[0] === 'shoulders') shoulderLed.push(`${seed} ${d.focus}: ${c.exercise.name}`)
      // A day that is not a leg day is not led by leg work because of the one
      // light leg accessory it carries for the week's sake.
      if (!/leg/i.test(d.focus)) {
        nonLegDays++
        // Glutes are left out of the test on purpose: Bird Dog and Side Plank
        // file under them and are trunk work, which belongs on these days.
        const led = list.slice(0, 3).filter(x => ['quads', 'hamstrings', 'calves'].includes(muscleGroupsOf(x.exercise)[0]))
        if (led.length > 0) legLedOffLegDay.push(`${seed} ${d.focus}: ${led.map(x => x.exercise.name).join(', ')}`)
      }
      // "Gets the least work — N sets" is only said of a muscle that really
      // has fewer sets here than some other muscle the session works.
      const work = new Map<string, number>()
      for (const ex of d.exercises) {
        const entry = getExerciseEntry(ex.name)
        if (!entry || entry.mechanics_tier === 'primer') continue
        for (const g of muscleGroupsOf(entry)) work.set(g, (work.get(g) ?? 0) + ex.sets)
      }
      for (const c of list) {
        const m = /^Your (\w+) gets? the least work in this session — (\d+) sets?\./.exec(c.note)
        if (m && !(Math.max(...work.values()) > Number(m[2]))) falseLeast.push(`${seed} ${d.focus}: ${c.note}`)
      }
      // Among candidates alike in every other way (same purpose, same tier,
      // same lead muscle), one she can add weight to is listed first.
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i].exercise, b = list[j].exercise
        if (a.mechanics_tier === b.mechanics_tier && muscleGroupsOf(a)[0] === muscleGroupsOf(b)[0]
          && dayHoldsDefiningWork(d.focus, [a]) === dayHoldsDefiningWork(d.focus, [b])
          && list[i].note === list[j].note && !isExternallyLoaded(a) && isExternallyLoaded(b)) {
          unloadedFirst.push(`${seed} ${d.focus}: ${a.name} before ${b.name}`)
        }
      }
    }
  }
  check('a day that is not a leg day is not led by leg work (the week\'s light leg accessory is not its theme)',
    nonLegDays > 0 && legLedOffLegDay.length === 0, legLedOffLegDay.slice(0, 3))
  check('on no day of the week is a movement that leads with the flagged shoulders suggested',
    shoulderLed.length === 0, shoulderLed.slice(0, 4))
  check('no sentence anywhere names the flagged shoulders as something to add to',
    everyNote.every(n => !/shoulders/.test(n)), everyNote.filter(n => /shoulders/.test(n)).slice(0, 3))
  check('"the least work" is only said of a muscle with fewer sets than another', falseLeast.length === 0, falseLeast.slice(0, 3))
  check('between two candidates alike in every other way, the one she can load comes first',
    unloadedFirst.length === 0, unloadedFirst.slice(0, 3))
  // Grammar: the verb agrees with the group it follows.
  const least = everyNote.filter(n => /least work/.test(n))
  const bad = least.filter(n => {
    const m = /^Your (\w+) (gets|get) the least work/.exec(n)
    return !m || m[2] !== leastWorkVerb(m[1] as (typeof MUSCLE_GROUPS)[number])
  })
  check('the "least work" sentence is still used somewhere (the ranking was not gutted)', least.length > 0, least.length)
  check('...and its verb agrees with its muscle every time', bad.length === 0, bad.slice(0, 3))
  check('plural groups take "get", singular ones "gets" — all eleven, by name',
    MUSCLE_GROUPS.every(g => leastWorkVerb(g) === (['chest', 'back', 'core'].includes(g) ? 'gets' : 'get')),
    MUSCLE_GROUPS.map(g => `${g}:${leastWorkVerb(g)}`))
  check('"Your shoulders gets" cannot be printed', leastWorkVerb('shoulders') === 'get')

  // A healthy trainee is not caught by the flag rule: shoulder work is still
  // offered on a day that trains shoulders.
  const healthy = { ...sam, injuries: [], equipment_access: 'full_gym' } as unknown as UserProfile
  setRandomSource(seededRngFromKey('healthy-a'))
  const hMeso = silence(() => generateMesocycle(healthy))
  resetRandomSource()
  const shoulderDays = hMeso[0].days.filter(d => d.exercises.some(e => {
    const entry = getExerciseEntry(e.name)
    return !!entry && entry.mechanics_tier !== 'primer' && muscleGroupsOf(entry)[0] === 'shoulders'
  }))
  const offered = shoulderDays.flatMap(d => getAdditionCandidates(d, healthy, [], 200))
  check('with no flag, a day that trains shoulders is still offered shoulder work',
    shoulderDays.length > 0 && offered.some(x => muscleGroupsOf(x.exercise)[0] === 'shoulders'),
    { days: shoulderDays.length, offered: offered.length })
  check('...and never a movement-prep drill, flag or no flag',
    hMeso[0].days.filter(d => d.exercises.length > 0).every(d => getAdditionCandidates(d, healthy, [], 200).every(x => x.exercise.mechanics_tier !== 'primer')))
}

// ---------------------------------------------------------------------------
console.log('\n6. The day menu offers nothing for a day before the plan began')
// ---------------------------------------------------------------------------
{
  const past: DayVerbInput = {
    isDone: false, hasSession: true, movedAway: false, beforePlan: false, isPast: true, isToday: false,
    declared: { missed: false, rest: false, swapped: false }, canShorten: true, canLighter: true, canRebuild: true,
  }
  const ordinary = dayVerbs(past)
  check('an ordinary past training day still offers "I missed it" and "I did something else"',
    ordinary.includes('missed') && ordinary.includes('something_else'), ordinary)
  const before = dayVerbs({ ...past, beforePlan: true })
  check('the same weekday BEFORE the plan began offers neither', !before.includes('missed') && !before.includes('something_else'), before)
  check('...nor anything else: nothing was planned, so there is nothing to explain', before.length === 0, before)
  const today = dayVerbs({ ...past, isPast: false, isToday: true })
  check('today is unchanged: missed, move, rest, something else, and the three plan edits',
    ['missed', 'move', 'rest', 'something_else', 'shorten', 'lighter', 'rebuild'].every(v => today.includes(v as never)) && !today.includes('did_elsewhere'), today)
  check('a future day can be moved or rested but not missed',
    JSON.stringify(dayVerbs({ ...past, isPast: false })) === JSON.stringify(['move', 'rest']), dayVerbs({ ...past, isPast: false }))
  check('a logged day, a rest day and a moved-away day still offer nothing',
    dayVerbs({ ...past, isDone: true }).length === 0 && dayVerbs({ ...past, hasSession: false }).length === 0 && dayVerbs({ ...past, movedAway: true }).length === 0)
}

// ---------------------------------------------------------------------------
console.log('\n7. Wiring — the screen calls the functions above (source; behaviour is the driver\'s)')
// ---------------------------------------------------------------------------
{
  const grid = strip(read('src/components/exercise/SetGrid.tsx'))
  check('the grid asks carriedWeightFor(, and not in calibration week on sets 2+',
    /carriedWeightFor\(/.test(grid) && /calibrationProbe && ref\.setNumber > 1\)\s*\?\s*null/.test(grid))
  const blankUses = (grid.match(/blankWeightFor\(ref\)/g) ?? []).length
  check('one resolver feeds the save, the placeholder, the tour marker and the plate calculator', blankUses >= 4, blankUses)
  check('the save no longer reads last week\'s ghost for a blank weight on its own',
    !/parseFloat\(input\.weight \|\| \(ghost/.test(grid))
  check('focus asks shouldCentreOnFocus( before scrolling', /shouldCentreOnFocus\(/.test(grid)
    && grid.indexOf('shouldCentreOnFocus(') > -1 && grid.indexOf('shouldCentreOnFocus(') < grid.indexOf("scrollIntoView({ block: 'center'"))
  check('Enter calls the same handleSaveSet( the tick does', /e\.key !== 'Enter'[\s\S]{0,80}handleSaveSet\(ref\)/.test(grid))
  // Tab order is DOM order: weight, reps, the tick, then the two extras.
  const iWeight = grid.indexOf('id={`setgrid-weight-')
  const iReps = grid.indexOf('max={MAX_REPS}')
  const iTick = grid.indexOf('onClick={() => handleSaveSet(ref)}')
  const iCalc = grid.indexOf('aria-label="Plate calculator"')
  const iBW = grid.indexOf('aria-label="Toggle bodyweight"')
  check('in the document a row reads weight, reps, tick, then plate calculator and BW',
    [iWeight, iReps, iTick, iCalc, iBW].every(i => i > -1) && iWeight < iReps && iReps < iTick && iTick < iCalc && iCalc < iBW,
    { iWeight, iReps, iTick, iCalc, iBW })

  const panel = strip(read('src/components/exercise/TodayPanel.tsx'))
  check('the session list asks overridesToRelease(', /overridesToRelease\(/.test(panel))
  check('the tightness answer is handed the warm-up on screen',
    /tightnessWarmup\(tightAreas, profile\?\.injuries \?\? \[\], \{\s*general:/.test(panel))

  const warm = strip(read('src/components/exercise/WarmupSection.tsx'))
  const iGeneral = warm.indexOf('>General<')
  const iTight = warm.indexOf('data-testid="warmup-tightness"')
  const iMobility = warm.indexOf('>Mobility<')
  check('the warm-up draws General, then what feels tight, then Mobility',
    iGeneral > -1 && iTight > -1 && iMobility > -1 && iGeneral < iTight && iTight < iMobility, { iGeneral, iTight, iMobility })

  const sheet = strip(read('src/components/exercise/WhatHappenedSheet.tsx'))
  check('the What-happened sheet asks dayVerbs( and tells it when the day is before the plan',
    /dayVerbs\(\{/.test(sheet) && /beforePlan = cell\?\.state === 'before_plan'/.test(sheet))

  const css = strip(read('src/index.css'))
  check('number boxes draw no native spinner',
    /input\[type='number'\]::-webkit-inner-spin-button[\s\S]{0,80}-webkit-appearance:\s*none/.test(css)
    && /input\[type='number'\]\s*\{[^}]*appearance:\s*textfield/.test(css))

  const row = strip(read('src/components/exercise/ExerciseRow.tsx'))
  check('the open exercise card is not a scroll box (no overflow-hidden on it)',
    /'relative overflow-clip rounded-\[18px\]/.test(row) && !/'relative overflow-hidden rounded-\[18px\]/.test(row))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) FAILED\n`); process.exit(1) }
console.log('Logging manners hold.\n')
