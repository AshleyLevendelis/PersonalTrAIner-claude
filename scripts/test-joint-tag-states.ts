/**
 * Three-state joint tagging — the gate for "participates" vs "contraindicated"
 * vs "indicated".
 *
 * The old model had one array (loads_joints) doing two jobs, so the injury
 * filter removed rotator-cuff REHAB movements from a user with a rotator-cuff
 * injury. This asserts the three states stay distinct and that the migration
 * stayed additive (an un-reviewed entry keeps its historical behaviour).
 */
import {
  EXERCISE_DATABASE, contraindicatedJoints, isContraindicatedFor, isIndicatedFor,
} from '../src/lib/exercise-db'
import { getConstrainedPool, getFlaggedJoints } from '../src/lib/exercise-plan'
import type { UserProfile } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const profile = {
  age: 34, gender: 'male', height_cm: 178, weight_kg: 82, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2600,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'ai_recommendation', training_days: [], weekly_schedule: {},
  dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate',
  conditioning_preference: 'tolerate', created_at: new Date().toISOString(),
} as unknown as UserProfile

console.log('\n[1] Migration is additive: no contraindicated_joints => same as loads_joints')
{
  const unreviewed = EXERCISE_DATABASE.filter(e => e.contraindicated_joints === undefined)
  const allMatch = unreviewed.every(e =>
    JSON.stringify(contraindicatedJoints(e)) === JSON.stringify(e.loads_joints))
  check(`${unreviewed.length} un-reviewed entries keep historical behaviour`, allMatch)
}

console.log('\n[2] Rotator-cuff rehab movements survive a shoulder injury')
{
  const shoulder = getFlaggedJoints(['shoulders'])
  const REHAB = ['Band Pull-Aparts', 'Wall Slides', 'Prone Y-T Raises', 'Band Dislocates',
    'Band Face Pulls', 'Arm Circles', 'Scapular Push-Ups', 'Face Pulls', 'Rear Delt Flyes']
  for (const name of REHAB) {
    const e = EXERCISE_DATABASE.find(x => x.name === name)
    if (!e) { check(`${name} exists`, false); continue }
    check(`${name}: not excluded`, !isContraindicatedFor(e, shoulder))
    check(`${name}: marked indicated`, isIndicatedFor(e, shoulder))
    check(`${name}: still records that it loads the shoulder`, e.loads_joints.includes('shoulder'), e.loads_joints)
  }
}

console.log('\n[3] Genuinely contraindicated work is STILL excluded (no safety relaxation)')
{
  const shoulder = getFlaggedJoints(['shoulders'])
  const MUST_EXCLUDE = ['Barbell Bench Press', 'Overhead Press', 'Pull-Ups', 'Lat Pulldown',
    'Chest Dips', 'Lateral Raises', 'Overhead Carry', 'Plyo Push-Ups', 'Medicine Ball Slams']
  for (const name of MUST_EXCLUDE) {
    const e = EXERCISE_DATABASE.find(x => x.name === name)
    if (!e) { check(`${name} exists`, false); continue }
    check(`${name}: still excluded`, isContraindicatedFor(e, shoulder))
  }
}

console.log('\n[4] An indicated movement is never excluded even though it loads the joint')
{
  const shoulder = getFlaggedJoints(['shoulders'])
  const indicated = EXERCISE_DATABASE.filter(e => isIndicatedFor(e, shoulder))
  check('at least one indicated movement exists for shoulders', indicated.length > 0, indicated.length)
  check('none of them are excluded', indicated.every(e => !isContraindicatedFor(e, shoulder)))
  const pool = getConstrainedPool({ ...profile, injuries: ['shoulders'] }, [])
  const inPool = indicated.filter(e => pool.some(p => p.name === e.name)).length
  check(`all ${indicated.length} reach the constrained pool`, inPool === indicated.length, { inPool })
}

