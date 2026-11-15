// ---------------------------------------------------------------------------
// test:pregnancy-one-switch — his rulings of 15 Nov 2026 ("Maintenance + midwife", "NHS list, auto-on", "Ask due
// date"; docs/plans/pregnancy-one-switch.md). The Pregnant tick drives calories, food and late-pregnancy effort as one
// switch, so the three can never disagree again (the browser test found a 363 kcal deficit beside the coach's own
// "weight loss is not appropriate").
// ---------------------------------------------------------------------------
import fs from 'fs'
// dev-clock keeps its override in localStorage; a plain map stands in for it here.
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) }, clear: () => store.clear(), key: () => null, length: 0 } as Storage
import { computeTargets } from '../src/lib/nutrition-targets'
import { getMacroDerivation } from '../src/lib/macro-calculator'
import {
  nutritionGoalOf, mealRestrictionsOf, pregnancyWeeksOn, lateInPregnancy, noteForProfile, healthConditionLine,
  saidPregnant, askedToPause, PREGNANCY_CALORIE_LINE, LATE_PREGNANCY_SET_RPE_CEILING,
} from '../src/lib/health-conditions'
import { validateMealAgainstDiet, DIETARY_PREFERENCES, SELECTABLE_DIETARY_PREFERENCES } from '../src/lib/diet-rules'
import { DIETARY_OPTIONS } from '../src/lib/onboarding-slots'
import { parseIngredientLines } from '../src/lib/portion-scaler'
import { pregnancyFishCount, pregnancyFishLines } from '../src/lib/pregnancy-food'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { setDevClockOverride } from '../src/lib/dev-clock'
import { buildProfile, generateAllCombinations } from './quality-grid'
import type { UserProfile } from '../src/lib/types'

let failures = 0, ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(fs.readFileSync(p, 'utf8'))

