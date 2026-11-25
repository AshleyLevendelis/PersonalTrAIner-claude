// test:older-beginner — beginners from 60 (his request 21 Nov 2026, "fix those five issues for beginners over 60.
// tighten the beginner and 60+ selection rules"). The five: barbell lifts on day one, pull-up negatives / assisted
// pull-ups, a landmine press at an empty bar beside a 4 kg dumbbell press, a session called "Power", no balance work.
// Seeded, so every run is the same plan. Every section has a contrast that shows its fixture binds.
import { bestEquipmentRank, generateMesocycle, generateExercisePlan, setRandomSource, capBeginnerSets, beginnerWorkingSets, BEGINNER_MAX_WORKING_SETS, getConstrainedPool, stageOlderBeginnerFilter, fullBodyTrackName, phaseSequenceFor } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, EXERCISE_DATABASE, REHAB_ONLY, isRehabOnly, type ExerciseEntry } from '../src/lib/exercise-db'
import { isOlderBeginner, olderBeginnerExclusion, olderAdultExclusion, OLDER_ADULT_IMPACT } from '../src/lib/older-beginner'
import { meetsCapabilityRequirement } from '../src/lib/exercise-db'
import { generalWarmupFor } from '../src/lib/warmup'
import { needsBalanceWork, BALANCE_HOLD } from '../src/lib/pathway'
import type { UserProfile, MesocycleWeek, ConstraintTrace } from '../src/lib/types'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const her = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 60, gender: 'female', height_cm: 165, weight_kg: 72, activity_level: 'sedentary',
  fitness_goal: 'fat_loss', start_preference: 'train', equipment_access: 'full_gym',
  training_days: ALL.map(d => ({ day: d, available: ['Monday', 'Wednesday', 'Friday'].includes(d) })),
  preferred_time: 'morning', dietary_preferences: [], session_duration_preference: '30-45',
  workout_split_preference: 'ai_recommendation', macro_calculation_mode: 'STANDARD_STATIC',
  training_style: 'functional', training_experience: 'beginner', coaching_persona: 'supportive', injuries: [],
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...over,
} as UserProfile)
function plan(profile: UserProfile): MesocycleWeek[] {
  setRandomSource(seededRngFromKey('f60'))
  return generateMesocycle(profile)
}
const lifting = (p: MesocycleWeek[]) => p.flatMap(w => w.days).filter(d => d.exercises.length > 0)
const names = (p: MesocycleWeek[]) => new Set(lifting(p).flatMap(d => d.exercises.map(e => e.name)))
const entry = (n: string) => getExerciseEntry(n)!

console.log('test:older-beginner\n')

console.log('1. Who the rule is for')
check('60 and a beginner', isOlderBeginner({ age: 60, training_experience: 'beginner' }))
check('59 is not', !isOlderBeginner({ age: 59, training_experience: 'beginner' }))
check('a 60-year-old novice is not (it lifts once she has trained)', !isOlderBeginner({ age: 60, training_experience: 'novice' }))
check('no age held is not (nothing assumed)', !isOlderBeginner({ age: undefined as unknown as number, training_experience: 'beginner' }))

console.log('\n2. What is left out, and why')
const expect: [string, string | null][] = [
  ['Barbell Squats', 'barbell'], ['Trap Bar Deadlift', 'barbell'], ['Landmine Press', 'barbell'],
  ['Pull-Up Negatives', 'hanging'], ['Pull-Ups (Assisted)', 'hanging'], ['Box Jumps', 'impact'],
  ['Romanian Deadlifts', 'technique'], ['Walking Lunges', 'technique'], ['Single-Leg Dumbbell RDL', 'technique'],
  ['Reverse Hyper Machine', 'technique'],
  ['Goblet Squats', null], ['Lat Pulldown', null], ['Kettlebell Deadlift', null], ['Step-Ups', null],
]
for (const [n, want] of expect) {
  const e = getExerciseEntry(n)
  check(`${n}: ${want ?? 'kept'}`, !!e && olderBeginnerExclusion(e) === want, e ? String(olderBeginnerExclusion(e)) : 'not in the catalogue')
}

