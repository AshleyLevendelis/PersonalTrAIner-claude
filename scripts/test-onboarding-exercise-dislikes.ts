/**
 * Gate for "never give me burpees" actually working when said in onboarding.
 *
 * The gap this closes, found by tracing where onboarding answers end up:
 * saying "I won't eat mushrooms" during onboarding landed in user_facts and
 * was kept out of every meal, while "never give me burpees" — said in the
 * same breath — had nowhere to go at all. Exercise exclusions compile from
 * user_facts rows tagged 'exercise_preference', and the only two things that
 * ever wrote that tag were the coach chat and the swap button on the Exercise
 * tab. Onboarding never wrote one. So a person could rule out a food and an
 * exercise together and have only the food honoured.
 *
 * The check that matters most is BEHAVIOURAL, not textual: generate a real
 * plan with the dislike and assert the exercise is gone — against a control
 * run proving it was there to begin with. A gate that only greps for wiring
 * would pass just as happily on a feature that writes the database and never
 * reaches the plan, which is the exact half-landed shape this change fixes.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  ONBOARDING_SLOTS, NEVER_BLOCKING_SLOTS, initialSlotValues, assembleProfile, getSlotDef,
} from '../src/lib/onboarding-slots'
import { resolveExerciseTarget } from '../src/lib/fact-compiler'
import { generateExercisePlan, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile } from '../src/lib/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) console.log(`  ok: ${label}`)
  else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function profile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map((day, i) => ({ day, available: i < 4 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

function quiet<T>(fn: () => T): T {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}

/**
 * SEEDED, and that is not optional. The first version of this gate compared
 * two unseeded runs and reported that an unrecognised phrase had changed the
 * plan — it hadn't; generation draws on a random source, so two identical
 * calls differ on their own. An unseeded comparison here would make this gate
 * a coin flip, which is worse than a red one because it makes unrelated work
 * look guilty (exactly how test:injury-rebuild misfired once already).
 */
const namesIn = (p: UserProfile, exclusions: string[]) => quiet(() => {
  setRandomSource(seededRngFromKey('exercise-dislikes:fixed'))
  try {
    return [...new Set(generateExercisePlan(p, exclusions).plan.flatMap(d => d.exercises.map(e => e.name)))]
  } finally { resetRandomSource() }
})

console.log('\n1. The slot exists and mirrors dislikedFoods')
{
  const def = getSlotDef('dislikedExercises')
  check('dislikedExercises is in the catalogue', def !== undefined)
  check('...as free text, like dislikedFoods', def?.control === 'text', def?.control)
  check('...destined for user_facts, NOT a profile column', def?.destination === 'user_facts', def?.destination)
  check('...and optional', def?.required === false)

  // Deliberately unlike dislikedFoods, which IS asked. Onboarding was just
  // made conversational so it would stop marching through questions; fixing a
  // capture gap by adding a new question would take that straight back.
  check('it is NEVER proactively asked', NEVER_BLOCKING_SLOTS.includes('dislikedExercises'))
  check('...while dislikedFoods still IS asked', !NEVER_BLOCKING_SLOTS.includes('dislikedFoods'))
  check('the value starts empty', initialSlotValues().dislikedExercises === '')
}

console.log('\n2. The answer survives assembleProfile')
{
  const p = assembleProfile({ ...initialSlotValues(), dislikedExercises: 'Burpees, Box Jumps' } as never)
  check('comma-separated phrases are split', Array.isArray(p.disliked_exercises) && p.disliked_exercises.length === 2, p.disliked_exercises)
  check('...and trimmed', p.disliked_exercises?.[1] === 'Box Jumps', p.disliked_exercises)
  const empty = assembleProfile(initialSlotValues())
  check('an empty answer yields no phrases', (empty.disliked_exercises ?? []).length === 0, empty.disliked_exercises)
}

