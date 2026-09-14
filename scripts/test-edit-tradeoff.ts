// ---------------------------------------------------------------------------
// Gate: a change is allowed, priced in the goal's own terms, and offered a
// cheaper way — and the app is only firm where it said it would be.
//
// Guards the decision recorded in CLAUDE.md on 14 Sep 2026 (taken by the
// session on Ashley's explicit delegation): four tiers, ask-first at tier 2,
// never refuse what is not unsafe.
//
// AGAINST REAL GENERATED PLANS, not fixtures. A fixture proves the function
// runs; a real mesocycle proves the SENTENCE would appear on a real card, and
// it is the only way to catch a pinned case whose condition never fires
// because the plan's own shape never produces it.
//
// THE TRAP THIS GATE IS WRITTEN AROUND: every "is it tier 2" check can pass
// vacuously if the fixture happens to trip a DIFFERENT rule first. So each
// pinned case asserts its own `reason`, not just the tier — the reason is the
// module's own statement of WHICH rule fired, and it is never shown to a user,
// which makes it exactly the right thing for a gate to read.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan, DIMENSION_KEYS } from '../src/lib/quality-score'
import { removeExerciseFromSession, moveExerciseInSession } from '../src/lib/session-edit'
import {
  assessEdit, weeklySetsByMuscle, muscleVolumeChange, scoreDrop,
  isStrengthPhase, isAccumulationPhase, isStartingOut, DO_IT_ANYWAY,
  applyTradeoff, askText, askKey, shouldAsk, downgradeToCard,
  type EditContext,
} from '../src/lib/edit-tradeoff'
import type { MesocycleWeek, UserProfile, FitnessGoal } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 320)}` : ''}`) }
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function buildProfile(goal: FitnessGoal, over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: `tradeoff-${goal}`,
    fitness_goal: goal,
    training_experience: 'intermediate',
    equipment_access: 'full_gym',
    session_duration_preference: '45-60',
    training_days: ['Monday', 'Tuesday', 'Thursday', 'Friday'].map(day => ({ day, available: true })),
    weight_kg: 80, height_cm: 180, age: 30, gender: 'male',
    training_style: 'hybrid', recovery_capacity: 'moderate', injuries: [],
    ...over,
  } as unknown as UserProfile
}

function planFor(key: string, profile: UserProfile): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(key))
  const meso = generateMesocycle(profile)
  resetRandomSource()
  return meso
}

const hyper = buildProfile('hypertrophy')
const hyperPlan = planFor('tradeoff-hyper', hyper)

// ---------------------------------------------------------------------------
console.log('\n1. The cheap score agrees with the full score on everything it keeps')
// ---------------------------------------------------------------------------
{
  // The ONE claim ScoreOptions makes. If skipComparisons quietly changed a
  // dimension it was not meant to touch, every delta downstream would be
  // measuring something else.
  for (const goal of ['hypertrophy', 'fat_loss', 'functional', 'conditioning'] as FitnessGoal[]) {
    const p = buildProfile(goal)
    const meso = planFor(`agree-${goal}`, p)
    const full = scorePlan(p, meso, 'k')
    const cheap = scorePlan(p, meso, 'k', { skipComparisons: true })
    const kept = DIMENSION_KEYS.filter(d => d !== 'goalAlignment')
    const same = kept.every(d => full.dimensions[d].points === cheap.dimensions[d].points)
    check(`${goal}: every dimension but goal alignment is identical`, same,
      kept.map(d => [d, full.dimensions[d].points, cheap.dimensions[d].points]))
  }
  // And that it is genuinely cheaper for the case that motivated it — the
  // profile whose full score regenerates two comparison plans.
  const slow = buildProfile('fat_loss', { recovery_capacity: 'low' } as Partial<UserProfile>)
  const slowPlan = planFor('agree-slow', slow)
  scorePlan(slow, slowPlan, 'warm', { skipComparisons: true })
  const tFull = Date.now(); scorePlan(slow, slowPlan, 'k'); const full = Date.now() - tFull
  const tCheap = Date.now(); scorePlan(slow, slowPlan, 'k', { skipComparisons: true }); const cheap = Date.now() - tCheap
  console.log(`  fat_loss/low recovery: full ${full} ms, cheap ${cheap} ms`)
  check('...and the cheap path is the faster one on the profile that motivated it', cheap * 4 < full || full < 40, { full, cheap })
}