console.log('\n3. Her plan (60, beginner, full gym, functional, 3 days): the five issues')
const hers = plan(her())
const herNames = names(hers)
const leaks = [...herNames].filter(n => { const e = getExerciseEntry(n); return e && olderBeginnerExclusion(e) })
check('no barbell, hanging, jumping or technique lift in any of the 16 weeks', leaks.length === 0, leaks.join(', '))
check('her vertical pull is a lat pulldown', herNames.has('Lat Pulldown'), [...herNames].join(', '))
check('no pull-up of any kind', ![...herNames].some(n => /pull-up/i.test(n)))
check('no landmine press', !herNames.has('Landmine Press'))
check('no session named "Power"', lifting(hers).every(d => !/power/i.test(d.focus)), [...new Set(lifting(hers).map(d => d.focus))].join(', '))
check('her full-body days are "Full Body Strength"', lifting(hers).some(d => d.focus === 'Full Body Strength'))
check('balance work on every lifting day (a warm-up line, or the day\'s movement prep, never both)', lifting(hers).every(d => d.warmup?.mobility.some(m => m.name === BALANCE_HOLD) || d.exercises.some(e => e.name === BALANCE_HOLD)))
const coversEveryWeek = (pats: string[]) => hers.every(w => w.days.some(d => d.exercises.some(e => pats.includes(getExerciseEntry(e.name)?.movement_pattern ?? ''))))
check('every week still squats', coversEveryWeek(['knee_dominant']))
check('every week still hinges', coversEveryWeek(['hip_hinge']))
check('every week still pushes and pulls', coversEveryWeek(['horizontal_push', 'vertical_push']) && coversEveryWeek(['horizontal_pull', 'vertical_pull']))

console.log('\n4. The same woman at 59: the fixture binds (she is given what the rule takes away)')
const at59 = plan(her({ age: 59 }))
const leaks59 = [...names(at59)].filter(n => { const e = getExerciseEntry(n); return e && olderBeginnerExclusion(e) })
check('at 59 her plan holds lifts the rule removes', leaks59.length > 0)
check('at 59 there is no balance hold (it starts at 60 for a beginner)', lifting(at59).every(d => !d.warmup?.mobility.some(m => m.name === BALANCE_HOLD)))
check('at 59 a beginner is still never told "Power"', lifting(at59).every(d => !/power/i.test(d.focus)))

console.log('\n5. Not a beginner: nothing changes')
const inter = plan(her({ age: 62, training_experience: 'intermediate' }))
// RE-ANCHORED 21 Nov 2026: "Power" now follows the plan's blocks, not the level. Her fat-loss plan has no power block.
check('a 62-year-old intermediate: "Full Body Power" exactly when her plan holds a power block',
  (() => { const hasPower = phaseSequenceFor(her({ age: 62, training_experience: 'intermediate' })).includes('power'); return lifting(inter).some(d => /^Full Body/.test(d.focus)) && lifting(inter).filter(d => /^Full Body/.test(d.focus)).every(d => d.focus === (hasPower ? 'Full Body Power' : 'Full Body Strength')) })())
{
  const strong = her({ age: 30, training_experience: 'advanced', fitness_goal: 'functional', training_style: 'functional' })
  setRandomSource(seededRngFromKey('pw')); const sp = generateMesocycle(strong)
  check('...and a plan WITH a power block keeps "Full Body Power" (the fixture binds)', phaseSequenceFor(strong).includes('power') && lifting(sp).some(d => d.focus === 'Full Body Power'), [...new Set(lifting(sp).map(d => d.focus))])
}
check('a 62-year-old intermediate can be given a barbell', [...names(inter)].some(n => olderBeginnerExclusion(entry(n)) === 'barbell'))
check('balance from 65 for everyone, 60 for a beginner', needsBalanceWork({ age: 65, training_experience: 'advanced' })
  && !needsBalanceWork({ age: 64, training_experience: 'novice' }) && needsBalanceWork({ age: 60, training_experience: 'beginner' }))
