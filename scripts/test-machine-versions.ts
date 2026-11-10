// ---------------------------------------------------------------------------
// MACHINE VERSIONS ARE SWAPPABLE, PRICED AS THEIR PARENT, AND NEVER GENERATED (4 Nov 2026; Ashley's ruling "Machines
// swappable only", after "I've been in the gyms used machines which were not available as swaps in the app").
//
// What can go wrong, each held below:
//   1. a row that is not a machine version (a free-weight name, a one-sided name under kit not priced per side), or a
//      machine version left behind in the log-only table;
//   2. a version only after the lazy chunk lands, so a plan holding one fails to resolve on the first screen;
//   3. a version priced or grouped by its OWN name rather than its parent's (measured before the fix: a V-squat at
//      45 kg against the hack squat's 97.5 in the same slot), or one-sided and handed the two-sided number;
//   4. a version in a generated plan, a pool, the strict resolver or the ban resolver;
//   5. the swap and add pickers, the writers or the coach refusing one, or the plan's readers losing it after a swap.
// The phone half is verify:machine-swap.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import {
  EXERCISE_DATABASE, getExerciseEntry, getExerciseId, slugifyExerciseName, machineVersions, logOnlyExercises,
  contraindicatedJoints, getMovementFamily, searchExerciseCatalog, searchExerciseCatalogByWords, searchExercisesToLog,
} from '../src/lib/exercise-db'
import { MACHINE_VERSIONS } from '../src/lib/exercise-machine-versions'
import { NEAR_COPIES } from '../src/lib/exercise-near-copies'
import { categorize, isPerSideLoad, prescribeLoad } from '../src/lib/load-prescription'
import { getConstrainedPool, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { swapExerciseInMesocycle } from '../src/lib/mesocycle-edit'
import { addExerciseToSession } from '../src/lib/session-edit'
import { executeExerciseSwap } from '../src/lib/pending-action-executor'
import { resolveExerciseTarget } from '../src/lib/fact-compiler'
import { estimateDaySeconds } from '../src/lib/session-duration'
import { machineVersionLine } from '../src/lib/coach-voice'
import { swapNameFallback } from '../src/lib/swap-name-fallback'
import { resolveExerciseName } from '../src/lib/set-parse'
import { ensureNearCopies } from '../src/lib/near-copies-loader'
import type { UserProfile, TrainingStyle, FitnessGoal, TrainingExperience, EquipmentAccess, MesocycleWeek } from '../src/lib/types'

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
const quietAsync = async <T,>(f: () => Promise<T>): Promise<T> => {
  const o = { log: console.log, warn: console.warn, error: console.error, debug: console.debug }
  console.log = console.warn = console.error = console.debug = () => {}
  try { return await f() } finally { Object.assign(console, o) }
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
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// THE ADMISSION RULE, written here independently of the table's own build, so the two can disagree.
const MACH = /machine|selector|plate[- ]loaded|lever|hammer strength|iso[- ]lateral|smith|cable|pulley|pec deck|leg press|hack squat|leg extension|leg curl|pulldown|converging|diverging|pin[- ]selected/i
const FREE = /barbell|dumbbell|kettlebell|\bband(ed)?\b|bodyweight|landmine|trap bar/i
const ONE = /single[- ](arm|leg)|one[- ](arm|leg)|unilateral|\b1[- ](arm|leg)|iso[- ]lateral/i
const STACK = new Set(['cable machine', 'machine', 'leg press machine', 'hack squat machine'])
const byName = new Map(EXERCISE_DATABASE.map(e => [e.name, e]))
function admits(name: string, parentName: string): string | null {
  const p = byName.get(parentName)
  if (!p) return 'no such parent'
  if (!p.equipment.some(q => /machine/.test(q))) return 'parent needs no machine'
  // A free weight in the name is never a machine version, whatever else it says ("Barbell Hack Squat" is a barbell
  // behind the legs, not the hack machine; a mutation adding that row was MISSED until this line).
  if (FREE.test(name) || !(MACH.test(name) || p.equipment.every(q => /machine/.test(q)))) return 'name is a free-weight lift'
  if (ONE.test(name) && !p.unilateral && !p.equipment.some(q => STACK.has(q))) return 'one-sided under kit not priced per side'
  // A LEVER SQUAT has no price category (the machine pack, 3 Nov): priced as a hack squat it could be handed far too much.
  if (/pendulum|super squat/i.test(name)) return 'no price category fits it'
  return null
}

console.log('\nMACHINE VERSIONS: SWAPPABLE, PRICED AS THEIR PARENT, NEVER GENERATED\n')

// 2 FIRST, because order is the point: BEFORE the lazy chunk is fetched.
console.log('2. Present with the app, before the log-only table is fetched')
check('a machine version resolves before the near-copy chunk lands (a plan holding one opens on the first screen)',
  logOnlyExercises().length === 0 && getExerciseEntry('V-Squat Machine')?.parent === 'Hack Squat', getExerciseEntry('V-Squat Machine')?.name)
check('...and the swap search finds one then too', searchExerciseCatalogByWords('v-squat', 20).some(e => e.name === 'V-Squat Machine'))
await ensureNearCopies()

const versions = machineVersions()
const versionNames = new Set(versions.map(v => v.name.toLowerCase()))

console.log('\n1. Every row is a machine version, and none is left behind in the log-only table')
{
  check(`every row builds (${versions.length} of ${MACHINE_VERSIONS.length})`, MACHINE_VERSIONS.length >= 450 && versions.length === MACHINE_VERSIONS.length,
    MACHINE_VERSIONS.filter(([n]) => !versionNames.has(n.toLowerCase())).map(r => r.join(' <- ')))
  const dupes = MACHINE_VERSIONS.map(([n]) => n.toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i)
  const clash = MACHINE_VERSIONS.filter(([n]) => byName.has(n) || NEAR_COPIES.some(([c]) => c.toLowerCase() === n.toLowerCase())).map(([n]) => n)
  check('...no name twice, none the catalogue or the log-only table holds', dupes.length === 0 && clash.length === 0, { dupes, clash })
  const refused = MACHINE_VERSIONS.map(([n, p]) => [n, p, admits(n, p)]).filter(r => r[2])
  check('every row passes the rule: a machine parent, a machine name, one-sided only where priced per side', refused.length === 0, refused.slice(0, 6))
  const leftBehind = NEAR_COPIES.filter(([n, p]) => admits(n, p) === null).map(r => r.join(' <- '))
  check('...and no log-only row passes it, so a machine she is standing at is never stuck as log-only', leftBehind.length === 0, leftBehind.slice(0, 6))
  // THE RULE BINDS: rows it refuses exist on both sides of each clause, in her own lists.
  check('the rule refuses real rows of her lists (proving it is not vacuous)',
    admits('Barbell Hyperextension (Weighted)', 'Back Extension Machine') === 'name is a free-weight lift'
    && admits('Abduction Machine (Iso-Lateral)', 'Hip Abduction Machine') === 'one-sided under kit not priced per side'
    && admits('Paused Bench Press', 'Barbell Bench Press') === 'parent needs no machine'
    && admits('Barbell Hack Squat (Behind the Back Barbell)', 'Hack Squat') === 'name is a free-weight lift'
    && admits('Pendulum Squat Machine', 'Hack Squat') === 'no price category fits it')
  const pendulum = getExerciseEntry('Pendulum Squat Machine')
  check('a pendulum squat is loggable but never a swap option (log-only, absent from the swap search)', pendulum?.log_only === true && !searchExerciseCatalogByWords('pendulum', 20).some(e => /pendulum/i.test(e.name)), pendulum?.name)
}

console.log('\n3. Built from the parent: its joints, the machine kit, its style; one-sided by name; its own id')
{
  const wrong: string[] = []
  for (const v of versions) {
    const p = byName.get(v.parent!)!
    if (v.log_only) wrong.push(`${v.name}: marked log-only`)
    if (v.id !== slugifyExerciseName(v.name) || v.id === p.id) wrong.push(`${v.name}: id ${v.id}`)
    if (JSON.stringify(contraindicatedJoints(v)) !== JSON.stringify(contraindicatedJoints(p)) || JSON.stringify(v.loads_joints ?? null) !== JSON.stringify(p.loads_joints ?? null)) wrong.push(`${v.name}: joints differ`)
    const kit = p.equipment.filter(q => !['dumbbell', 'dumbbells', 'barbell', 'kettlebell', 'resistance band', 'bodyweight'].includes(q))
    if (JSON.stringify(v.equipment) !== JSON.stringify(kit.length ? kit : p.equipment)) wrong.push(`${v.name}: kit ${v.equipment}`)
    if (v.unilateral !== (p.unilateral || ONE.test(v.name))) wrong.push(`${v.name}: one-sided ${v.unilateral}`)
    if (JSON.stringify(v.style_tags) !== JSON.stringify(p.style_tags)) wrong.push(`${v.name}: style`)
    if (v.mechanics_tier !== p.mechanics_tier || v.movement_pattern !== p.movement_pattern || v.prescription_type !== p.prescription_type) wrong.push(`${v.name}: tier, pattern or type`)
  }
  check('each: not log-only, own slug id, parent\'s joints, tier, pattern, style; the machine kit; one-sided by name', wrong.length === 0, wrong.slice(0, 6))
  const mixed = getExerciseEntry('Cable Single-Arm Overhead Extension')
  check('a cable version of a dumbbell-or-cable parent needs the cable, not a dumbbell', JSON.stringify(mixed?.equipment) === '["cable machine"]', mixed?.equipment)
  check('its sets go under its own id, the slug the coach also writes', getExerciseId('V-Squat Machine') === 'v-squat-machine')
}

console.log('\n4. Priced and grouped as its parent; one-sided ones per side')
{
  const cat: string[] = [], fam: string[] = [], side: string[] = [], price: string[] = []
  const who = person({ training_experience: 'intermediate', gender: 'male', weight_kg: 82 })
  for (const v of versions) {
    const p = byName.get(v.parent!)!
    if (categorize(v) !== categorize(p)) cat.push(`${v.name}: ${categorize(v)} vs ${categorize(p)}`)
    if (getMovementFamily(v) !== getMovementFamily(p)) fam.push(v.name)
    const newlyOneSided = v.unilateral && !p.unilateral
    if (isPerSideLoad(v) !== (isPerSideLoad(p) || newlyOneSided)) side.push(v.name)
    // A MIXED PARENT ("dumbbell or cable") is priced on the version's machine kit: one cable stack, not a dumbbell in
    // each hand. Everything else about the price is the parent's.
    const a = quiet(() => prescribeLoad({ ...p, equipment: v.equipment }, who, { reps: 10, rpe: 8 } as never)).starting_weight_kg
    const b = quiet(() => prescribeLoad(v, who, { reps: 10, rpe: 8 } as never)).starting_weight_kg
    if (a == null ? b != null : newlyOneSided ? !(b != null && b < a && b >= a / 2 - 2.5) : b !== a) price.push(`${v.name}: ${b} vs ${p.name} ${a}`)
  }
  check('every version is in its parent\'s price category', cat.length === 0, cat.slice(0, 5))
  check('...and its movement family (so coherence and repeats treat a V-squat beside a hack squat as one movement)', fam.length === 0, fam.slice(0, 5))
  check('...priced per side exactly when the parent is, or when its own name says one arm, one leg or iso-lateral', side.length === 0, side.slice(0, 5))
  check('...so its starting weight is the parent\'s, or about half of it for a newly one-sided one', price.length === 0 && versions.some(v => v.unilateral && !byName.get(v.parent!)!.unilateral), price.slice(0, 5))
}

console.log('\n5. Never generated, never resolved by a looser phrase')
{
  check('the catalogue the generator reads holds none', !EXERCISE_DATABASE.some(e => versionNames.has(e.name.toLowerCase())))
  const leaked = new Set<string>()
  let pools = 0, plans = 0
  for (const style of ['bodybuilding', 'functional', 'hybrid', 'combat'] as TrainingStyle[])
    for (const equipment_access of ['full_gym', 'home_gym'] as EquipmentAccess[]) {
      pools++
      for (const e of quiet(() => getConstrainedPool(person({ training_style: style, equipment_access }), []))) if (versionNames.has(e.name.toLowerCase())) leaked.add(e.name)
    }
  for (const goal of ['hypertrophy', 'fat_loss', 'functional'] as FitnessGoal[])
    for (const training_experience of ['beginner', 'advanced'] as TrainingExperience[]) {
      setRandomSource(seededRngFromKey(`mv|${goal}|${training_experience}`))
      try { for (const w of quiet(() => generateMesocycle(person({ fitness_goal: goal, training_experience })))) for (const d of w.days) for (const x of d.exercises) if (versionNames.has(x.name.toLowerCase())) leaked.add(x.name); plans++ } finally { resetRandomSource() }
    }
  check(`no pool (${pools}) and no seeded plan (${plans}, every week) holds one`, pools === 8 && plans === 6 && leaked.size === 0, [...leaked])
  const strict = versions.filter(v => searchExerciseCatalog(v.name, 50).some(e => versionNames.has(e.name.toLowerCase()))).map(v => v.name)
  check('the strict search (the ban and logged-set resolvers) never returns one', strict.length === 0, strict.slice(0, 5))
  const bans = ['leg press', 'lat pulldown', 'chest press', 'hack squat'].filter(w => { const r = resolveExerciseTarget(w); return r.resolvedRefs.some(n => versionNames.has(n.toLowerCase())) })
  check('...so banning "leg press" bans the catalogue lift, not forty machines', bans.length === 0, bans)
}

console.log('\n6. Found by her words, and swapped, added and confirmed through every writer')
{
  for (const [said, want] of [['neutral grip chest press', 'Neutral-Grip Chest Press Machine'], ['iso lateral chest', 'Plate-Loaded Iso-Lateral Chest Press'], ['assisted chin', 'Assisted Chin-Up Machine'], ['v-squat', 'V-Squat Machine']]) {
    const got = searchExerciseCatalogByWords(said, 20).map(e => e.name)
    check(`the swap and add search finds "${said}" -> ${want}`, got.includes(want), got)
  }
  const ls = searchExerciseCatalogByWords('leg press', 20)
  const firstV = ls.findIndex(e => versionNames.has(e.name.toLowerCase())), lastC = ls.map(e => !versionNames.has(e.name.toLowerCase())).lastIndexOf(true)
  check('...with every catalogue lift above every version ("leg press")', firstV > 0 && lastC < firstV, ls.map(e => e.name))
  check('the logging box finds them too, through the same search', searchExercisesToLog('v-squat', 8).some(e => e.name === 'V-Squat Machine'))
  // THE COACH, given a loose name: offered the machine as a swap, never told an injury keeps it out (it said exactly
  // that before the fallback judged a version as its parent).
  const loose = swapNameFallback({ typed: 'v squat', oldExercise: 'Hack Squat', resolution: resolveExerciseName('v squat', []), profile: person(), exclusions: [] })
  check('the coach, asked for "v squat", offers the V-squat machine as a swap', /^V-Squat/.test(loose.offered[0] ?? '') && !/keep it out/.test(loose.text), loose.text)
  const shoulder = swapNameFallback({ typed: 'iso lateral shoulder press', oldExercise: 'Lateral Raises', resolution: resolveExerciseName('iso lateral shoulder press', []), profile: person({ injuries: ['shoulders'] }), exclusions: [] })
  check('...and still says when her injury does keep one out (a shoulder press with a shoulder injury)', !shoulder.offered.some(n => /shoulder press/i.test(n)) && /injuries/.test(shoulder.text), shoulder.text)
  check('no version name can break the coach\'s tap buttons (no "]" or "|")', versions.every(v => !/[\]|]/.test(v.name)))

  const p = person()
  setRandomSource(seededRngFromKey('mv|writers'))
  const meso: MesocycleWeek[] = quiet(() => generateMesocycle(p))
  resetRandomSource()
  const week = meso[1], day = week.days.find(d => d.exercises.length > 3)!
  const at = (m: MesocycleWeek[], w: number, n: string) => m.find(x => x.week_number === w)?.days.find(d => d.day === day.day)?.exercises.find(e => e.name === n)
  const vsq = versions.find(v => v.name === 'V-Squat Machine')!, hack = byName.get('Hack Squat')!
  const sw = await quietAsync(() => swapExerciseInMesocycle({ mesocycle: meso, profile: p, currentWeekNumber: week.week_number, dayName: day.day, exIndex: 1, newExercise: vsq, scope: 'permanent' }))
  const ref = await quietAsync(() => swapExerciseInMesocycle({ mesocycle: meso, profile: p, currentWeekNumber: week.week_number, dayName: day.day, exIndex: 1, newExercise: hack, scope: 'permanent' }))
  const v1 = at(sw, week.week_number, 'V-Squat Machine'), h1 = at(ref, week.week_number, 'Hack Squat')
  check('a swap to a version lands (the writer every swap ends in)', sw !== meso && !!v1, day.exercises.map(e => e.name))
  check('...at the weight the parent gets in the same slot (V-squat = hack squat)', v1?.suggested_load_kg != null && v1.suggested_load_kg === h1?.suggested_load_kg, { v: v1?.suggested_load_kg, hack: h1?.suggested_load_kg })
  const iso = versions.find(v => v.name === 'Plate-Loaded Iso-Lateral Chest Press')!, cpm = byName.get('Chest Press Machine')!
  const si = await quietAsync(() => swapExerciseInMesocycle({ mesocycle: meso, profile: p, currentWeekNumber: week.week_number, dayName: day.day, exIndex: 1, newExercise: iso, scope: 'permanent' }))
  const sc = await quietAsync(() => swapExerciseInMesocycle({ mesocycle: meso, profile: p, currentWeekNumber: week.week_number, dayName: day.day, exIndex: 1, newExercise: cpm, scope: 'permanent' }))
  const i1 = at(si, week.week_number, iso.name), c1 = at(sc, week.week_number, cpm.name)
  check('...and an iso-lateral one at about half, said per side', i1?.suggested_load_kg != null && c1?.suggested_load_kg != null && i1.suggested_load_kg < c1.suggested_load_kg && i1.suggested_load_kg >= c1.suggested_load_kg / 2 - 2.5 && /side|arm/i.test(i1.suggested_load ?? ''), { iso: i1?.suggested_load, cpm: c1?.suggested_load })
  // THE PLAN'S READERS: timing reads the version as its parent (it had read the catalogue alone, and lost it).
  const dv = sw.find(w => w.week_number === week.week_number)!.days.find(d => d.day === day.day)!
  const dh = ref.find(w => w.week_number === week.week_number)!.days.find(d => d.day === day.day)!
  check('the session\'s timing reads it as its parent (same day, same length)', Math.abs(estimateDaySeconds(dv) - estimateDaySeconds(dh)) < 1, { v: estimateDaySeconds(dv), h: estimateDaySeconds(dh) })
  // AN EQUIVALENT MUTANT, recorded rather than given a check (4 Nov 2026): timing reads an entry only for a timed or
  // carried set and for a barbell or top-tier setup, and no machine version's parent is any of those, so a reader that
  // lost the version prices its day exactly as it should. Measured: every machine parent's one-lift day equals an
  // unknown name's. The source check in section 7 is what holds the lookup there.

  const added = addExerciseToSession({ mesocycle: meso, profile: p, weekNumber: week.week_number, dayName: day.day, entry: vsq, load: null, scope: 'today' } as never)
  check('an addition of one is made, not refused', added.changed && !added.refusal, added.refusal)
  const exec = await quietAsync(() => executeExerciseSwap(p, meso, { weekNumber: week.week_number, dayName: day.day, exIndex: 1, oldExerciseName: day.exercises[1].name, newExerciseName: 'V-Squat Machine', scope: 'today' } as never))
  // No profile id here, so the save step is what fails: the swap itself was made, and nothing refused it.
  check('the coach\'s confirmed swap of one is made (only the save, which needs a real profile, is left)', exec.mesocycle !== meso && JSON.stringify(exec.mesocycle).includes('"V-Squat Machine"') && exec.receipt.failed.every(f => f.op === 'save'), exec.receipt)
  const copy = logOnlyExercises().find(c => c.name === 'Paused Bench Press')!
  const still = await quietAsync(() => swapExerciseInMesocycle({ mesocycle: meso, profile: p, currentWeekNumber: week.week_number, dayName: day.day, exIndex: 1, newExercise: copy, scope: 'permanent' }))
  check('a FREE-WEIGHT near-copy is still refused (her 3 Nov ruling stands for those)', still === meso)
}

console.log('\n7. Every plan reader asks the shared lookup, and the row says what it is')
{
  // A plan reader that looks a slot up in the catalogue alone loses a swapped-in version. Comments stripped.
  const readers = ['exercise-plan', 'periodization', 'session-duration', 'quality-score', 'edit-tradeoff', 'session-kind']
  const direct = readers.flatMap(f => { const s = strip(readFileSync(new URL(`../src/lib/${f}.ts`, import.meta.url), 'utf8')); return (s.match(/EXERCISE_DATABASE\.find\(/g) ?? []).map(() => f) })
  check('no plan reader finds a slot in the catalogue alone (each asks getExerciseEntry)', direct.length === 0, direct)
  const vEntry = getExerciseEntry('V-Squat Machine')
  check('the row line names the parent and the price', !!vEntry && machineVersionLine(vEntry) === 'A version of Hack Squat, priced like it.')
  check('...and is absent on a catalogue lift and on a log-only one', machineVersionLine(byName.get('Hack Squat')!) === null && machineVersionLine(logOnlyExercises()[0]) === null)
  const swapSheet = strip(readFileSync(new URL('../src/components/exercise/SwapDialog.tsx', import.meta.url), 'utf8'))
  const addSheet = strip(readFileSync(new URL('../src/components/exercise/AddExerciseSheet.tsx', import.meta.url), 'utf8'))
  check('the swap and add sheets draw it (source; the driver is verify:machine-swap)', /machineVersionLine\(exercise\)/.test(swapSheet) && /machineVersionLine\(exercise\)/.test(addSheet))
}

console.log('\n8. The gym machines with nothing to be a version of: priced and excluded as their nearest lift')
{
  const PAIRS: [string, string][] = [
    ['Smith Machine Romanian Deadlift', 'Romanian Deadlifts'], ['Smith Machine Bent-Over Row', 'Barbell Rows'],
    ['Smith Machine Shrug', 'Shrugs'], ['Smith Machine Hip Thrust', 'Hip Thrust'], ['Smith Machine Calf Raise', 'Standing Calf Raise Machine'],
    ['Machine Pullover', 'Dumbbell Pullover'], ['Ab Crunch Machine', 'Cable Crunch'], ['Cable Front Raise', 'Front Raises'],
  ]
  const who = person({ gender: 'male', weight_kg: 82 })
  const total = (n: string) => { const e = byName.get(n)!; const w = quiet(() => prescribeLoad(e, who, { reps: 10, rpe: 8 } as never)).starting_weight_kg; return w == null ? null : isPerSideLoad(e) ? w * 2 : w }
  const wrong: string[] = []
  for (const [n, near] of PAIRS) {
    const e = byName.get(n), m = byName.get(near)
    if (!e || !m) { wrong.push(`${n}: missing`); continue }
    if (categorize(e) !== categorize(m)) wrong.push(`${n}: category ${categorize(e)} vs ${categorize(m)}`)
    // THE WEEK COUNTS IT AS ITS NEAREST: same movement pattern; same tier, except a Smith lift sits one below its
    // barbell lift (as Smith Machine Squat does: the rails take the balance, not the load).
    if (e.movement_pattern !== m.movement_pattern) wrong.push(`${n}: pattern ${e.movement_pattern} vs ${m.movement_pattern}`)
    const smithStep = /^Smith /.test(n) && m.mechanics_tier === 'tier1_compound' && e.mechanics_tier === 'tier2_compound'
    if (e.mechanics_tier !== m.mechanics_tier && !smithStep) wrong.push(`${n}: tier ${e.mechanics_tier} vs ${m.mechanics_tier}`)
    if (JSON.stringify(contraindicatedJoints(e)) !== JSON.stringify(contraindicatedJoints(m))) wrong.push(`${n}: excluded for ${contraindicatedJoints(e)} vs ${contraindicatedJoints(m)}`)
    const a = total(n), b = total(near)
    if (a == null ? b != null : b == null || Math.abs(a - b) > 0.1 * b + 2.5) wrong.push(`${n}: ${a} kg on the body vs ${near} ${b}`)
  }
  check('each is in its nearest lift\'s price category and pattern, its tier, excluded for the same injuries, within 10% of its load on the body', wrong.length === 0, wrong)
  // RE-ANCHORED 10 Nov 2026: "the last eight entries" stopped being true the moment a later batch was appended after
  // them. What it protects is that each one sits AFTER the lift it copies, so a tie goes to the one the app already had.
  const idx = (n: string) => EXERCISE_DATABASE.findIndex(e => e.name === n)
  check('...each placed AFTER its nearest lift in the catalogue, so a tie still goes to an entry the app already had', PAIRS.every(([n, near]) => idx(n) > 0 && idx(near) >= 0 && idx(n) > idx(near)), PAIRS.map(([n, near]) => [n, idx(n), near, idx(near)]))
  const found = ['smith romanian', 'pullover machine', 'ab crunch machine', 'smith shrug'].map(w => [w, searchExerciseCatalogByWords(w, 20).map(e => e.name)] as const)
  check('...and found by the words on the machine', found.every(([, r]) => r.length > 0) && found[1][1].includes('Machine Pullover') && found[2][1].includes('Ab Crunch Machine'), found)
  check('her abdominal machines are versions of it', getExerciseEntry('Abdominal Crunch Machine (Pin-Selected)')?.parent === 'Ab Crunch Machine')
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} machine-version check(s) failed`); process.exit(1) }
console.log('machine-versions: all checks passed')
