// ---------------------------------------------------------------------------
// THE APP MUST NOT DESCRIBE WORK THE PLAN DOES NOT CONTAIN.
//
// Ashley, 2 Sep 2026, asking why a comprehensive audit missed a fortnight-old
// defect: a sedentary beginner's plan is walks — no exercises in any of its
// sixteen weeks — and the app described it in lifting language everywhere.
//
// TWO REASONS IT WAS MISSED, both worth stating because they are properties
// of the checking, not of the code being checked:
//
//   1. THE PROFILE WAS NEVER BUILT. dev-constraint-audit hardcoded
//      activity_level: 'moderate', and isStartingOut needs beginner AND
//      sedentary — so of 13,967 audited combinations, not one was a walking
//      plan. Fixed alongside this file — activity level is now swept for
//      the beginner tier, the only one where it changes the plan.
//   2. NOTHING READ THE SENTENCES. Every audit check is structural —
//      equipment, injuries, duration, load caps, empty sessions. All of them
//      would pass a plan that is correctly built and wrongly described.
//
// So this gate reads the PROSE, on every surface that generates it from a
// plan, against a plan that contains no lifting. It is deliberately not
// about walks: it asks whether what the app SAYS matches what it HAS.
// ---------------------------------------------------------------------------
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { weekNoteText } from '../src/lib/week-note'
import { buildFirstRunIntro, planShapeFromMesocycle } from '../src/lib/first-run-intro'
import { buildCoachExerciseSummary } from '../src/lib/chat-plan-context'
import { isStartingOut } from '../src/lib/starting-out'
import { needsStartPreferenceAnswer } from '../src/lib/onboarding-slots'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 320)}` : ''}`) }
}

