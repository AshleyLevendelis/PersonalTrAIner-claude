/**
 * test:primer-dose — a warm-up move weighs the same on every route, and a swing is not halved (24 Nov 2026).
 *
 * Ashley, week 2: "Kettlebell Swings at 8kg was way too light" beside a 95 kg trap bar deadlift. Traced and run: a
 * plan built fresh priced the swing warm-up at 14 kg (male, intermediate, 85 kg); any edit priced it through the
 * working-lift path, which took the testing week's half and then the warm-up's half, 8 kg. And a swing's job before a
 * hinge is a hard hip snap, which half its easy estimate cannot ask for. docs/plans/primer-dose.md.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { prepLoadKg, primerPrescription, resolveLoadFields, isBallisticPrimer, PRIMER_INTENSITY } from '../src/lib/warmup'
import { recomputeLoad } from '../src/lib/mesocycle-edit'
import { repricePrimerSlots } from '../src/lib/primer-repair'
import { calibrationAnchorsFor } from '../src/lib/calibration-anchor'
import type { UserProfile, MesocycleWeek, ExerciseSetLog, Exercise } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${extra !== undefined ? `\n        ${JSON.stringify(extra)}` : ''}`) }
}

const him = { gender: 'male', weight_kg: 85, age: 35, training_experience: 'intermediate', equipment_access: 'full_gym', injuries: [] } as unknown as UserProfile
const swing = getExerciseEntry('Kettlebell Swings')!
const wrist = getExerciseEntry('Eccentric Wrist Extension')!
const swingKg = (p: UserProfile) => resolveLoadFields(swing, true, primerPrescription(swing, p, 2)).suggested_load_kg

async function main() {
  console.log('\n1. The swing warm-up is a real bell for a trained man')
  const kg = swingKg(him)
  const estimate = primerPrescription(swing, him, 2).starting_weight_kg
  check('his swing is 16 kg or more (it was 8 after an edit, 14 fresh)', kg != null && kg >= 16, kg)
  check('...its own easy estimate, not half of it', kg === estimate, { kg, estimate })
  check('the swing is the ballistic primer; a wrist drill is not', isBallisticPrimer(swing) && !isBallisticPrimer(wrist))
  check('a wrist drill is still half its working weight', prepLoadKg(wrist, 20) === 10, prepLoadKg(wrist, 20))
  const novice = swingKg({ ...him, training_experience: 'novice' } as UserProfile)
  check('a lighter, newer lifter gets a lighter bell', novice != null && kg != null && novice <= kg, { novice, kg })

  console.log('\n2. Every route prices it the same: an edit in a testing plan, with no log, is not cut twice')
  const viaEdit = await recomputeLoad(swing, him, PRIMER_INTENSITY, 2, '5', false, true, true)
  check('an edit in the testing week prices the swing as a new plan does', viaEdit.starting_weight_kg === estimate, { edit: viaEdit.starting_weight_kg, fresh: estimate })
  const viaEdit2 = await recomputeLoad(swing, him, PRIMER_INTENSITY, 2, '5', false, false, true, { kg: 8, step: false } as never)
  check('...and never reads a halved weight back as last week\'s', viaEdit2.starting_weight_kg === estimate, viaEdit2.starting_weight_kg)
  const viaEditBench = await recomputeLoad(getExerciseEntry('Barbell Bench Press')!, him, 'RPE 7-8', 3, '8-10', false, true, true)
  const benchFresh = (await recomputeLoad(getExerciseEntry('Barbell Bench Press')!, him, 'RPE 7-8', 3, '8-10', false, false, false)).starting_weight_kg ?? 0
  check('a working lift in the testing week still takes the testing discount (the branch is the primer\'s alone)', (viaEditBench.starting_weight_kg ?? 0) < benchFresh, { testing: viaEditBench.starting_weight_kg, fresh: benchFresh })

  console.log('\n3. A saved plan with the old 8 kg swing is corrected, once')
  const slot = (name: string, kgv: number): Exercise => ({ name, sets: 2, reps: '5', rest: '30s', suggested_load: `~${kgv}kg`, suggested_load_kg: kgv } as unknown as Exercise)
  const weeks = [1, 2].map(n => ({ week_number: n, block_number: 1, days: [{ day: 'Tuesday', exercises: [slot('Kettlebell Swings', 8), slot('Trap Bar Deadlift', 95)] }] })) as unknown as MesocycleWeek[]
  const r = repricePrimerSlots(weeks, him)
  check('both weeks\' swing take the current price', r.changed.length === 2 && r.next.every(w => w.days[0].exercises[0].suggested_load_kg === kg), r.next.map(w => w.days[0].exercises[0].suggested_load_kg))
  check('...the words beside it agree', r.next.every(w => (w.days[0].exercises[0].suggested_load ?? '').includes(String(kg))))
  check('the deadlift is untouched', r.next.every(w => w.days[0].exercises[1].suggested_load_kg === 95))
  check('read again, nothing changes', repricePrimerSlots(r.next, him).changed.length === 0)

  console.log('\n4. A warm-up move is not a testing-week result')
  const testing = { week_number: 1, block_number: 1, isCalibrationWeek: true, days: [{ day: 'Tuesday', exercises: [slot('Kettlebell Swings', 14), slot('Goblet Squats', 12)] }] } as unknown as MesocycleWeek
  const log = (name: string, kgv: number): ExerciseSetLog => ({ user_id: 'u', date: '2026-11-17', exercise_name: name, exercise_id: getExerciseEntry(name)!.id, set_number: 1, weight_kg: kgv, reps_completed: 12, is_bodyweight: false } as ExerciseSetLog)
  const anchors = calibrationAnchorsFor(testing, testing.days[0], [log('Kettlebell Swings', 32), log('Goblet Squats', 24)])
  check('a heavier swing does not re-anchor the warm-up', !anchors.some(a => a.exerciseName === 'Kettlebell Swings'), anchors)
  check('...while a heavier working lift beside it still does (the detector works)', anchors.some(a => a.exerciseName === 'Goblet Squats'), anchors)

  console.log('\n5. The card does not progress a warm-up from its log; a saved plan is corrected on open (source)')
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const panel = strip(readFileSync(join(ROOT, 'src/components/exercise/TodayPanel.tsx'), 'utf8'))
  check('both of the card\'s progression reads leave primers out', (panel.match(/getExerciseEntry\(ex\.name\)\?\.mechanics_tier !== 'primer'/g) ?? []).length === 2)
  const app = strip(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))
  check('the app corrects the saved plan once it is read from the server', /repricePrimerSlots\(mesocycleNow\.current, profile\)/.test(app) && /changed\.map\(w => saveMesocycleWeek\(profileId, w\)\)/.test(app))
}

main().then(() => {
  console.log(`\n${ran} checks ran, ${failures} failed`)
  if (failures > 0) process.exit(1)
}).catch(err => { console.error(err); console.log(`\n${ran} checks ran, ${failures + 1} failed`); process.exit(1) })
