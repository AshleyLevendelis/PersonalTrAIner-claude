// ---------------------------------------------------------------------------
// Gate for how a prescribed weight is WRITTEN on screen.
//
// WHY THIS EXISTS. `loadingMode()` checks `equipment.includes('dumbbells')`
// first, so any dumbbell-capable movement is priced PER HAND. Measured across
// full_gym/home_gym/minimalist x beginner/intermediate/advanced, that is
// 1126 of 2356 prescriptions — 47.8%. `formatLoad()` has always produced the
// right string ("~14kg per hand") and stored it on every exercise as
// `suggested_load`. Only LoadChip read it. ExerciseLine and ExerciseRow
// re-rendered the raw `suggested_load_kg` with a hard-coded "kg", so half of
// every plan showed a per-hand number in the same format as a total, sitting
// directly beneath one:
//
//     Barbell Squats       · 42.5kg     42.5kg total
//     Romanian Deadlifts   · 14kg       14kg PER HAND — 28kg total
//
// Read down the list, the RDL looks like a third of the squat. It is
// two-thirds.
//
// THE CHECK HAS TO BE "NOBODY HAND-ROLLS A KG STRING", not "these two files
// look right today". This is the feature-built-in-two-halves shape: the
// label existed and the screens people read were not wired to it. A gate
// pinned to the two files that were wrong would pass while a third surface
// repeated the mistake.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { formatLoad, splitLoadDisplay, loadingMode, isPerSideLoad } from '../src/lib/load-prescription'
import { getExerciseEntry } from '../src/lib/exercise-db'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// ---------------------------------------------------------------------------
console.log('\n1. The splitter round-trips everything formatLoad writes')
// ---------------------------------------------------------------------------
{
  // splitLoadDisplay parses this app's OWN output, which is only safe while
  // the two sit together. This is what makes that safe.
  for (const mode of ['total', 'per_hand', 'single_side'] as const) {
    for (const kg of [2, 14, 42.5, 137.5]) {
      const written = formatLoad(kg, mode)
      const parts = splitLoadDisplay(written)
      check(`${mode} @ ${kg}kg round-trips ("${written}")`,
        !!parts && `${parts.approx ? '~' : ''}${parts.value}${parts.unit}` === written, { written, parts })
    }
  }
  // A sentence is not a number with a unit, and must not be forced into one.
  for (const sentence of ['Bodyweight', 'Choose by feel']) {
    check(`"${sentence}" is not parsed as a weight`, splitLoadDisplay(sentence) === null)
  }
  // The per-hand qualifier has to SURVIVE the split — this is the whole point.
  check('a per-hand unit keeps its qualifier',
    splitLoadDisplay(formatLoad(14, 'per_hand'))?.unit === 'kg per hand')
  check('a total unit stays bare', splitLoadDisplay(formatLoad(14, 'total'))?.unit === 'kg')
}

// ---------------------------------------------------------------------------
console.log('\n2. No screen hand-rolls a weight string')
// ---------------------------------------------------------------------------
{
  // Every `{...suggested_load_kg}kg` in a component, in any spelling. The
  // rule is that a PRESCRIBED load reaches the screen through the plan's own
  // formatted string; a logged or historical weight is a different number and
  // is not covered here.
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const f = join(dir, e)
      if (statSync(f).isDirectory()) walk(f)
      else if (/\.tsx$/.test(f)) files.push(f)
    }
  }
  walk(join(ROOT, 'src/components'))

  // COMMENTS STRIPPED FIRST. Written without this, the check fired on the
  // comment I had just added to ExerciseLine explaining the bug — the third
  // time in this session a check of mine has been satisfiable by its own
  // documentation. Block comments matter as much as line ones here: the
  // explanation lives in a JSX {/* ... */} whose middle lines start with
  // neither // nor *.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
       .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1)

  const offenders: string[] = []
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'))
    src.split('\n').forEach((line, i) => {
      // A PRESCRIBED load rendered with a literal unit beside it. Session
      // volume, PR weights and logged sets are different numbers with their
      // own units and are deliberately not covered.
      if (!/suggested_load_kg\}kg/.test(line)) return
      // The documented fallback for the (currently impossible) case of a
      // plan item carrying a number but no formatted string. It is allowed
      // BECAUSE it sits behind `suggested_load ??` — the string wins whenever
      // there is one.
      if (/suggested_load \?\?/.test(line)) return
      offenders.push(`${f.replace(ROOT + '/', '')}:${i + 1}  ${line.trim().slice(0, 90)}`)
    })
  }
  check('no component pairs suggested_load_kg with a literal "kg"', offenders.length === 0, offenders)

  // The two that were wrong, named — so a revert is caught by name as well as
  // by shape, and so this file records which they were.
  const line = readFileSync(join(ROOT, 'src/components/exercise/ExerciseLine.tsx'), 'utf8')
  check('ExerciseLine renders the plan\'s own string', /ex\.suggested_load \?\?/.test(line))
  // The bare form may only appear as the fallback behind `suggested_load ??`.
  const bareInLine = [...line.matchAll(/\$\{ex\.suggested_load_kg\}kg/g)].length
  const guardedInLine = [...line.matchAll(/ex\.suggested_load \?\? `~\$\{ex\.suggested_load_kg\}kg`/g)].length
  check('...and its only bare "kg" is the guarded fallback',
    bareInLine === guardedInLine, { bare: bareInLine, guarded: guardedInLine })

  const row = readFileSync(join(ROOT, 'src/components/exercise/ExerciseRow.tsx'), 'utf8')
  check('ExerciseRow takes its unit from the split', /splitLoadDisplay\(ex\.suggested_load\)/.test(row))
  check('...and passes the same unit into the logging grid', /loadUnitLabel=\{/.test(row))
}

// ---------------------------------------------------------------------------
console.log('\n3. The column that ASKS for a number says which number')
// ---------------------------------------------------------------------------
{
  // Display being wrong is a misread. The input being unlabelled is a wrong
  // LOG — and exercise_set_logs carries no unit of its own to catch it.
  const grid = readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8')
  check('the weight column accepts a unit label', /loadUnitLabel\?: string/.test(grid))
  check('...and shows it when it is not a plain kg', /loadUnitLabel !== 'kg'/.test(grid))
  check('...and does not re-derive it from the exercise name',
    !/loadingMode\(|isPerSideLoad\(/.test(grid))
}

// ---------------------------------------------------------------------------
console.log('\n4. The rule this all rests on still holds')
// ---------------------------------------------------------------------------
{
  // If dumbbell-capable movements stopped being per-hand, everything above
  // would be labelling a distinction that no longer exists.
  const rdl = getExerciseEntry('Romanian Deadlifts')!
  check('a barbell,dumbbells movement is priced per hand',
    loadingMode(rdl) === 'dumbbell' && isPerSideLoad(rdl), { equipment: rdl.equipment, mode: loadingMode(rdl) })
  const squat = getExerciseEntry('Barbell Squats')!
  check('a barbell-only movement is priced as a total',
    loadingMode(squat) === 'barbell' && !isPerSideLoad(squat), { equipment: squat.equipment })
}

console.log(failures === 0 ? '\nAll load-display checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