// ---------------------------------------------------------------------------
console.log('\n2. Sets per muscle are counted the way a person counts them')
// ---------------------------------------------------------------------------
{
  const week = hyperPlan.find(w => w.week_number === 1)!
  const sets = weeklySetsByMuscle(week)
  const groups = Object.keys(sets)
  check('a real week produces real per-muscle set counts', groups.length >= 5 && Object.values(sets).every(n => (n ?? 0) > 0), sets)

  // THE CATALOGUE SPELLS ONE MUSCLE TWO WAYS. 'quadriceps' (Barbell Squats)
  // and 'quads' (Trap Bar Deadlift) are the same leg; 'biceps brachii'
  // (Barbell Curls) and 'biceps' (Chest-Supported Row) the same arm;
  // 'anterior deltoid' (Barbell Bench Press) and 'shoulders' (Overhead Carry)
  // the same joint. Summed raw, each pair reads as two muscles and every
  // per-muscle sentence is then wrong by half.
  //
  // RUN, NOT READ. An earlier version of this grepped the source for the
  // strings, which is the check-satisfied-by-a-dead-branch shape CLAUDE.md
  // warns about — the map could be present and unreached and it would pass.
  // These build a real one-exercise week from the real catalogue entry and
  // assert the two spellings land on the SAME key.
  //
  // THE MAP ITSELF IS exercise-db's, since 14 Sep 2026. edit-tradeoff.ts
  // briefly shipped its own copy, which would have meant the chest:back
  // sentence on a card and the per-muscle sentence beside it counting
  // different chests. These checks are unchanged by that fix, which is the
  // point of them being behavioural.
  const oneExerciseWeek = (name: string): MesocycleWeek => ({
    week_number: 1, label: 'probe',
    days: [{ day: 'Monday', focus: 'probe', exercises: [{ name, sets: 3 }] }],
  } as unknown as MesocycleWeek)

  for (const [a, b, expected] of [
    ['Barbell Squats', 'Trap Bar Deadlift', 'quads'],
    ['Barbell Curls', 'Chest-Supported Row', 'biceps'],
    ['Barbell Bench Press', 'Overhead Carry', 'shoulders'],
  ] as const) {
    const ga = weeklySetsByMuscle(oneExerciseWeek(a))
    const gb = weeklySetsByMuscle(oneExerciseWeek(b))
    check(`"${a}" and "${b}" both count toward ${expected}`,
      (ga as Record<string, number>)[expected] > 0 && (gb as Record<string, number>)[expected] > 0,
      { [a]: ga, [b]: gb })
  }
  // And nothing the catalogue lists that ISN'T a muscle someone counts sets
  // for may appear as a group — 'cardiovascular system' is on Jump Rope.
  const cardio = weeklySetsByMuscle(oneExerciseWeek('Jump Rope'))
  check('...and a non-muscle like "cardiovascular system" never becomes a group',
    !Object.keys(cardio).some(k => /cardio|system/i.test(k)), cardio)

  // A primer is preparation, not volume. Counting it would inflate every
  // group on any day that warms up properly — which is every day.
  const withPrimer = {
    ...week,
    days: week.days.map((d, i) => i !== 0 ? d : {
      ...d,
      exercises: [{ ...d.exercises[0], tier: 'tier_0_primer' as const, sets: 99 }, ...d.exercises.slice(1)],
    }),
  }
  const before = weeklySetsByMuscle(week)
  const after = weeklySetsByMuscle(withPrimer)
  const inflated = (Object.keys(after) as (keyof typeof after)[]).some(g => (after[g] ?? 0) > (before[g] ?? 0))
  check('a 99-set PRIMER adds nothing to any muscle group', !inflated, { before, after })
}