check('fullBodyTrackName renames only Full Body Power, only in a plan with no power block',
  fullBodyTrackName('Full Body Power', false) === 'Full Body Strength' && fullBodyTrackName('Full Body Power', true) === 'Full Body Power'
  && fullBodyTrackName('Squat & Carry', false) === 'Squat & Carry')

console.log('\n6. The swap shortlist reads the same pool (edits keep the bar)')
const pool = getConstrainedPool(her())
const poolLeaks = pool.filter(e => olderBeginnerExclusion(e))
check('the constrained pool holds none of them', poolLeaks.length === 0, poolLeaks.map(e => e.name).join(', '))
check('and holds a kettlebell deadlift and a goblet squat', pool.some(e => e.name === 'Kettlebell Deadlift') && pool.some(e => e.name === 'Goblet Squats'))

console.log('\n7. A pattern with nothing else left: a barbell lift yields, a hanging one never does')
const trace = (): ConstraintTrace => ({
  equipment_filtered: [], injury_filtered: [], style_filtered: [], skill_filtered: [],
  time_cap_adjusted: [], exclusion_filtered: [], structure_adjusted: [],
  pool_size_after_each_stage: { equipment: 0, injury: 0, style: 0, skill: 0, final: 0 },
} as ConstraintTrace)
const constructed: ExerciseEntry[] = ['Barbell Squats', 'Pull-Up Negatives', 'Pull-Ups (Assisted)', 'Bent-Over Dumbbell Row', 'Kettlebell Deadlift'].map(entry)
const out = stageOlderBeginnerFilter(constructed, { age: 63, training_experience: 'beginner' }, trace()).map(e => e.name)
check('the only squat (a barbell) is kept, so no week loses its squat', out.includes('Barbell Squats'), out.join(', '))
check('the only vertical pulls (hanging) are not kept', !out.includes('Pull-Up Negatives') && !out.includes('Pull-Ups (Assisted)'), out.join(', '))
check('an ordinary lift passes', out.includes('Kettlebell Deadlift') && out.includes('Bent-Over Dumbbell Row'))
const withGoblet = stageOlderBeginnerFilter([...constructed, entry('Goblet Squats')], { age: 63, training_experience: 'beginner' }, trace()).map(e => e.name)
check('with a goblet squat there, the barbell squat goes', !withGoblet.includes('Barbell Squats') && withGoblet.includes('Goblet Squats'), withGoblet.join(', '))
check('a 59-year-old passes through untouched', stageOlderBeginnerFilter(constructed, { age: 59, training_experience: 'beginner' }, trace()).length === constructed.length)

console.log('\n8. Every name the rule lists is a real catalogue entry (a renamed exercise must not slip past)')
const regexHits = EXERCISE_DATABASE.filter(e => !e.retired && olderBeginnerExclusion(e) === 'technique' && /single-leg|reverse hyper/i.test(e.name))
check('the single-leg RDL and reverse-hyper rule matches catalogue entries', regexHits.length >= 2, regexHits.map(e => e.name).join(', '))

