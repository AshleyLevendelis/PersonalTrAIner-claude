/**
 * Gate: putting one exercise INTO a session, as part of the plan.
 *
 * Ashley chose this on 13 Sep 2026. It was the last MISSING line in the
 * "Changing one exercise" grain — you could swap, remove, move and ban, and
 * you could LOG extra work, but you could not add anything to the plan.
 *
 * THE PROPERTY THIS FILE EXISTS FOR, and it is two properties.
 *
 * 1. THE FILTERS. `getConstrainedPool` is what applies equipment, injuries,
 *    style and skill. The ranked list must BE that pool — an addition that
 *    skipped it would be the one path into a plan the injury filter does not
 *    guard. Checked by generating candidates for a profile with a real injury
 *    and real equipment limits and asserting the forbidden movements are
 *    absent, not by reading the source for a call to the pool.
 *
 * 2. HER RULING ON THE PICKER, same day: *show everything, warn me*. So the
 *    absent-from-the-ranked-list movements must still be FINDABLE, each
 *    carrying its warning. A gate that only checked (1) would be satisfied by
 *    a build that hid them entirely, which is the opposite of what she chose.
 *
 * Sections:
 *  1. The peer's programming is what lands, and the numbers are not invented.
 *  2. Position follows generation's tier order; a superset is never split.
 *  3. The inherited superset rest is repaired.
 *  4. Refusals: a rest day, a duplicate, a day that isn't there.
 *  5. Scope reaches the weeks it says and no others.
 *  6. The ranked list IS the constrained pool (the filters).
 *  7. ...and the search path warns rather than hides (her ruling).
 *  8. The screen and the coach both reach it, on the rails the others use.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  generateMesocycle, getConstrainedPool, getExerciseCompatibilityWarnings, mapTier, mapMovementPattern,
} from '../src/lib/exercise-plan'
import { addExerciseToSession, peerProgrammingFor } from '../src/lib/session-edit'
import { executeExerciseAdd } from '../src/lib/pending-action-executor'
import { getAdditionCandidates, resolveAdditionRequest } from '../src/lib/exercise-add-candidates'
import { applyReplacement, recomputeLoad } from '../src/lib/mesocycle-edit'
import { searchExerciseCatalog, muscleGroupsOf, EXERCISE_DATABASE, type ExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile, MesocycleWeek, Exercise, WorkoutDay } from '../src/lib/types'
import type { LoadPrescription } from '../src/lib/load-prescription'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const baseProfile = {
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
const silence = <T>(fn: () => T): T => {
  const l = console.log, d = console.debug
  console.log = () => {}; console.debug = () => {}
  try { return fn() } finally { console.log = l; console.debug = d }
}

const PROFILE = baseProfile
const MESO = silence(() => generateMesocycle(PROFILE))
const WEEK = MESO[0].week_number
const DAY = MESO[0].days.find(d => d.exercises.length > 3)!.day
const dayOf = (m: MesocycleWeek[], week: number, day = DAY) =>
  m.find(w => w.week_number === week)!.days.find(d => d.day === day)!

/** Prices a candidate the way both surfaces do — one peer, one answer. */
async function price(entry: ExerciseEntry, day: WorkoutDay, profile = PROFILE): Promise<LoadPrescription> {
  const prog = peerProgrammingFor(day.exercises, mapTier(entry.mechanics_tier))!
  return recomputeLoad(entry, profile, prog.intensity, prog.sets, prog.reps, true)
}