// ---------------------------------------------------------------------------
console.log('\n3. Removing real work reports it; a free edit stays silent')
// ---------------------------------------------------------------------------
{
  const week = hyperPlan.find(w => w.week_number === 1)!
  const day = week.days.find(d => d.exercises.length > 4)!
  const target = day.exercises.findIndex(e => e.tier !== 'tier_0_primer')
  const trial = removeExerciseFromSession({
    mesocycle: hyperPlan, profile: hyper, weekNumber: 1, dayName: day.day, exIndex: target, scope: 'permanent',
  })
  check('the removal trial actually changed the plan', trial.changed, trial.refusal)

  const verdict = assessEdit({
    profile: hyper, before: hyperPlan, after: trial.mesocycle, weekNumber: 1,
    dayName: day.day, kind: 'remove', scope: 'permanent',
    exerciseName: day.exercises[target].name,
  })
  console.log(`  removing ${day.exercises[target].name} from ${day.day}: tier ${verdict.tier} — ${verdict.reason}`)
  check('taking a real exercise out is never silent', verdict.tier >= 1, verdict)
  check('...and it says what it costs', !!verdict.cost && verdict.cost.length > 20, verdict.cost)

  // REORDERING COSTS NOTHING, and that is the non-vacuity half: if every edit
  // came back tier 1, the check above would pass while meaning nothing.
  const reorder = moveExerciseInSession({
    mesocycle: hyperPlan, profile: hyper, weekNumber: 1, dayName: day.day, fromIndex: 2, toIndex: 3, scope: 'today',
  })
  const quiet = assessEdit({
    profile: hyper, before: hyperPlan, after: reorder.mesocycle, weekNumber: 1,
    dayName: day.day, kind: 'reorder', scope: 'today',
    exerciseName: day.exercises[2]?.name,
  })
  console.log(`  reordering within ${day.day}: tier ${quiet.tier} — ${quiet.reason}`)
  check('shuffling two accessories costs nothing and says nothing', quiet.tier === 0 && quiet.cost === null, quiet)
}