console.log('\n1. Calories: maintenance while pregnant ("Maintenance + midwife")')
{
  // The tester's profile: 31, 165 cm, 79.4 kg, sedentary, fat loss.
  const priya = { id: 'priya', age: 31, gender: 'female', height_cm: 165, weight_kg: 79.4, activity_level: 'sedentary', fitness_goal: 'fat_loss', macro_calculation_mode: 'STANDARD_STATIC' } as unknown as UserProfile
  const pregnant = { ...priya, health_conditions: ['pregnancy'] }
  const deficit = computeTargets(priya)?.calories, held = computeTargets(pregnant)?.calories
  const maint = computeTargets({ ...priya, fitness_goal: 'functional' })?.calories
  check('the fat-loss deficit (1,448) is gone while pregnant: maintenance (1,810)', deficit === 1448 && held === maint && held! > deficit!, { deficit, held, maint })
  const bulk = computeTargets({ ...pregnant, fitness_goal: 'hypertrophy' })?.calories
  check('...and so is a muscle-gain surplus', bulk === maint, { bulk, maint })
  check('the goal itself is kept (fat loss comes back when unticked)', nutritionGoalOf(pregnant) === 'functional' && nutritionGoalOf(priya) === 'fat_loss' && pregnant.fitness_goal === 'fat_loss')
  check('the breakdown names it "Maintenance while pregnant", never a deficit', getMacroDerivation(pregnant)?.surplusLabel === 'Maintenance while pregnant' && Math.abs(getMacroDerivation(pregnant)?.surplusKcal ?? 99) <= 5, getMacroDerivation(pregnant))
  check('the line sends calories to the midwife or GP', /maintenance/.test(PREGNANCY_CALORIE_LINE) && /midwife or GP/.test(PREGNANCY_CALORIE_LINE))
  check('Nutrition shows that line while pregnant', /isPregnant\(profile\) && \(/.test(read('src/components/NutritionDisplay.tsx')) && /data-testid="pregnancy-calorie-line">\{PREGNANCY_CALORIE_LINE\}/.test(read('src/components/NutritionDisplay.tsx')))
  check('the coach is told the target is maintenance and to send calorie questions on', /Their calorie target is MAINTENANCE while pregnant/.test(fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')))
}

console.log('\n2. Food: the NHS list, switched on by the tick, never chosen or saved')
{
  const m = (lines: string[]) => parseIngredientLines(lines)
  const avoid = ['100g smoked salmon', '40g chorizo', '30g salami', '30g pepperoni', '100g chicken liver', '6 oysters']
  const fine = ['100g ham', '100g mozzarella', '40g cheddar', '100g tuna canned in water', '100g sardines canned', '100g prawns', '40g feta cheese']
  for (const line of avoid) check(`kept out while pregnant: ${line}`, validateMealAgainstDiet(m([line]), ['pregnancy']).ok === false)
  check('...and every one of them is allowed with no tick (the rule binds only on pregnancy)', avoid.every(line => validateMealAgainstDiet(m([line]), []).ok))
  for (const line of fine) check(`fine in pregnancy (NHS): ${line}`, validateMealAgainstDiet(m([line]), ['pregnancy']).ok === true, validateMealAgainstDiet(m([line]), ['pregnancy']).violations)
  const ticked = { dietary_preferences: ['vegetarian'], health_conditions: ['pregnancy'] }
  check('the rule is added to what he picked while ticked', JSON.stringify(mealRestrictionsOf(ticked)) === '["vegetarian","pregnancy"]', mealRestrictionsOf(ticked))
  check('...and not without the tick, even if it somehow got saved', JSON.stringify(mealRestrictionsOf({ dietary_preferences: ['pregnancy'] })) === '[]')
  check('it is a real rule the checker knows, but never in the diet pickers', DIETARY_PREFERENCES.includes('pregnancy') && !SELECTABLE_DIETARY_PREFERENCES.includes('pregnancy') && !DIETARY_OPTIONS.some(o => o.value === 'pregnancy'))
  const app = read('src/App.tsx'), chat = read('src/components/ChatAssistant.tsx')
  check('the meal readers ask the switch, not the saved diets (pools, generation, the coach, swaps)',
    /useServablePools\(storedMealPools, profile \? mealRestrictionsOf\(profile\)/.test(app)
    && (app.match(/dietaryPreferences: mealRestrictionsOf\(/g) ?? []).length >= 5
    && /dietary_preferences: mealRestrictionsOf\(profile\)/.test(chat)
    && !/profile\.dietary_preferences \?\? \[\]/.test(chat))
  const genMeals = fs.readFileSync('supabase/functions/generate-meals/index.ts', 'utf8'), coach = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('the meal writer and the coach are told the list', /if \(has\("pregnancy"\)\) rules\.push\("PREGNANCY \(NHS foods to avoid\)/.test(genMeals) && /preferences\.includes\("pregnancy"\)/.test(coach))
}

console.log('\n3. Food: tuna and oily fish watched over the week (a limit, never a ban)')
{
  const m = (l: string[]) => ({ ingredients: parseIngredientLines(l) })
  const day = (lunch: string[], dinner: string[]) => ({ chosen: { lunch: m(lunch), dinner: m(dinner) } })
  const within = [day(['112g tuna canned in water'], ['140g salmon']), day(['224g tuna canned in water'], ['140g mackerel'])]
  const over = [...within, day(['224g tuna canned in water'], ['140g trout'])]
  check('3 tins and 2 portions: within the advice, nothing said', pregnancyFishLines(within).length === 0, pregnancyFishCount(within))
  check('5 tins and 3 portions: both counted', JSON.stringify(pregnancyFishCount(over)) === '{"tunaTins":5,"oilyPortions":3}', pregnancyFishCount(over))
  const lines = pregnancyFishLines(over)
  check('...and both said, in the advice\'s own numbers', lines.length === 2 && /5 tins' worth of tuna.*no more than 4/.test(lines[0]) && /3 portions of oily fish.*no more than 2/.test(lines[1]), lines)
  check('Nutrition shows the watch while pregnant, from the served week', /pregnancyFishLines\(mealWeek\.map\(/.test(read('src/components/NutritionDisplay.tsx')))
}

console.log('\n4. The due date ("Ask due date"): weeks, and from 28 weeks one notch lower with weights held')
{
  check('due in 20 weeks is 20 weeks pregnant; due today is 40', pregnancyWeeksOn('2026-04-04', '2025-11-15') === 20 && pregnancyWeeksOn('2026-02-01', '2026-02-01') === 40, [pregnancyWeeksOn('2026-04-04', '2025-11-15')])
  check('no date: no weeks (treated as past 16, as before)', pregnancyWeeksOn(null, '2026-11-15') === null && pregnancyWeeksOn('soon', '2026-11-15') === null)
  const p = { health_conditions: ['pregnancy'], due_date: '2027-02-08' }
  check('28 weeks is late; 27 the day before is not; not pregnant never is', lateInPregnancy(p, '2026-11-15') === false && lateInPregnancy(p, '2026-11-16') === true && lateInPregnancy({ due_date: '2027-02-08' }, '2026-12-30') === false, [pregnancyWeeksOn(p.due_date, '2026-11-15'), pregnancyWeeksOn(p.due_date, '2026-11-16')])
  // The generator, at week 30 from week 1 (a due date 10 weeks out), against the same profile 10 weeks earlier.
  const base = buildProfile(generateAllCombinations().find(c => c.equipment === 'full_gym' && c.experience === 'advanced')!) as UserProfile
  const plan = (due: string) => {
    setDevClockOverride(base.id, '2026-11-16')
    setRandomSource(seededRngFromKey('preg-late'))
    try { return generateMesocycle({ ...base, health_conditions: ['pregnancy'], due_date: due }) } finally { resetRandomSource(); setDevClockOverride(base.id, null) }
  }
  const rpeTop = (meso: ReturnType<typeof generateMesocycle>) => Math.max(...meso.flatMap(w => w.days).flatMap(d => d.exercises).map(e => Number((/RPE\s*(?:\d+(?:\.\d+)?\s*-\s*)?(\d+(?:\.\d+)?)/i.exec(e.intensity ?? '') ?? [])[1] ?? 0)))
  const late = rpeTop(plan('2027-01-25')), early = rpeTop(plan('2027-08-01'))
  check(`at 30 weeks no working set asks above RPE ${LATE_PREGNANCY_SET_RPE_CEILING}`, late > 0 && late <= LATE_PREGNANCY_SET_RPE_CEILING, { late })
  check('...while a plan that ends before 28 weeks still reaches the health ceiling of 8 (the late rule moved the number)', early > LATE_PREGNANCY_SET_RPE_CEILING && early <= 8, { early })
  const today = read('src/components/exercise/TodayPanel.tsx')
  check('today\'s card holds a weight that would go up, from 28 weeks', /if \(lateInPregnancy\(profile, today\)\) \{/.test(today) && /nextLoads\[name\] > last\) \{\s*nextLoads\[name\] = last/.test(today))
  check('Profile asks the due date under the tick, and it is read back on load', /data-testid="profile-due-date"/.test(read('src/components/ProfileScreen.tsx')) && /due_date: typeof profileRow\.due_date === 'string'/.test(read('src/App.tsx')))
  check('the database step exists', fs.existsSync('supabase/migrations/20261115120000_add_due_date.sql'))
}

console.log('\n5. Words that agree with the switch')
{
  const note = "Diet drives the fat loss here, not the workout — this program is built to protect the muscle you already have while you're in a deficit. Weights stay real weights and progression keeps climbing."
  check('the week note drops the deficit sentence while pregnant, keeps the rest', noteForProfile(note, { health_conditions: ['pregnancy'] }) === 'Weights stay real weights and progression keeps climbing.', noteForProfile(note, { health_conditions: ['pregnancy'] }))
  check('...and is unchanged when not pregnant', noteForProfile(note, {}) === note)
  check('...a sentence about the deficit alone goes too (each word binds on its own)', noteForProfile('Keep the deficit small. Sleep well.', { health_conditions: ['pregnancy'] }) === 'Sleep well.' && noteForProfile('Fat loss comes from food. Sleep well.', { health_conditions: ['pregnancy'] }) === 'Sleep well.')
  check('the generator, Exercise and the coach all read the filtered note',
    /const goalNote = noteForProfile\(/.test(read('src/lib/exercise-plan.ts')) && /coachNote=\{noteForProfile\(/.test(read('src/components/exercise/TodayPanel.tsx')) && /coachNote: noteForProfile\(activeMesoWeek\?\.coach_note, profile\)/.test(read('src/components/ChatAssistant.tsx')))
  const line = healthConditionLine(['pregnancy'])
  check('the health line is true whether or not the rebuild was taken (no "I\'ll keep your sets")', !/I'll keep/.test(line) && /A plan built with this ticked keeps/.test(line) && /midwife or GP/.test(line), line)
}

console.log('\n6. The chat offers what the coach only talked about')
{
  check('"I\'m 20 weeks pregnant" / "we\'re expecting a baby" are heard; "my wife is pregnant", "not pregnant" are not',
    saidPregnant("I'm 20 weeks pregnant") && saidPregnant("we're expecting a baby") && !saidPregnant('my wife is pregnant') && !saidPregnant("I'm not pregnant"))
  check('"pause my plan for a week" is heard; "don\'t pause my plan", "pause the music" are not',
    askedToPause("Can you pause my plan for a week? I'm going on holiday") && !askedToPause("don't pause my plan") && !askedToPause('pause the music'))
  const chat = read('src/components/ChatAssistant.tsx')
  check('with no card in the turn, the app raises the tick card or the pause card itself',
    /if \(!failed && !pendingAction\) \{\s*if \(saidPregnant\(userText\) && !isPregnant\(profile\)\) await offerFromApp\('propose_pregnancy_tick'/.test(chat)
    && /askedToPause\(userText\) && !profile\.plan_paused_since/.test(chat))
  check('...and the tick card writes the same column Profile does, then offers the same rebuild',
    /row\.kind === 'propose_pregnancy_tick'/.test(chat) && /update\(\{ health_conditions: next \}\)/.test(chat) && /detectPlanInvalidation\(profile, \{ health_conditions: next \}\)/.test(chat))
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:pregnancy-one-switch FAILED'); process.exit(1) }
console.log('One tick: maintenance calories, the NHS food list, and a lighter third trimester, said the same everywhere.')