console.log('\n9. ALL AGES (21 Nov 2026): from 65 at any level, no jump with a real landing')
const atAge = (age: number, exp: UserProfile['training_experience'], style: UserProfile['training_style'] = 'functional') => {
  // Measured in the 2,048-plan audit: intermediate/advanced power blocks are where broad jumps and plyo push-ups live.
  setRandomSource(seededRngFromKey(`imp${exp}`))
  return generateMesocycle(her({ age, training_experience: exp, training_style: style, fitness_goal: 'functional', session_duration_preference: '45-60',
    training_days: ALL.map(d => ({ day: d, available: ['Monday', 'Wednesday', 'Friday', 'Saturday'].includes(d) })) }))
}
const jumpsIn = (p: MesocycleWeek[]) => [...names(p)].filter(n => OLDER_ADULT_IMPACT.has(n))
// combat, the style that holds the most of them (four of the five at 64, advanced, measured).
for (const exp of ['intermediate', 'advanced'] as const) {
  const young = jumpsIn(atAge(64, exp, 'combat')), old = jumpsIn(atAge(66, exp, 'combat'))
  check(`${exp}, 64: the plan holds landing jumps (the fixture binds)`, young.length > 0, young.join(', '))
  check(`${exp}, 66: none`, old.length === 0, old.join(', '))
}
check('the rule starts at 65 exactly', olderAdultExclusion({ age: 65 }, entry('Broad Jumps')) && !olderAdultExclusion({ age: 64 }, entry('Broad Jumps')))
check('skipping stays for an experienced 70-year-old', !olderAdultExclusion({ age: 70 }, entry('Jump Rope')) && !olderAdultExclusion({ age: 70 }, entry('Jumping Jacks')))
check('the swap shortlist agrees at 70', getConstrainedPool(her({ age: 70, training_experience: 'advanced' })).every(e => !OLDER_ADULT_IMPACT.has(e.name)))

console.log('\n10. ALL AGES: a beginner learns the slow version first')
check('pull-up negatives wait for novice', !meetsCapabilityRequirement(entry('Pull-Up Negatives'), 'beginner') && meetsCapabilityRequirement(entry('Pull-Up Negatives'), 'novice'))
check('kettlebell swings wait for novice', !meetsCapabilityRequirement(entry('Kettlebell Swings'), 'beginner') && meetsCapabilityRequirement(entry('Kettlebell Swings'), 'novice'))
const young = getConstrainedPool(her({ age: 25 })).map(e => e.name)
check('a 25-year-old beginner\'s pool has neither', !young.includes('Pull-Up Negatives') && !young.includes('Kettlebell Swings'))
const youngNovice = getConstrainedPool(her({ age: 25, training_experience: 'novice' })).map(e => e.name)
check('a 25-year-old novice\'s pool has both (the rule binds)', youngNovice.includes('Pull-Up Negatives') && youngNovice.includes('Kettlebell Swings'))
check('a 25-year-old beginner may still use a barbell (age, not experience, takes it away)', young.includes('Barbell Squats'))

console.log('\n11. ALL AGES: a novice is never told "Power" either (no power phase below intermediate)')
const nov = plan(her({ age: 30, training_experience: 'novice' }))
check('a novice\'s full-body days are "Full Body Strength"', lifting(nov).some(d => d.focus === 'Full Body Strength') && lifting(nov).every(d => !/power/i.test(d.focus)))
check('and a novice never reaches a power phase (the name is honest)', nov.every(w => !/power/i.test(w.phase_label ?? '')))

console.log('\n12. The warm-up opener: no jumping jacks for a beginner from 60')
const home = (over: Partial<UserProfile>) => { setRandomSource(seededRngFromKey('wu')); return generateMesocycle(her({ equipment_access: 'bodyweight', ...over })) }
const opener = (p: MesocycleWeek[]) => lifting(p)[0]?.warmup?.general.map(g => g.name).join(',') ?? ''
check('60, beginner, at home: not Jumping Jacks', !/jump/i.test(opener(home({}))), opener(home({})))
check('59, beginner, at home: Jumping Jacks (the fixture binds)', /jump/i.test(opener(home({ age: 59 }))), opener(home({ age: 59 })))
{
  setRandomSource(seededRngFromKey('wu'))
  const week = generateExercisePlan(her({ equipment_access: 'bodyweight' })).plan
  const first = week.find(d => d.exercises.length > 0)?.warmup?.general.map(g => g.name).join(',') ?? ''
  check('the single-week build agrees (its warm-up is the first one built)', !!first && !/jump/i.test(first), first)
}
check('the low-impact twin is the pregnancy one (one list)', generalWarmupFor('bodyweight', [], true).name === lifting(home({}))[0]?.warmup?.general[0]?.name)