// ---------------------------------------------------------------------------
console.log('\n4. The seven pinned cases each fire — for their OWN reason')
// ---------------------------------------------------------------------------
{
  const base: Omit<EditContext, 'kind' | 'scope'> = {
    profile: hyper, before: hyperPlan, after: hyperPlan, weekNumber: 1, dayName: 'Monday',
  }
  // Synthetic weeks, because a real plan cannot be in two phases at once and
  // each rule needs its own. The EDIT paths are real everywhere else; these
  // stand in only for "which week are we standing in".
  const strengthWeek = (w: MesocycleWeek): MesocycleWeek => ({ ...w, phase_label: 'Maximal Strength' })
  const accumulationWeek = (w: MesocycleWeek): MesocycleWeek => ({ ...w, phase_label: 'Hypertrophy' })
  const deloadWeek = (w: MesocycleWeek): MesocycleWeek => ({ ...w, is_deload: true })

  const w1 = hyperPlan.find(w => w.week_number === 1)!
  const swap = (fn: (w: MesocycleWeek) => MesocycleWeek) =>
    hyperPlan.map(w => (w.week_number === 1 ? fn(w) : w))

  const mainDay = w1.days.find(d => d.exercises.some(e => e.tier === 'tier_1_primary'))!
  const mainLift = mainDay.exercises.find(e => e.tier === 'tier_1_primary')!.name

  const cases: { name: string; ctx: EditContext; reasonIncludes: string }[] = [
    {
      name: 'an ongoing volume cut in an accumulation phase',
      ctx: { ...base, before: swap(accumulationWeek), after: swap(accumulationWeek), kind: 'volume_lighter', scope: 'permanent' },
      reasonIncludes: 'accumulation',
    },
    {
      name: 'removing a main lift in a strength phase',
      ctx: { ...base, before: swap(strengthWeek), after: swap(strengthWeek), dayName: mainDay.day, kind: 'remove', scope: 'permanent', exerciseName: mainLift },
      reasonIncludes: 'main lift during a strength phase',
    },
    {
      name: 'banning a main lift in a strength phase',
      ctx: { ...base, before: swap(strengthWeek), after: swap(strengthWeek), dayName: mainDay.day, kind: 'ban', scope: 'permanent', exerciseName: mainLift },
      reasonIncludes: 'main lift during a strength phase',
    },
    {
      name: 'adding work to a deload',
      ctx: { ...base, before: swap(deloadWeek), after: swap(deloadWeek), kind: 'add', scope: 'today' },
      reasonIncludes: 'deload',
    },
    {
      name: 'the third shortening of the same weekday',
      ctx: { ...base, kind: 'shorten', scope: 'today', priorShorteningsThisBlock: 2 },
      reasonIncludes: 'third shortening',
    },
  ]

  for (const c of cases) {
    const v = assessEdit(c.ctx)
    check(`${c.name} → tier 2`, v.tier === 2, v)
    check(`...for that reason, not another rule's`, v.reason.includes(c.reasonIncludes), v.reason)
    check(`...and it ASKS rather than warning`, !!v.question && v.question.trim().endsWith('?'), v.question)
    check(`...offering a cheaper route`, v.alternatives.length >= 1, v.alternatives)
  }

  // The barbell-to-machine case needs two real catalogue entries, so it is
  // built from the plan's own main lift rather than named here.
  const barbellDay = w1.days.find(d => d.exercises.some(e =>
    e.tier === 'tier_1_primary' && /barbell/i.test(e.name)))
  if (barbellDay) {
    const lift = barbellDay.exercises.find(e => e.tier === 'tier_1_primary' && /barbell/i.test(e.name))!.name
    const v = assessEdit({
      ...base, before: swap(strengthWeek), after: swap(strengthWeek), dayName: barbellDay.day,
      kind: 'swap', scope: 'permanent', exerciseName: lift, newExerciseName: 'Chest Press Machine',
    })
    check('a barbell main lift swapped to a machine for the block → tier 2', v.tier === 2, v)
    check('...for the carry-over reason', v.reason.includes('machine'), v.reason)
    check('...and it offers "just today"', v.alternatives.some(a => /today/i.test(a.label)), v.alternatives)
  } else {
    check('the fixture holds a barbell main lift to test the machine swap on', false, 'no barbell tier_1 in week 1')
  }

  // A main lift dragged into the back half of a strength session.
  {
    const idx = mainDay.exercises.findIndex(e => e.name === mainLift)
    const moved = moveExerciseInSession({
      mesocycle: swap(strengthWeek), profile: hyper, weekNumber: 1, dayName: mainDay.day,
      fromIndex: idx, toIndex: mainDay.exercises.length - 1, scope: 'today',
    })
    const v = assessEdit({
      ...base, before: swap(strengthWeek), after: moved.mesocycle, dayName: mainDay.day,
      kind: 'reorder', scope: 'today', exerciseName: mainLift,
    })
    check('the main lift moved to the end of a strength session → tier 2', v.tier === 2, v)
    check('...for the fresh-lift reason', v.reason.includes('back half'), v.reason)
  }
}

