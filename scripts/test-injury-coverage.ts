/**
 * Gate: every injury a user can report actually changes their plan.
 *
 * Found by generating two plans and diffing them. Three of the eight
 * INJURY_OPTIONS codes — hips, elbows, ankles — produced a plan BYTE-FOR-BYTE
 * IDENTICAL to a healthy person's. Someone with a bad hip was still handed
 * Deadlifts. The app collected the injury, stored it, showed it back on the
 * profile screen, and threw it away.
 *
 * It was known. `getFlaggedJoints`' own doc comment said "Only 5 of the 8
 * INJURY_OPTIONS codes are mapped — hips/ankles/elbows are collected at
 * onboarding but currently have no joint tag to filter on." Written down,
 * never acted on, and nothing failed while it was true.
 *
 * TWO CLAIMS, and they are different, which is why both are checked:
 *   §1 every code is MAPPED to a joint;
 *   §2 every code visibly CHANGES a plan.
 * `hip` and `elbow` were already valid joint names sitting on 1 and 2
 * exercises, so a mapping alone would have satisfied §1 while still doing
 * nothing. Coverage is not effect.
 */
import { setRandomSource, resetRandomSource, generateExercisePlan, getFlaggedJoints, isEquipmentAllowed } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { EXERCISE_DATABASE, contraindicatedJoints, isIndicatedFor } from '../src/lib/exercise-db'
import { INJURY_OPTIONS } from '../src/lib/onboarding-slots'
import type { UserProfile, EquipmentAccess } from '../src/lib/types'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const base = (injuries: string[], equipment_access: EquipmentAccess = 'full_gym'): UserProfile => ({
  age: 34, gender: 'male', height_cm: 178, weight_kg: 82, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2600,
  equipment_access, injuries, training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'ai_recommendation',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
    { day: 'Friday', available: true }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  created_at: new Date().toISOString(),
} as unknown as UserProfile)

/** Seeded, because generation is deliberately random for variety and an unseeded diff would be a coin flip. */
const namesFor = (injuries: string[], tier: EquipmentAccess = 'full_gym'): string[] => {
  setRandomSource(seededRngFromKey(`injury-coverage:${tier}`))
  try { return generateExercisePlan(base(injuries, tier)).plan.flatMap(d => d.exercises.map(e => e.name)) }
  finally { resetRandomSource() }
}

const CODES = INJURY_OPTIONS.map(o => o.value)

console.log('\n1. Every injury the user can select is mapped to a joint')
{
  check('there are options to check, so this has teeth', CODES.length >= 8, CODES.length)
  const unmapped = CODES.filter(c => getFlaggedJoints([c]).size === 0)
  check('no selectable injury maps to nothing', unmapped.length === 0, unmapped)
}

console.log('\n2. ...and every one of them visibly CHANGES the plan')
{
  // The check that actually matters. A mapping to a joint nothing carries is
  // still a no-op, which is exactly what hip (1 tagged exercise) and elbow (2)
  // were before this.
  const healthy = namesFor([])
  const inert: string[] = []
  for (const code of CODES) {
    const injured = namesFor([code])
    const removed = healthy.filter(n => !injured.includes(n))
    if (JSON.stringify(healthy) === JSON.stringify(injured)) inert.push(code)
    else console.log(`     ${code.padEnd(12)} removes ${removed.length}`)
  }
  check('no injury leaves the plan untouched', inert.length === 0, inert)
}

console.log('\n3. THE SHOULDER LESSON: an injury never removes its own rehab')
{
  // The shoulder tag audit found the filter stripping Band Pull-Aparts, Wall
  // Slides and Prone Y-T Raises from a shoulder-injured plan — the exercises
  // a physio prescribes FOR that injury. Tagging by "does this joint
  // participate" instead of "is this dangerous" is what caused it, and this
  // is the check that makes the mistake impossible to repeat silently.
  const contradictions: string[] = []
  for (const code of CODES) {
    const flagged = getFlaggedJoints([code])
    if (flagged.size === 0) continue
    for (const e of EXERCISE_DATABASE) {
      if (!isIndicatedFor(e, flagged)) continue
      if (contraindicatedJoints(e).some(j => flagged.has(j))) contradictions.push(`${code}: ${e.name}`)
    }
  }
  check('no exercise is both rehab FOR a joint and banned for it', contradictions.length === 0, contradictions.slice(0, 5))
}