async function main() {
  const day0 = dayOf(MESO, WEEK)
  const suggestions = getAdditionCandidates(day0, PROFILE, [])
  const PICK = suggestions[0].exercise
  const LOAD = await price(PICK, day0)

  // -------------------------------------------------------------------------
  console.log('\n1. The peer\'s programming lands, and no number is invented')
  // -------------------------------------------------------------------------
  const tier = mapTier(PICK.mechanics_tier)
  const peer = peerProgrammingFor(day0.exercises, tier)!
  const added = addExerciseToSession({ mesocycle: MESO, profile: PROFILE, weekNumber: WEEK, dayName: DAY, entry: PICK, load: LOAD, scope: 'today' })
  check('the add succeeds on a real generated day', added.changed, added.refusal)
  const slot = dayOf(added.mesocycle, WEEK).exercises.find(e => e.name === PICK.name)!
  check('it is there', !!slot)
  check('reps come from the peer, not from thin air', slot.reps === peer.reps, { got: slot.reps, peer: peer.reps })

  // THE POINT OF peerProgrammingFor: the caller prices the load, the module
  // builds the slot, and if the two picked different peers the weight on the
  // card would be computed for a set count the plan never receives. Asserted
  // by handing applyReplacement the same peer and comparing the whole slot's
  // programming, rather than trusting that both call the same helper.
  const plain = day0.exercises.filter(e => !e.superset_label)
  const sameTier = plain.filter(e => e.tier === tier)
  const template = (sameTier.length > 0 ? sameTier : plain)[Math.max(0, (sameTier.length > 0 ? sameTier : plain).length - 1)]
  const expected = applyReplacement(template, PICK, LOAD, PROFILE.session_duration_preference)
  check('the priced sets are the peer\'s sets', peer.sets === template.sets, { priced: peer.sets, peer: template.sets })
  check('reps agree with what applyReplacement would build', slot.reps === expected.reps, { slot: slot.reps, expected: expected.reps })

  // A MOVEMENT WITH NO HISTORY GETS THE RESET BASIS, never a confident number
  // about a lift nobody has done. The reset branch's own sentence.
  check('a brand new lift is told to find its working weight',
    /find your working weight/i.test(String(slot.load_guidance ?? '')), slot.load_guidance)

  // Nothing that belonged to the outgoing peer survives onto the new movement.
  check('no ramp block carried from the peer', slot.ramp_up === undefined)
  check('no selection note carried from the peer', slot.selection_note === undefined)
  check('no superset label carried from the peer', slot.superset_label === undefined)

  check('the plan it was handed is not mutated', dayOf(MESO, WEEK).exercises.every(e => e.name !== PICK.name))

  // -------------------------------------------------------------------------
  console.log('\n2. Position follows tier order, and a superset is never split')
  // -------------------------------------------------------------------------
  const RANK: Record<string, number> = {
    tier_0_primer: 0, tier_1_primary: 1, tier_2_secondary: 2, tier_3_isolation: 3, tier_4_finisher: 4,
  }
  const after = dayOf(added.mesocycle, WEEK).exercises
  const at = after.findIndex(e => e.name === PICK.name)
  const beforeRank = at > 0 ? RANK[after[at - 1].tier ?? 'tier_3_isolation'] : -1
  const afterRank = at < after.length - 1 ? RANK[after[at + 1].tier ?? 'tier_3_isolation'] : 99
  check('it is not appended blindly to the end', at < after.length - 1 || afterRank === 99 && beforeRank <= RANK[tier])
  check('everything before it is the same tier or earlier', beforeRank <= RANK[tier], { beforeRank, tier })
  check('everything after it is the same tier or later', afterRank >= RANK[tier], { afterRank, tier })

  // A LABELLED PAIR IS ADJACENT AND MUST STAY SO — the scorer deducts
  // superset_not_adjacent, and buildSupersetPairs goes out of its way to make
  // them neighbours. Forged rather than hoped for: a day with a real pair.
  const pairDay = MESO.flatMap(w => w.days).find(d => {
    const labels = d.exercises.map(e => e.superset_label).filter(Boolean)
    return new Set(labels).size < labels.length
  })
  if (!pairDay) {
    check('a day with a labelled superset exists to test against (skipped, none generated)', true)
  } else {
    const meso2 = MESO.map(w => ({ ...w, days: w.days.map(d => d.day === pairDay.day ? pairDay : d) }))
    const cand = getAdditionCandidates(pairDay, PROFILE, [])[0]
    const load2 = await price(cand.exercise, pairDay)
    const r = addExerciseToSession({ mesocycle: meso2, profile: PROFILE, weekNumber: WEEK, dayName: pairDay.day, entry: cand.exercise, load: load2, scope: 'today' })
    const ex = dayOf(r.mesocycle, WEEK, pairDay.day).exercises
    let split = false
    for (let i = 1; i < ex.length - 1; i++) {
      if (ex[i].name !== cand.exercise.name) continue
      if (ex[i - 1].superset_label && ex[i - 1].superset_label === ex[i + 1].superset_label) split = true
    }
    check('inserting never lands between the two halves of a pair', !split, { day: pairDay.day, added: cand.exercise.name })
  }

  // -------------------------------------------------------------------------
  console.log('\n3. A superset peer\'s "alternate" rest does not come with it')
  // -------------------------------------------------------------------------
  // MEASURED, NOT ASSUMED: clearOrphanedSupersetLabels returns early on any
  // slot with no superset_label (settle-week.ts:114), so it can never repair
  // this one — the new slot has no label to orphan. Forged: a day whose only
  // same-tier peer is half of a pair.
  // EVERY exercise labelled, not just one. The first version of this forge
  // labelled only the last, and the mutation that deletes the repair survived
  // it: peerTemplate prefers PLAIN slots (`plain.length > 0 ? plain : all`),
  // so with one labelled exercise among six the template is never the labelled
  // one and the inherited-rest path is never taken. A check that cannot reach
  // the code it names is not a check.
  const forged: WorkoutDay = {
    ...day0,
    exercises: day0.exercises.map((e, i) => ({
      ...e, superset_label: i % 2 === 0 ? 'A1' : 'A2', rest: 'alternate',
    })),
  }
  const forgedTier = forged.exercises[forged.exercises.length - 1].tier!
  const forgedCand = getConstrainedPool(PROFILE, []).find(e =>
    mapTier(e.mechanics_tier) === forgedTier && !forged.exercises.some(x => x.name === e.name))!
  const forgedMeso = MESO.map(w => ({ ...w, days: w.days.map(d => d.day === DAY ? forged : d) }))
  const forgedLoad = await price(forgedCand, forged)
  const forgedResult = addExerciseToSession({ mesocycle: forgedMeso, profile: PROFILE, weekNumber: WEEK, dayName: DAY, entry: forgedCand, load: forgedLoad, scope: 'today' })
  const forgedSlot = dayOf(forgedResult.mesocycle, WEEK).exercises.find(e => e.name === forgedCand.name)
  check('the added slot exists on the forged day', !!forgedSlot, forgedResult.refusal)
  check('it never ships rest: "alternate" with nothing to alternate with',
    forgedSlot?.rest !== 'alternate', { rest: forgedSlot?.rest })

  // -------------------------------------------------------------------------
  console.log('\n4. Refusals, in words a person can read')
  // -------------------------------------------------------------------------
  const restDay = MESO[0].days.find(d => d.exercises.length === 0)
  if (restDay) {
    const r = addExerciseToSession({ mesocycle: MESO, profile: PROFILE, weekNumber: WEEK, dayName: restDay.day, entry: PICK, load: LOAD, scope: 'today' })
    check('a rest day is not silently turned into a one-exercise workout', !r.changed)
    // THE REASON, NOT JUST A REFUSAL. Checking only that the sentence names
    // the day let the guard be deleted outright: with no exercises there is no
    // peer to copy, so the generic "I couldn't add X to Y" fires instead — and
    // that names the day too. What a person needs to read here is that the day
    // is a REST day and what to do about it, which the fallback never says.
    check('...and says it is a rest day, and what to do instead',
      /rest day/i.test(r.refusal ?? '') && /training day/i.test(r.refusal ?? ''), r.refusal)
  }
  const dup = addExerciseToSession({ mesocycle: added.mesocycle, profile: PROFILE, weekNumber: WEEK, dayName: DAY, entry: PICK, load: LOAD, scope: 'today' })
  check('adding the same exercise twice is refused', !dup.changed)
  // Same trap as the rest-day refusal above: the per-week duplicate skip makes
  // the generic refusal fire when the guard is deleted, and that names the
  // exercise as well. The distinguishing words are what is asserted.
  check('...and says it is already there, not just that it failed',
    /already on/i.test(dup.refusal ?? '') && !!dup.refusal?.includes(PICK.name), dup.refusal)
  const nowhere = addExerciseToSession({ mesocycle: MESO, profile: PROFILE, weekNumber: WEEK, dayName: 'Fakeday', entry: PICK, load: LOAD, scope: 'today' })
  check('a day that is not on the plan is refused, not crashed into', !nowhere.changed && !!nowhere.refusal)
  check('every refusal leaves the plan exactly as it was', dup.mesocycle === added.mesocycle && nowhere.mesocycle === MESO)

  // -------------------------------------------------------------------------
  console.log('\n5. Scope reaches the weeks it says and no others')
  // -------------------------------------------------------------------------
  const block = MESO[0].block_number
  const has = (m: MesocycleWeek[], w: number) => {
    const d = m.find(x => x.week_number === w)?.days.find(x => x.day === DAY)
    return !!d?.exercises.some(e => e.name === PICK.name)
  }
  const todayOnly = addExerciseToSession({ mesocycle: MESO, profile: PROFILE, weekNumber: WEEK, dayName: DAY, entry: PICK, load: LOAD, scope: 'today' })
  const laterWeeks = MESO.filter(w => w.block_number === block && w.week_number > WEEK).map(w => w.week_number)
  check('"today" reaches this week', has(todayOnly.mesocycle, WEEK))
  check('"today" reaches no later week', laterWeeks.every(w => !has(todayOnly.mesocycle, w)), laterWeeks)
  const restOfBlock = addExerciseToSession({ mesocycle: MESO, profile: PROFILE, weekNumber: WEEK, dayName: DAY, entry: PICK, load: LOAD, scope: 'permanent' })
  check('"rest of block" reaches every later week of this block',
    laterWeeks.every(w => has(restOfBlock.mesocycle, w)), laterWeeks.filter(w => !has(restOfBlock.mesocycle, w)))
  const nextBlock = MESO.find(w => w.block_number !== block)
  if (nextBlock) {
    check('...and never the next block', !has(restOfBlock.mesocycle, nextBlock.week_number), nextBlock.week_number)
  }

  // -------------------------------------------------------------------------
  console.log('\n6. The ranked list IS the constrained pool — the filters')
  // -------------------------------------------------------------------------
  // A profile with a REAL constraint on both axes: no gym (so barbell work is
  // out) and a shoulder injury (so overhead work is out). Both are things the
  // generator itself would never plan, so both must be absent from a list that
  // claims to be what the app would plan.
  // 'minimalist', not 'home_gym' — home_gym includes a barbell, a bench and a
  // squat rack, so a "no barbell" assertion against it would pass vacuously.
  // 'shoulders' is the injury code INJURED_JOINTS actually keys on; the first
  // draft of this gate used 'shoulder_impingement', which matches nothing and
  // made the injury half of the check assert against an empty set.
  const limited = {
    ...baseProfile, equipment_access: 'minimalist', injuries: ['shoulders'],
  } as unknown as UserProfile
  const limitedMeso = silence(() => generateMesocycle(limited))
  const limitedDay = limitedMeso[0].days.find(d => d.exercises.length > 3)!
  const limitedCands = getAdditionCandidates(limitedDay, limited, [], 200)
  const pool = new Set(getConstrainedPool(limited, []).map(e => e.name))
  check('every suggestion is in the constrained pool',
    limitedCands.every(c => pool.has(c.exercise.name)),
    limitedCands.filter(c => !pool.has(c.exercise.name)).map(c => c.exercise.name).slice(0, 5))

  // Diffed against the whole catalogue, not a search string: what matters is
  // "everything the filters removed", and a keyword search only finds the ones
  // whose NAME happens to carry the word.
  const forbidden = EXERCISE_DATABASE.filter(e => !e.retired && !pool.has(e.name))
  check('the catalogue really does hold movements this profile is filtered out of', forbidden.length > 0, forbidden.length)
  check('none of them is suggested',
    forbidden.every(e => !limitedCands.some(c => c.exercise.name === e.name)),
    forbidden.filter(e => limitedCands.some(c => c.exercise.name === e.name)).map(e => e.name).slice(0, 5))

  // The injury's OWN contribution, isolated: the same profile with the injury
  // lifted keeps movements this one does not.
  const healthyPool = getConstrainedPool({ ...limited, injuries: [] } as unknown as UserProfile, [])
  const injuryFiltered = healthyPool.filter(e => !pool.has(e.name))
  check('the shoulder injury really does remove movements', injuryFiltered.length > 0, injuryFiltered.length)
  check('none of THOSE is suggested either',
    injuryFiltered.every(e => !limitedCands.some(c => c.exercise.name === e.name)),
    injuryFiltered.filter(e => limitedCands.some(c => c.exercise.name === e.name)).map(e => e.name).slice(0, 5))

  const banned = getAdditionCandidates(limitedDay, limited, [limitedCands[0].exercise.name], 200)
  check('a banned exercise leaves the suggestions',
    !banned.some(c => c.exercise.name === limitedCands[0].exercise.name), limitedCands[0].exercise.name)

  // A SESSION IS NOT A WHOLE BODY. The first version of the ranker scored an
  // exercise UP for training a group the day did not touch, and offered Air
  // Squat and Belt Squat on a bench-press day. Nothing that trains none of
  // what the day trains may be suggested for it.
  const dayGroups = new Set(
    limitedDay.exercises.flatMap(e => {
      const entry = EXERCISE_DATABASE.find(x => x.name.toLowerCase() === e.name.toLowerCase())
      return entry ? muscleGroupsOf(entry) : []
    }),
  )
  check('the day has muscles to be on-theme with', dayGroups.size > 0, [...dayGroups])
  const offTheme = limitedCands.filter(c => !muscleGroupsOf(c.exercise).some(g => dayGroups.has(g)))
  check('nothing that trains none of what this session trains is suggested',
    offTheme.length === 0, offTheme.map(c => c.exercise.name).slice(0, 5))

  // THE CONCRETE REGRESSION, stated in the terms the defect appeared in rather
  // than in the ranker's own vocabulary: on a day with no squat and no hinge,
  // nothing squat- or hinge-patterned may be offered. This is the check that
  // would have caught "Air Squat, Belt Squat, Bodyweight Good Morning" on a
  // bench-press day; the muscle-overlap check above happens to catch it too,
  // but only because it shares the ranker's own way of seeing.
  const lowerDay = MESO.flatMap(w => w.days).find(d =>
    d.exercises.length > 3
    && !d.exercises.some(e => e.movement_pattern === 'squat' || e.movement_pattern === 'hinge'))
  if (!lowerDay) {
    check('an upper-body day exists to test against (skipped, none generated)', true)
  } else {
    const upperCands = getAdditionCandidates(lowerDay, PROFILE, [], 200)
    const legs = upperCands.filter(c => {
      const p = mapMovementPattern(c.exercise.movement_pattern)
      return p === 'squat' || p === 'hinge'
    })
    check('no squat or hinge is offered for a day that has neither',
      legs.length === 0, { day: lowerDay.day, offered: legs.map(c => c.exercise.name).slice(0, 5) })
  }

  check('the list is stable — the same day offers the same order twice',
    JSON.stringify(getAdditionCandidates(limitedDay, limited, []).map(c => c.exercise.name))
    === JSON.stringify(getAdditionCandidates(limitedDay, limited, []).map(c => c.exercise.name)))
  check('every suggestion carries a reason', limitedCands.every(c => c.note.trim().length > 0))

  // BOTH OF THESE WERE FOUND BY READING A SCREENSHOT, not by a check, and are
  // pinned here so they cannot come back.
  //
  // 1. The reason must name the group the exercise LEADS with. Keying on the
  //    least-served overlapping group instead produced "Archer Push-Ups — your
  //    core gets the least work in this session": true of a push-up's
  //    secondary core, and it reads as though the app thinks a push-up is core
  //    work.
  //    "Leads with" means leads with AMONG WHAT THIS DAY TRAINS — the first
  //    version of this check compared against the exercise's absolute first
  //    muscle and flagged "Suitcase Carry — your back gets the least work",
  //    which is correct: the carry leads with core, this day trains no core,
  //    and back is the leading thing it does train. Naming a muscle the
  //    session does not touch would be the actual defect.
  const leadFor = (e: ExerciseEntry) => muscleGroupsOf(e).find(g => dayGroups.has(g))
  const misleading = limitedCands.filter(c => {
    const m = /^Your (\w+) gets the least work/.exec(c.note)
    return m ? leadFor(c.exercise) !== m[1] : false
  })
  check('a "least work" reason names the muscle the exercise leads with, among those this day trains',
    misleading.length === 0,
    misleading.map(c => ({ name: c.exercise.name, leads: leadFor(c.exercise), note: c.note })).slice(0, 3))
  check('...and never names a muscle this session does not train at all',
    limitedCands.every(c => {
      const m = /^Your (\w+) gets the least work/.exec(c.note)
      return !m || dayGroups.has(m[1] as never)
    }))

  // 2. The row's two badges are movement_pattern and mechanics_tier, and for a
  //    handful of catalogue entries (Battle Ropes) those are the same word, so
  //    the row printed "cardio  cardio".
  const sheetSrc = read('src/components/exercise/AddExerciseSheet.tsx')
  check('the catalogue really does hold an entry whose pattern and tier are one word',
    EXERCISE_DATABASE.some(e => !e.retired
      && e.movement_pattern.replace(/_/g, ' ') === e.mechanics_tier.replace(/_/g, ' ')),
    EXERCISE_DATABASE.filter(e => e.movement_pattern.replace(/_/g, ' ') === e.mechanics_tier.replace(/_/g, ' ')).map(e => e.name).slice(0, 3))
  check('...and the row de-duplicates its badges rather than printing it twice',
    /new Set\(\[[\s\S]{0,200}movement_pattern[\s\S]{0,200}mechanics_tier/.test(strip(sheetSrc)))
  check('a day with nothing on it suggests nothing',
    getAdditionCandidates({ ...limitedDay, exercises: [] }, limited, []).length === 0)

  // -------------------------------------------------------------------------
  console.log('\n7. ...and the search path warns rather than hides — her ruling')
  // -------------------------------------------------------------------------
  // "Show everything, warn me", 13 Sep 2026. A build that satisfied §6 by
  // hiding the filtered movements entirely would be the opposite of what she
  // chose, so the same two movements §6 proved absent from the RANKED list
  // must be findable by name, each stating its clash.
  const equipmentBlocked = forbidden[0]
  const found = searchExerciseCatalog(equipmentBlocked.name, 20)
  check('an equipment-blocked movement is still findable by name',
    found.some(e => e.name === equipmentBlocked.name), equipmentBlocked.name)
  const equipWarnings = getExerciseCompatibilityWarnings(equipmentBlocked, limited, [])
  check('...and the row would state the equipment clash',
    equipWarnings.some(w => /needs /i.test(w)), equipWarnings)

  const injuryBlocked = injuryFiltered[0]
  check('an injury-blocked movement is still findable by name',
    searchExerciseCatalog(injuryBlocked.name, 20).some(e => e.name === injuryBlocked.name), injuryBlocked.name)
  const injuryWarnings = getExerciseCompatibilityWarnings(injuryBlocked, limited, [])
  check('...and the row would state the injury, or say it is good for it',
    injuryWarnings.some(w => /flagged an injury|good for your/i.test(w)), injuryWarnings)

  const bannedName = limitedCands[0].exercise.name
  check('a previously banned movement says so on the row',
    getExerciseCompatibilityWarnings(limitedCands[0].exercise, limited, [bannedName])
      .some(w => /previously banned/i.test(w)))

  // -------------------------------------------------------------------------
  console.log('\n8. Both surfaces reach it, on the rails the other edits use')
  // -------------------------------------------------------------------------
  const panel = strip(read('src/components/exercise/TodayPanel.tsx'))
  const sheet = strip(read('src/components/exercise/AddExerciseSheet.tsx'))
  const chat = strip(read('supabase/functions/chat-gemini/index.ts'))
  const client = strip(read('src/components/ChatAssistant.tsx'))
  const executor = strip(read('src/lib/pending-action-executor.ts'))
  const store = strip(read('src/lib/pending-actions-store.ts'))

  check('the screen has an entry point', /data-testid="add-exercise"/.test(panel))
  check('...which mounts the sheet', /<AddExerciseSheet/.test(panel))
  check('...and saves through the one shared saver, like remove and move',
    /addExerciseToSession\([\s\S]{0,400}?\),\s*scope,\s*\)/.test(panel)
    && /applySessionEdit/.test(panel))
  check('the sheet asks rather than decides the scope',
    /data-scope="today"/.test(sheet) && /data-scope="permanent"/.test(sheet))
  check('the sheet says the new length before the tap', /data-testid="add-length"/.test(sheet))
  check('...read off a trial of the real edit, not a second model',
    /addExerciseToSession\(\{[\s\S]{0,300}?scope: 'today'/.test(panel) && /estimateDaySeconds\(afterDay\)/.test(panel))

  check('the coach declares the tool', /name: "propose_exercise_add"/.test(chat))
  // BOUNDED AT THE NEXT HANDLER, not at a fixed character count — a fixed
  // window ran into a neighbour's `reply: ""` on 13 Sep 2026 and satisfied
  // this check for a tool that did not have one.
  const handlerAt = chat.indexOf('if (name === "propose_exercise_add")')
  const nextHandlerAt = handlerAt === -1 ? -1 : chat.indexOf('if (name === "', handlerAt + 10)
  const body = handlerAt === -1 ? ''
    : chat.slice(handlerAt, nextHandlerAt === -1 ? handlerAt + 1400 : Math.min(nextHandlerAt, handlerAt + 1400))
  check('...its handler forwards a proposal', /kind: "propose_exercise_add"/.test(body), body.slice(0, 120))
  check('...and writes nothing itself',
    !/supabase\s*\n?\s*\.from\(/.test(body) && !/\.update\(|\.insert\(|\.upsert\(/.test(body))
  check('...and puts no words in the model\'s mouth', /reply: ""/.test(body))
  check('the prompt tells it adding is not logging',
    /propose_exercise_add/.test(chat) && /adding is not logging/i.test(chat))

  check('the client builds the card', /buildExerciseAddProposal/.test(client))
  // THE RESOLUTION IS CALLED, NOT GREPPED FOR. This check used to search
  // ChatAssistant for `getConstrainedPool` and it survived a mutation that
  // replaced the builder's pool with the raw catalogue — the word was still in
  // the file, on the import line. The resolver is now one exported function
  // that both the card and the confirm use, so the property can be asserted by
  // running it.
  check('the card goes through the one resolver', /resolveAdditionRequest/.test(client))

  // THE CONFIRM IS RUN, NOT READ. Grepping the executor for the resolver's
  // name survived a mutation that replaced the call with a raw catalogue
  // lookup — the name was still on the import line, the same way it survived
  // in the builder. `executeExerciseAdd` reaches its resolution step before it
  // needs a database, and a profile with no id stops it at the save with a
  // named failure, so the whole safety step can be exercised offline.
  const noId = { ...limited, id: undefined } as unknown as UserProfile
  const errOf = (r: Awaited<ReturnType<typeof executeExerciseAdd>>) =>
    r.receipt.failed[0]?.error ?? ''
  const opOf = (r: Awaited<ReturnType<typeof executeExerciseAdd>>) =>
    r.receipt.failed[0]?.op ?? ''
  const addPayload = (name: string) => ({
    weekNumber: limitedMeso[0].week_number, dayName: limitedDay.day, exerciseName: name, scope: 'today' as const,
  })

  const invented = await executeExerciseAdd(noId, limitedMeso, addPayload('Turbo Encabulator Press'), [])
  check('confirming a movement the model invented is refused',
    opOf(invented) === 'propose_exercise_add' && /can't add/i.test(errOf(invented)), errOf(invented))
  check('...and nothing is written', invented.mesocycle === limitedMeso)

  const blocked = await executeExerciseAdd(noId, limitedMeso, addPayload(injuryFiltered[0].name), [])
  check('confirming an injury-blocked movement is refused at the confirm, not only in the card',
    opOf(blocked) === 'propose_exercise_add', errOf(blocked))

  const allowed = await executeExerciseAdd(noId, limitedMeso, addPayload(limitedCands[0].exercise.name), [])
  check('a movement this profile CAN be prescribed gets past the resolution step',
    opOf(allowed) === 'save', { op: opOf(allowed), error: errOf(allowed) })

  const bannedAtConfirm = await executeExerciseAdd(
    noId, limitedMeso, addPayload(limitedCands[0].exercise.name), [limitedCands[0].exercise.name])
  check('...and a ban still stops it at confirm time',
    opOf(bannedAtConfirm) === 'propose_exercise_add', errOf(bannedAtConfirm))
  check('a movement the model invented resolves to nothing',
    resolveAdditionRequest('Turbo Encabulator Press', limited, []) === null)
  check('a real movement this profile is filtered out of resolves to nothing',
    resolveAdditionRequest(forbidden[0].name, limited, []) === null, forbidden[0].name)
  check('an injury-blocked movement resolves to nothing',
    resolveAdditionRequest(injuryFiltered[0].name, limited, []) === null, injuryFiltered[0].name)
  check('a banned movement resolves to nothing',
    resolveAdditionRequest(limitedCands[0].exercise.name, limited, [limitedCands[0].exercise.name]) === null)
  check('a movement this profile CAN be prescribed resolves to it',
    resolveAdditionRequest(limitedCands[0].exercise.name, limited, [])?.name === limitedCands[0].exercise.name)
  check('...and so does a partial name, when it is unambiguous',
    resolveAdditionRequest(limitedCands[0].exercise.name.toLowerCase(), limited, [])?.name === limitedCands[0].exercise.name)
  check('an empty name resolves to nothing rather than to the first thing in the pool',
    resolveAdditionRequest('   ', limited, []) === null)
  check('...and the client calls that executor on confirm', /executeExerciseAdd\(profile, mesocycle/.test(client))
  check('...and can be undone from the pre-image',
    /propose_exercise_add/.test(store) && /undoSessionEdit/.test(client))

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void quiet
void main()