console.log('\n13. ALL AGES: a bodyweight week still squats (the main lower lift alternates when no tier-1 lift exists)')
// Measured offenders from the 2,048-plan audit (seeded with its own key): three full-body days, each built on a hinge.
for (const [age, style, goal, nd] of [[24, 'hybrid', 'functional', 3], [24, 'combat', 'hypertrophy', 4], [68, 'combat', 'functional', 3]] as const) {
  const gender = (age + nd) % 2 ? 'female' : 'male'
  const p = her({ age, gender, weight_kg: gender === 'female' ? 68 : 84, height_cm: gender === 'female' ? 165 : 178, activity_level: 'lightly_active',
    fitness_goal: goal, equipment_access: 'bodyweight', training_style: style, session_duration_preference: '45-60',
    training_days: ALL.map((d, i) => ({ day: d, available: [0, 2, 4, 5].slice(0, nd).includes(i) })) })
  setRandomSource(seededRngFromKey(`${age}beginnerbodyweight${style}${goal}${nd}`))
  const weeks = generateMesocycle(p).slice(0, 3).filter(w => !w.is_deload)
  const squatless = weeks.filter(w => !w.days.some(d => d.exercises.some(e => getExerciseEntry(e.name)?.movement_pattern === 'knee_dominant')))
  const hingeless = weeks.filter(w => !w.days.some(d => d.exercises.some(e => getExerciseEntry(e.name)?.movement_pattern === 'hip_hinge')))
  check(`${age}, bodyweight beginner, ${style}/${goal}, ${nd} days: every week squats and hinges`, squatless.length === 0 && hingeless.length === 0,
    `${squatless.length} without a squat, ${hingeless.length} without a hinge`)
}

console.log('\n14. A BEGINNER\'S SESSION HOLDS AT MOST 18 WORKING SETS (his ruling 21 Nov 2026)')
check('the cap is 18', BEGINNER_MAX_WORKING_SETS === 18)
// The audit's measured offender: 8 exercises x 3 = 24 sets on a combat Pull & Hinge day.
const combat = (exp: UserProfile['training_experience']) => {
  setRandomSource(seededRngFromKey(`24${exp}full_gymcombatfat_loss4`))
  return generateMesocycle(her({ age: 24, gender: 'male', weight_kg: 84, height_cm: 178, activity_level: 'lightly_active', training_experience: exp,
    training_style: 'combat', session_duration_preference: '45-60', training_days: ALL.map((d, i) => ({ day: d, available: [0, 2, 4, 5].includes(i) })) }))
}
const maxSets = (p: MesocycleWeek[]) => Math.max(...lifting(p).map(beginnerWorkingSets))
const begMax = maxSets(combat('beginner')), novMax = maxSets(combat('novice'))
check('a beginner\'s busiest day is 18 sets or fewer', begMax <= 18, String(begMax))
check('a novice on the same plan is not capped (the fixture binds)', novMax > 18, String(novMax))
check('the beginner plan still squats, hinges, pushes and pulls every week', combat('beginner').every(w => {
  const pats = new Set(w.days.flatMap(d => d.exercises.map(e => getExerciseEntry(e.name)?.movement_pattern)))
  return (pats.has('knee_dominant') || pats.has('single_leg')) && pats.has('hip_hinge') && (pats.has('horizontal_push') || pats.has('vertical_push')) && (pats.has('horizontal_pull') || pats.has('vertical_pull'))
}))
// Constructed days, each built so ONE rule decides the outcome (a day the cap clears by trimming alone cannot see the
// protections: the first version of these checks missed four of six mutations for exactly that reason).
const row = (name: string, sets: number, extra: Record<string, unknown> = {}) => ({ name, sets, reps: '10', rest: '60s', ...extra }) as never
type Capped = { exercises: { name: string; sets: number }[] }
const cap = (exercises: unknown[]) => capBeginnerSets({ day: 'Monday', focus: 'Pull & Hinge', exercises } as never) as Capped
const setsIn = (d: Capped, n: string) => d.exercises.find(e => e.name === n)?.sets
// 22 sets, 4 to lose: isolation can give all 4, so the compound accessories keep theirs.
const order = cap([row('Band Pull-Aparts', 2), row('Deadlifts', 4), row('Lat Pulldown', 5), row('Bent-Over Dumbbell Row', 5), row('Face Pulls', 4), row('Dumbbell Curls', 4)])
check('isolation gives before the compound accessories', setsIn(order, 'Lat Pulldown') === 5 && setsIn(order, 'Bent-Over Dumbbell Row') === 5
  && setsIn(order, 'Face Pulls') === 2 && setsIn(order, 'Dumbbell Curls') === 2, JSON.stringify(order.exercises))
