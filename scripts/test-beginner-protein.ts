// A beginner's protein sits 0.4 g/kg lower, never below 1.6 (15 Nov 2026, CSCS: the coeliac nurse's 156 g as a vegan
// beginner). Everyone else unchanged. One exit: the count of failures.
import { readFileSync } from 'node:fs'
import { presetSplitFor, getProfileMacroSplit, getStaticDailyMacros } from '../src/lib/macro-calculator'
import { computeTargets } from '../src/lib/nutrition-targets'

let ran = 0, failed = 0
const ok = (c: boolean, m: string, d?: unknown) => { ran++; if (c) console.log(`  ok: ${m}`); else { failed++; console.log(`  FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d)}` : ''}`) } }
const base = { age: 35, gender: 'female', height_cm: 165, weight_kg: 78, activity_level: 'moderate', fitness_goal: 'fat_loss', training_days: ['monday', 'wednesday', 'friday'], dietary_preferences: [] } as any
const beg = { ...base, training_experience: 'beginner' }, mid = { ...base, training_experience: 'intermediate' }, adv = { ...base, training_experience: 'advanced' }

console.log('§1 The presets')
ok(presetSplitFor('balanced', beg).proteinPerKg === 1.6 && presetSplitFor('balanced', mid).proteinPerKg === 2.0 && presetSplitFor('balanced', adv).proteinPerKg === 2.0, 'Balanced: beginner 1.6, others 2.0')
ok(presetSplitFor('higher_protein', beg).proteinPerKg === 2.0 && presetSplitFor('higher_protein', mid).proteinPerKg === 2.4, 'Higher protein: beginner 2.0, others 2.4')
ok(presetSplitFor('higher_carb', beg).proteinPerKg === 1.6 && presetSplitFor('lower_carb', beg).proteinPerKg === 1.6, 'never below 1.6 (higher carb 1.8 -> 1.6, not 1.4)')
ok(presetSplitFor('lower_carb', beg).fatPercent === presetSplitFor('lower_carb', mid).fatPercent, 'fat is unchanged')
ok(getProfileMacroSplit(beg).proteinPerKg === 1.6 && getProfileMacroSplit(mid).proteinPerKg === 2.0, 'a profile that never chose a split reads its own default')
ok(getProfileMacroSplit({ ...beg, macro_split_preset: 'custom', macro_protein_per_kg: 2.4 }).proteinPerKg === 2.4, 'a custom figure he set is his, beginner or not')

console.log('§2 The day: same calories, the protein that comes off goes to carbs')
const b = getStaticDailyMacros(beg), m = getStaticDailyMacros(mid)
ok(!!b && !!m && b.protein === 125 && m.protein === 156, 'the nurse\'s 78 kg: 125 g as a beginner, 156 g otherwise', { b: b?.protein, m: m?.protein })
ok(!!b && !!m && b.calories === m.calories && b.carbs > m.carbs && b.fat === m.fat, 'calories and fat identical, carbs up', { b, m })

console.log('§3 One method (25 Nov 2026, his "Take it out"): a profile saved on the old day-by-day mode gets the same numbers')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const old = (p: any) => computeTargets({ ...p, macro_calculation_mode: 'DYNAMIC_CSCS' })
ok(JSON.stringify(old(beg)) === JSON.stringify(b) && JSON.stringify(old(mid)) === JSON.stringify(m), 'beginner and not: identical to Standard', { old: old(beg), b })

console.log('§4 The Profile card reads the same default')
const card = readFileSync('src/components/MacroSplitCard.tsx', 'utf8')
ok(/const values = presetSplitFor\(preset, profile\)/.test(card), 'tapping a preset writes this person\'s figure')
ok(/split\.proteinPerKg === presetSplitFor\('balanced', profile\)\.proteinPerKg \? ' \(default\)'/.test(card), '"(default)" means this person\'s default')

console.log(`${ran} checks ran, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
