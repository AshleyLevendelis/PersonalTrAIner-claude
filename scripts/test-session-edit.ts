/**
 * Gate: taking one exercise out of a session, and moving one within it.
 *
 * Ashley, 11 Sep 2026, from the must-have audit. Before this, an exercise
 * could be swapped or banned and nothing else: banning rewrites every week of
 * every block, so "not today" did not exist, and there was no reordering at
 * all.
 *
 * THE PROPERTY THIS FILE EXISTS FOR. An edit made outside generateMesocycle
 * cannot re-run the passes that are private to it, but it MUST re-run the ones
 * that are reachable. So the checks below do not read the source to see that
 * enforceSetHierarchy is called — they call it on the RESULT and assert it
 * changes nothing, which is the only form of the claim that cannot be
 * satisfied by a line that happens to be present.
 *
 * Sections:
 *  1. Removing takes exactly one exercise out, and refuses rather than gut.
 *  2. Scope reaches the weeks it says and no others.
 *  3. Everything reachable is re-asserted afterwards, including the warm-up.
 *  4. Moving reorders, and a superset's halves travel together.
 *  5. The balance cost is reported, never enforced.
 *  6. One saver, two surfaces; the coach's two tools on the proposal rail.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateMesocycle, enforceSetHierarchy, enforceLoadCoherence } from '../src/lib/exercise-plan'
import {
  removeExerciseFromSession,
  moveExerciseInSession,
  reorderWithSupersets,
  MIN_EXERCISES_PER_SESSION,
} from '../src/lib/session-edit'
import { describeBalanceCost, weekBalance } from '../src/lib/session-balance-cost'
import type { UserProfile, MesocycleWeek, Exercise } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
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

const quiet = console.log
console.log = () => {}
const MESO = generateMesocycle(profile)
console.log = quiet

const WEEK = MESO[0].week_number
const DAY = MESO[0].days.find(d => d.exercises.length > MIN_EXERCISES_PER_SESSION + 1)!.day
const dayOf = (m: MesocycleWeek[], week: number) => m.find(w => w.week_number === week)!.days.find(d => d.day === DAY)!
const names = (m: MesocycleWeek[], week: number) => dayOf(m, week).exercises.map(e => e.name)

// ---------------------------------------------------------------------------
console.log('\n0. The fixture')
// ---------------------------------------------------------------------------
check('a day with room to lose one exists', dayOf(MESO, WEEK).exercises.length > MIN_EXERCISES_PER_SESSION, { day: DAY, n: dayOf(MESO, WEEK).exercises.length })
check('the block has later weeks, so scope can be told apart', MESO.filter(w => w.block_number === MESO[0].block_number).length > 1)

// ---------------------------------------------------------------------------
console.log('\n1. Removing takes one out, and refuses rather than gut a session')
// ---------------------------------------------------------------------------
{
  const before = names(MESO, WEEK)
  const victim = before[1]
  const r = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: DAY, exIndex: 1, scope: 'today' })
  check('it changed', r.changed)
  check('...the named exercise is gone', !names(r.mesocycle, WEEK).includes(victim), { victim, after: names(r.mesocycle, WEEK) })
  check('...exactly one fewer', names(r.mesocycle, WEEK).length === before.length - 1)
  check('...and every other exercise survived, in order',
    names(r.mesocycle, WEEK).join('|') === before.filter((_, i) => i !== 1).join('|'))
  check('the input is untouched — pure', names(MESO, WEEK).join('|') === before.join('|'))

  // A day trimmed to the floor refuses the next one.
  let m = MESO
  let guard = 0
  while (dayOf(m, WEEK).exercises.length > MIN_EXERCISES_PER_SESSION && guard++ < 20) {
    const step = removeExerciseFromSession({ mesocycle: m, profile, weekNumber: WEEK, dayName: DAY, exIndex: 0, scope: 'today' })
    if (!step.changed) break
    m = step.mesocycle
  }
  check(`a session can be trimmed down to the ${MIN_EXERCISES_PER_SESSION}-exercise floor`, dayOf(m, WEEK).exercises.length === MIN_EXERCISES_PER_SESSION, dayOf(m, WEEK).exercises.length)
  const refused = removeExerciseFromSession({ mesocycle: m, profile, weekNumber: WEEK, dayName: DAY, exIndex: 0, scope: 'today' })
  check('...and the one after that is refused', !refused.changed && !!refused.refusal, refused.refusal)
  check('...with nothing written', refused.mesocycle === m)
  check('...saying what to do instead', /take the whole day off|swap/i.test(refused.refusal ?? ''), refused.refusal)

  const missing = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: 'Nonesuch', exIndex: 0, scope: 'today' })
  check('an unknown day is refused, not crashed', !missing.changed && missing.mesocycle === MESO)
}

// ---------------------------------------------------------------------------
console.log('\n2. Scope reaches the weeks it says, and no others')
// ---------------------------------------------------------------------------
{
  const block = MESO[0].block_number
  const laterSameBlock = MESO.filter(w => w.block_number === block && w.week_number > WEEK).map(w => w.week_number)
  const otherBlock = MESO.find(w => w.block_number !== block)?.week_number
  const victim = names(MESO, WEEK)[1]

  const today = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: DAY, exIndex: 1, scope: 'today' })
  check("'today' leaves every later week alone",
    laterSameBlock.every(w => names(today.mesocycle, w).length === names(MESO, w).length), laterSameBlock)

  const block2 = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: DAY, exIndex: 1, scope: 'permanent' })
  const reached = laterSameBlock.filter(w => names(MESO, w)[1] === victim)
  check("'permanent' reaches the rest of THIS block",
    reached.length > 0 && reached.every(w => !names(block2.mesocycle, w).includes(victim)), { reached })
  if (otherBlock != null) {
    check('...and never the next block', names(block2.mesocycle, otherBlock).join('|') === names(MESO, otherBlock).join('|'))
  }

  // A later week whose slot has rotated to something else must NOT lose that
  // something else — the index is positional, so the name is checked too.
  const rotated = laterSameBlock.filter(w => names(MESO, w)[1] !== victim)
  if (rotated.length > 0) {
    check('a rotated slot in a later week is left alone, not removed by index',
      rotated.every(w => names(block2.mesocycle, w).join('|') === names(MESO, w).join('|')), rotated)
  } else {
    // Build the case rather than skip it: rename the slot in a later week.
    const w = laterSameBlock[0]
    const forged = MESO.map(week => week.week_number !== w ? week : {
      ...week,
      days: week.days.map(d => d.day !== DAY ? d : { ...d, exercises: d.exercises.map((e, i) => i === 1 ? { ...e, name: 'Something Else Entirely' } : e) }),
    })
    const r = removeExerciseFromSession({ mesocycle: forged, profile, weekNumber: WEEK, dayName: DAY, exIndex: 1, scope: 'permanent' })
    check('a rotated slot in a later week is left alone, not removed by index',
      names(r.mesocycle, w).includes('Something Else Entirely'), names(r.mesocycle, w))
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. What is reachable is re-asserted — proven by breaking it first')
// ---------------------------------------------------------------------------
// EVERY CHECK HERE HANDS THE EDIT A DAY THAT ALREADY VIOLATES THE RULE, and
// asserts the violation is gone afterwards. An earlier version ran each pass
// again on the result and asserted it changed nothing — which read well and
// proved nothing: a well-formed day satisfies all three whether or not the
// edit re-runs them, and all four mutations that deleted a pass went
// uncaught. A forged violation is the only form the edit cannot pass by
// accident. Each forge is itself checked for being a real violation first,
// so a catalogue change that makes a forge inert shows up as a failure here
// rather than as a check that quietly stops asking anything.
{
  // --- set hierarchy: an accessory carrying more sets than the main lift ---
  const bumpIdx = dayOf(MESO, WEEK).exercises.length - 1
  const forgedSets = MESO.map(w => w.week_number !== WEEK ? w : {
    ...w,
    days: w.days.map(d => d.day !== DAY ? d : { ...d, exercises: d.exercises.map((e, i) => i === bumpIdx ? { ...e, sets: 9 } : e) }),
  })
  check('the forge is real — 9 sets on an accessory is a hierarchy violation',
    enforceSetHierarchy(dayOf(forgedSets, WEEK).exercises)[bumpIdx].sets !== 9,
    enforceSetHierarchy(dayOf(forgedSets, WEEK).exercises)[bumpIdx].sets)
  const rSets = removeExerciseFromSession({ mesocycle: forgedSets, profile, weekNumber: WEEK, dayName: DAY, exIndex: 0, scope: 'today' })
  const settledDay = dayOf(rSets.mesocycle, WEEK).exercises
  check('an edit puts the set hierarchy back', settledDay[settledDay.length - 1].sets < 9, settledDay.map(e => `${e.name}:${e.sets}`))
  check('...and a second pass then finds nothing left to do',
    enforceSetHierarchy(settledDay).every((e, i) => e.sets === settledDay[i].sets))

  // --- one lift, one weight, across the week ---------------------------------
  const srcIdx = dayOf(MESO, WEEK).exercises.findIndex((e, i) => i > 0 && e.suggested_load_kg != null)
  const src = dayOf(MESO, WEEK).exercises[srcIdx]
  const otherDay = MESO.find(w => w.week_number === WEEK)!.days.find(d => d.day !== DAY && d.exercises.length > 0)
  check('the fixture has a second day to disagree with', !!otherDay && srcIdx > 0, { srcIdx, otherDay: otherDay?.day })
  const forgedWeight = MESO.map(w => w.week_number !== WEEK ? w : {
    ...w,
    days: w.days.map(d => d.day !== otherDay!.day ? d
      : { ...d, exercises: [...d.exercises, { ...src, suggested_load_kg: (src.suggested_load_kg ?? 0) + 25 }] }),
  })
  const clonedOf = (m: MesocycleWeek[]) => {
    const d = m.find(w => w.week_number === WEEK)!.days.find(x => x.day === otherDay!.day)!
    return d.exercises[d.exercises.length - 1].suggested_load_kg
  }
  check('the forge is real — the same prescription now carries two weights',
    clonedOf(forgedWeight) !== src.suggested_load_kg, { forged: clonedOf(forgedWeight), real: src.suggested_load_kg })
  const rWeight = removeExerciseFromSession({ mesocycle: forgedWeight, profile, weekNumber: WEEK, dayName: DAY, exIndex: 0, scope: 'today' })
  check('an edit puts one-lift-one-weight back across the whole week',
    clonedOf(rWeight.mesocycle) === src.suggested_load_kg, { after: clonedOf(rWeight.mesocycle), expected: src.suggested_load_kg })

  // --- load coherence: an outlier against its own week -----------------------
  // Which lift coherence will actually pull back is a fact about the
  // catalogue, not something to assume — so it is FOUND, by inflating each
  // loaded lift in turn and seeing which one the pass objects to.
  const weekDays = MESO.find(w => w.week_number === WEEK)!.days
  let outlier: { day: string; idx: number; was: number } | null = null
  for (const d of weekDays) {
    if (d.exercises.length <= MIN_EXERCISES_PER_SESSION) continue
    for (let i = 1; i < d.exercises.length && !outlier; i++) {
      const was = d.exercises[i].suggested_load_kg
      if (was == null) continue
      const trial = JSON.parse(JSON.stringify(weekDays)) as typeof weekDays
      const td = trial.find(x => x.day === d.day)!
      td.exercises[i].suggested_load_kg = was * 20
      enforceLoadCoherence(trial)
      if (td.exercises[i].suggested_load_kg !== was * 20) outlier = { day: d.day, idx: i, was }
    }
    if (outlier) break
  }
  check('the forge is real — a 20x weight somewhere in the week is incoherent', !!outlier, outlier)
  if (outlier) {
    const forgedLoad = MESO.map(w => w.week_number !== WEEK ? w : {
      ...w,
      days: w.days.map(d => d.day !== outlier!.day ? d
        : { ...d, exercises: d.exercises.map((e, i) => i === outlier!.idx ? { ...e, suggested_load_kg: outlier!.was * 20 } : e) }),
    })
    const rLoad = removeExerciseFromSession({ mesocycle: forgedLoad, profile, weekNumber: WEEK, dayName: outlier.day, exIndex: 0, scope: 'today' })
    const loadedDay = rLoad.mesocycle.find(w => w.week_number === WEEK)!.days.find(d => d.day === outlier!.day)!
    // exIndex 0 came out, so the forged lift sits one place earlier now.
    const after = loadedDay.exercises[outlier.idx - 1]
    check('an edit pulls an incoherent weight back',
      after?.suggested_load_kg != null && after.suggested_load_kg < outlier.was * 20,
      { name: after?.name, kg: after?.suggested_load_kg, forged: outlier.was * 20 })
  }

  // --- the warm-up, rebuilt from what the session now holds -------------------
  // THE VICTIM IS THE RAMPED LIFT, deliberately. Removing an exercise the
  // warm-up never mentioned proves nothing about rebuilding it: the first
  // version of this check took index 0, which on this plan is a primer with
  // no ramp, and a mutation that skipped the rebuild entirely went uncaught.
  const day0 = dayOf(MESO, WEEK)
  const rampedName = (day0.warmup?.ramp_ups ?? []).map(r => r.exercise).find(n => day0.exercises.some(e => e.name === n))
  check('the day has a ramped lift to take out', !!rampedName, (day0.warmup?.ramp_ups ?? []).map(r => r.exercise))
  const victimIdx = day0.exercises.findIndex(e => e.name === rampedName)
  const r = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: DAY, exIndex: victimIdx, scope: 'today' })
  const after = dayOf(r.mesocycle, WEEK)
  check('the day-level warm-up no longer ramps the exercise that left',
    !(after.warmup?.ramp_ups ?? []).some(r2 => r2.exercise === rampedName), (after.warmup?.ramp_ups ?? []).map(x => x.exercise))
  check('...and every ramp it does carry belongs to an exercise still in the session',
    (after.warmup?.ramp_ups ?? []).every(r2 => after.exercises.some(e => e.name === r2.exercise)))
  check('...and no surviving exercise keeps a ramp the warm-up dropped',
    after.exercises.every(e => !e.ramp_up || (after.warmup?.ramp_ups ?? []).some(r2 => r2.exercise === e.name)))

  // --- a superset survivor is repaired ---------------------------------------
  // Looked for on the generated plan first; this profile's plan happens to
  // hold none, so the case is BUILT rather than skipped — same shape as the
  // rotated-slot case in section 2. Skipping it would make the check depend
  // on a fixture detail nobody is holding still.
  {
    const found = MESO.flatMap(w => w.days.map(d => ({ w: w.week_number, d })))
      .find(({ d }) => {
        const labels = d.exercises.map(e => e.superset_label?.[0]).filter(Boolean)
        return d.exercises.length > MIN_EXERCISES_PER_SESSION + 1 && labels.some((l, i2) => labels.indexOf(l) !== i2)
      })
    const week = found?.w ?? WEEK
    const dayName = found?.d.day ?? DAY
    const meso = found
      ? MESO
      : MESO.map(w => w.week_number !== week ? w : {
          ...w,
          days: w.days.map(d => d.day !== dayName ? d : {
            ...d,
            exercises: d.exercises.map((e, i2) =>
              i2 === 0 ? { ...e, superset_label: 'A1', rest: 'alternate' }
              : i2 === 1 ? { ...e, superset_label: 'A2', rest: 'alternate' }
              : e),
          }),
        })
    const day = meso.find(w => w.week_number === week)!.days.find(d => d.day === dayName)!
    const letter = day.exercises.map(e => e.superset_label?.[0]).find((l, i2, all) => !!l && all.indexOf(l) !== i2)!
    const memberIdx = day.exercises.findIndex(e => e.superset_label?.[0] === letter)
    const partners = day.exercises.filter((e, i2) => e.superset_label?.[0] === letter && i2 !== memberIdx).map(e => e.name)
    check('a superset pair exists to break', partners.length > 0, { found: !!found, dayName, letter })
    const broken = removeExerciseFromSession({ mesocycle: meso, profile, weekNumber: week, dayName, exIndex: memberIdx, scope: 'today' })
    check('...breaking it is allowed', broken.changed, broken.refusal)
    const survivors = broken.mesocycle.find(w => w.week_number === week)!.days.find(d => d.day === dayName)!.exercises
      .filter(e => partners.includes(e.name))
    check('...and the partner left behind keeps no dangling label',
      survivors.length > 0 && survivors.every(e => !e.superset_label), survivors.map(e => ({ n: e.name, l: e.superset_label })))
    check("...nor a rest of 'alternate' with nobody to alternate with",
      survivors.length > 0 && survivors.every(e => e.rest !== 'alternate'), survivors.map(e => ({ n: e.name, r: e.rest })))
  }
}

// ---------------------------------------------------------------------------
console.log('\n4. Moving reorders, and a superset travels as one')
// ---------------------------------------------------------------------------
{
  const before = names(MESO, WEEK)
  const r = moveExerciseInSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: DAY, fromIndex: 0, toIndex: 2, scope: 'today' })
  check('it changed', r.changed)
  const after = names(r.mesocycle, WEEK)
  check('...the same exercises, in a different order', [...after].sort().join('|') === [...before].sort().join('|') && after.join('|') !== before.join('|'))
  check('...the moved one landed where asked', after[2] === before[0], { before, after })
  check('...and no weight moved with it',
    dayOf(r.mesocycle, WEEK).exercises.every(ex => {
      const was = dayOf(MESO, WEEK).exercises.find(e => e.name === ex.name)
      return !was || was.suggested_load_kg === ex.suggested_load_kg
    }))

  const nowhere = moveExerciseInSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: DAY, fromIndex: 0, toIndex: 0, scope: 'today' })
  check('moving somewhere it already is changes nothing', !nowhere.changed && nowhere.mesocycle === MESO)
  const off = moveExerciseInSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: DAY, fromIndex: 0, toIndex: 99, scope: 'today' })
  check('moving off the end is refused', !off.changed && /outside the session/i.test(off.refusal ?? ''), off.refusal)

  // Superset partners, on a literal — the generated fixture may hold none.
  const ex = (name: string, label?: string): Exercise => ({ name, sets: 3, reps: '8-10', rest: label ? 'alternate' : '90s', substitution: '', superset_label: label } as Exercise)
  const withPair = [ex('Squat'), ex('Bench', 'A1'), ex('Row', 'A2'), ex('Curl')]
  const moved = reorderWithSupersets(withPair, 1, 3)
  check('a superset moves as a block, staying adjacent',
    !!moved && moved.map(e => e.name).join('|').includes('Bench|Row'), moved?.map(e => e.name))
  check('...and moving EITHER half moves both', (() => {
    const fromSecond = reorderWithSupersets(withPair, 2, 0)
    return !!fromSecond && fromSecond.map(e => e.name).slice(0, 2).join('|') === 'Bench|Row'
  })(), reorderWithSupersets(withPair, 2, 0)?.map(e => e.name))
  check('a no-op reorder returns null rather than a fresh array', reorderWithSupersets([ex('A'), ex('B')], 0, 0) === null)
}

// ---------------------------------------------------------------------------
console.log('\n5. The balance cost is reported, never enforced')
// ---------------------------------------------------------------------------
{
  const w1 = MESO.find(w => w.week_number === WEEK)!
  const base = weekBalance(w1)
  check('the reader counts real sets on a real plan — not zero', base.pushSets > 0 && base.pullSets > 0, base)
  check('an unchanged week has nothing to say', describeBalanceCost(w1, w1) === null)

  const noPulls = { ...w1, days: w1.days.map(d => ({ ...d, exercises: d.exercises.filter(e => e.movement_pattern !== 'pull') })) }
  const said = describeBalanceCost(w1, noPulls)
  check('stripping every pull says so, in plain words', !!said && /nothing pulling/i.test(said), said)
  check('...and it only READ — the week it was handed is unchanged', w1.days.every((d, i) => d.exercises.length === MESO[0].days[i].exercises.length))

  // A removal that costs nothing must stay silent, or the warning becomes wallpaper.
  const r = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK, dayName: DAY, exIndex: 0, scope: 'today' })
  const cost = describeBalanceCost(w1, r.mesocycle.find(w => w.week_number === WEEK))
  check('a single removal inside the band says nothing', cost === null || /heavy|nothing/.test(cost), cost)
}

// ---------------------------------------------------------------------------
console.log('\n6. One saver, two surfaces — and the coach on the proposal rail')
// ---------------------------------------------------------------------------
{
  const persistence = strip(read('src/lib/mesocycle-persistence.ts'))
  check('there is one scoped saver', /export async function saveScopedEdit/.test(persistence))
  check('...whose two branches are the scope, not a guess',
    /if \(scope === 'today'\)[\s\S]{0,200}saveMesocycleWeek/.test(persistence) && /block_number === block && w\.week_number >= weekNumber/.test(persistence))

  const panel = strip(read('src/components/exercise/TodayPanel.tsx'))
  const executor = strip(read('src/lib/pending-action-executor.ts'))
  check('the screen saves through it', /saveScopedEdit\(profileId, next\.mesocycle, liveWeek, scope\)/.test(panel))
  check('the coach saves through it too', (executor.match(/saveScopedEdit\(profile\.id, result\.mesocycle, payload\.weekNumber, payload\.scope\)/g) || []).length === 2)
  check('neither re-implements the branch', !/scope === 'today'[\s\S]{0,120}saveMesocycleWeek/.test(panel))

  const row = strip(read('src/components/exercise/ExerciseRow.tsx'))
  check('the row menu offers all three', /data-testid="move-up"/.test(row) && /data-testid="move-down"/.test(row) && /data-testid="remove-exercise"/.test(row))
  check('...with only the ban styled destructive',
    (row.match(/variant="destructive"/g) || []).length === 1)
  check('...and the move items disabled at the ends', /disabled=\{!canMoveUp\}/.test(row) && /disabled=\{!canMoveDown\}/.test(row))

  const sheet = strip(read('src/components/exercise/RemoveExerciseSheet.tsx'))
  check('removing asks rather than decides — her ruling, 11 Sep',
    /data-verb="drop"/.test(sheet) && /data-verb="swap-instead"/.test(sheet))
  check('...and the balance cost is shown before the tap', /data-testid="remove-balance-cost"/.test(sheet))
  check('...with the same scope words the swap dialog uses',
    /Today only/.test(sheet) && /Rest of block/.test(sheet))

  const chat = read('supabase/functions/chat-gemini/index.ts')
  for (const tool of ['propose_exercise_remove', 'propose_exercise_reorder']) {
    check(`${tool} is declared`, new RegExp(`name: "${tool}"`).test(chat))
  }
  const handler = chat.slice(chat.indexOf('name === "propose_exercise_remove"'), chat.indexOf('name === "propose_exercise_swap"'))
  check('...both PROPOSE and write nothing server-side',
    /kind: name/.test(handler) && !/workout_sessions|mesocycle_weeks|PATCH/.test(handler))
  check('reordering names a neighbour, never counts positions',
    /before_item/.test(chat) && /after_item/.test(chat) && /never a count of positions/i.test(chat))
  check('the prompt keeps removing and banning apart', /Removing is not banning/i.test(chat))

  const ui = strip(read('src/components/ChatAssistant.tsx'))
  check('the client builds both cards', /buildExerciseRemoveProposal/.test(ui) && /buildExerciseReorderProposal/.test(ui))
  check('...trialling the real edit before offering it',
    /const trial = removeExerciseFromSession\(/.test(ui) && /const trial = moveExerciseInSession\(/.test(ui))
  check('...so a refusal reaches the person instead of a card that cannot apply',
    /if \(!trial\.changed\) return \{ ok: false, reason: trial\.refusal/.test(ui))
  check('...executes on confirm', /executeExerciseRemove\(/.test(ui) && /executeExerciseReorder\(/.test(ui))
  check('...and undoes from the pre-image', /undoSessionEdit\(profile\.id, preImage/.test(ui))
  const store = strip(read('src/lib/pending-actions-store.ts'))
  check('both kinds require a pre-image', /'propose_exercise_remove', 'propose_exercise_reorder'/.test(store))

  // THE RECEIPT SAYS THE SIDE THEY ASKED FOR, not the side the indexes imply.
  // Moving an exercise DOWN the list to sit before something has
  // toIndex > fromIndex, so a receipt that reads the direction off the
  // arithmetic told someone who said "before the bench press" that it now
  // sits after it. The property: the word comes from the request.
  const exec = strip(read('src/lib/pending-action-executor.ts'))
  check('the move receipt takes its before/after from the request',
    /placement/.test(exec) && !/toIndex < payload\.fromIndex \? 'before'/.test(exec))
  check('...and the client fills it in from which argument was given',
    /placement: beforeItem \? 'before' : 'after'/.test(ui))
}

console.log(failures === 0 ? '\nAll session-edit checks passed.' : `\n${failures} session-edit check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
