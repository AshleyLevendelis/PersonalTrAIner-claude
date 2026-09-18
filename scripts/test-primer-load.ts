// ---------------------------------------------------------------------------
// Gate: A PREP MOVE THAT NEEDS A BELL GETS A WEIGHT — and the two other things
// the same card was getting wrong.
//
// Ashley, 18 Sep 2026, mid-session: *"Swapped exercises doesnt show prescribed
// weights."* Her Kettlebell Swings sat in the primer slot with no weight
// anywhere on the card, a box offering 0, and a plate calculator beside it.
// She put 24kg on the bell and logged it.
//
// MEASURED, and the measurement is why this is not a swap bug: `prescribeLoad`
// had already worked out 8kg for that slot. Three call sites threw it away —
// `isPrimer ? null : load.starting_weight_kg` at exercise-plan.ts twice and
// mesocycle-edit.ts once — and across a whole generated mesocycle 64 of 64
// primers carried no weight. The swap was faithfully reproducing generation.
//
// HER RULING, from three options: **a starting weight, kept light** — over
// "say Light, no number" and over asking her once and remembering.
//
// And two more from the same screenshots:
//   - the weight box defaulted to `0`, so a blank tap logged 0kg against a
//     bell she had loaded to 24. A default is a prescription.
//   - *"says distance 40 but it's not clear if that's feet meters etc."* The
//     unit was in the prescription ("3x40m") and thrown away on the way out.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join } from 'path'
import { primerCarriesWeight, isExternallyLoaded } from '../src/lib/load-prescription'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { swapExerciseInMesocycle } from '../src/lib/mesocycle-edit'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getRepsColumnLabel } from '../src/components/exercise/SetGrid'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const PROFILE = {
  id: 'p', training_style: 'hybrid', training_experience: 'intermediate',
  equipment_access: 'full_gym', fitness_goal: 'hypertrophy', injuries: [],
  workout_days_per_week: 4, session_duration_preference: '45-60', body_weight_kg: 80,
  training_days: [
    { day: 'Monday', available: true }, { day: 'Wednesday', available: true },
    { day: 'Friday', available: true }, { day: 'Sunday', available: true },
  ],
} as unknown as UserProfile

const PREP_SENTENCE = 'Stay light and controlled. This is preparation, not a working set.'

// ---------------------------------------------------------------------------
console.log('\n[1] Which prep moves need a number')
// ---------------------------------------------------------------------------
{
  for (const [name, expected] of [
    ['Kettlebell Swings', true],
    ['Wall Slides', false],
    ['Standing Band Hip Abduction', false],
  ] as [string, boolean][]) {
    const e = getExerciseEntry(name)
    check(`${name} ${expected ? 'needs a weight' : 'needs none'}`,
      !!e && primerCarriesWeight(e) === expected, { found: !!e, got: e && primerCarriesWeight(e) })
  }
  // It IS the loaded test, not a second opinion about equipment. A private
  // copy of that list is how the app came to disagree with itself about
  // what a home gym contains.
  const kb = getExerciseEntry('Kettlebell Swings')!
  check('...and it asks the same question the rest of the app asks',
    primerCarriesWeight(kb) === isExternallyLoaded(kb))
}

// ---------------------------------------------------------------------------
console.log('\n[2] Her case, through the real swap — both branches')
// ---------------------------------------------------------------------------
{
  setRandomSource(seededRngFromKey('primer-load-gate'))
  const meso = generateMesocycle(PROFILE)
  resetRandomSource()
  const wk = meso[0]
  const day = wk.days.find(d => d.exercises.some(e => (e as unknown as { tier?: string }).tier === 'tier_0_primer'))
  check('2a. the fixture really has a prep slot to swap into', !!day)

  if (day) {
    const idx = day.exercises.findIndex(e => (e as unknown as { tier?: string }).tier === 'tier_0_primer')
    const after = async (incoming: string) => {
      const weeks = await swapExerciseInMesocycle({
        mesocycle: meso, profile: PROFILE, currentWeekNumber: wk.week_number,
        dayName: day.day, exIndex: idx, newExercise: getExerciseEntry(incoming), scope: 'today',
      } as never)
      const d = weeks.find(w => w.week_number === wk.week_number)!.days.find(x => x.day === day.day)!
      return d.exercises[idx] as unknown as {
        name: string; suggested_load_kg?: number | null; suggested_load?: string
        intensity?: string; load_guidance?: string
      }
    }
    const bell = await after('Kettlebell Swings')
    check('2b. swapping in kettlebell swings now prescribes a weight',
      bell.name === 'Kettlebell Swings' && typeof bell.suggested_load_kg === 'number' && bell.suggested_load_kg > 0,
      { kg: bell.suggested_load_kg, load: bell.suggested_load })
    check('2c. ...and it is still prep, not a working set',
      bell.intensity === 'Light — movement prep' && bell.load_guidance === PREP_SENTENCE,
      { intensity: bell.intensity, guidance: bell.load_guidance })

    const slides = await after('Wall Slides')
    check('2d. a prep move needing no kit still gets no number',
      slides.suggested_load_kg == null && slides.suggested_load === 'Light',
      { kg: slides.suggested_load_kg, load: slides.suggested_load })
    check('2e. ...with the identical sentence, so the ruling reads the same either way',
      slides.intensity === 'Light — movement prep' && slides.load_guidance === PREP_SENTENCE,
      { intensity: slides.intensity, guidance: slides.load_guidance })
  }
}

