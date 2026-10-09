// ---------------------------------------------------------------------------
// Gate: the Nutrition header and the meal engine give ONE answer to "is this
// day on target?".
//
// 9 Oct 2026, the test log's L20. The header read "ON THE NUMBER" with 179 g
// of protein against a 164 g target, and "MACROS OFF" at 181 g. The header had
// its own rule: calories within 30 kcal AND protein within 10% AND carbs
// within 10%, fat not looked at. The engine that CHOSE the day has a different
// one — calories within 5%, protein from 5% under to 15% over, carbs and fat
// within 25% — so the screen could call a day "macros off" that the engine had
// picked precisely because it was on target, and "on the number" with fat 40%
// out.
//
// WHAT THIS HOLDS:
//   1. the verdict is the engine's: for the day the engine actually serves,
//      the header says "on target" exactly when the engine says so, across a
//      grid of days;
//   2. the bands are the ruling's own, checked against written numbers (a
//      check compared with the constant that drives it can only agree with
//      itself);
//   3. an off-target day NAMES what is off and by how much — "protein 26 g
//      over" — never "macros off";
//   4. the header has no rule of its own left.
//
// One exit, at the bottom. Every check runs every time.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { MacroTargets } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

async function main() {
  // Loosely typed: on the tree before the fix the verdict was not exported.
  const mg = await import('../src/lib/meal-generation') as unknown as typeof import('../src/lib/meal-generation') & Record<string, unknown>
  const label = mg.dayVerdictLabel as unknown as ((totals: MacroTargets, targets: MacroTargets) => string) | undefined
  const verdict = mg.dayVerdict as unknown as ((totals: MacroTargets, targets: MacroTargets) => { onTarget: boolean; off: { macro: string; delta: number }[] }) | undefined
  const macroOk = mg.macroOnTarget as unknown as ((macro: string, actual: number, target: number) => boolean) | undefined
  const say = (totals: MacroTargets, targets: MacroTargets) => (label ? label(totals, targets) : '(no label function)')
  const T = (calories: number, protein: number, carbs: number, fat: number): MacroTargets => ({ calories, protein, carbs, fat })

  // Sam's targets, from the test log.
  const SAM = T(1697, 164, 150, 49)

  console.log('\n0. The pieces exist\n')
  check('the engine exports one verdict for a day', typeof verdict === 'function')
  check('...one verdict per macro', typeof macroOk === 'function')
  check('...and the words the header prints for it', typeof label === 'function')

  console.log('\n1. The two readings from the test log now get the same answer\n')
  {
    const at179 = say(T(1697, 179, 150, 49), SAM)
    const at181 = say(T(1697, 181, 150, 49), SAM)
    check('179 g of protein against 164 g is on target', at179 === 'on target', at179)
    check('...and so is 181 g: it was "macros off", two grams later', at181 === 'on target', at181)
    check('...and the two say the same thing', at179 === at181, [at179, at181])
  }

  console.log('\n2. The header agrees with the engine about the day the engine serves\n')
  {
    // One meal, one option: the engine has nothing to choose, so what it
    // reports is its verdict on exactly these numbers (after any resize it
    // makes to the dish, which is why the totals are read back from it).
    const ratios = [0.7, 0.8, 0.94, 0.96, 1, 1.04, 1.06, 1.14, 1.16, 1.24, 1.26, 1.4]
    let cells = 0, engineOn = 0, engineOff = 0, disagree = 0
    const examples: unknown[] = []
    for (const targets of [SAM, T(2400, 150, 280, 75), T(3040, 190, 380, 85)]) {
      for (const rc of ratios) for (const rp of ratios) for (const rcarb of [0.7, 0.76, 1, 1.24, 1.3]) for (const rf of [0.7, 0.76, 1, 1.24, 1.3]) {
        const macros = T(Math.round(targets.calories * rc), Math.round(targets.protein * rp), Math.round(targets.carbs * rcarb), Math.round(targets.fat * rf))
        const day = mg.assembleDay({ dinner: [{ slot: 'dinner', name: 'One dish', ingredients: [{ name: 'chicken breast', quantity: 100, unit: 'g' }], macros, tags: [] }] } as never, targets)
        cells++
        if (day.withinTolerance) engineOn++; else engineOff++
        const headerSaysOn = say(day.totals, targets) === 'on target'
        if (headerSaysOn !== day.withinTolerance) { disagree++; if (examples.length < 5) examples.push({ totals: day.totals, targets, engine: day.withinTolerance, header: say(day.totals, targets) }) }
      }
    }
    check(`the grid has both kinds of day in it (sanity check on this check): ${engineOn} on target, ${engineOff} off`, cells === 10800 && engineOn > 300 && engineOff > 3000, { cells, engineOn, engineOff })
    check('"on target" is on the header exactly when the engine says the day is on target — every one of 10,800 days', disagree === 0, { disagree, examples })
  }

  console.log('\n3. The bands are the ruling\'s own (written numbers, not the constants)\n')
  {
    // Against 1,697 kcal / 164 g protein / 150 g carbs / 49 g fat:
    //   calories within 5%          -> 1,613 to 1,781
    //   protein 5% under to 15% over -> 156 to 188
    //   carbs within 25%             -> 113 to 187
    //   fat within 25%               -> 37 to 61
    const on = (t: MacroTargets) => say(t, SAM) === 'on target'
    check('calories: 1,613 and 1,781 are on target', on(T(1613, 164, 150, 49)) && on(T(1781, 164, 150, 49)))
    check('...1,611 and 1,783 are not', !on(T(1611, 164, 150, 49)) && !on(T(1783, 164, 150, 49)), [say(T(1611, 164, 150, 49), SAM), say(T(1783, 164, 150, 49), SAM)])
    check('protein: 156 g and 188 g are on target', on(T(1697, 156, 150, 49)) && on(T(1697, 188, 150, 49)))
    check('...155 g and 189 g are not — the band is lopsided on purpose, a little over is fine', !on(T(1697, 155, 150, 49)) && !on(T(1697, 189, 150, 49)), [say(T(1697, 155, 150, 49), SAM), say(T(1697, 189, 150, 49), SAM)])
    check('carbs: 113 g and 187 g are on target, 112 g and 188 g are not', on(T(1697, 164, 113, 49)) && on(T(1697, 164, 187, 49)) && !on(T(1697, 164, 112, 49)) && !on(T(1697, 164, 188, 49)))
    check('fat: 37 g and 61 g are on target, 36 g and 62 g are not — fat is looked at now', on(T(1697, 164, 150, 37)) && on(T(1697, 164, 150, 61)) && !on(T(1697, 164, 150, 36)) && !on(T(1697, 164, 150, 62)), [say(T(1697, 164, 150, 36), SAM), say(T(1697, 164, 150, 62), SAM)])
    check('a day with fat 40% out is not called on target (it could be, before)', !on(T(1697, 164, 150, 69)), say(T(1697, 164, 150, 69), SAM))
    check('no calorie target at all: nothing to be off', say(T(900, 80, 90, 30), T(0, 0, 0, 0)) === 'on target')
  }

  console.log('\n4. An off-target day names what is off, and by how much\n')
  {
    check('protein 26 g over: "protein 26 g over"', say(T(1697, 190, 150, 49), SAM) === 'protein 26 g over', say(T(1697, 190, 150, 49), SAM))
    check('protein 14 g under: "protein 14 g under"', say(T(1697, 150, 150, 49), SAM) === 'protein 14 g under', say(T(1697, 150, 150, 49), SAM))
    check('carbs 50 g under: "carbs 50 g under"', say(T(1697, 164, 100, 49), SAM) === 'carbs 50 g under', say(T(1697, 164, 100, 49), SAM))
    check('fat 20 g over: "fat 20 g over"', say(T(1697, 164, 150, 69), SAM) === 'fat 20 g over', say(T(1697, 164, 150, 69), SAM))
    // Calories are the number this line sits beside ("target 1697 · 120 over"),
    // so when they are off they are what is named, as they always were.
    check('calories 120 over: "120 over", as before', say(T(1817, 164, 150, 49), SAM) === '120 over', say(T(1817, 164, 150, 49), SAM))
    check('calories 200 under: "200 under"', say(T(1497, 164, 150, 49), SAM) === '200 under', say(T(1497, 164, 150, 49), SAM))
    // Calories 5.5% over (half a point past their band), protein 34% over
    // (19 points past its own): protein is by far the worse miss, and the
    // calories are still what is named.
    check('calories AND protein off: the calories are named, even when protein is the bigger miss', say(T(1790, 220, 150, 49), SAM) === '93 over', say(T(1790, 220, 150, 49), SAM))
    // Two macros off with calories fine: the one furthest outside its own band.
    // Protein 205 g is 25% over (10 points past its +15%); fat 62 g is 26.5%
    // over (1.5 points past its 25%). Protein is the worse miss.
    check('protein and fat both off: the one further outside its band is named', say(T(1697, 205, 150, 62), SAM) === 'protein 41 g over', say(T(1697, 205, 150, 62), SAM))
    check('...whichever order they are in: carbs 30% under beats fat 26% over', say(T(1697, 164, 105, 62), SAM) === 'carbs 45 g under', say(T(1697, 164, 105, 62), SAM))
    // ...and when the worst is the LAST one looked at: protein a gram past its
    // band, fat 63% over. A label that named the first miss it found says protein.
    check('...and it is the WORST that is named, not the first found: fat 63% over beats protein a gram out', say(T(1697, 189, 150, 80), SAM) === 'fat 31 g over', say(T(1697, 189, 150, 80), SAM))
    // The protein band is lopsided: 20% over is 5 points past it, 20% under is
    // 15 points past. Against carbs 35% over (10 points past):
    check('...measured from the band\'s own edge: protein 20% over loses to carbs 35% over', say(T(1697, 197, 203, 49), SAM) === 'carbs 53 g over', say(T(1697, 197, 203, 49), SAM))
    check('...and protein 20% UNDER beats the same carbs', say(T(1697, 131, 203, 49), SAM) === 'protein 33 g under', say(T(1697, 131, 203, 49), SAM))
    check('"macros off" is never said', ![T(1697, 190, 150, 49), T(1697, 164, 100, 49), T(1697, 205, 150, 62), T(1900, 200, 150, 49)].some(t => /macros off/i.test(say(t, SAM))))
    const v = verdict ? verdict(T(1697, 205, 150, 62), SAM) : null
    check('the verdict lists every macro that is off, worst first, with its signed difference', !!v && v.onTarget === false && v.off.map(o => o.macro).join() === 'protein,fat' && v.off[0].delta === 41 && v.off[1].delta === 13, v)
    const vOn = verdict ? verdict(T(1697, 179, 150, 49), SAM) : null
    check('...and nothing when the day is on target', !!vOn && vOn.onTarget === true && vOn.off.length === 0, vOn)
  }

  console.log('\n5. The header has no rule of its own\n')
  {
    const ui = strip(readFileSync(join(ROOT, 'src/components/MealPlan.tsx'), 'utf8'))
    const hero = ui.slice(ui.indexOf('function TotalsHero('), ui.indexOf('function formatIngredient('))
    check('the header component was found (sanity check on this check)', hero.length > 400, hero.length)
    check('it prints the engine\'s label', /dayVerdictLabel\(totals, targets\)/.test(hero))
    check('...and lights protein by the engine\'s verdict for protein', /macroOnTarget\('protein', totals\.protein, targets\.protein\)/.test(hero))
    check('no percentage, no 30 kcal, no "macros off" of its own', !/0\.1\b|< 30\b|macros off|on the number|withinTolerance/.test(hero), hero.match(/0\.1\b|< 30\b|macros off|on the number|withinTolerance/)?.[0])
    const engine = strip(readFileSync(join(ROOT, 'src/lib/meal-generation.ts'), 'utf8'))
    const dwt = engine.slice(engine.indexOf('function dayWithinTolerance('), engine.indexOf('function dayWithinTolerance(') + 600)
    check('the engine\'s own day check is built from the same per-macro verdict', (dwt.match(/macroOnTarget\(/g) ?? []).length === 4, (dwt.match(/macroOnTarget\(/g) ?? []).length)
  }

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed\n`); process.exit(1) }
  console.log('One answer to "is this day on target?", on the screen and in the engine.\n')
}

main().catch(err => { console.error(err); process.exit(1) })
