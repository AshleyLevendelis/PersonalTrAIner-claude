// THE MACRO SPLIT, FROM THE CHAT (28 Nov 2026, coach-awareness audit (b) 9). Held by behaviour: the patch is the one
// MacroSplitCard writes for the same preset, the grams on the card are getMacroDerivation's before and after (what the
// Nutrition tab draws), calories do not move, exact grams go to the screen's custom slider, and the conditioning goal
// changes nothing and says why in the screen's words.
import { planMacroSplit as planRaw, readMacroPreset, MACRO_SPLIT_REFUSALS, CONDITIONING_SPLIT_REASON } from '../src/lib/coach-routes/macro-split'
import { getMacroDerivation, presetSplitFor } from '../src/lib/macro-calculator'
import type { UserProfile } from '../src/lib/types'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
// A throw is a failed check, never a crash that stops the rest running.
const planMacroSplit = (p: UserProfile, said: string): ReturnType<typeof planRaw> => { try { return planRaw(p, said) } catch { return { ok: false, reason: 'THREW' } } }
const profile = (o: Partial<UserProfile> = {}): UserProfile => ({
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
  activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
  training_days: [], session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
  macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym', training_style: 'hybrid',
  training_experience: 'intermediate', coaching_persona: 'supportive', injuries: [],
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  dietary_preferences: [], meals_per_day: 3, include_snacks: true,
  ...o,
}) as UserProfile

console.log('1. His words: a preset, an exact figure, or asked')
check('presets by their words', readMacroPreset('higher protein') === 'higher_protein' && readMacroPreset('More protein') === 'higher_protein'
  && readMacroPreset('lower carb') === 'lower_carb' && readMacroPreset('more fat') === 'lower_carb'
  && readMacroPreset('more carbs') === 'higher_carb' && readMacroPreset('default') === 'balanced')
check('a number is the custom slider', readMacroPreset('180g protein') === 'custom')
check('anything else is asked', readMacroPreset('healthier') === null && readMacroPreset('protein') === null)
check('an unclear ask: which split', (p => !p.ok && p.reason === MACRO_SPLIT_REFUSALS.which)(planMacroSplit(profile(), 'healthier')))
check('an exact figure: pointed at the custom slider, nothing planned', (p => !p.ok && p.reason === MACRO_SPLIT_REFUSALS.custom)(planMacroSplit(profile(), '200 g protein')))

console.log('2. The patch is the card\'s, the grams are the screen\'s')
{
  const pr = profile()
  const p = planMacroSplit(pr, 'higher protein')
  check('plans', p.ok, p)
  {
    const q = p.ok ? p : { patch: {} as Record<string, unknown>, rows: [] as { field: string; before: string; after: string }[], note: '', lead: '' }
    const v = presetSplitFor('higher_protein', pr)
    check('the patch is what MacroSplitCard writes', q.patch.macro_split_preset === 'higher_protein' && q.patch.macro_protein_per_kg === v.proteinPerKg && q.patch.macro_fat_percent === v.fatPercent, q.patch)
    const before = getMacroDerivation(pr)!.target
    const after = getMacroDerivation({ ...pr, ...(q.patch as Partial<UserProfile>) })!.target
    const prot = q.rows.find(r => r.field === 'Protein')
    check('protein before and after are the derivation\'s grams', prot?.before === `${before.protein} g` && prot?.after === `${after.protein} g` && after.protein > before.protein, { prot, before, after })
    check('a macro that does not move has no row', q.rows.every(r => r.before !== r.after) && !q.rows.some(r => r.field === 'Fat'), q.rows)
    check('the card says calories stay, at the screen\'s figure', q.note.includes(Math.round(after.calories).toLocaleString('en-GB')) && /only how they divide changes/.test(q.note), q.note)
    check('asks, with the preset\'s own description', /^Want me to switch your split to Higher protein\? More protein/.test(q.lead), q.lead)
  }
  const beginner = profile({ training_experience: 'beginner' })
  const b = planMacroSplit(beginner, 'higher protein')
  check('a beginner gets the preset as the card would write it (0.4 g/kg lower)', b.ok && b.patch.macro_protein_per_kg === presetSplitFor('higher_protein', beginner).proteinPerKg && b.patch.macro_protein_per_kg === 2.0, b)
}

console.log('3. What changes nothing says why')
{
  const cond = planMacroSplit(profile({ fitness_goal: 'conditioning' }), 'higher protein')
  check('conditioning goal: the screen\'s own reason', !cond.ok && cond.reason === CONDITIONING_SPLIT_REASON, cond)
  const same = planMacroSplit(profile({ macro_split_preset: 'lower_carb' }), 'lower carb')
  check('already on it: said', !same.ok && same.reason === MACRO_SPLIT_REFUSALS.same('Lower carb'), same)
  const noBody = planMacroSplit(profile({ weight_kg: undefined as never, height_cm: undefined as never }), 'higher carb')
  check('no weight or height: no targets to change, said', !noBody.ok && noBody.reason === MACRO_SPLIT_REFUSALS.noTargets, noBody)
}

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')