const profile = (o: Partial<UserProfile> = {}): UserProfile => ({
  age: 44, gender: 'female', height_cm: 165, weight_kg: 88, activity_level: 'sedentary',
  fitness_goal: 'fat_loss', preferred_time: 'morning', bmr: 1500, tdee: 1900,
  equipment_access: 'bodyweight', injuries: [], training_style: 'hybrid',
  training_experience: 'beginner', session_duration_preference: '30-45',
  workout_split_preference: 'full_body',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: false },
    { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
    { day: 'Friday', available: true }, { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'low', conditioning_preference: 'tolerate',
  ...o,
} as UserProfile)

function planFor(o: Partial<UserProfile>, seed: string): MesocycleWeek[] {
  const p = profile(o)
  setRandomSource(seededRngFromKey(seed))
  try { return generateMesocycle(p, generateExercisePlan(p).plan) } finally { resetRandomSource() }
}

const walking = planFor({ start_preference: 'move_more' }, 'says:walk')
const lifting = planFor({ training_experience: 'intermediate', activity_level: 'moderate', equipment_access: 'full_gym' }, 'says:lift')

// A claim about weight or reps. Deliberately about INSTRUCTIONS, not the
// bare words: "there is no weight to add" is true and allowed to say weight.
const PROMISES_LOADING = /(working weights?|loads? climb|load goes up|find the weight|heavier weights|more weight than|reps? climb|rep target|sets? of)/i

console.log('\n0. WHO gets a walking plan is decided by what they WANT')
{
  // Ashley, 2 Sep 2026: "we need to capture what the user wants. is this
  // someone who just wants to be a bit more active or someone who wants to
  // start exercising in a gym with weights". Before this, the walking plan
  // was chosen by beginner + sedentary and nothing else, so someone who had
  // answered "full gym" and "muscle growth" got sixteen weeks of walking —
  // their DESK JOB overriding the two answers that stated intent.
  // The onboarding-side predicate is what actually governs whether the
  // question appears, so it is the one asserted here.
  const asked = (goal: string, activity = 'sedentary') => needsStartPreferenceAnswer({
    trainingExperience: 'beginner', activityLevel: activity, fitnessGoal: goal,
  } as never)
  const gymAndMuscle = profile({ equipment_access: 'full_gym', fitness_goal: 'hypertrophy' })
  check('someone who says "muscle growth" is never routed to walks, however sedentary',
    !isStartingOut(gymAndMuscle))
  check('...nor someone who says "functional strength — move better, lift heavier"',
    !isStartingOut(profile({ fitness_goal: 'functional' })))
  // ...and those two are never asked, because they have already said it.
  check('...and neither is asked the question again', 
    !asked('hypertrophy') && !asked('functional'))

  // Fat loss and conditioning are true of a walker and a lifter alike, so
  // those get asked, and the ANSWER decides.
  const fatLoss = profile({ fitness_goal: 'fat_loss' })
  check('a fat-loss beginner IS asked where they want to start', asked('fat_loss'))
  check('...and "straight into training" gets them real sessions',
    !isStartingOut({ ...fatLoss, start_preference: 'train' }))
  check('...while "get moving first" gets them the walks',
    isStartingOut({ ...fatLoss, start_preference: 'move_more' }))
  // The conservative default: never asked means keep what they have.
  check('an existing profile that was never asked keeps its walking plan',
    isStartingOut(fatLoss))
  // And nobody outside beginner+sedentary is touched at all.
  check('an active beginner is neither asked nor sent walking',
    !asked('fat_loss', 'moderate') && !isStartingOut(profile({ activity_level: 'moderate' })))
}

console.log('\n0c. The AUDIT still generates walking plans after the routing change')
{
  // The sweep was widened on 2 Sep to cover walking plans, and the SAME DAY
  // the rule for producing one changed from a single field to three. An
  // audit reporting 0 failures is worthless if the branch quietly stopped
  // being built — which is exactly how this branch went unaudited for a
  // fortnight. So: the audit's own sedentary arm, asserted to still be a
  // walking plan.
  const auditsSedentaryArm = profile({
    activity_level: 'sedentary', fitness_goal: 'fat_loss', start_preference: 'move_more',
    training_experience: 'beginner', equipment_access: 'full_gym',
  })
  check('the profile the audit builds for its sedentary arm is still a walking plan',
    isStartingOut(auditsSedentaryArm))
}

console.log('\n0b. The fixture really is a plan with no lifting in it')
{
  const exercises = walking.reduce((s, w) => s + w.days.reduce((n, d) => n + d.exercises.length, 0), 0)
  check(`the walking plan has no exercises at all (${exercises})`, exercises === 0, exercises)
  const liftExercises = lifting.reduce((s, w) => s + w.days.reduce((n, d) => n + d.exercises.length, 0), 0)
  check(`the control plan does have them (${liftExercises}), so the checks below can tell the two apart`, liftExercises > 0)
}

console.log('\n1. SURFACE: the week note above the workout')
{
  const bad = walking.map(w => ({ week: w.week_number, text: weekNoteText(w) })).filter(x => PROMISES_LOADING.test(x.text))
  check('no week of a walking plan is described as loading', bad.length === 0, bad.slice(0, 2))
  // The control must trip the same regex, or the check proves nothing.
  const control = lifting.map(w => weekNoteText(w)).filter(t => PROMISES_LOADING.test(t))
  check(`...and the same words DO appear on a lifting plan (${control.length} weeks), so this can fail`, control.length > 0)
}

console.log('\n2. SURFACE: the note stored on the week, which the coach and dashboard read')
{
  const bad = walking.filter(w => PROMISES_LOADING.test(w.coach_note ?? '')).map(w => `W${w.week_number}: ${w.coach_note}`)
  check('the stored note does not instruct a walking plan about load', bad.length === 0, bad.slice(0, 2))
}

console.log('\n3. SURFACE: the first thing the app ever says — the welcome')
{
  // Exactly what ChatAssistant passes: the plan shape, and a brief built from
  // the first scheduled day.
  const shape = planShapeFromMesocycle(walking)
  check('the plan shape knows this plan has no lifting in it', shape?.activityOnly === true, shape)
  const d1 = walking[0].days.find(d => d.plannedActivity)
  const brief = { focus: d1!.focus, movements: `${d1!.plannedActivity!.duration} minutes, easy pace`, when: 'today' as const }
  const messages = buildFirstRunIntro('Hi Ashley', brief, shape)
  const all = messages.map(m => m.content).join(' ')
  console.log(`     "${messages[1]?.content ?? ''}"`)
  check('the welcome does not promise working weights or climbing loads', !PROMISES_LOADING.test(all), all)
  check('...and does not leave a dangling dash where the movements would be', !/—\s*\./.test(all), all)
  // A button offering something the plan has none of is the same untruth.
  const replies = messages.flatMap(m => m.quickReplies ?? [])
  check('...and offers no exercise swap on a plan with no exercises',
    !replies.some(r => /swap an exercise/i.test(r)), replies)

  // The control: a lifting plan still gets the loading sentence and the swap.
  const liftShape = planShapeFromMesocycle(lifting)
  const liftDay = lifting[0].days.find(d => d.exercises.length > 0)!
  const liftMessages = buildFirstRunIntro('Hi Ashley', { focus: liftDay.focus, movements: liftDay.exercises.slice(0, 3).map(e => e.name).join(', '), when: 'today' }, liftShape)
  check('a LIFTING plan is still told about its working weights', PROMISES_LOADING.test(liftMessages.map(m => m.content).join(' ')))
  check('...and is still offered the exercise swap',
    liftMessages.flatMap(m => m.quickReplies ?? []).some(r => /swap an exercise/i.test(r)))
}

console.log('\n4. SURFACE: the week the coach is sent')
{
  const summary = buildCoachExerciseSummary({ days: walking[0].days, coachNote: walking[0].coach_note })
  // The coach must be able to answer "what am I doing today?" — the failure
  // that made it reach for a schedule tool instead.
  check('every day reaches the coach with something to say about it',
    walking[0].days.every(d => new RegExp(`${d.day}: `).test(summary)), summary.slice(0, 200))
  check('...and the walk arrives with its minutes, not as an empty day',
    /Walk, \d+ min/.test(summary), summary.slice(0, 200))
  check('...and no day reads as having nothing prescribed',
    !/no session prescribed/.test(summary), summary.slice(0, 200))
}

console.log(failures === 0 ? '\nWhat the app says is what the plan contains.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