console.log('\n[5] Injuries not yet reviewed are untouched (neck — the rest reviewed below)')
{
  // lower_back USED TO BE LISTED HERE and this check went red when it got
  // rehab, correctly. The two paths are meant to agree only while a joint is
  // unreviewed; reviewing one is precisely what makes them diverge.
  for (const inj of ['neck']) {
    const j = getFlaggedJoints([inj])
    const viaNew = EXERCISE_DATABASE.filter(e => isContraindicatedFor(e, j)).length
    const viaOld = EXERCISE_DATABASE.filter(e => e.loads_joints.some(x => j.has(x))).length
    check(`${inj}: exclusion count unchanged (${viaNew})`, viaNew === viaOld, { viaNew, viaOld })
  }
}

console.log('\n[5b] The lower back was reviewed: the two paths diverge by exactly its rehab')
{
  // THE 31b05d7 LESSON, ASSERTED. contraindicatedJoints() is
  // `contraindicated_joints ?? loads_joints`, so touching either field on an
  // entry can silently move what gets EXCLUDED. Dead Bug, Side Plank and Bird
  // Dog gained `loads_joints: ['lower_back_axial']` — they genuinely work the
  // joint — and each carries an explicit `contraindicated_joints: []` so the
  // fallback never fires and none of them is filtered out of the plan of the
  // person they were added for.
  //
  // So the OLD path must gain exactly those three while the NEW path holds
  // still. If viaNew moves, a back-injured trainee's options changed and this
  // is a regression, not a review.
  //
  // MOVED 12 -> 15 on 1 Sep 2026, deliberately: the machine-floor batch
  // added Smith Machine Squat, Landmine Row and Cable Pull-Through, each
  // mirroring its free-weight sibling's lower_back_axial tags (Barbell
  // Squats, T-Bar Rows, Romanian Deadlifts). All three load the joint in
  // BOTH paths, so the old-vs-new divergence stays exactly the three rehab
  // movements.
  const j = getFlaggedJoints(['lower_back'])
  const viaNew = EXERCISE_DATABASE.filter(e => isContraindicatedFor(e, j))
  const viaOld = EXERCISE_DATABASE.filter(e => e.loads_joints.some(x => j.has(x)))
  const REHAB = ['Dead Bug', 'Side Plank', 'Bird Dog']
  check(`what a bad back excludes did NOT move (${viaNew.length})`, viaNew.length === 15, { viaNew: viaNew.length })
  check('...and none of the rehab movements is among the exclusions',
    REHAB.every(n => !viaNew.some(e => e.name === n)),
    viaNew.filter(e => REHAB.includes(e.name)).map(e => e.name).join(', '))
  const onlyOld = viaOld.filter(e => !viaNew.some(x => x.name === e.name)).map(e => e.name).sort()
  check(`the legacy path diverges by exactly the rehab (${onlyOld.join(', ')})`,
    JSON.stringify(onlyOld) === JSON.stringify([...REHAB].sort()), onlyOld.join(', '))
}

console.log('\n[5c] Hip and lower-back rehab reaches the trainee it was written for')
{
  // Mirrors [4], which asserts the same for shoulders. Both joints read 0 of
  // 576 training days before this work — the movements did not exist for the
  // hip and were untagged for the back.
  for (const [inj, joint] of [['hips', 'hip'], ['lower_back', 'lower_back_axial']] as const) {
    const flagged = getFlaggedJoints([inj])
    const indicated = EXERCISE_DATABASE.filter(e => isIndicatedFor(e, flagged))
    check(`${inj}: indicated movements exist`, indicated.length > 0, indicated.length)
    check(`${inj}: none of them is excluded for the joint it treats`,
      indicated.every(e => !isContraindicatedFor(e, flagged)),
      indicated.filter(e => isContraindicatedFor(e, flagged)).map(e => e.name).join(', '))
    // The shoulder lesson, restated per joint: an injury must never remove
    // its own rehab.
    check(`${inj}: every one reaches the constrained pool`,
      indicated.every(e => getConstrainedPool({ ...profile, injuries: [inj] }, [])
        .some(p => p.name === e.name)), joint)
  }
}