check('the warm-up primer is untouched and not counted', setsIn(order, 'Band Pull-Aparts') === 2 && beginnerWorkingSets(order as never) === 18)
// Everything but the main lift at its floor, and three exercises: nothing may give, so the day stays over.
const floor = cap([row('Deadlifts', 16), row('Lat Pulldown', 2), row('Bent-Over Dumbbell Row', 2)])
check('the main lift keeps every set, even over the cap', setsIn(floor, 'Deadlifts') === 16, JSON.stringify(floor.exercises))
check('never below three training exercises, even over the cap', floor.exercises.length === 3)
// At their floors and over: whole exercises go, from the end, isolation first, skipping a superset partner.
const drops = cap([row('Deadlifts', 10), row('Lat Pulldown', 2), row('Bent-Over Dumbbell Row', 2), row('Face Pulls', 2),
  row('Dumbbell Curls', 2), row('Shrugs', 2, { superset_label: 'A1' }), row('Dead Bug', 2)])
check('a superset partner is never dropped; the next isolation goes instead', drops.exercises.some(e => e.name === 'Shrugs')
  && !drops.exercises.some(e => e.name === 'Dead Bug') && !drops.exercises.some(e => e.name === 'Dumbbell Curls'), JSON.stringify(drops.exercises.map(e => e.name)))
check('the dropped day is at the cap', beginnerWorkingSets(drops as never) === 18)

