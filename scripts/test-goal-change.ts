// ---------------------------------------------------------------------------
// "I WANT TO BUILD MUSCLE INSTEAD OF LOSING FAT."
//
// The last setup answer that existed on NEITHER surface, closed 17 Sep 2026.
// Not for want of machinery, which is what makes this worth a gate of its own:
// `fitness_goal` was already in PLAN_INVALIDATING_FIELDS, detectPlanInvalidation
// already had a finished goal branch, goal-policies.ts already declared how the
// four goals differ, and macro-calculator.ts already read the goal for the
// deficit, the carb prescription and the label. Every piece existed and NOTHING
// WROTE THE FIELD. A reader of this codebase would have concluded it worked.
//
// So the shape this file guards against is not "a feature broke" — it is "a
// feature was never reachable while looking finished". That needs the write
// path pinned, not just the machinery.
//
// ASHLEY'S RULING, 17 Sep 2026, from three options: training AND food, from
// this week. Over asking about food as a second question — somebody training
// for muscle while still eating a fat-loss deficit is the worst of both — and
// over finishing the current block first, which can mean three weeks of work
// they have already said they do not want.
//
// THE FOOD HALF IS THE PART THAT CAN GO SILENT. The calorie and macro targets
// are DERIVED from fitness_goal, so they move on their own the moment the
// field is written. That is a virtue and a trap: nothing would notice if the
// notice, the meals, or the derivation itself stopped happening, because the
// plan half would still look perfect.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { detectPlanInvalidation, PLAN_INVALIDATING_FIELDS } from '../src/lib/plan-invalidation'
import { executeGoalChange } from '../src/lib/pending-action-executor'
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { computeTargets } from '../src/lib/nutrition-targets'
import { GOAL_OPTIONS } from '../src/lib/onboarding-slots'
import { RECEIPTS } from '../src/lib/coach-voice'
import { GOAL_POLICIES } from '../src/lib/goal-policies'
import type { UserProfile, FitnessGoal } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const base = (o: Record<string, unknown> = {}): UserProfile => ({
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'fat_loss', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '60-90',
  workout_split_preference: 'upper_lower',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
    { day: 'Friday', available: false }, { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  ...o,
} as unknown as UserProfile)

console.log('\n1. Changing the goal raises an offer, and the offer describes BOTH halves')
{
  check('the goal is on the invalidating list at all',
    (PLAN_INVALIDATING_FIELDS as readonly string[]).includes('fitness_goal'),
    PLAN_INVALIDATING_FIELDS)

  const offer = detectPlanInvalidation(base(), { fitness_goal: 'hypertrophy' })
  check('changing it offers a rebuild', offer?.field === 'fitness_goal', offer)
  check('...and promises logged work is untouched',
    !!offer && /already logged stays exactly/.test(offer.detail), offer?.detail)
  check('...without naming a database field',
    !!offer && !/fitness_goal|profile\./.test(offer.detail), offer?.detail)

  // ASHLEY'S RULING, READ OFF THE COPY. This is the whole reason the goal's
  // offer differs from every other one: it is the only invalidating field
  // that is also an input to the calorie calculation. An offer that mentions
  // only the training would be describing half of what happens on the tap,
  // which is the silent change the propose-then-confirm rail exists to stop.
  check('...and says the FOOD moves too, not only the plan',
    !!offer && /calorie/i.test(offer.detail) && /meal/i.test(offer.detail), offer?.detail)
  check('...and warns that rebuilding the meals takes a moment',
    !!offer && /takes a moment/i.test(offer.detail), offer?.detail)

  const same = detectPlanInvalidation(base(), { fitness_goal: 'fat_loss' })
  check('re-saving the same goal does not', same === null, same)
}

console.log('\n2. Only the GOAL carries a food sentence — the others must not')
{
  // THE CONTRAST IS THE CHECK. Every other invalidating field changes what
  // you DO, not what you need to eat: none of them is an input to
  // computeTargets. A food line on one of those would be a promise the app
  // does not keep. Written as a loop so a new field cannot quietly acquire
  // one without this failing.
  const others: { patch: Record<string, unknown>; label: string }[] = [
    { patch: { training_style: 'bodybuilding' }, label: 'style' },
    { patch: { session_duration_preference: '30-45' }, label: 'session length' },
    { patch: { equipment_access: 'home_basic' }, label: 'equipment' },
    { patch: { start_preference: 'move_more' }, label: 'starting point' },
  ]
  for (const { patch, label } of others) {
    const o = detectPlanInvalidation(base({ start_preference: 'train' }), patch)
    check(`the ${label} offer exists`, o !== null, { label, patch })
    check(`...and says nothing about calories or meals`,
      !!o && !/calorie|macro|meal/i.test(o.detail), { label, detail: o?.detail })
  }
}

console.log('\n3. The four goals really do produce different plans')
{
  // Otherwise the rebuild is theatre. Asked of goal-policies, the file that
  // DECLARES the differences, rather than of a literal copied out of it —
  // a hard-coded expectation here would just restate the source.
  const goals = GOAL_OPTIONS.map(o => o.value)
  check('all four goals have a declared policy',
    goals.every(g => !!GOAL_POLICIES[g]), goals)
  const volumes = goals.map(g => GOAL_POLICIES[g].setVolumeMultiplier)
  const conditioning = goals.map(g => GOAL_POLICIES[g].conditioningFrequencyPerWeek)
  const emphases = goals.map(g => GOAL_POLICIES[g].progressionEmphasis)
  check('...and they are not all the same programme with a different label',
    new Set([...volumes, ...conditioning, ...emphases].map(String)).size > 3,
    { volumes, conditioning, emphases })
  // The two goals a real person most often switches between, specifically.
  check('fat loss and muscle growth differ in what progression ramps or in volume',
    GOAL_POLICIES.fat_loss.progressionEmphasis !== GOAL_POLICIES.hypertrophy.progressionEmphasis
      || GOAL_POLICIES.fat_loss.setVolumeMultiplier !== GOAL_POLICIES.hypertrophy.setVolumeMultiplier,
    { fat_loss: GOAL_POLICIES.fat_loss, hypertrophy: GOAL_POLICIES.hypertrophy })
}

console.log('\n4. The FOOD half is derived from the goal, so a write moves it')
{
  // This is the half with no code of its own, and therefore the half nothing
  // would notice breaking. computeTargets is called on two profiles that
  // differ ONLY in fitness_goal; if the numbers came back equal, the whole
  // "and your food changes with it" promise would be false while every plan
  // check above still passed.
  const before = computeTargets(base({ fitness_goal: 'fat_loss' }))
  const after = computeTargets(base({ fitness_goal: 'hypertrophy' }))
  check('targets resolve for both goals', before !== null && after !== null, { before, after })
  check('...and the calorie target actually moves with the goal',
    !!before && !!after && before.calories !== after.calories,
    { fat_loss: before?.calories, hypertrophy: after?.calories })
  check('...upward, going from a deficit to building',
    !!before && !!after && after.calories > before.calories,
    { fat_loss: before?.calories, hypertrophy: after?.calories })

  // AND THE APP HAS TO RE-RUN IT. The derivation above is worth nothing if
  // nothing recomputes when the field changes, which is exactly the shape
  // that made this whole feature unreachable. App's macro effect keys on a
  // string of inputs — fitness_goal must be in it.
  // RE-ANCHORED 17 Sep 2026. This read the inline array inside `const
  // macroInputs` and broke when that array became a named constant — the
  // refactor made the code better and the check worse, which is the
  // mechanism-pinned failure CLAUDE.md warns about. The property is "the goal
  // is one of the inputs that retrigger the target recompute", so read the
  // list by name and then prove the recompute is built FROM that list.
  const app = stripComments(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))
  const keysAt = app.indexOf('MACRO_INPUT_KEYS = [')
  const keys = keysAt < 0 ? '' : app.slice(keysAt, app.indexOf(']', keysAt))
  check('the target-recompute inputs are declared as a named list', keysAt > 0, { keysAt })
  check('the app recomputes targets when the goal changes',
    /fitness_goal/.test(keys), { keys })
  // AND THE LIST IS ACTUALLY WHAT DRIVES IT. A list nothing reads would
  // satisfy the check above while the recompute keyed on something else.
  const inputsAt = app.indexOf('const macroInputs')
  const inputs = inputsAt < 0 ? '' : app.slice(inputsAt, inputsAt + 200)
  check('...and the change-detector is built from that list, not a second copy',
    /MACRO_INPUT_KEYS/.test(inputs), { inputs: inputs.slice(0, 160) })

  // AND SAY SO. The numbers moving silently is worse than not moving: the
  // Nutrition tab would show different figures with no account of why.
  const effectAt = app.indexOf('const lastMacroInputsRef')
  const effect = effectAt < 0 ? '' : app.slice(effectAt, effectAt + 2500)
  check('...and announces the move rather than changing numbers silently',
    /snapshotTargetsIfChanged\(/.test(effect) && /targetsMoved\(/.test(effect), { effectAt })
}

console.log('\n5. Confirming REACHES the plan, from the current week on')
{
  setRandomSource(seededRngFromKey('goal-change'))
  const profile = base()
  const meso = generateMesocycle(profile, generateExercisePlan(profile).plan)
  resetRandomSource()
  check('there is a plan to rebuild', meso.length >= 4, meso.length)

  const CURRENT = 3
  const WANTED: FitnessGoal = 'hypertrophy'
  const snapshot = (weeks: typeof meso) => JSON.stringify(weeks.map(w => ({
    week: w.week_number,
    days: (w.days ?? []).map(d => ({ day: d.day, ex: (d.exercises ?? []).map(e => e.name) })),
  })))
  const behindBefore = snapshot(meso.filter(w => w.week_number < CURRENT))
  const aheadBefore = snapshot(meso.filter(w => w.week_number >= CURRENT))

  // NO profile.id, so the executor's database writes are skipped and the
  // rebuild still runs. That is the real code path, not a stub — the writes
  // are already guarded by `if (profile.id)` for exactly this reason.
  const result = await executeGoalChange(
    { ...profile, id: undefined } as unknown as UserProfile,
    meso, [], { fitnessGoal: WANTED, fromWeek: CURRENT },
  )
  check('the rebuild succeeded', result.receipt.failed.length === 0, result.receipt.failed)
  check('...and returned a plan', result.mesocycle.length === meso.length, result.mesocycle.length)

  check('weeks already behind are untouched',
    snapshot(result.mesocycle.filter(w => w.week_number < CURRENT)) === behindBefore)
  check('...and the weeks from here on DID change',
    snapshot(result.mesocycle.filter(w => w.week_number >= CURRENT)) !== aheadBefore)
  check('week identity survives — nothing is renumbered',
    result.mesocycle.map(w => w.week_number).join(',') === meso.map(w => w.week_number).join(','),
    result.mesocycle.map(w => w.week_number))

  // NOT FROM WEEK 1. A rebuild that started at the beginning would rewrite
  // history that logged sets point at — the same failure every rebuild path
  // in this app guards against.
  check('...and it did not silently rebuild from week 1',
    snapshot(result.mesocycle.filter(w => w.week_number === 1)) === snapshot(meso.filter(w => w.week_number === 1)))

  check('the receipt names the goal in the words a person chose from',
    result.receipt.landed.some(l => l.includes(GOAL_OPTIONS.find(o => o.value === WANTED)!.label)),
    result.receipt.landed)
  check('...and the receipt title is registered rather than undefined',
    !!RECEIPTS['propose_goal_change']?.done && !!RECEIPTS['propose_goal_change']?.failed,
    RECEIPTS['propose_goal_change'])
}

console.log('\n6. Rebuild first, write second — proven by failing the rebuild')
{
  // The order is not a style preference. Writing the goal and then failing
  // the rebuild leaves somebody labelled for a goal, EATING for it (the
  // targets follow the field immediately), and training the old plan — a
  // worse state than before they asked. Handed an empty mesocycle so the
  // rebuild cannot succeed, and the profile write must not have happened.
  const profile = base()
  const result = await executeGoalChange(
    { ...profile, id: undefined } as unknown as UserProfile,
    [], [], { fitnessGoal: 'hypertrophy', fromWeek: 1 },
  )
  check('a rebuild with nothing to rebuild fails rather than claiming success',
    result.receipt.failed.length > 0, result.receipt)
  check('...and reports nothing as landed',
    result.receipt.landed.length === 0, result.receipt.landed)

  // The source order, because the runtime check above cannot see a write
  // that was skipped for want of an id.
  const src = stripComments(readFileSync(join(ROOT, 'src/lib/pending-action-executor.ts'), 'utf8'))
  const at = src.indexOf('export async function executeGoalChange')
  const fn = at < 0 ? '' : src.slice(at, src.indexOf('\nexport ', at + 10))
  check('executeGoalChange was found', fn.length > 0, { at })
  check('...and it writes the profile field at all', /updateProfileField/.test(fn))
  check('...after the rebuild, never before it',
    fn.indexOf('rebuildFromCurrentWeek') < fn.indexOf('updateProfileField'),
    { rebuild: fn.indexOf('rebuildFromCurrentWeek'), write: fn.indexOf('updateProfileField') })
}

console.log('\n7. Both surfaces can actually reach it')
{
  // THE DEFECT THIS WHOLE FILE EXISTS FOR. Every piece of machinery above
  // was already present on 16 Sep and the feature was unreachable, because
  // no control and no tool ever wrote the field. These are the two checks
  // that would have failed that day.
  const profileScreen = stripComments(readFileSync(join(ROOT, 'src/components/ProfileScreen.tsx'), 'utf8'))
  check('the Profile screen has a control that saves a new goal',
    /savePatch\(\{\s*fitness_goal:/.test(profileScreen), 'no savePatch for fitness_goal')
  check('...built from the same four options onboarding asked',
    /options=\{GOAL_OPTIONS\}/.test(profileScreen))

  const fn = stripComments(readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8'))
  check('the coach declares a goal tool', /name:\s*"propose_goal_change"/.test(fn))
  check('...and handles it', /name === "propose_goal_change"/.test(fn))
  // A COURIER, like every other proposal: the server must not write.
  const hAt = fn.indexOf('name === "propose_goal_change"')
  const handler = hAt < 0 ? '' : fn.slice(hAt, hAt + 900)
  check('...as a courier — it proposes, it does not apply',
    /kind:\s*"propose_goal_change"/.test(handler) && !/supabase\s*\.from|updateProfileField/.test(handler))

  const chat = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  check('the client builds the card', /buildGoalChangeProposal\(/.test(chat))
  check('...and the confirm runs the executor', /executeGoalChange\(/.test(chat))
  // AN IMPORT IS NOT A USE: require the call, not the bare name.
  check('...and rebuilds the meals on confirm, per the ruling',
    /onGoalMealsNeedRebuild\?\.\(\)/.test(chat))

  const app = stripComments(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))
  check('...and App supplies a real meal rebuild rather than a stub',
    /onGoalMealsNeedRebuild=\{handleRegenerateAllMeals\}/.test(app))
  check('the screen path rebuilds meals too, and ONLY for the goal',
    /planInvalidation\?\.field === 'fitness_goal'[\s\S]{0,80}handleRegenerateAllMeals\(\)/.test(app))
}

console.log('\n8. The card and the undo cannot lose what they wrote')
{
  const store = stripComments(readFileSync(join(ROOT, 'src/lib/pending-actions-store.ts'), 'utf8'))
  // Without this the undo restores nothing at all, silently.
  check('a goal change keeps a pre-image, or undo has nothing to put back',
    /kindsRequiringPreImage[\s\S]{0,600}'propose_goal_change'/.test(store))

  const chat = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  // AND THE FIELD GOES BACK WITH THE PLAN. Restoring the weeks while leaving
  // fitness_goal changed would put someone on their old programme while the
  // app still ate for the new goal — worse than the schedule case, which has
  // the same guard for the same reason.
  //
  // ANCHORED PAST THE UNDO ITSELF, not on the kind. My first version sliced
  // from the first `if (row.kind === 'propose_goal_change') {` and landed in
  // the CONFIRM branch, because `else if (row.kind === ...` contains that
  // substring — so the check read a block that legitimately has no
  // updateProfileField and reported a defect that was not there. The undo
  // path is the one that restores a run of weeks, so start from the call
  // that does it.
  const runUndoAt = chat.indexOf('undoWeekRangeChange(')
  const undo = runUndoAt < 0 ? '' : chat.slice(runUndoAt, runUndoAt + 1800)
  check('the run-of-weeks undo was found', runUndoAt > 0, { runUndoAt })
  const goalUndoAt = undo.indexOf("row.kind === 'propose_goal_change'")
  check('undoing a goal change puts the goal back too', goalUndoAt > 0, { goalUndoAt })
  const goalUndo = goalUndoAt < 0 ? '' : undo.slice(goalUndoAt, goalUndoAt + 600)
  check('...through a real write, not just local state',
    /updateProfileField\(/.test(goalUndo) && /onProfileChanged\(/.test(goalUndo), goalUndo.slice(0, 250))
}

console.log('\n9. The coach is told to ask rather than guess')
{
  // Ashley's cardio ruling generalised: a rule built on a model JUDGEMENT is
  // enforceable in ONE direction only. Nothing here can prove the coach asks
  // — that is the exam's job, against the deployed function. What CAN be
  // proven is that the instruction exists and that the two neighbouring
  // tools are told apart, which is where a wrong card would come from.
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const at = fn.indexOf('=== 3f2.')
  const section = at < 0 ? '' : fn.slice(at, fn.indexOf('=== 3g.', at))
  check('there is a prompt section for the goal', section.length > 0, { at })
  check('...telling the coach to ask when the user is only musing',
    /musing/i.test(section) && /ask/i.test(section), section.slice(0, 200))
  check('...and separating goal from style in so many words',
    /goal is what/i.test(section) && /style is how/i.test(section))
  check('...and naming the food half, so the card is not described as training only',
    /deficit|surplus|eating more/i.test(section))

  // The tool description carries the same boundary, because the model reads
  // it at the moment of choosing and may never reach the prompt section.
  const decl = fn.slice(fn.indexOf('name: "propose_goal_change"'), fn.indexOf('name: "propose_goal_change"') + 2600)
  check('the tool description says it changes food as well as training',
    /calorie|macro/i.test(decl), decl.slice(0, 120))
  check('...and tells the model to ask unless the user was definite',
    /ASK BEFORE CALLING/i.test(decl))
}

console.log(failures === 0 ? '\nAll goal-change checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
