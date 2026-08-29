// ---------------------------------------------------------------------------
// Gate: Nutrition's five-ring meter (design handoff v2 §3).
//
// "The letters are load-bearing. Colour alone failed (three of five hues were
// unreadable when darkened), and ink alone failed (five arcs in one hue are not
// a key). Colour + letter works." So §2 here checks the key survives with
// colour switched off — that is the property, not the pixels.
//
// §8 step 4: "the meter's five arcs must be mathematically right against the
// ledger, and each macro identifiable by letter with colour off."
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildNutritionField, type NutritionFieldInput } from '../src/lib/nutrition-field'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

// The handoff's own worked example.
const base: NutritionFieldInput = {
  caloriesEaten: 1240, caloriesTarget: 2480,
  proteinEaten: 88, proteinTarget: 160,
  carbsEaten: 126, carbsTarget: 280,
  fatEaten: 35, fatTarget: 69,
  waterMl: 1250, waterTargetMl: 2000,
  hasTargets: true,
}

console.log('\n1. The handoff\'s example reproduces exactly')
{
  const m = buildNutritionField(base)
  check('1240 of 2480 kcal', m.kcal?.eaten === 1240 && m.kcal?.target === 2480, m.kcal)
  check('the grid reads P 88/160, C 126/280, F 35/69, W 1250/2000',
    m.cells.map(c => `${c.letter} ${c.eaten}/${c.target}`).join(', ') === 'P 88/160, C 126/280, F 35/69, W 1250/2000',
    m.cells.map(c => `${c.letter} ${c.eaten}/${c.target}`))
  check('five arcs, no more', m.arcs.length === 5, m.arcs.length)
}

console.log('\n2. The key survives with colour off — the whole reason letters exist')
{
  const m = buildNutritionField(base)
  const letters = m.cells.map(c => c.letter)
  check('every cell carries a letter', letters.every(Boolean) && letters.length === 4, letters)
  check('...and they are unique, so colour is never the only key',
    new Set(letters).size === letters.length, letters)
  check('...and no two cells share a swatch either',
    new Set(m.cells.map(c => c.swatch)).size === m.cells.length, m.cells.map(c => c.swatch))
}

console.log('\n3. Arcs match the prototype, and the ledger')
{
  const m = buildNutritionField(base)
  const geom = m.arcs.map(a => `${a.label}:${a.radius}/${a.width}`).join(' ')
  check('radii and widths are the prototype\'s',
    geom === 'water:50/4 kcal:40/9 protein:30/6 carbs:22/6 fat:14/6', geom)
  check('kcal is the headline — the ONLY arc with no colour of its own',
    m.arcs.filter(a => a.color === undefined).map(a => a.label).join() === 'kcal')
  const protein = m.arcs.find(a => a.label === 'protein')!
  check('the protein arc is the real ratio, not an eyeballed one',
    Math.abs(protein.value - 88 / 160) < 1e-9, protein.value)
  const water = m.arcs.find(a => a.label === 'water')!
  check('...and so is water', Math.abs(water.value - 1250 / 2000) < 1e-9, water.value)
}

console.log('\n4. A declined body metric shows no fabricated target')
{
  const m = buildNutritionField({ ...base, hasTargets: false })
  check('no kcal figure at all', m.kcal === null)
  check('no macro cells', !m.cells.some(c => c.key !== 'water'), m.cells.map(c => c.key))
  check('no macro arcs', m.arcs.every(a => a.label === 'water'), m.arcs.map(a => a.label))
  // Water is a target you set, not one derived from a body metric, so it stays.
  check('...but water survives, because it never needed one',
    m.cells.some(c => c.key === 'water') && m.arcs.some(a => a.label === 'water'))
}

console.log('\n5. A zero target can never divide by zero')
{
  const m = buildNutritionField({ ...base, proteinTarget: 0, caloriesTarget: 0 })
  check('every arc value is finite', m.arcs.every(a => Number.isFinite(a.value)), m.arcs.map(a => a.value))
}

console.log('\n6. The field carries no action — logging lives on the canvas')
{
  const src = readFileSync(join(ROOT, 'src/lib/nutrition-field.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('the model exposes no CTA', !/cta/i.test(src))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll nutrition-field checks passed.')
