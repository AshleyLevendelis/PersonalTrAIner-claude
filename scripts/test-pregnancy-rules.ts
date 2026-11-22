// ---------------------------------------------------------------------------
// PREGNANCY: EXERCISE RULES (his ruling 14 Nov 2026, "Exercise rules only"; pregnancy-rules.ts). While "Pregnant" is
// ticked no plan holds a jumping or impact move or a move lying flat (back or front), each is replaced by one of the
// same kind, and a pick from the whole catalogue says so. Calories and food are untouched. One exit, at the bottom.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { EXERCISE_DATABASE, getExerciseEntry } from '../src/lib/exercise-db'
import { generateMesocycle, getConstrainedPool, getExerciseCompatibilityWarnings, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { PREGNANCY_LATE_EXCLUDED, PELVIC_FLOOR_WARMUP_ITEM, pregnancyExclusion, pregnancyWarning, PREGNANCY_IMPACT, PREGNANCY_LYING, PREGNANCY_ABDOMINAL_STRAIN, PREGNANCY_REP_FLOOR } from '../src/lib/pregnancy-rules'
import { isContraindicatedFor, INJURED_JOINTS } from '../src/lib/exercise-db'
import { detectPlanInvalidation } from '../src/lib/plan-invalidation'
import { pregnancyWeeksOn } from '../src/lib/health-conditions'
import { getAppNow, getLocalDateString } from '../src/lib/dev-clock'
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
  check('every abdominal-strain name is a real catalogue entry', [...PREGNANCY_ABDOMINAL_STRAIN].every(n => names.has(n)))
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
      'Pallof Press', 'Barbell Reverse Lunge', 'Front Squat'],
    // Cable Crunch, Ab Crunch Machine, Hanging Leg Raises and Ab Wheel Rollout were kept here (not flat) until 21 Nov 2026,
    // when his "yes fix all three" left them out for a different reason: they strain the stomach wall (PREGNANCY_ABDOMINAL_STRAIN).
    'shoulders up on a bench, hips moving (a hip thrust is not flat)': ['Hip Thrust', 'Dumbbell Hip Thrust', 'Machine Hip Thrust', 'Smith Machine Hip Thrust'],
    'hands and feet on the floor, nothing lying on the front (push-up and plank positions)': ['Push-Ups', 'Incline Push-Ups', 'Deficit Push-Ups', 'Archer Push-Ups',
      'Knee Push-Ups', 'Wide Push-Ups', 'Close-Grip Push-Ups', 'Decline Push-Ups', 'Mountain Climbers', 'Plank', 'Plank Shoulder Taps', 'Bird Dog'],
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
  // RE-ANCHORED 21 Nov 2026: this was "minimal kit, SORE SHOULDERS", and it passed only through the leak fixed that day,
  // a replacement press that loads the sore shoulder. Now a replacement must clear the injury rule too, so that profile
  // has no press both rules allow (named in BACKLOG as the cost). The property, a lying press replaced by an upright
  // one, is held where an allowed press exists: the same minimal kit, no injury.
  const thinKey = 'minimalist|none|30-45|functional|beginner|hypertrophy|low|love'
  const thinCombo = generateAllCombinations().find(c => comboKey(c) === thinKey)
  check('the re-anchored fixture exists', !!thinCombo, thinKey)
  const thin = buildProfile(thinCombo ?? generateAllCombinations()[0]) as UserProfile
  const thinPool = getConstrainedPool({ ...thin, health_conditions: ['pregnancy'] } as UserProfile)
  const thinBase = getConstrainedPool(thin)
  check('...and binds: not pregnant, its bench-press group holds a lying press', thinBase.some(e => e.substitution_group === 'bench_press' && pregnancyExclusion(e)))
  check('a press left out is replaced by another press, so the pressing survives (minimal kit)', thinPool.some(e => e.substitution_group === 'bench_press') && thinPool.every(e => !pregnancyExclusion(e)), thinPool.filter(e => e.movement_pattern === 'horizontal_push').map(e => e.name))
  const sore = buildProfile(generateAllCombinations().find(c => comboKey(c) === 'minimalist|shoulders|30-45|functional|beginner|hypertrophy|low|tolerate')!) as UserProfile
  const sorePool = getConstrainedPool({ ...sore, health_conditions: ['pregnancy'] } as UserProfile)
  check('...and with sore shoulders, no replacement loads the shoulder', sorePool.every(e => !isContraindicatedFor(e, new Set(['shoulder']))), sorePool.filter(e => isContraindicatedFor(e, new Set(['shoulder']))).map(e => e.name))
  const src = strip(fs.readFileSync('src/lib/exercise-plan.ts', 'utf8'))
  check('generation and the shared pool both run the pregnancy stage', (src.match(/pool = stagePregnancyFilter\(pool, equipmentOnly, isPregnant\(profile\), (throwaway|trace), getFlaggedJoints\(profile\.injuries \|\| \[\]\)\)/g) ?? []).length === 2)
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