console.log('\n4. The plan does not collapse — wiped patterns are named, not discovered')
{
  // A wiped movement pattern means every slot in it drops with no replacement
  // by construction (see assessAdaptation's wipedPatterns). Some wipes are
  // CORRECT — every calf exercise loads the ankle, so you do not train calves
  // on a bad ankle. Others are content gaps: below full_gym the only cardio
  // is jumping, and at bodyweight the only vertical pull is a pull-up.
  //
  // Frozen so a future over-broad tag shows up BY NAME rather than as a
  // quietly thinner plan.
  const EXPECTED_WIPES: Record<string, string[]> = {
    // REFRESHED 31 Aug 2026, computed from the database rather than edited by
    // hand, after §6.2 added ~40 bodyweight/backpack variants. Three kinds of
    // change are folded in here and they are worth telling apart:
    //
    // BETTER — a wipe that is simply gone, because a safe variant now exists:
    //   wrists/{home_gym,minimalist,bodyweight} no longer lose ALL cardio,
    //   ankles/{home_gym,minimalist,bodyweight} the same, and elbows/bodyweight
    //   no longer loses vertical_pull (Pull-Up Negatives, Scapular Pull-Ups).
    //
    // NEWLY VISIBLE, not newly broken — a pattern that had ZERO exercises at
    // that tier before, so the loop skipped it (`all.length === 0`) and it
    // could not be reported. shoulders/bodyweight gains vertical_push,
    // isolation_shoulder, isolation_trap and isolation_tricep; neck/bodyweight
    // gains isolation_trap; elbows/bodyweight gains vertical_push,
    // isolation_bicep and isolation_tricep. Every one of those exercises is a
    // Backpack/Pike/Chair variant that genuinely loads the injured joint, so
    // the filter is right and the trainee is no worse off than when the
    // pattern was empty — the gap just stopped being invisible.
    //
    // STILL A CONTENT GAP, unchanged in kind: closing these needs exercises a
    // bad shoulder or elbow can actually do at that tier, not a looser filter.
    // "Even a perfect filter can't substitute what doesn't exist."
    'shoulders|full_gym': ['vertical_pull', 'isolation_shoulder'],
    'shoulders|home_gym': ['vertical_pull', 'isolation_shoulder'],
    'shoulders|minimalist': ['vertical_push', 'vertical_pull', 'isolation_shoulder'],
    'shoulders|bodyweight': ['horizontal_push', 'vertical_push', 'vertical_pull', 'isolation_shoulder', 'isolation_trap', 'isolation_tricep'],
    'neck|full_gym': ['isolation_trap'],
    'neck|home_gym': ['isolation_trap'],
    'neck|minimalist': ['isolation_trap'],
    'neck|bodyweight': ['isolation_trap'],
    'wrists|bodyweight': ['horizontal_push'],
    // ankle + calves is CORRECT and always was: every calf exercise loads the
    // ankle, so you do not train calves on a bad one.
    'ankles|full_gym': ['isolation_calf'],
    'ankles|home_gym': ['isolation_calf'],
    'ankles|minimalist': ['isolation_calf'],
    'ankles|bodyweight': ['isolation_calf'],
    'elbows|bodyweight': ['vertical_push', 'isolation_bicep', 'isolation_tricep'],
  }

  const patterns = [...new Set(EXERCISE_DATABASE.map(e => e.movement_pattern))]
  const surprises: string[] = []
  for (const code of CODES) {
    const flagged = getFlaggedJoints([code])
    for (const tier of ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[]) {
      const wiped: string[] = []
      for (const p of patterns) {
        const all = EXERCISE_DATABASE.filter(e => e.movement_pattern === p && isEquipmentAllowed(e, tier))
        if (all.length === 0) continue
        if (all.every(e => contraindicatedJoints(e).some(j => flagged.has(j)))) wiped.push(p)
      }
      const expected = EXPECTED_WIPES[`${code}|${tier}`] ?? []
      const unexpected = wiped.filter(w => !expected.includes(w))
      const gone = expected.filter(w => !wiped.includes(w))
      if (unexpected.length) surprises.push(`${code}/${tier} NEW wipe: ${unexpected.join(',')}`)
      if (gone.length) surprises.push(`${code}/${tier} no longer wipes: ${gone.join(',')} — update EXPECTED_WIPES`)
    }
  }
  check('the only wiped patterns are the ones already understood', surprises.length === 0, surprises.slice(0, 6))
  console.log('     (ankle wiping calf work is CORRECT; the cardio and vertical-pull wipes are content gaps — no safe variant exists at those tiers)')
  // HIP IS THE ONE THAT MUST STAY CLEAN. Ashley's ruling was calibrated so a
  // hip-injured trainee still gets a full leg day — drop the heavy loaded
  // work, keep the controlled movements. If hip ever starts wiping a pattern,
  // the tagging has drifted past what she agreed to.
  check('a hip injury wipes no pattern at any tier',
    !Object.keys(EXPECTED_WIPES).some(k => k.startsWith('hips|')),
    Object.keys(EXPECTED_WIPES).filter(k => k.startsWith('hips|')))
}

