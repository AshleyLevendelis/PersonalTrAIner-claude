// ---------------------------------------------------------------------------
// THE WARM-UP OBEYS THE RULES THE SESSION OBEYS (18 Nov 2026, the full pass).
//
// The plan takes every jumping move out for a bad knee or ankle, and every jumping or lying-flat move out while
// pregnant. The warm-up was built from its own two tables and asked neither question: 4,608 of 6,144 sampled warm-ups
// for a pregnant trainee held a jump and 928 a Glute Bridge. This holds the warm-up, the tightness drills and the
// starting-out circuit to the same rule. One exit, at the bottom.
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { generalWarmupFor, buildWarmup, drillsPreparing } from '../src/lib/warmup'
import { tightnessWarmup } from '../src/lib/tightness'
import { homeCircuit } from '../src/lib/pathway'
import { pregnancyExclusion } from '../src/lib/pregnancy-rules'
import { getExerciseEntry, isContraindicatedFor, INJURED_JOINTS } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildProfile, comboKey, generateAllCombinations } from './quality-grid'
import type { UserProfile, EquipmentAccess } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const JUMP = /\b(jump|jumps|jumping|jacks?|high knees|skipping|burpees?|bounds?|hops?)\b/i
const TIERS: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']

console.log('\n1. The opening item: the kit\'s own, or its both-feet-on-the-floor twin')
{
  const healthy = TIERS.map(t => generalWarmupFor(t, [], false))
  check('with nothing ruled out, three of the four kits open with a jump (so the rule has something to do)', healthy.filter(g => JUMP.test(g.name)).length === 3, healthy.map(g => g.name))
  check('pregnant: no kit opens with a jump', TIERS.every(t => !JUMP.test(generalWarmupFor(t, [], true).name)), TIERS.map(t => generalWarmupFor(t, [], true).name))
  check('a knee on the injuries list: no kit opens with a jump', TIERS.every(t => !JUMP.test(generalWarmupFor(t, ['knees'], false).name)), TIERS.map(t => generalWarmupFor(t, ['knees'], false).name))
  check('...nor with an ankle', TIERS.every(t => !JUMP.test(generalWarmupFor(t, ['ankles'], false).name)))
  // THE CATALOGUE'S OWN JUDGEMENT, not a second list: an injury rules the opening out exactly when it rules out a jump the opening names.
  const parts: Record<string, string[]> = { home_gym: ['Jump Rope'], minimalist: ['Jumping Jacks', 'High Knees'], bodyweight: ['Jumping Jacks', 'High Knees'] }
  const disagree: string[] = []
  for (const tier of ['home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[]) for (const injury of Object.keys(INJURED_JOINTS)) {
    const ruledOut = parts[tier].some(n => isContraindicatedFor(getExerciseEntry(n)!, new Set(INJURED_JOINTS[injury])))
    const low = !JUMP.test(generalWarmupFor(tier, [injury], false).name)
    if (ruledOut !== low) disagree.push(`${tier}/${injury}`)
  }
  check('for every kit and every injury the opening agrees with what the plan would do with that jump', disagree.length === 0, disagree)
  check('...so a sore wrist changes the skipping rope, and leaves jumping jacks alone', !JUMP.test(generalWarmupFor('home_gym', ['wrists'], false).name) && JUMP.test(generalWarmupFor('bodyweight', ['wrists'], false).name),
    [generalWarmupFor('home_gym', ['wrists'], false).name, generalWarmupFor('bodyweight', ['wrists'], false).name])
  check('...and an elbow or a neck changes nothing', TIERS.every(t => generalWarmupFor(t, ['elbows', 'neck'], false).name === generalWarmupFor(t, [], false).name))
  check('the gym\'s bike, rower or treadmill is the same for everyone', generalWarmupFor('full_gym', ['knees', 'ankles'], true).name === generalWarmupFor('full_gym', [], false).name)
  // SAME LENGTH, so no session is resized by it and no plan pays for it in sets.
  check('the twin takes exactly as long as the item it replaces', (['home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[]).every(t => generalWarmupFor(t, [], true).duration_seconds === generalWarmupFor(t, [], false).duration_seconds),
    (['home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[]).map(t => [generalWarmupFor(t, [], true).duration_seconds, generalWarmupFor(t, [], false).duration_seconds]))
  check('every opening says how long and how hard', TIERS.flatMap(t => [generalWarmupFor(t, [], true), generalWarmupFor(t, ['knees'], false)]).every(g => /\d/.test(g.prescription) && g.purpose.length > 10))
}

console.log('\n2. The drills: nothing lying flat while pregnant')
{
  // THE DAY IS FOUND, NOT ASSUMED: the first set of patterns whose ordinary warm-up holds a Glute Bridge (the drill
  // ranking decides, and it has changed before). No such day would make every check below vacuous, so that is checked.
  const candidates = [['hip_hinge'], ['hip_hinge', 'squat'], ['squat'], ['single_leg', 'hip_hinge']]
    .flatMap(patterns => [[], ['wrists'], ['shoulders'], ['knees'], ['wrists', 'shoulders']].map(injuries => ({ patterns, injuries })))
  const dayFor = (c: { patterns: string[]; injuries: string[] }, pregnant: boolean) => buildWarmup({ patterns: c.patterns as never, compounds: [], equipment: 'bodyweight', injuries: c.injuries, experience: 'novice' as never, budgetSeconds: 1200, pregnant })
  const found = candidates.find(c => dayFor(c, false).mobility.some(m => m.name === 'Glute Bridge')) ?? candidates[0]
  const names = (pregnant: boolean) => dayFor(found, pregnant).mobility.map(m => m.name)
  check('a day\'s ordinary warm-up holds a Glute Bridge when not pregnant (so the next check binds)', names(false).includes('Glute Bridge'), { found, names: names(false) })
  check('...and none while pregnant', !names(true).includes('Glute Bridge') && names(true).every(n => !pregnancyExclusion({ name: n })), names(true))
  check('...with other drills in its place, not an emptier warm-up', names(true).length >= Math.min(2, names(false).length), { not: names(false), pregnant: names(true) })
  const tight = (pregnant: boolean) => drillsPreparing(['hip', 'lower_back_axial'], [], pregnant).map(d => d.name)
  check('"my hips feel tight" offers a Glute Bridge when not pregnant (binds)', tight(false).includes('Glute Bridge'), tight(false))
  check('...and never while pregnant', tight(true).every(n => !pregnancyExclusion({ name: n })) && tight(true).length > 0, tight(true))
  // THE ANSWER ON SCREEN, with an answer found to bind: the first set of areas (and injuries) whose ordinary answer
  // shows a Glute Bridge among its three drills.
  const asks = [['hips'], ['lower_back'], ['hips', 'lower_back'], ['knees'], ['hips', 'knees']].flatMap(areas => [[], ['wrists'], ['shoulders'], ['wrists', 'shoulders']].map(injuries => ({ areas, injuries })))
  const ask = asks.find(a => tightnessWarmup(a.areas, a.injuries, [], false).items.some(i => i.name === 'Glute Bridge')) ?? asks[0]
  const shown = (pregnant: boolean) => tightnessWarmup(ask.areas, ask.injuries, [], pregnant).items.map(i => i.name)
  check('a tightness answer on screen shows a Glute Bridge when not pregnant (binds)', shown(false).includes('Glute Bridge'), { ask, shown: shown(false) })
  check('...and the same answer while pregnant shows none lying flat', shown(true).every(n => !pregnancyExclusion({ name: n })), shown(true))
}

console.log('\n3. Real plans: every warm-up in every week')
{
  const all = generateAllCombinations().filter((_, i) => i % 389 === 0)
  const count = { healthy: { days: 0, jump: 0, lying: 0 }, pregnant: { days: 0, jump: 0, lying: 0 }, knees: { days: 0, jump: 0 } }
  const quiet = console.log
  console.log = () => {}
  try {
    for (const c of all) for (const kind of ['healthy', 'pregnant'] as const) {
      const p = buildProfile(c) as UserProfile
      if (kind === 'pregnant') p.health_conditions = ['pregnancy']
      setRandomSource(seededRngFromKey(comboKey(c)))
      let meso; try { meso = generateMesocycle(p) } finally { resetRandomSource() }
      const hasKnee = (p.injuries ?? []).some(i => i === 'knees' || i === 'ankles')
      for (const w of meso) for (const d of w.days) {
        if (!d.warmup) continue
        const items = [...d.warmup.general, ...d.warmup.mobility].map(i => i.name)
        const x = count[kind]
        x.days++
        if (items.some(n => JUMP.test(n))) x.jump++
        if (items.some(n => pregnancyExclusion({ name: n }) === 'lying')) x.lying++
        if (kind === 'healthy' && hasKnee) { count.knees.days++; if (items.some(n => JUMP.test(n))) count.knees.jump++ }
      }
    }
  } finally { console.log = quiet }
  console.log(`     ${all.length} profiles — ${JSON.stringify(count)}`)
  check('not pregnant: warm-ups do hold jumps and lying drills (binds)', count.healthy.jump > 0 && count.healthy.lying > 0, count.healthy)
  check('pregnant: not one warm-up with a jump', count.pregnant.days > 0 && count.pregnant.jump === 0, count.pregnant)
  check('pregnant: not one warm-up with a drill lying flat', count.pregnant.lying === 0, count.pregnant)
  check('a knee or ankle on the list: not one warm-up with a jump', count.knees.days > 0 && count.knees.jump === 0, count.knees)
}

console.log('\n4. The starting-out circuit keeps its four patterns, each move in its own words')
{
  const everything = () => true
  const full = homeCircuit({ age: 40 }, 3, everything)
  check('with nothing ruled out it is squat, push, pull and a Glute Bridge', full.exercises.map(e => e.name).join() === 'Box Squat (Bodyweight),Incline Push-Ups,Towel Row,Glute Bridge' && full.leftOut.length === 0, full.exercises.map(e => e.name))
  const noBridge = homeCircuit({ age: 40 }, 3, n => n !== 'Glute Bridge')
  check('with the Glute Bridge ruled out (it lies flat) the hinge is kept, standing', noBridge.exercises.map(e => e.name).includes('Bodyweight Hip Hinge to Wall') && noBridge.leftOut.length === 0, { names: noBridge.exercises.map(e => e.name), leftOut: noBridge.leftOut })
  const hinge = noBridge.exercises.find(e => e.name === 'Bodyweight Hip Hinge to Wall')
  check('...described as itself, not as lying on your back', !!hinge && /wall/.test(hinge.load_guidance ?? '') && !/lying on your back/.test(hinge.load_guidance ?? ''), hinge?.load_guidance)
  const wallSit = homeCircuit({ age: 40 }, 3, n => n !== 'Box Squat (Bodyweight)').exercises.find(e => e.name === 'Wall Sit')
  check('a Wall Sit in place of the chair squat is described as a wall sit', !!wallSit && /wall/.test(wallSit.load_guidance ?? '') && !/chair/.test(wallSit.load_guidance ?? ''), wallSit?.load_guidance)
  const bridge = full.exercises.find(e => e.name === 'Glute Bridge')
  check('...and the first choices keep their own words', /lying on your back/.test(bridge?.load_guidance ?? '') && /chair/.test(full.exercises[0].load_guidance ?? ''))
  // The real thing: a pregnant person on the walking start, from the plan's own eligibility.
  const starter = { ...(buildProfile(generateAllCombinations().find(c => c.equipment === 'bodyweight')!) as UserProfile),
    training_experience: 'beginner', activity_level: 'sedentary', fitness_goal: 'fat_loss', start_preference: 'move_more', health_conditions: ['pregnancy'] } as UserProfile
  setRandomSource(seededRngFromKey('warmup-rules-starter'))
  const quiet = console.log; console.log = () => {}
  let meso; try { meso = generateMesocycle(starter) } finally { resetRandomSource(); console.log = quiet }
  const strength = meso.flatMap(w => w.days).flatMap(d => d.exercises.map(e => e.name))
  check('a pregnant walking-start plan holds strength moves from week 3 (so the next check has a subject)', strength.length > 0, strength.length)
  check('...none lying flat or jumping, and the hinge is there', strength.every(n => !pregnancyExclusion({ name: n })) && strength.includes('Bodyweight Hip Hinge to Wall'), [...new Set(strength)])
  check('...on a plan that is the walking start (walks on every training day)', meso[0].days.some(d => !!d.plannedActivity), meso[0].days.map(d => d.focus))
}

console.log(`\n${ran} checks ran${failures ? `, ${failures} FAILED` : ''}.`)
console.log(failures === 0 ? 'The warm-up, the tightness drills and the starting-out circuit obey the rules the session obeys.' : `${failures} warmup-rules check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