console.log('\n15. HER FOUR LEFTOVERS (his "fix the four leftovers in her plan too", 21 Nov 2026), and what they were for everyone')
{
  const hersNow = plan(her())
  const loadingWeeks = hersNow.filter(w => !w.is_deload)
  const mainOf = (d: MesocycleWeek['days'][number]) => d.exercises.find(e => getExerciseEntry(e.name)?.mechanics_tier !== 'primer'
    && ['knee_dominant', 'hip_hinge'].includes(getExerciseEntry(e.name)?.movement_pattern ?? ''))?.name
  // (4) The foundations: a kettlebell deadlift and a goblet squat, for the whole plan.
  const mains = new Set(loadingWeeks.flatMap(w => lifting([w]).map(mainOf)).filter(Boolean))
  check('her main lower-body lifts are the kettlebell deadlift and the goblet squat, all 16 weeks', mains.size === 2 && mains.has('Kettlebell Deadlift') && mains.has('Goblet Squats'), [...mains].join(', '))
  const at59 = plan(her({ age: 59 }))
  check('...where at 59 (no foundation rule) they are not', !new Set(lifting(at59).map(mainOf)).has('Kettlebell Deadlift') || !new Set(lifting(at59).map(mainOf)).has('Goblet Squats'))
  // (2) No Russian twist for a beginner from 60.
  check('a Russian twist is a technique lift for her', olderBeginnerExclusion(entry('Russian Twist')) === 'technique')
  // (3) A rehab drill only for the injury it treats.
  const herNames = names(hersNow)
  check('no rehab-only drill in her plan', ![...herNames].some(n => REHAB_ONLY.has(n)), [...herNames].filter(n => REHAB_ONLY.has(n)).join(', '))
  check('every rehab-only name is a real catalogue entry', [...REHAB_ONLY].every(n => !!getExerciseEntry(n)))
  const sorePool = getConstrainedPool(her({ age: 40, training_experience: 'intermediate', injuries: ['elbows'] })).map(e => e.name)
  const okPool = getConstrainedPool(her({ age: 40, training_experience: 'intermediate' })).map(e => e.name)
  check('a sore elbow keeps its tendon drill; a healthy one does not', sorePool.includes('Eccentric Wrist Extension') && !okPool.includes('Eccentric Wrist Extension'))
  check('a sore knee keeps its quad set; a healthy knee does not', getConstrainedPool(her({ age: 40, training_experience: 'intermediate', injuries: ['knees'] })).some(e => e.name === 'Seated Short-Arc Quad Set') && !okPool.includes('Seated Short-Arc Quad Set'))
  // Through the generator's own pipeline, on healthy profiles across kit and style (the audit had a rehab drill in
  // 1,007 of 2,048 plans before): her plan alone could miss it, a first version of this check did.
  {
    const leaks: string[] = []
    for (const eq of ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const) for (const style of ['functional', 'hybrid', 'bodybuilding', 'combat'] as const) for (const exp of ['beginner', 'intermediate'] as const) {
      setRandomSource(seededRngFromKey(`rehab${eq}${style}${exp}`))
      const week = generateExercisePlan(her({ age: 35, training_experience: exp, equipment_access: eq, training_style: style, fitness_goal: 'hypertrophy' })).plan
      for (const d of week) for (const e of d.exercises) if (REHAB_ONLY.has(e.name)) leaks.push(`${eq}/${style}/${exp}: ${e.name}`)
    }
    check('32 healthy base weeks, through the generator itself: no rehab-only drill', leaks.length === 0, leaks.slice(0, 4).join('; '))
  }
  check('a near-copy of a rehab drill answers as its parent', isRehabOnly({ name: 'x', parent: 'Eccentric Wrist Extension' }))
  // (1) Improvised kit is improvised: a backpack row and a chair leg extension rank low.
  check('a backpack row ranks as improvised kit', bestEquipmentRank(entry('Backpack Row')) === 'low')
  check('a chair leg extension ranks as improvised kit', bestEquipmentRank(entry('Chair Leg Extension')) === 'low')
  check('a dumbbell row does not', bestEquipmentRank(entry('Bent-Over Dumbbell Row')) === 'high')
  check('no backpack or furniture lift in her full-gym plan', ![...herNames].some(n => /backpack|chair|towel row|table row/i.test(n)), [...herNames].filter(n => /backpack|chair|towel|table/i.test(n)).join(', '))
  // The measured offender for everyone: her own plan at 59 held a backpack row in week 5 before this.
  // And the main-lift anchor on a day with no tier-1 lift (bodyweight): it holds for the whole plan.
  setRandomSource(seededRngFromKey('bwmain'))
  const bw = generateMesocycle(her({ age: 30, training_experience: 'intermediate', equipment_access: 'bodyweight', training_style: 'hybrid' }))
  const bwMains = new Map<number, Set<string>>()
  for (const w of bw.filter(x => !x.is_deload)) lifting([w]).forEach((d, i) => { const m = d.exercises.find(e => getExerciseEntry(e.name)?.mechanics_tier === 'tier2_compound' && getExerciseEntry(e.name)?.movement_pattern !== 'carry')?.name; if (m) (bwMains.get(i) ?? bwMains.set(i, new Set()).get(i)!).add(m) })
  check('a bodyweight day keeps its main lift in every block (16 Nov "main lifts for the whole plan")', [...bwMains.values()].every(s => s.size === 1), [...bwMains.values()].map(s => [...s].join('/')).join(' | '))
  // The balance hold once per warm-up.
  const twice = lifting(hersNow).filter(d => d.exercises.some(e => e.name === BALANCE_HOLD) && d.warmup?.mobility.some(m => m.name === BALANCE_HOLD))
  check('the balance hold is never both the movement prep and a warm-up line', twice.length === 0, twice.length)
}

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