// ---------------------------------------------------------------------------
console.log('\n[3] All three call sites, not just the one she reported')
// ---------------------------------------------------------------------------
{
  // The swap is proven by CALLING it above. Generation's sites cannot be
  // reached the same way without a seed that happens to pick a loaded primer,
  // so they are held on the source — and the COUNT is the point. It found the
  // fourth site: the build started from three (two generation, one swap) and
  // 3c went red on a rotation path nobody had listed, which is a rule applied
  // at three of four places, the exact shape of the original defect.
  const plan = stripComments(readFileSync(join(ROOT, 'src/lib/exercise-plan.ts'), 'utf8'))
  const edit = stripComments(readFileSync(join(ROOT, 'src/lib/mesocycle-edit.ts'), 'utf8'))
  const planCalls = (plan.match(/primerCarriesWeight\(/g) ?? []).length
  const editCalls = (edit.match(/primerCarriesWeight\(/g) ?? []).length
  check('3a. generation asks the question at all three of its sites', planCalls >= 9, { planCalls })
  check('3b. the swap asks it too', editCalls >= 3, { editCalls })
  // AND NOBODY STILL NULLS A PRIMER'S WEIGHT UNCONDITIONALLY — the shape the
  // defect had. A bare `isPrimer ? null` on the load is what she hit.
  const bare = [...plan.matchAll(/isPrimer \? null : load\.starting_weight_kg/g)].length
    + [...edit.matchAll(/isPrimer \? null : load\.starting_weight_kg/g)].length
  check('3c. no site discards the weight for every primer any more', bare === 0, { bare })
}

// ---------------------------------------------------------------------------
console.log('\n[4] The box stops inventing a zero')
// ---------------------------------------------------------------------------
const grid = stripComments(readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8'))
{
  check('4a. a movement that needs a weight gets an empty box, not 0',
    /return catalogEntryIsLoaded \? '' : '0'/.test(grid), (grid.match(/.{0,50}: '0'.{0,20}/g) ?? []).slice(0, 3))
  check('4b. ...and the old unconditional zero is gone',
    !/suggestedLoadKg != null \? String\(suggestedLoadKg\) : '0'/.test(grid))
}

// ---------------------------------------------------------------------------
console.log('\n[5] The logging column says what it is counting, and in what')
// ---------------------------------------------------------------------------
{
  check('5a. a carry names its metres', getRepsColumnLabel('40m', 'distance_load') === 'Distance · m',
    getRepsColumnLabel('40m', 'distance_load'))
  check('5b. a hold names its seconds', getRepsColumnLabel('45s', 'time') === 'Hold · s',
    getRepsColumnLabel('45s', 'time'))
  check('5c. a steady effort names its minutes', getRepsColumnLabel('20min', 'steady_state') === 'Duration · min',
    getRepsColumnLabel('20min', 'steady_state'))
  // REPS IS THE ONE THAT NEEDS NOTHING: the unit IS the word. "Reps · reps"
  // would be the rule applied without reading it.
  check('5d. reps stays plain, because the word is the unit',
    getRepsColumnLabel('8-12', 'reps') === 'Reps' && getRepsColumnLabel('8-12') === 'Reps')
  // And it never INVENTS a unit the prescription does not carry.
  check('5e. a prescription with no unit gets no unit', getRepsColumnLabel('40', 'distance_load') === 'Distance',
    getRepsColumnLabel('40', 'distance_load'))
}

// ---------------------------------------------------------------------------
console.log('\n[6] A row of identical chips does not pretend to be a ladder')
// ---------------------------------------------------------------------------
const chip = stripComments(readFileSync(join(ROOT, 'src/components/exercise/LoadChip.tsx'), 'utf8'))
{
  check('6a. the per-set chips render only where the loads actually differ',
    /new Set\(ex\.per_set_load\.map\(s => s\.load_kg\)\)\.size > 1/.test(chip))
  // Teeth: the chips must still EXIST for the case they are for.
  check('6b. ...and they still exist for a real ramp', /S\{s\.set_number\}/.test(chip))
}

// ---------------------------------------------------------------------------
console.log('\n[7] Every source detector is proven on something that fails it')
// ---------------------------------------------------------------------------
{
  const brokenGrid = "return suggestedLoadKg != null ? String(suggestedLoadKg) : '0'"
  check('7a. the zero detector fails on the old fallback',
    !/return catalogEntryIsLoaded \? '' : '0'/.test(brokenGrid)
    && /suggestedLoadKg != null \? String\(suggestedLoadKg\) : '0'/.test(brokenGrid))
  const brokenPlan = 'suggested_load_kg: isPrimer ? null : load.starting_weight_kg,'
  check('7b. the unconditional-null detector fails on the shape she hit',
    [...brokenPlan.matchAll(/isPrimer \? null : load\.starting_weight_kg/g)].length === 1)
  const brokenChip = '{ex.per_set_load && ex.per_set_load.length > 0 && !calibration ? ('
  check('7c. the chip detector fails on a row that always renders',
    !/new Set\(ex\.per_set_load\.map\(s => s\.load_kg\)\)\.size > 1/.test(brokenChip))
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
if (failures > 0) process.exit(1)