// ---------------------------------------------------------------------------
console.log('\n5. Where the app stays quiet — and it is never an accident')
// ---------------------------------------------------------------------------
{
  const w1 = hyperPlan.find(w => w.week_number === 1)!
  const day = w1.days.find(d => d.exercises.length > 4)!
  const removal = removeExerciseFromSession({
    mesocycle: hyperPlan, profile: hyper, weekNumber: 1, dayName: day.day, exIndex: 1, scope: 'permanent',
  })

  // STARTING OUT: never charged, for any edit. Same edit, same plan, only the
  // profile differs — so a pass here cannot come from the edit being free.
  const beginner = buildProfile('hypertrophy', { start_preference: 'move_more' } as Partial<UserProfile>)
  const charged = assessEdit({
    profile: hyper, before: hyperPlan, after: removal.mesocycle, weekNumber: 1,
    dayName: day.day, kind: 'remove', scope: 'permanent', exerciseName: day.exercises[1].name,
  })
  const free = assessEdit({
    profile: beginner, before: hyperPlan, after: removal.mesocycle, weekNumber: 1,
    dayName: day.day, kind: 'remove', scope: 'permanent', exerciseName: day.exercises[1].name,
  })
  check('the same edit costs a trainee something...', charged.tier >= 1, charged)
  check('...and costs someone starting out nothing at all', free.tier === 0 && free.cost === null, free)
  check('...because of who they are, not what they changed', isStartingOut(beginner) && !isStartingOut(hyper))

  // A DELOAD MADE LIGHTER is the plan working, not a cost.
  const deload = hyperPlan.map(w => (w.week_number === 1 ? { ...w, is_deload: true } : w))
  const lighter = assessEdit({
    profile: hyper, before: deload, after: deload, weekNumber: 1,
    dayName: day.day, kind: 'volume_lighter', scope: 'today',
  })
  check('making a deload lighter is free', lighter.tier === 0, lighter)
  // ...but ADDING to one is still tier 2, so the branch above is a rule and
  // not a blanket exemption for deload weeks.
  const heavier = assessEdit({
    profile: hyper, before: deload, after: deload, weekNumber: 1,
    dayName: day.day, kind: 'volume_heavier', scope: 'today',
  })
  check('...while adding to the same deload still asks', heavier.tier === 2, heavier)
}

