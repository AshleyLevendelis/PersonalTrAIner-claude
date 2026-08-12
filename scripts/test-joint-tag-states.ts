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

console.log('\n[5] Other injuries are untouched by the shoulder review')
{
  for (const inj of ['knees', 'lower_back', 'wrists', 'neck']) {
    const j = getFlaggedJoints([inj])
    const viaNew = EXERCISE_DATABASE.filter(e => isContraindicatedFor(e, j)).length
    const viaOld = EXERCISE_DATABASE.filter(e => e.loads_joints.some(x => j.has(x))).length
    check(`${inj}: exclusion count unchanged (${viaNew})`, viaNew === viaOld, { viaNew, viaOld })
  }
}

if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
console.log('\nAll joint-tag state checks passed.')