// ---------------------------------------------------------------------------
console.log('\n9. His "yes fix all three", 21 Nov 2026: an injury, heavy low reps, hard ab moves')
{
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const mum = (over: Partial<UserProfile>): UserProfile => ({
    age: 31, gender: 'female', height_cm: 166, weight_kg: 68, activity_level: 'lightly_active', fitness_goal: 'fat_loss',
    start_preference: 'train', equipment_access: 'full_gym', training_style: 'hybrid', training_experience: 'beginner',
    training_days: DAYS.map((d, i) => ({ day: d, available: [0, 2, 4].includes(i) })), session_duration_preference: '45-60',
    injuries: [], recovery_capacity: 'moderate', workout_split_preference: 'ai_recommendation', conditioning_preference: 'tolerate',
    health_conditions: ['pregnancy'], ...over,
  } as UserProfile)
  const planOf = (p: UserProfile, key: string) => { setRandomSource(seededRngFromKey(key)); const m = generateMesocycle(p); resetRandomSource(); return m }
  const all = (m: ReturnType<typeof generateMesocycle>) => m.flatMap(w => w.days.flatMap(d => d.exercises))

  // (1) Measured before: 64 of 64 pregnant plans with a back, knee, hip or wrist held a lift the injury rule forbids.
  for (const inj of [['lower_back'], ['knees'], ['hips'], ['wrists']]) {
    const flagged = new Set(inj.flatMap(i => INJURED_JOINTS[i]))
    for (const exp of ['beginner', 'advanced'] as const) {
      const bad = all(planOf(mum({ injuries: inj, training_experience: exp }), `pi${inj}${exp}`)).filter(e => { const en = getExerciseEntry(e.name); return en && isContraindicatedFor(en, flagged) })
      check(`pregnant, ${inj}, ${exp}: nothing the injury rule forbids`, bad.length === 0, [...new Set(bad.map(e => e.name))])
    }
    const pool = getConstrainedPool(mum({ injuries: inj })).filter(e => isContraindicatedFor(e, flagged))
    check(`pregnant, ${inj}: the swap shortlist agrees`, pool.length === 0, pool.map(e => e.name))
  }
  // The fixture binds: the same woman not pregnant is not given these either (the injury stage alone works), so the
  // leak was the pregnancy replacement; and a pregnancy replacement still happens (a lying move is replaced, not lost).
  const notPreg = all(planOf(mum({ injuries: ['lower_back'], health_conditions: [] }), 'pilower_backbeginner'))
  check('not pregnant, same back: nothing forbidden (the injury stage alone was always right)', notPreg.every(e => !isContraindicatedFor(getExerciseEntry(e.name)!, new Set(['lower_back_axial']))))

  // (2) No strength or power block, and 8 reps or more on every working set.
  for (const exp of ['intermediate', 'advanced'] as const) {
    const m = planOf(mum({ training_experience: exp, fitness_goal: 'hypertrophy' }), `strong${exp}`)
    check(`pregnant ${exp}: no strength or power block`, m.every(w => !/strength|power/i.test(w.phase_label ?? '')), [...new Set(m.map(w => w.phase_label))])
    const low = all(m).filter(e => getExerciseEntry(e.name)?.mechanics_tier !== 'primer' && /^\d+(-\d+)?$/.test(String(e.reps)) && Math.min(...String(e.reps).match(/\d+/g)!.map(Number)) < PREGNANCY_REP_FLOOR)
    check(`pregnant ${exp}: every working set is ${PREGNANCY_REP_FLOOR}+ reps`, low.length === 0, low.slice(0, 3).map(e => `${e.name} ${e.reps}`))
    const notM = planOf(mum({ training_experience: exp, fitness_goal: 'hypertrophy', health_conditions: [] }), `strong${exp}`)
    check(`not pregnant ${exp}: a strength block and sets under 8 (the fixture binds)`, notM.some(w => /strength/i.test(w.phase_label ?? ''))
      && all(notM).some(e => /^\d+(-\d+)?$/.test(String(e.reps)) && Math.min(...String(e.reps).match(/\d+/g)!.map(Number)) < 8))
  }
  check('the floor is 8', PREGNANCY_REP_FLOOR === 8)

  // (3) Hard ab moves are out, everywhere a pregnancy exclusion reaches, and anti-movement core stays.
  for (const n of ['Hanging Leg Raises', 'Ab Wheel Rollout', 'Russian Twist', 'Cable Crunch', 'Ab Crunch Machine']) {
    check(`${n}: left out while pregnant`, PREGNANCY_ABDOMINAL_STRAIN.has(n) && pregnancyExclusion({ name: n }) === 'abdominal' && !!getExerciseEntry(n))
  }
  for (const n of ['Bird Dog', 'Side Plank', 'Pallof Press', 'Plank']) check(`${n}: kept`, pregnancyExclusion({ name: n }) === null)
  const core = new Set<string>()
  for (const exp of ['intermediate', 'advanced'] as const) for (const style of ['hybrid', 'bodybuilding', 'functional'] as const)
    for (const e of all(planOf(mum({ training_experience: exp, training_style: style }), `core${exp}${style}`))) core.add(e.name)
  const strain = [...core].filter(n => PREGNANCY_ABDOMINAL_STRAIN.has(n))
  check('no hard ab move in six pregnant plans', strain.length === 0, strain)
  const coreNotPreg = new Set<string>()
  for (const exp of ['intermediate', 'advanced'] as const) for (const style of ['hybrid', 'bodybuilding', 'functional'] as const)
    for (const e of all(planOf(mum({ training_experience: exp, training_style: style, health_conditions: [] }), `core${exp}${style}`))) coreNotPreg.add(e.name)
  check('...where the same six not pregnant hold at least one (the fixture binds)', [...coreNotPreg].some(n => PREGNANCY_ABDOMINAL_STRAIN.has(n)))
  check('the search warning names it', /stomach wall/.test(pregnancyWarning('abdominal')))
  const w = getExerciseCompatibilityWarnings(getExerciseEntry('Hanging Leg Raises')!, mum({}))
  check('picking one from the whole catalogue says so', w.some(x => /stomach wall/.test(x)), w)
}