console.log('\n5. How MUCH each injury removes, frozen')
{
  // Found by mutation. Tagging five more squat variants as hip-contraindicated
  // took a hip-injured trainee's knee_dominant options from 8 to 2 — a large
  // change to what a real person gets — and every check above stayed green,
  // because no pattern was fully wiped and the plan still "differed from
  // healthy". Coverage and wipe-detection both pass straight over an
  // over-broad tag that stops just short of emptying a pattern.
  //
  // Ashley's hip ruling was calibrated on exactly this: drop the heavy loaded
  // work, KEEP the controlled movements, the session stays whole. A count is
  // the only thing that holds that line. Generated from the code, not typed
  // from memory — the hand-written version of a frozen table in this repo has
  // been wrong before.
  const AT_THE_FIX: Record<string, number> = {
    // The five pre-existing codes are at their ORIGINAL pre-change values.
    // The first attempt at this work silently cut them — knees 25 -> 15,
    // wrists 21 -> 13, lower_back 12 -> 5, shoulders 47 -> 40 — because
    // `contraindicatedJoints()` is `contraindicated_joints ?? loads_joints`,
    // so writing that field AT ALL replaces the loads_joints fallback rather
    // than adding to it. Tagging an exercise for the hip therefore un-banned
    // it for the knee. Caught by test:band-slots moving, then measured. The
    // tagging now merges loads_joints in; these numbers are what proves it.
    //
    // RE-MEASURED 31 Aug 2026 after §6.2's exercise additions — every count
    // rose because the database grew, not because any tag widened. Recorded
    // from the database rather than adjusted by hand, so the next drift is
    // still caught by name.
    lower_back: 12, knees: 35, shoulders: 62, neck: 6, wrists: 25,
    hips: 14, ankles: 19, elbows: 18,
  }
  const drift: string[] = []
  for (const code of CODES) {
    const flagged = getFlaggedJoints([code])
    const n = EXERCISE_DATABASE.filter(e => contraindicatedJoints(e).some(j => flagged.has(j))).length
    const expected = AT_THE_FIX[code]
    if (expected === undefined) drift.push(`${code}: NEW injury code, ${n} contraindicated — add it here deliberately`)
    else if (n !== expected) drift.push(`${code}: ${n} (was ${expected})`)
  }
  check('no injury quietly started removing more or less', drift.length === 0, drift)
  check('...and every code is accounted for', Object.keys(AT_THE_FIX).length === CODES.length,
    { frozen: Object.keys(AT_THE_FIX).length, codes: CODES.length })
}

console.log('\n6. The COACH offers every area the plan engine can handle\n')
{
  // The same failure as a missing map entry, one layer out: an injury the
  // app collects, stores and can act on, that the coach refuses to act on.
  //
  // This is what it looked like. Hips, ankles and elbows were wired into
  // INJURED_JOINTS (they remove 11, 10 and 11 exercises — section 2 above
  // measures it), and chat-gemini's two injury tools still enumerated five
  // areas and still told the model "only these 5 have joint-conflict data".
  // So a user said "my hip's been bothering me" and the coach answered that
  // it couldn't adjust for that — a sentence that had been true once and had
  // quietly stopped being true. It sat in a DEPLOYED edge function, where
  // nothing in this repo's test suite was looking.
  const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const enums = [...chat.matchAll(/affected_area:[\s\S]{0,120}?enum: \[([^\]]+)\]/g)]
    .map(m => m[1].split(',').map(v => v.trim().replace(/^"|"$/g, '')))
  check('all three injury tools declare an affected_area enum', enums.length === 3, enums.length)
  for (const [i, list] of enums.entries()) {
    const missing = CODES.filter(c => !list.includes(c))
    const extra = list.filter(c => !CODES.includes(c))
    check(`injury tool ${i + 1} offers exactly the codes the engine maps`,
      missing.length === 0 && extra.length === 0, { missing, extra })
  }
  // The prose has to move with the enum, or the model is told one thing and
  // handed another — which is how it went wrong the first time.
  check('no surviving claim that only five areas are supported',
    !/only these 5 have joint-conflict data/.test(chat))
  // Parse the slash-separated list ITSELF, not "does this code appear
  // somewhere on that line". The first version of this check did the latter
  // and passed while the list said five, because the sentence explaining the
  // old bug names hips, ankles and elbows a few words later — a check
  // satisfied by its own explanation, which is the exact shape this codebase
  // keeps producing.
  const listed = /affected_area accepts ([a-z_/]+) on EITHER tool/.exec(chat)?.[1]?.split('/') ?? []
  check('...and the system prompt lists exactly the same eight',
    CODES.every(c => listed.includes(c)) && listed.length === CODES.length,
    { listed, expected: CODES })
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll injury-coverage checks passed.\n')
