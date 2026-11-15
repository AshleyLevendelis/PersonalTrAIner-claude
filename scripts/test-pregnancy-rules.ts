// ---------------------------------------------------------------------------
// PREGNANCY: EXERCISE RULES (his ruling 14 Nov 2026, "Exercise rules only"; pregnancy-rules.ts). While "Pregnant" is
// ticked no plan holds a jumping or impact move or a move lying flat (back or front), each is replaced by one of the
// same kind, and a pick from the whole catalogue says so. Calories and food are untouched. One exit, at the bottom.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { EXERCISE_DATABASE, getExerciseEntry } from '../src/lib/exercise-db'
import { generateMesocycle, getConstrainedPool, getExerciseCompatibilityWarnings, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { pregnancyExclusion, PREGNANCY_IMPACT, PREGNANCY_LYING } from '../src/lib/pregnancy-rules'
import { detectPlanInvalidation } from '../src/lib/plan-invalidation'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildProfile, comboKey, generateAllCombinations } from './quality-grid'
import type { UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\n1. The lists, and nothing in the catalogue left undecided')
{
  const names = new Set(EXERCISE_DATABASE.map(e => e.name))
  const listed = [...PREGNANCY_IMPACT, ...PREGNANCY_LYING]
  check('every name on the lists is a real catalogue entry (a typo would exclude nothing)', listed.every(n => names.has(n)), listed.filter(n => !names.has(n)))
  // KEPT ON PURPOSE (CSCS): not flat — shoulders up on a bench, inclined, seated, standing or side-lying.
  const KEPT = new Set(['Incline Barbell Bench Press', 'Chest Press Machine', 'Machine Pullover', 'Side-Lying Hip Abduction', 'Cable Flyes',
    'Hip Thrust', 'Dumbbell Hip Thrust', 'Machine Hip Thrust', 'Smith Machine Hip Thrust', 'Mountain Climbers', 'Low Box Step-Up', 'Box Squat (Bodyweight)'])
  const IMPACT_WORDS = /\b(jump|jumps|jumping|plyo|burpees?|bounds?|hops?|skipping|sprints?|jacks?|box)\b/i
  const LYING_WORDS = /(floor press|bench press|skull|dead bug|crunch|pullover|lying|glute bridge|hip thrust|hollow|flyes?|sit-?up|leg raise|supine|prone)/i
  const undecided = EXERCISE_DATABASE.filter(e => (IMPACT_WORDS.test(e.name) || LYING_WORDS.test(e.name))
    && !pregnancyExclusion(e) && !KEPT.has(e.name) && !/^(Cable Crunch|Ab Crunch Machine|Hanging Leg Raises|Rear Delt Flyes|Cable Rear Delt Fly)$/.test(e.name)).map(e => e.name)
  check('a new entry the words would flag is decided here (left out, or kept on purpose)', undecided.length === 0, undecided)
  const flat = getExerciseEntry('Barbell Bench Press')!
  check('a variant or machine copy answers as the exercise it is a version of', pregnancyExclusion({ name: 'Paused Bench Press', parent: 'Barbell Bench Press' }) === 'lying' && pregnancyExclusion(flat) === 'lying' && pregnancyExclusion({ name: 'Incline Barbell Bench Press' }) === null)
}

console.log('\n2. Real plans: none while pregnant; the same plans hold them otherwise (so it binds)')
{
  const all = generateAllCombinations().filter((_, i) => i % 389 === 0)
  const t = [0, 1].map(() => ({ hits: 0, exercises: 0, emptyTraining: 0 }))
  for (const c of all) for (const preg of [false, true]) {
    const p = buildProfile(c) as UserProfile
    if (preg) p.health_conditions = ['pregnancy']
    setRandomSource(seededRngFromKey(comboKey(c)))
    let meso; try { meso = generateMesocycle(p) } finally { resetRandomSource() }
    const x = t[preg ? 1 : 0]
    for (const w of meso) for (const d of w.days) {
      if (d.exercises.length === 0 && !d.plannedActivity && !/rest|recovery/i.test(d.focus ?? '')) x.emptyTraining++
      for (const e of d.exercises) { x.exercises++; if (pregnancyExclusion(e as never)) x.hits++ }
    }
  }
  console.log(`     ${all.length} profiles — not pregnant ${JSON.stringify(t[0])}, pregnant ${JSON.stringify(t[1])}`)
  check('not pregnant: the plans hold these moves (binds)', t[0].hits > 0, t[0])
  check('pregnant: not one, in any week', t[1].hits === 0, t[1])
  check('...every slot filled: no more empty training days, and at least 97% of the exercises', t[1].emptyTraining <= t[0].emptyTraining && t[1].exercises >= t[0].exercises * 0.97, t)
}

console.log('\n3. Every road that chooses an exercise')
{
  const base = buildProfile(generateAllCombinations().find(c => c.equipment === 'full_gym')!) as UserProfile
  const pool = getConstrainedPool({ ...base, health_conditions: ['pregnancy'] } as UserProfile)
  check('the shared pool (swap list, add, session rebuild, coach swap) holds none', pool.length > 0 && pool.every(e => !pregnancyExclusion(e)), pool.filter(e => pregnancyExclusion(e)).map(e => e.name))
  check('...and does hold them for the same profile not pregnant (binds)', getConstrainedPool(base).some(e => pregnancyExclusion(e)))
  // A SLOT IS FILLED, NOT EMPTIED: measured 15 Nov 2026, without the replacement 146 of 1,317 sampled profiles lost every
  // bench-press-type move while pregnant. This one (minimal kit, sore shoulders) keeps one only through the replacement.
  const thin = buildProfile(generateAllCombinations().find(c => comboKey(c) === 'minimalist|shoulders|30-45|functional|beginner|hypertrophy|low|tolerate')!) as UserProfile
  const thinPool = getConstrainedPool({ ...thin, health_conditions: ['pregnancy'] } as UserProfile)
  check('a press left out is replaced by another press, so the pressing survives (minimal kit, sore shoulders)', thinPool.some(e => e.substitution_group === 'bench_press') && thinPool.every(e => !pregnancyExclusion(e)), thinPool.filter(e => e.movement_pattern === 'horizontal_push').map(e => e.name))
  const src = strip(fs.readFileSync('src/lib/exercise-plan.ts', 'utf8'))
  check('generation and the shared pool both run the pregnancy stage', (src.match(/pool = stagePregnancyFilter\(pool, equipmentOnly, isPregnant\(profile\), (throwaway|trace)\)/g) ?? []).length === 2)
  const w = getExerciseCompatibilityWarnings(getExerciseEntry('Box Jumps')!, { ...base, health_conditions: ['pregnancy'] } as UserProfile)
  check('a pick from the whole catalogue says the plan leaves it out', w.some(x => /jumping move: your plan leaves these out while you are pregnant/.test(x)) && !getExerciseCompatibilityWarnings(getExerciseEntry('Box Jumps')!, base).some(x => /pregnant/.test(x)), w)
}

console.log('\n4. The rebuild offer says it')
{
  const on = detectPlanInvalidation({ health_conditions: [] } as unknown as UserProfile, { health_conditions: ['pregnancy'] } as never)
  const off = detectPlanInvalidation({ health_conditions: ['pregnancy'] } as unknown as UserProfile, { health_conditions: [] } as never)
  const other = detectPlanInvalidation({ health_conditions: [] } as unknown as UserProfile, { health_conditions: ['heart_condition'] } as never)
  check('ticking Pregnant offers a rebuild that names the moves left out', /leaves out jumping moves and moves lying flat/.test(on?.detail ?? ''), on)
  check('...unticking names them coming back; another condition says neither', /brings back the jumping and lying-flat moves/.test(off?.detail ?? '') && !/jumping/.test(other?.detail ?? ''), { off, other })
}

console.log('\n5. The coach')
{
  const coach = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('the coach is told the plan leaves these out, never to suggest one, and that the pregnancy itself is the midwife\'s', /\$\{context\.pregnant \? `- THEY ARE PREGNANT\. Their plan leaves out every jumping or impact move and every move lying flat/.test(coach) && /midwife or GP/.test(coach))
  check('...and the chat tells it', /pregnant: healthConditionsOf\(profile\)\.includes\('pregnancy'\),/.test(fs.readFileSync('src/components/ChatAssistant.tsx', 'utf8')))
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:pregnancy-rules FAILED'); process.exit(1) }
console.log('While pregnant: no jumping, nothing lying flat, every slot filled, and the app says so.')