console.log('\n[6] A shoulder injury still leaves real pressing and rowing available')
{
  const shoulder = getFlaggedJoints(['shoulders'])
  const pool = getConstrainedPool({ ...profile, injuries: ['shoulders'] }, [])
  const byPattern = (p: string) => pool.filter(e => e.movement_pattern === p).length
  // The content gap that made a shoulder rebuild contain no upper-body
  // pushing at all. Guarded so a future tag edit can't silently reopen it.
  check(`horizontal_push options survive (${byPattern('horizontal_push')})`, byPattern('horizontal_push') > 0)
  check(`vertical_push options survive (${byPattern('vertical_push')})`, byPattern('vertical_push') > 0)
  check(`horizontal_pull options survive (${byPattern('horizontal_pull')})`, byPattern('horizontal_pull') > 0)
  for (const name of ['Barbell Floor Press', 'Dumbbell Floor Press', 'Neutral-Grip Dumbbell Press',
                      'Landmine Press', 'Chest-Supported Row', 'Neutral-Grip Seated Cable Row']) {
    const e = EXERCISE_DATABASE.find(x => x.name === name)
    check(`${name}: exists and survives a shoulder injury`, !!e && !isContraindicatedFor(e, shoulder))
    check(`${name}: still honestly records that it loads the shoulder`, !!e && e.loads_joints.includes('shoulder'))
    check(`${name}: is tolerated, NOT marked as rehab`, !!e && !(e.indicated_joints ?? []).includes('shoulder'))
  }
}

console.log('\n[7] Knee-rehab movements survive a knee injury')
{
  const knee = getFlaggedJoints(['knees'])
  const REHAB = ['Sliding Leg Curl', 'Lying Leg Curl', 'Wall Sit', 'Spanish Squat',
    'Banded Terminal Knee Extension', 'Low Box Step-Up']
  for (const name of REHAB) {
    const e = EXERCISE_DATABASE.find(x => x.name === name)
    if (!e) { check(`${name} exists`, false); continue }
    check(`${name}: not excluded`, !isContraindicatedFor(e, knee))
    check(`${name}: marked indicated`, isIndicatedFor(e, knee))
    check(`${name}: still records that it loads the knee`, e.loads_joints.includes('knee'), e.loads_joints)
  }
  // Cycling Intervals is a tolerated substitute, not prescribed rehab —
  // deliberately NOT indicated_joints (see the reasoning comment on the
  // entry itself), so it gets its own, weaker assertion.
  const cycling = EXERCISE_DATABASE.find(x => x.name === 'Cycling Intervals')
  check('Cycling Intervals: not excluded', !!cycling && !isContraindicatedFor(cycling, knee))
  check('Cycling Intervals: still records that it loads the knee', !!cycling && cycling.loads_joints.includes('knee'))
}

console.log('\n[8] Genuinely contraindicated knee work is STILL excluded (no safety relaxation)')
{
  const knee = getFlaggedJoints(['knees'])
  const MUST_EXCLUDE = ['Barbell Squats', 'Leg Press', 'Goblet Squats', 'Hack Squat', 'Air Squat',
    'Walking Lunges', 'Bulgarian Split Squats', 'Step-Ups', 'Split Squat (Bodyweight)',
    'Step-Ups (Bodyweight)', 'Pistol Squat Progression', 'Leg Extensions', 'Nordic Hamstring Curl',
    'Jump Rope', 'Burpees', 'Box Jumps', 'Broad Jumps', 'Deadlifts', 'Trap Bar Deadlift',
    'Treadmill Intervals']
  for (const name of MUST_EXCLUDE) {
    const e = EXERCISE_DATABASE.find(x => x.name === name)
    if (!e) { check(`${name} exists`, false); continue }
    check(`${name}: still excluded`, isContraindicatedFor(e, knee))
  }
}