// ---------------------------------------------------------------------------
console.log('\n6. The score is a guarantee we check, never a number on screen')
// ---------------------------------------------------------------------------
{
  // Ashley's ruling, 13 Sep 2026. Every user-facing string this module can
  // emit is collected and searched for a score. `reason` is excluded on
  // purpose — it is the one field documented as never shown.
  const src = readFileSync(join(ROOT, 'src/lib/edit-tradeoff.ts'), 'utf8')
  const stripped = stripComments(src)
  const emitted = [
    ...stripped.matchAll(/\bcost:\s*(`[^`]*`|'[^']*'|"[^"]*")/g),
    ...stripped.matchAll(/\bquestion:\s*(`[^`]*`|'[^']*'|"[^"]*")/g),
    ...stripped.matchAll(/\bnote:\s*(`[^`]*`|'[^']*'|"[^"]*")/g),
    ...stripped.matchAll(/\blabel:\s*(`[^`]*`|'[^']*'|"[^"]*")/g),
  ].map(m => m[1])
  check('the module emits real sentences to check', emitted.length >= 15, emitted.length)
  const scoreish = emitted.filter(s => /\bout of\b|\/ ?12\b|score|\bpoints\b|\d\.\d\b/i.test(s))
  check('no cost, question or offer ever quotes a score', scoreish.length === 0, scoreish)
  const dimensionLeak = emitted.filter(s => /goalAlignment|primerFit|timeFit\b/.test(s))
  check('...nor a dimension by its internal name', dimensionLeak.length === 0, dimensionLeak)

  // And the delta path never compares an absolute against the floor — the
  // thing ScoreOptions' own note forbids.
  check('scoreDrop never mentions the 7.2 floor', !/7\.2/.test(stripped))
  check('...and reads BOTH sides with the same options', (stripped.match(/skipComparisons: true/g) ?? []).length >= 2)
}

// ---------------------------------------------------------------------------
console.log('\n7. Tier 2 is an ask, not a block')
// ---------------------------------------------------------------------------
{
  const src = readFileSync(join(ROOT, 'src/lib/edit-tradeoff.ts'), 'utf8')
  const stripped = stripComments(src)
  check('the "do it anyway" chip is exported for every caller to use', /export const DO_IT_ANYWAY/.test(stripped))
  check(`...and it reads as permission, not a warning`, /Do it anyway/.test(DO_IT_ANYWAY))
  // Nothing in this module may refuse. Tier 3 lives in the builders and this
  // file must not grow a second home for it.
  check('no tier above 2 exists here', !/tier:\s*3/.test(stripped))
  check('...and nothing here refuses an edit', !/\brefus\w*:/.test(stripped))

  // Every pinned case must carry BOTH halves of the ask, or it is a warning
  // wearing a question mark.
  const questions = [...stripped.matchAll(/question:\s*`([^`]*)`/g)].map(m => m[1])
  check('every question actually asks something', questions.length >= 6 && questions.every(q => q.includes('?')), questions.length)
}

// ---------------------------------------------------------------------------
console.log('\n8. The helpers the tier rules stand on are real')
// ---------------------------------------------------------------------------
{
  const w1 = hyperPlan.find(w => w.week_number === 1)!
  check('phase detection reads the plan, not a guess',
    isStrengthPhase({ ...w1, phase_label: 'Maximal Strength' }) && !isStrengthPhase({ ...w1, phase_label: 'Hypertrophy' }))
  check('accumulation detection is the complement, not the same test',
    isAccumulationPhase({ ...w1, phase_label: 'Hypertrophy' }) && !isAccumulationPhase({ ...w1, phase_label: 'Maximal Strength' }))

  // muscleVolumeChange must find nothing when nothing moved — the honest
  // no-op that keeps tier 0 reachable.
  check('an unchanged week reports no volume move', muscleVolumeChange(w1, w1) === null)
  // ...and must find a real one when a whole day goes.
  const stripped = { ...w1, days: w1.days.map((d, i) => (i === 0 ? { ...d, exercises: [] } : d)) }
  const moved = muscleVolumeChange(w1, stripped)
  check('...and finds one when a day is emptied', moved !== null && moved.direction === 'down', moved)

  check('an unchanged plan shows no score drop', scoreDrop(hyper, hyperPlan, hyperPlan) === null)
}

// ---------------------------------------------------------------------------
console.log('\n9. The card and the ask are built from the verdict, not re-derived')
// ---------------------------------------------------------------------------
{
  const tier1 = { tier: 1 as const, cost: 'Your chest goes from 12 sets this week to 8.', alternatives: [{ label: 'Just today', note: 'next week is unchanged', prompt: 'today only' }], question: null, reason: 'probe' }
  const tier2 = { tier: 2 as const, cost: 'That is the lift this block is built around.', alternatives: [{ label: 'Swap it instead', note: 'keeps the slot', prompt: 'swap it' }], question: 'What is going on with it?', reason: 'probe' }
  const tier0 = { tier: 0 as const, cost: null, alternatives: [], question: null, reason: 'probe' }

  // THE COST JOINS THE CARD, it does not take it over. A meal removal's own
  // verified swaps and the balancing sentence are what the app DID; this is
  // what it COST, and a person needs both.
  const existing = {
    implications: [{ severity: 'info' as const, text: 'Load recomputed once you confirm.' }],
    alternatives: [{ label: 'Tuna', note: 'same protein', prompt: 'use tuna' }],
  }
  const merged = applyTradeoff(existing, tier1)
  check('the cost lands as the warning, after what the app did',
    merged.implications.length === 2 && merged.implications[1].severity === 'warn' && merged.implications[0].text.includes('Load recomputed'),
    merged.implications)

  // ONE AMBER LINE, NOT TWO. A card that already carries a balance warning —
  // "that leaves your week push-heavy" — and then adds "your back goes from 14
  // sets to 9" is saying the same fact twice, because the back work leaving IS
  // why the week went push-heavy. Caught by verify:swap-request going red.
  const withBalanceWarning = {
    implications: [
      { severity: 'info' as const, text: 'Load recomputed once you confirm.' },
      { severity: 'warn' as const, text: 'That leaves your week push-heavy — 5 pushing sets to 3 pulling.' },
    ],
    alternatives: [],
  }
  const single = applyTradeoff(withBalanceWarning, tier1)
  const warns = single.implications.filter(i => i.severity === 'warn')
  check('a card never carries two warnings about one edit', warns.length === 1, single.implications)
  check('...and the one it keeps is in the goal\u2019s terms', warns[0].text === tier1.cost, warns[0])
  check('...while what the app DID survives untouched',
    single.implications.some(i => i.severity === 'info' && /Load recomputed/.test(i.text)), single.implications)
  check('a free edit leaves an existing balance warning alone',
    applyTradeoff(withBalanceWarning, tier0) === withBalanceWarning)
  check('...and the existing offers keep their places', merged.alternatives[0].label === 'Tuna' && merged.alternatives.length === 2, merged.alternatives)
  check('a free edit leaves the card exactly as it was', applyTradeoff(existing, tier0) === existing)

  // THE ASK CARRIES "DO IT ANYWAY", ALWAYS AND LAST. This is the whole of the
  // decision: one tap further away, never blocked.
  const ask = askText(tier2)
  check('the ask is a question with chips', ask.includes('What is going on with it?') && ask.includes('[QUICK_REPLIES:'), ask)
  check(`...always offering "${DO_IT_ANYWAY}"`, ask.includes(`"${DO_IT_ANYWAY}"`), ask)
  check('...as the LAST chip, so the alternative is read first',
    ask.lastIndexOf(`"${DO_IT_ANYWAY}"`) > ask.indexOf('"Swap it instead"'), ask)
  check('a tier-1 produces no ask at all', askText(tier1) === '' && askText(tier0) === '')

  // THE THREE GUARDS.
  const none = { alreadyAsked: new Set<string>(), sessionRunning: false }
  check('a tier-2 asks by default', shouldAsk(tier2, 'k', 'permanent', none))
  check('...and a tier-1 never asks', !shouldAsk(tier1, 'k', 'permanent', none))
  check('asked once already this block → no second ask',
    !shouldAsk(tier2, 'k', 'permanent', { ...none, alreadyAsked: new Set(['k']) }))
  check('...but a DIFFERENT thing in the same block still asks',
    shouldAsk(tier2, 'other', 'permanent', { ...none, alreadyAsked: new Set(['k']) }))
  check('mid-session, a TODAY change never interrupts',
    !shouldAsk(tier2, 'k', 'today', { ...none, sessionRunning: true }))
  check('...while a lasting change mid-session still asks',
    shouldAsk(tier2, 'k', 'permanent', { ...none, sessionRunning: true }))

  // A GUARDED-OUT TIER 2 MUST NOT GO SILENT. It still cost something.
  const down = downgradeToCard(tier2)
  check('a tier-2 that is not asked becomes a tier-1 card, not nothing',
    down.tier === 1 && down.cost === tier2.cost && down.question === null, down)
  check('...and says why it was downgraded, for the log', /asked already|mid-session/.test(down.reason), down.reason)
  check('downgrading a tier-1 changes nothing', downgradeToCard(tier1) === tier1)

  // askKey must separate the things a person would think of as separate.
  const k = (kind: string, ex?: string, day = 'Monday') =>
    askKey({ kind: kind as never, dayName: day, exerciseName: ex }, 2)
  check('two different exercises are two different asks', k('remove', 'Squats') !== k('remove', 'Bench'))
  check('two different edits to one exercise are two different asks', k('remove', 'Squats') !== k('swap', 'Squats'))
  check('the same edit in a later block asks again',
    askKey({ kind: 'remove' as never, dayName: 'Monday', exerciseName: 'Squats' }, 3) !== k('remove', 'Squats'))
  check('...and case in the name never splits one thing into two', k('remove', 'SQUATS') === k('remove', 'squats'))
}

console.log(failures === 0 ? '\nAll edit trade-off checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