console.log('\n3. THE ONE THAT MATTERS — it is gone from a real generated plan')
{
  // Control first. Without this the whole section could pass on an exercise
  // the engine never picks, proving nothing at all.
  const TARGET = 'Barbell Bench Press'
  const before = namesIn(profile({}), [])
  check(`control: "${TARGET}" IS generated with no exclusions`, before.includes(TARGET))

  const resolved = resolveExerciseTarget(TARGET)
  check(`"${TARGET}" resolves to catalogue names`, resolved.resolution === 'resolved')
  const refs = resolved.resolution === 'resolved' ? resolved.resolvedRefs : []
  check('...including itself', refs.includes(TARGET))

  const after = namesIn(profile({}), refs)
  check(`"${TARGET}" is ABSENT once the dislike is applied`, !after.includes(TARGET))
  check('...and a plan still gets built', after.length > 5, after.length)
}

console.log('\n4. A phrase the catalogue does not know excludes NOTHING')
{
  // "those jumpy squat things" has no name to exclude. It must not silently
  // exclude something approximate — an unresolved phrase contributes no refs,
  // and is still recorded so the answer is never lost.
  const r = resolveExerciseTarget('those jumpy squat things')
  const refs = r.resolution === 'resolved' ? r.resolvedRefs : []
  check('an unrecognised phrase yields no exclusions', refs.length === 0, refs)
  const withIt = namesIn(profile({}), refs)
  const control = namesIn(profile({}), [])
  check('...so the plan is unchanged', JSON.stringify(withIt) === JSON.stringify(control))
}

console.log('\n5. Both halves are wired at signup, not just the database one')
{
  // The failure this guards: writing user_facts AFTER the plan is generated,
  // so the very first plan still contains the exercise they just ruled out.
  // exerciseExclusions is [] for a brand-new signup, so the in-memory answer
  // has to reach the generate calls directly.
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('the dislikes are resolved at signup', /const resolvedDislikeRefs = /.test(app))
  check('...merged into the exclusions used for generation', /const effectiveOnboardingExclusions = /.test(app))
  check('...passed to generateExercisePlan', /generateExercisePlan\(enrichedProfile, effectiveOnboardingExclusions\)/.test(app))
  check('...AND to generateMesocycle', /generateMesocycle\(enrichedProfile, workout, effectiveOnboardingExclusions\)/.test(app))

  const block = app.slice(app.indexOf('if (onboardingExerciseDislikes.length > 0)'), app.indexOf("if (enrichedProfile.disliked_foods"))
  check('a fact row is written per phrase', /createFact\(\{/.test(block))
  check("...tagged 'exercise_preference', the tag exclusions compile from", /kind: 'exercise_preference'/.test(block))
  check("...sourced 'onboarding'", /source: 'onboarding'/.test(block))
  check('...as a HARD dislike, same as the chat path', /polarity: 'dislike'/.test(block) && /hardness: 'hard'/.test(block))
  check('...with refs only when resolved', /resolvedRefs: r\.resolution === 'resolved' \? r\.resolvedRefs : \[\]/.test(block))
}

console.log('\n6. The model is told the slot exists')
{
  // A slot the prompt never mentions is a slot that never gets filled. The
  // catalogue alone is not enough — dislikedFoods gets an explicit rule, and
  // this needs one too, including the instruction NEVER to ask for it.
  const fn = readFileSync(join(ROOT, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')
  check('set_slot knows it takes literal text', /dislikedFoods\/dislikedExercises, the literal text/.test(fn))
  const rule = fn.slice(fn.indexOf("EXERCISES THEY WON'T DO"), fn.indexOf("EXERCISES THEY WON'T DO") + 900)
  check('there is a rule telling the model to record it', rule.length > 100)
  check('...naming the tool call', /set_slot\(dislikedExercises=/.test(rule))
  check('...and forbidding it from ASKING', /NEVER ASK for this/.test(rule))
  check('...and separating a hard no from a moan', /hard no from a moan/i.test(rule))
}

console.log('\n7. Regression: the food mirror still works')
{
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('onboarding food dislikes still become facts', /kind: 'food_preference',\s*\n\s*source: 'onboarding'/.test(app))
  check('dislikedFoods still maps into the profile', (assembleProfile({ ...initialSlotValues(), dislikedFoods: 'mushrooms' } as never).disliked_foods ?? []).includes('mushrooms'))
  check('every slot still has a unique key', new Set(ONBOARDING_SLOTS.map(s => s.key)).size === ONBOARDING_SLOTS.length)
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll onboarding exercise-dislike checks passed.\n')
