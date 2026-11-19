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
  // READ BY POSITION, NOT ONLY BY NAME (18 Nov 2026). The first version of this check asked only about names, and a
  // flat bench press called "Neutral-Grip Dumbbell Press" went into a pregnant trainee's plan. An entry is now asked
  // about when its NAME, its own FORM CUES, or the GROUP it substitutes in suggests lying down or leaving the floor,
  // and every one asked about is decided: left out (the lists), or kept here on purpose with the reason it is kept.
  const KEPT: Record<string, string[]> = {
    'inclined, seated or standing, not flat': ['Incline Barbell Bench Press', 'Incline Dumbbell Press', 'Incline Machine Press', 'Chest Press Machine',
      'Cable Flyes', 'Pec Deck Machine', 'Machine Pullover', 'Straight-Arm Pulldown', 'Single-Arm Band Pulldown', 'Incline Dumbbell Curls',
      'Seated Machine Row', 'Seated Band Leg Curl', 'Seated Leg Curl', 'Iso-Lateral Kneeling Leg Curl', 'Seated Dip Machine', 'Machine Tricep Extension',
      'Smith Machine Shoulder Press', 'Rear Delt Flyes', 'Glute Kickback Machine', 'Cable Glute Kickback', 'Multi-Hip Machine', 'Hip Abduction Machine',
      'Pallof Press', 'Cable Crunch', 'Ab Crunch Machine', 'Hanging Leg Raises', 'Barbell Reverse Lunge', 'Front Squat'],
    'shoulders up on a bench, hips moving (a hip thrust is not flat)': ['Hip Thrust', 'Dumbbell Hip Thrust', 'Machine Hip Thrust', 'Smith Machine Hip Thrust'],
    'hands and feet on the floor, nothing lying on the front (push-up and plank positions)': ['Push-Ups', 'Incline Push-Ups', 'Deficit Push-Ups', 'Archer Push-Ups',
      'Knee Push-Ups', 'Wide Push-Ups', 'Close-Grip Push-Ups', 'Decline Push-Ups', 'Mountain Climbers', 'Plank', 'Plank Shoulder Taps', 'Ab Wheel Rollout', 'Bird Dog'],
    'side-lying or side-on': ['Side-Lying Hip Abduction', 'Clamshell', 'Side Plank', 'Copenhagen Plank'],
    'a step onto a box, not a jump': ['Low Box Step-Up', 'Box Squat (Bodyweight)'],
  }
  const kept = new Set(Object.values(KEPT).flat())
  const IMPACT_WORDS = /\b(jump|jumps|jumping|plyo|burpees?|bounds?|hops?|skipping|sprints?|jacks?|box|slams?|high knees)\b/i
  const LYING_WORDS = /(floor press|bench press|skull|dead bug|crunch|pullover|lying|glute bridge|hip thrust|hollow|flyes?|sit-?up|leg raise|supine|prone)/i
  const CUE_WORDS = /\b(lie|lying|lay|supine|prone|face[- ]down|on the pad|against the pad|flat bench|torso flat|under (a|the) (bar|table|sturdy)|straight line under|run on the spot|slam)\b/i
  const POSITION_GROUPS = new Set(['bench_press', 'fly_isolation', 'leg_curl', 'hip_thrust', 'core_dynamic', 'core_stability', 'lat_isolation', 'explosive_upper', 'explosive_lower'])
  const asksAbout = (e: (typeof EXERCISE_DATABASE)[number]) => IMPACT_WORDS.test(e.name) || LYING_WORDS.test(e.name)
    || CUE_WORDS.test([...(e.form_cues ?? []), e.coach_note_swap ?? ''].join(' ')) || POSITION_GROUPS.has(e.substitution_group)
  const undecided = EXERCISE_DATABASE.filter(e => asksAbout(e) && !pregnancyExclusion(e) && !kept.has(e.name)).map(e => e.name)
  check('every entry whose name, cues or group suggests lying down or jumping is decided here (left out, or kept on purpose)', undecided.length === 0, undecided)
  // PROVE THE DETECTOR ON KNOWN POSITIVES: it must ask about every move already on the lists, or it could not have
  // found them. (The name-only detector fails this on eleven of the moves added on 18 Nov.)
  const missedByDetector = listed.filter(n => !asksAbout(getExerciseEntry(n)!))
  check('...and the detector would have asked about every move on the lists', missedByDetector.length === 0, missedByDetector)
  check('nothing is both kept and left out, and every kept name is a real entry', [...kept].every(n => names.has(n) && !pregnancyExclusion({ name: n })), [...kept].filter(n => !names.has(n) || pregnancyExclusion({ name: n })))
  check('the flat presses a name alone does not give away are left out', ['Neutral-Grip Dumbbell Press', 'Dumbbell Squeeze Press'].every(n => pregnancyExclusion({ name: n }) === 'lying'))
  check('...and so are the moves lying face down on a pad or bench', ['Chest-Supported Row', 'T-Bar Row Machine', 'Reverse Hyper Machine', 'Back Extension Machine', 'Dumbbell Leg Curl'].every(n => pregnancyExclusion({ name: n }) === 'lying'))
  check('...the rows hung face-up under a bar or table, and the floor leg curls', ['Inverted Row', 'Table Row', 'Sliding Leg Curl', 'Single-Leg Sliding Leg Curl'].every(n => pregnancyExclusion({ name: n }) === 'lying'))
  check('...running on the spot and the ball slam are impact', ['High Knees', 'Medicine Ball Slams'].every(n => pregnancyExclusion({ name: n }) === 'impact'))
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