console.log('\n10. From 28 weeks, one notch lower: read at the date each PLAN week will be trained (21 Nov 2026)')
{
  // The week's date was worked out from the week inside its BLOCK (1-4), so every block's first week was dated today
  // and a woman 20 weeks pregnant had RPE 7-8 in plan weeks 13-15, at 32-35 weeks. Due 20 weeks after today's run.
  const today = getLocalDateString(getAppNow(undefined))
  const due = getLocalDateString(new Date(Date.parse(`${today}T12:00:00Z`) + 20 * 7 * 86_400_000))
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const p = { age: 30, gender: 'female', height_cm: 166, weight_kg: 66, activity_level: 'lightly_active', fitness_goal: 'functional',
    health_conditions: ['pregnancy'], due_date: due, start_preference: 'train', equipment_access: 'full_gym',
    training_days: DAYS.map(d => ({ day: d, available: ['Monday', 'Wednesday', 'Friday'].includes(d) })), session_duration_preference: '45-60',
    training_style: 'hybrid', training_experience: 'intermediate', injuries: [], recovery_capacity: 'moderate', workout_split_preference: 'ai_recommendation' } as unknown as UserProfile
  setRandomSource(seededRngFromKey('late28')); const m = generateMesocycle(p); resetRandomSource()
  const topRpe = (w: (typeof m)[number]) => Math.max(0, ...w.days.flatMap(d => d.exercises).map(e => { const r = String(e.intensity ?? '').match(/RPE\s*\d+(?:-(\d+))?/); const n = String(e.intensity ?? '').match(/RPE\s*(\d+)(?:-(\d+))?/); return n ? Number(n[2] ?? n[1]) : 0 }))
  const weekDate = (n: number) => getLocalDateString(new Date(Date.parse(`${today}T12:00:00Z`) + (n - 1) * 7 * 86_400_000))
  const late = m.filter(w => (pregnancyWeeksOn(due, weekDate(w.week_number)) ?? 0) >= 28)
  const early = m.filter(w => (pregnancyWeeksOn(due, weekDate(w.week_number)) ?? 0) < 28 && !w.is_deload)
  check('plan weeks past 28 weeks pregnant exist in this fixture', late.length >= 4, late.map(w => w.week_number))
  check('every one of them tops out at RPE 7', late.every(w => topRpe(w) <= 7), late.map(w => `${w.week_number}:${topRpe(w)}`))
  check('...while a week before 28 can still reach RPE 8 (the fixture binds)', early.some(w => topRpe(w) === 8), early.map(w => `${w.week_number}:${topRpe(w)}`))
}

