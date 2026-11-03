// ---------------------------------------------------------------------------
// test:near-copies: LOG-ONLY NEAR-COPIES (3 Nov 2026; Ashley's ruling "Searchable, log-only", from three options, and
// her "then build the log-only near-copies"; docs/plans/log-only-near-copies.md).
//
// A near-copy (a paused squat, a wide-grip pulldown) is never prescribed, but is found in search and logged under its
// own name. Holds: (1) every row builds from a real parent and copies its kit and joints; (2) it reaches NOTHING that
// builds or edits a plan (the catalogue, every pool, generated plans, the pickers' and the ban resolver's searches,
// the swap and add writers, the coach's executor); (3) it IS findable and loggable (the logging search, the name
// lookup, its own history id, the chat logger's exact name) without turning an existing name ambiguous; (4) the
// injury, kit and ban marks a search row shows reach it through its parent.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { NEAR_COPIES } from '../src/lib/exercise-near-copies'
import {
  EXERCISE_DATABASE, getExerciseEntry, getExerciseId, slugifyExerciseName, logOnlyExercises, contraindicatedJoints,
  searchExerciseCatalog, searchExerciseCatalogByWords, searchExercisesToLog,
} from '../src/lib/exercise-db'
import { getConstrainedPool, generateMesocycle, getExerciseCompatibilityWarnings, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { swapExerciseInMesocycle } from '../src/lib/mesocycle-edit'
import { addExerciseToSession } from '../src/lib/session-edit'
import { executeExerciseSwap } from '../src/lib/pending-action-executor'
import { resolveExerciseTarget } from '../src/lib/fact-compiler'
import { resolveExerciseName } from '../src/lib/set-parse'
import { canHoldRecord } from '../src/lib/pr-engine'
import { logOnlyRefusal } from '../src/lib/coach-voice'
import type { UserProfile, TrainingStyle, FitnessGoal, TrainingExperience, EquipmentAccess } from '../src/lib/types'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 400)}`) }
}
const quiet = <T,>(f: () => T): T => {
  const o = { log: console.log, warn: console.warn, error: console.error, debug: console.debug }
  console.log = console.warn = console.error = console.debug = () => {}
  try { return f() } finally { Object.assign(console, o) }
}
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const person = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 32, gender: 'female', height_cm: 168, weight_kg: 68, activity_level: 'moderate', fitness_goal: 'hypertrophy',
  preferred_time: 'evening', bmr: 1500, tdee: 2200, equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
  training_days: DAYS.map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...over,
}) as unknown as UserProfile

const copies = logOnlyExercises()
const copyNames = new Set(copies.map(c => c.name.toLowerCase()))

console.log('\n1. Every near-copy is built from a real parent, and copies what keeps it safe')
{
  check(`every row of the table builds (${copies.length} of ${NEAR_COPIES.length})`, NEAR_COPIES.length >= 80 && copies.length === NEAR_COPIES.length,
    NEAR_COPIES.filter(([n]) => !copyNames.has(n.toLowerCase())).map(([n, p]) => `${n} <- ${p}`))
  const dupes = NEAR_COPIES.map(([n]) => n.toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i)
  check('...no name twice, and none the catalogue already holds', dupes.length === 0 && !copies.some(c => EXERCISE_DATABASE.some(e => e.name.toLowerCase() === c.name.toLowerCase())), dupes)
  const wrong: string[] = []
  for (const c of copies) {
    const p = EXERCISE_DATABASE.find(e => e.name === c.parent)
    if (!p) { wrong.push(`${c.name}: no parent ${c.parent}`); continue }
    if (!c.log_only) wrong.push(`${c.name}: not marked log-only`)
    // THE SLUG, NOT THE PARENT'S ID: the coach's function logs a set under the slug of the name it was given.
    if (c.id !== slugifyExerciseName(c.name) || c.id === p.id) wrong.push(`${c.name}: id ${c.id}`)
    if (JSON.stringify(c.equipment) !== JSON.stringify(p.equipment) || JSON.stringify(c.equipment_alternatives ?? null) !== JSON.stringify(p.equipment_alternatives ?? null)) wrong.push(`${c.name}: kit differs`)
    if (JSON.stringify(contraindicatedJoints(c)) !== JSON.stringify(contraindicatedJoints(p)) || JSON.stringify(c.indicated_joints ?? null) !== JSON.stringify(p.indicated_joints ?? null)) wrong.push(`${c.name}: joints differ`)
    if (c.mechanics_tier !== p.mechanics_tier || c.prescription_type !== p.prescription_type || c.movement_pattern !== p.movement_pattern) wrong.push(`${c.name}: tier, type or pattern differs`)
  }
  check('each has its own slug id and its parent\'s kit, joints, tier, type and pattern', wrong.length === 0, wrong.slice(0, 5))
  check('...and none is a primer or cardio, so a set logged under one can hold a personal best', copies.every(c => canHoldRecord(c.name)), copies.filter(c => !canHoldRecord(c.name)).map(c => c.name))
}

console.log('\n2. Nothing that builds or edits a plan can reach one')
{
  check('the catalogue every pool, rotation and gate iterates holds none', !EXERCISE_DATABASE.some(e => e.log_only || copyNames.has(e.name.toLowerCase())))
  const leaked = new Set<string>()
  let pools = 0
  for (const style of ['bodybuilding', 'functional', 'hybrid', 'combat'] as TrainingStyle[])
    for (const equipment_access of ['full_gym', 'home_gym', 'minimalist'] as EquipmentAccess[]) {
      pools++
      for (const e of quiet(() => getConstrainedPool(person({ training_style: style, equipment_access }), []))) if (e.log_only) leaked.add(e.name)
    }
  check(`no constrained pool holds one (${pools} pools)`, pools === 12 && leaked.size === 0, [...leaked])
  let plans = 0
  for (const goal of ['hypertrophy', 'fat_loss', 'functional'] as FitnessGoal[])
    for (const training_experience of ['beginner', 'advanced'] as TrainingExperience[]) {
      setRandomSource(seededRngFromKey(`near|${goal}|${training_experience}`))
      try {
        for (const w of quiet(() => generateMesocycle(person({ fitness_goal: goal, training_experience })))) for (const d of w.days) for (const x of d.exercises) if (copyNames.has(x.name.toLowerCase())) leaked.add(x.name)
        plans++
      } finally { resetRandomSource() }
    }
  check(`no generated plan prescribes one (${plans} seeded plans, every week)`, plans === 6 && leaked.size === 0, [...leaked])
  // THE PICKERS AND THE BAN RESOLVER keep the plan-only searches: asked for each near-copy by its exact name.
  const pickerHits = copies.filter(c => searchExerciseCatalogByWords(c.name, 50).some(e => e.log_only) || searchExerciseCatalog(c.name, 50).some(e => e.log_only)).map(c => c.name)
  check('the swap and add pickers\' search never offers one, even typed exactly', pickerHits.length === 0, pickerHits)
  const banHits = copies.filter(c => { const r = resolveExerciseTarget(c.name); return r.resolution === 'resolved' && r.resolvedRefs.some(n => copyNames.has(n.toLowerCase())) }).map(c => c.name)
  check('...nor the ban resolver, so banning a lift never bans a near-copy by a looser phrase', banHits.length === 0, banHits)

  // THE WRITERS: the plan after the attempt is the plan before it.
  const p = person()
  setRandomSource(seededRngFromKey('near|writers'))
  const meso = quiet(() => generateMesocycle(p))
  resetRandomSource()
  const week = meso[0], day = week.days.find(d => d.exercises.length > 2)!
  // From the built list, not the lookup, so these checks still run (and fail) if the lookup loses near-copies.
  const paused = copies.find(c => c.name === 'Paused Bench Press')!
  const swapped = await quiet(() => swapExerciseInMesocycle({ mesocycle: meso, profile: p, currentWeekNumber: week.week_number, dayName: day.day, exIndex: 1, newExercise: paused, scope: 'permanent' }))
  check('a swap to a near-copy changes nothing, on any route (the one writer every swap ends in)', swapped === meso && !JSON.stringify(swapped).includes('Paused Bench Press'))
  const added = addExerciseToSession({ mesocycle: meso, profile: p, weekNumber: week.week_number, dayName: day.day, entry: paused, load: null, scope: 'today' } as never)
  check('an addition of one is refused, in the app\'s own sentence', !added.changed && added.refusal === logOnlyRefusal(paused), added.refusal)
  const exec = await quiet(() => executeExerciseSwap(p, meso, { weekNumber: week.week_number, dayName: day.day, exIndex: 1, oldExerciseName: day.exercises[1].name, newExerciseName: 'Paused Bench Press', scope: 'today' }))
  check('the coach\'s confirmed swap of one lands nothing and says why', exec.mesocycle === meso && exec.receipt.landed.length === 0 && exec.receipt.failed[0]?.error === logOnlyRefusal(paused), exec.receipt)
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const chat = strip(readFileSync(new URL('../src/components/ChatAssistant.tsx', import.meta.url), 'utf8'))
  const guard = chat.indexOf('if (newEntry.log_only) return { ok: false, reason: logOnlyRefusal(newEntry) }')
  const card = chat.indexOf('const payload: ExerciseSwapPayload = {')
  check('the coach\'s swap card refuses one BEFORE a card is built (source; the executor above is the behaviour)', guard > 0 && card > 0 && guard < card, { guard, card })
  check('the refusal names the lift that does go in a plan', logOnlyRefusal(paused) === "Paused Bench Press is one to log, not to plan: it's a version of Barbell Bench Press, which is the one that goes in a plan.", logOnlyRefusal(paused))
}

console.log('\n3. Found, and logged under its own name')
{
  const found = searchExercisesToLog('paused bench', 8).map(e => e.name)
  check('the logging search finds one by its own words ("paused bench")', found.includes('Paused Bench Press'), found)
  const wide = searchExercisesToLog('wide grip pulldown', 8).map(e => e.name)
  check('...by every typed word, punctuation aside ("wide grip pulldown")', wide.includes('Wide-Grip Lat Pulldown'), wide)
  const bench = searchExercisesToLog('bench', 8)
  const firstCopy = bench.findIndex(e => e.log_only), lastPlan = bench.map(e => !e.log_only).lastIndexOf(true)
  check('...and a plan exercise always ranks above every near-copy', bench.length > 0 && (firstCopy === -1 || lastPlan < firstCopy), bench.map(e => e.name))
  check('the name lookup resolves one, so history, its box and its marks all read the parent\'s shape', getExerciseEntry('wide-grip lat pulldown')?.parent === 'Lat Pulldown')
  check('...and its sets go under its own id, the slug the coach also writes, never the parent\'s', getExerciseId('Wide-Grip Lat Pulldown') === 'wide-grip-lat-pulldown' && getExerciseId('Lat Pulldown') !== getExerciseId('Wide-Grip Lat Pulldown'))
  const exact = resolveExerciseName('Pendlay Row', [])
  check('the chat logger resolves one said exactly', exact.resolution === 'resolved' && exact.exerciseName === 'Pendlay Row', exact)
  // NO NAME THAT RESOLVED BEFORE TURNS AMBIGUOUS: every parent, said by its own name, still resolves to itself.
  const parents = [...new Set(copies.map(c => c.parent!))]
  const moved = parents.filter(n => { const r = resolveExerciseName(n, []); return !(r.resolution === 'resolved' && r.exerciseName === n) })
  check(`every parent still resolves to itself (${parents.length})`, parents.length >= 30 && moved.length === 0, moved)
}

console.log('\n4. The marks reach it through its parent')
{
  // Through the LOOKUP, as the logging screen reaches them: a lookup that lost near-copies fails here, never throws.
  const marks = (name: string, who: UserProfile, bans: string[] = []) => { const e = getExerciseEntry(name); return e ? getExerciseCompatibilityWarnings(e, who, bans) : ['(not found)'] }
  const knee = marks('Deficit Reverse Lunge', person({ injuries: ['knees'] }))
  check('a knee injury marks a near-copy of a lunge, as it marks the lunge', knee.some(w => /flagged an injury/.test(w)), knee)
  const home = marks('Wide-Grip Lat Pulldown', person({ equipment_access: 'minimalist' }))
  check('...kit marks too (a pulldown machine at home)', home.some(w => /^Needs /.test(w)), home)
  const ban = marks('Paused Bench Press', person(), ['Barbell Bench Press'])
  check('...and a banned parent marks its versions', ban.includes("You've banned Barbell Bench Press, and this is a version of it."), ban)
  const clean = marks('Paused Bench Press', person(), [])
  check('...while nothing marks it when nothing applies', clean.length === 0, clean)
}

console.log('\n5. The logging screen calls the logging search, and passes what the marks need')
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const sheet = strip(readFileSync(new URL('../src/components/exercise/AddUnplannedWork.tsx', import.meta.url), 'utf8'))
  check('AddUnplannedWork lists searchExercisesToLog( results (the driver is verify:near-copies)', /searchExercisesToLog\(/.test(sheet) && /data-testid="log-suggestion"/.test(sheet))
  const today = strip(readFileSync(new URL('../src/components/exercise/TodayPanel.tsx', import.meta.url), 'utf8'))
  check('...and Today hands it her profile and bans', /<AddUnplannedWork[\s\S]{0,400}profile=\{profile\}[\s\S]{0,80}exclusions=\{exclusions\}/.test(today))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} near-copies check(s) failed`); process.exit(1) }
console.log('near-copies: all checks passed')