console.log('\n[9] An indicated knee movement is never excluded even though it loads the joint')
{
  const knee = getFlaggedJoints(['knees'])
  const indicated = EXERCISE_DATABASE.filter(e => isIndicatedFor(e, knee))
  check('at least one indicated movement exists for knees', indicated.length > 0, indicated.length)
  check('none of them are excluded', indicated.every(e => !isContraindicatedFor(e, knee)))
  const pool = getConstrainedPool({ ...profile, injuries: ['knees'] }, [])
  const inPool = indicated.filter(e => pool.some(p => p.name === e.name)).length
  check(`all ${indicated.length} reach the constrained pool`, inPool === indicated.length, { inPool })
}

console.log('\n[10] A knee injury still leaves real direct leg work available')
{
  const pool = getConstrainedPool({ ...profile, injuries: ['knees'] }, [])
  const byPattern = (p: string) => pool.filter(e => e.movement_pattern === p).length
  // The content gap this review closed: a knee injury correctly excluded
  // every knee_dominant/single_leg/isolation_quad/isolation_hamstring
  // movement, and the database had NO safe alternative for any of those
  // four patterns — a knee rebuild had zero direct quad or hamstring work.
  // Guarded so a future tag edit can't silently reopen it.
  check(`knee_dominant options survive (${byPattern('knee_dominant')})`, byPattern('knee_dominant') > 0)
  check(`single_leg options survive (${byPattern('single_leg')})`, byPattern('single_leg') > 0)
  check(`isolation_quad options survive (${byPattern('isolation_quad')})`, byPattern('isolation_quad') > 0)
  check(`isolation_hamstring options survive (${byPattern('isolation_hamstring')})`, byPattern('isolation_hamstring') > 0)
}

console.log('\n[11] Over-broad wrist tags relaxed: static grip-hold movements survive a wrist injury')
{
  const wrist = getFlaggedJoints(['wrists'])
  // Tolerated, not indicated -- these are ordinary training that happens to
  // not load the wrist through active range, not literal wrist rehab.
  const TOLERATED = ['Shrugs', 'Barbell Rows', 'T-Bar Rows']
  for (const name of TOLERATED) {
    const e = EXERCISE_DATABASE.find(x => x.name === name)
    if (!e) { check(`${name} exists`, false); continue }
    check(`${name}: not excluded for wrist`, !isContraindicatedFor(e, wrist))
    check(`${name}: not marked indicated (tolerated, not rehab)`, !isIndicatedFor(e, wrist))
    check(`${name}: still records that it loads the wrist`, e.loads_joints.includes('wrist'), e.loads_joints)
  }
  // Shrugs' neck exclusion and the rows' lower_back_axial exclusion must
  // survive the wrist relaxation -- this was a per-joint tag split, not a
  // blanket "these exercises are fine now."
  const lowerBack = getFlaggedJoints(['lower_back'])
  const neck = getFlaggedJoints(['neck'])
  check('Barbell Rows: still excluded for lower_back', isContraindicatedFor(EXERCISE_DATABASE.find(x => x.name === 'Barbell Rows')!, lowerBack))
  check('T-Bar Rows: still excluded for lower_back', isContraindicatedFor(EXERCISE_DATABASE.find(x => x.name === 'T-Bar Rows')!, lowerBack))
  check('Shrugs: still excluded for neck', isContraindicatedFor(EXERCISE_DATABASE.find(x => x.name === 'Shrugs')!, neck))
}

console.log('\n[12] Grip-is-the-point carries stay excluded for wrist (no safety relaxation)')
{
  const wrist = getFlaggedJoints(['wrists'])
  const MUST_EXCLUDE = ["Farmer's Walk", 'Suitcase Carry', 'Trap Bar Carry']
  for (const name of MUST_EXCLUDE) {
    const e = EXERCISE_DATABASE.find(x => x.name === name)
    if (!e) { check(`${name} exists`, false); continue }
    check(`${name}: still excluded for wrist`, isContraindicatedFor(e, wrist))
  }
}

if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
console.log('\nAll joint-tag state checks passed.')