console.log('\n11. His "yes fix all four", 21 Nov 2026: from 28 weeks, supported legs, no face-down work, weights held; pelvic floor always')
{
  const today = getLocalDateString(getAppNow(undefined))
  const dueIn = (weeks: number) => getLocalDateString(new Date(Date.parse(`${today}T12:00:00Z`) + weeks * 7 * 86_400_000))
  const weekDate = (n: number) => getLocalDateString(new Date(Date.parse(`${today}T12:00:00Z`) + (n - 1) * 7 * 86_400_000))
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const mum = (o: Record<string, unknown>) => ({ age: 30, gender: 'female', height_cm: 166, weight_kg: 66, activity_level: 'lightly_active', fitness_goal: 'functional',
    health_conditions: ['pregnancy'], due_date: dueIn(20), start_preference: 'train', equipment_access: 'full_gym',
    training_days: DAYS.map(d => ({ day: d, available: ['Monday', 'Wednesday', 'Friday'].includes(d) })), session_duration_preference: '45-60',
    training_style: 'hybrid', training_experience: 'intermediate', injuries: [], recovery_capacity: 'moderate', workout_split_preference: 'ai_recommendation', ...o } as unknown as UserProfile)
  const lateLeaks: string[] = [], earlyHeld: number[] = [], rising: string[] = [], noPelvic: string[] = [], missing: string[] = [], heavyDeload: string[] = []
  let earlyHolds = 0
  for (const eq of ['full_gym', 'home_gym', 'minimalist', 'bodyweight']) for (const style of ['hybrid', 'functional', 'bodybuilding']) for (const exp of ['novice', 'intermediate', 'advanced']) {
    setRandomSource(seededRngFromKey(`late${eq}${style}${exp}`))
    const m = generateMesocycle(mum({ equipment_access: eq, training_style: style, training_experience: exp })); resetRandomSource()
    const lastKg = new Map<string, number>()
    for (const w of m) {
      const late = (pregnancyWeeksOn(dueIn(20), weekDate(w.week_number)) ?? 0) >= 28
      // A block that only REACHES 28 weeks takes the late versions from its start, so "before" means a block wholly before.
      for (const d of w.days) {
        if (d.exercises.length > 0 && !d.warmup?.mobility.some(x => x.name === PELVIC_FLOOR_WARMUP_ITEM.name)) noPelvic.push(`${eq}/${style}/${exp} w${w.week_number} ${d.day}`)
        for (const e of d.exercises) {
          if (late && PREGNANCY_LATE_EXCLUDED.has(e.name)) lateLeaks.push(`${eq}/${style}/${exp} w${w.week_number} ${e.name}`)
          if (!late && w.week_number <= 4 && PREGNANCY_LATE_EXCLUDED.has(e.name)) earlyHolds++
          const kg = (e as { suggested_load_kg?: number }).suggested_load_kg
          if (late && !w.is_deload && kg != null) { const prev = lastKg.get(e.name); if (prev != null && kg > prev) rising.push(`${eq}/${style}/${exp} w${w.week_number} ${e.name} ${prev}->${kg}`) }
          // An easier week is never heavier than the lift's last loading week (the hold lowered week 15; the deload had
          // been worked out from the unheld number: a 12.5kg lat pulldown, then a 20kg deload).
          if (w.is_deload && kg != null) { const prev = lastKg.get(e.name); if (prev != null && kg > prev) heavyDeload.push(`${eq}/${style}/${exp} w${w.week_number} ${e.name} ${prev}->${kg}`) }
          if (!w.is_deload && kg != null) lastKg.set(e.name, kg)
        }
      }
      if (!w.is_deload) {
        const pats = new Set(w.days.flatMap(d => d.exercises.map(e => getExerciseEntry(e.name)?.movement_pattern)))
        if (!pats.has('knee_dominant') && !pats.has('single_leg')) missing.push(`${eq}/${style}/${exp} w${w.week_number} squat`)
      }
    }
  }
  check('no split-stance, single-leg or face-down exercise in any week from 28 weeks (36 plans)', lateLeaks.length === 0, lateLeaks.slice(0, 4))
  check('...while the first block (20-23 weeks) still holds some (the check binds, and early pregnancy is not narrowed)', earlyHolds > 0, earlyHolds)
  check('from 28 weeks no lift\'s weight rises between loading weeks', rising.length === 0, rising.slice(0, 4))
  check('no easier week is heavier than the lift\'s last loading week', heavyDeload.length === 0, heavyDeload.slice(0, 4))
  check('pelvic floor exercises in the warm-up of every training day', noPelvic.length === 0, noPelvic.slice(0, 3))
  check('every loading week still trains the legs', missing.length === 0, missing.slice(0, 3))
  setRandomSource(seededRngFromKey('pf-none'))
  const notPreg = generateMesocycle(mum({ health_conditions: [] })); resetRandomSource()
  check('...and nobody who is not pregnant gets them', notPreg.every(w => w.days.every(d => !d.warmup?.mobility.some(x => x.name === PELVIC_FLOOR_WARMUP_ITEM.name))))
  // Named here, not read from the list: a check that reads the list it guards cannot see a name taken off it.
  for (const n of ['Bulgarian Split Squats', 'Walking Lunges', 'Dumbbell Lateral Lunge', 'Dumbbell Reverse Lunge', 'Step-Ups',
    'Plank', 'Plank Shoulder Taps', 'Copenhagen Plank', 'Push-Ups', 'Decline Push-Ups', 'Pike Push-Ups', 'Mountain Climbers']) {
    check(`${n}: left out from 28 weeks`, PREGNANCY_LATE_EXCLUDED.has(n))
  }
  // A slot is REPLACED where something both rules allow exists, never just dropped: a minimalist kit keeps its pressing.
  {
    const pushes = (w: { days: { exercises: { name: string }[] }[] }) => w.days.reduce((n, d) => n + d.exercises.filter(e => ['horizontal_push', 'vertical_push'].includes(getExerciseEntry(e.name)?.movement_pattern ?? '') && getExerciseEntry(e.name)?.mechanics_tier !== 'primer').length, 0)
    setRandomSource(seededRngFromKey('lateminimalistbodybuildingnovice'))
    const mm = generateMesocycle(mum({ equipment_access: 'minimalist', training_style: 'bodybuilding', training_experience: 'novice' })); resetRandomSource()
    const earlyW = mm.find(w => w.week_number === 1)!, lateWs = mm.filter(w => !w.is_deload && (pregnancyWeeksOn(dueIn(20), weekDate(w.week_number)) ?? 0) >= 28)
    check('a minimalist kit keeps its pressing from 28 weeks (replaced, not dropped)', lateWs.length > 0 && lateWs.every(w => pushes(w) >= pushes(earlyW)), { early: pushes(earlyW), late: lateWs.map(pushes) })
  }
  check('every late-excluded name is a real catalogue entry', [...PREGNANCY_LATE_EXCLUDED].every(n => !!getExerciseEntry(n)), [...PREGNANCY_LATE_EXCLUDED].filter(n => !getExerciseEntry(n)))
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:pregnancy-rules FAILED'); process.exit(1) }
console.log('While pregnant: no jumping, nothing lying flat, every slot filled, and the app says so.')
