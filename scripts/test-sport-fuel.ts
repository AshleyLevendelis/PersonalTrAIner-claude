/**
 * test:sport-fuel — ANOTHER SPORT IS FUELLED (Ashley, 7 Nov 2026: "yes, add
 * the extra calories on sport days").
 *
 * The food targets counted gym sessions and the activity level, which setup
 * asks as the day OUTSIDE training, so two Muay Thai nights a week went
 * unfuelled. Now:
 *   1. What a class costs: (MET - 1) x kg x an hour, from the sport table,
 *      or from the coach's effort estimate for a sport it does not know.
 *   2. Standard (one number a day): the week's sport energy spread over seven
 *      days, so every day's number rises by the same amount, and the TDEE
 *      shown beside it agrees.
 *   3. Dynamic (a number per day): the energy on the sport day itself, with a
 *      hard day's carbs; the other days do not move.
 *   4. What is said on the Nutrition sheet, and that every reader of the
 *      day's burn goes through the one sport-aware function.
 * Browser half: verify:sport-fuel.
 */
import { readFileSync } from 'node:fs'
import { sportSessionKcal, sportKcalPerWeek, sportKcalOn, sportMet } from '../src/lib/setup-sports'
import { calculateDailyMacros, getMacroDerivation, getStaticDailyMacros, staticTDEEFor, resolveBodyMetrics, applyGoalAdjustment, sportFuelNote } from '../src/lib/macro-calculator'
import type { ConcurrentActivity, UserProfile } from '../src/lib/types'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const MUAY: ConcurrentActivity = { name: 'Muay Thai', intensity: 0.8, days: ['Tuesday', 'Thursday'], movement_demands: ['striking', 'knee_dominant', 'hip_hinge', 'conditioning'], timeOfDay: 'evening' }
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const base = {
  id: 'p1', age: 34, gender: 'female', height_cm: 170, weight_kg: 68, activity_level: 'moderate', fitness_goal: 'hypertrophy',
  training_days: DAYS.map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(day) })),
  session_duration_preference: '45-60', macro_calculation_mode: 'STANDARD_STATIC', concurrent_activities: [],
} as unknown as UserProfile
const withSport = { ...base, concurrent_activities: [MUAY] } as UserProfile

console.log('\n1. What a class costs')
check('Muay Thai at 68 kg: (8 - 1) x 68 x 1 hour = 476 kcal', sportSessionKcal(MUAY, 68) === 476, sportSessionKcal(MUAY, 68))
check('...twice a week is 952 a week', sportKcalPerWeek([MUAY], 68) === 952, sportKcalPerWeek([MUAY], 68))
check('...on a Tuesday it is 476, on a Wednesday nothing', sportKcalOn([MUAY], 'Tuesday', 68) === 476 && sportKcalOn([MUAY], 'Wednesday', 68) === 0)
check('a heavier person burns more for the same class', sportSessionKcal(MUAY, 90) > sportSessionKcal(MUAY, 68))
check('yoga costs far less than Muay Thai', sportSessionKcal({ name: 'Yoga', intensity: 0.3 }, 68) < sportSessionKcal(MUAY, 68) / 3, sportSessionKcal({ name: 'Yoga', intensity: 0.3 }, 68))
check("a sport the table does not know is costed from the coach's effort estimate", sportMet({ name: 'Ultimate frisbee', intensity: 0.8 }) === 7.8 && sportMet({ name: 'Ultimate frisbee', intensity: 0.3 }) === 4.8)
check('a sport with no days costs nothing', sportKcalPerWeek([{ ...MUAY, days: [] }], 68) === 0)

console.log('\n2. Standard: one number a day, spread across the week')
const m = resolveBodyMetrics(withSport)!
const plainTdee = staticTDEEFor(base, m), sportTdee = staticTDEEFor(withSport, m)
check('the day\'s burn rises by the week\'s sport energy over seven days (952 / 7 = 136)', sportTdee - plainTdee === 136, sportTdee - plainTdee)
const a = getStaticDailyMacros(base)!, b = getStaticDailyMacros(withSport)!
const expected = applyGoalAdjustment(sportTdee, 'hypertrophy', 'female') - applyGoalAdjustment(plainTdee, 'hypertrophy', 'female')
check('the calorie target rises by that, after the goal\'s own adjustment', Math.abs((b.calories - a.calories) - expected) <= 12 && b.calories > a.calories, [a.calories, b.calories, expected])
check('...and stays the same number every day', DAYS.every(d => calculateDailyMacros(withSport, d, [])!.calories === b.calories))
const der = getMacroDerivation(withSport)!
check('the TDEE shown beside the target includes the sport', der.tdee === sportTdee && der.target.calories === b.calories, der)
check('no sport, no change: the target is what it always was', getStaticDailyMacros({ ...base, concurrent_activities: undefined } as UserProfile)!.calories === a.calories)

console.log('\n3. Dynamic: on the sport day itself')
const dyn = { ...withSport, macro_calculation_mode: 'DYNAMIC_CSCS' } as UserProfile
const dynNo = { ...base, macro_calculation_mode: 'DYNAMIC_CSCS' } as UserProfile
const plan = [{ day: 'Tuesday', focus: 'Upper Pull & Core', exercises: [] }, { day: 'Thursday', focus: 'Push & Press', exercises: [] }] as never
const tue = calculateDailyMacros(dyn, 'Tuesday', plan)!, tueNo = calculateDailyMacros(dynNo, 'Tuesday', plan)!
check('a Muay Thai day gets more energy', tue.calories > tueNo.calories + 250, [tueNo.calories, tue.calories])
check('...with more of it as carbs (a hard day\'s carbs)', tue.carbs > tueNo.carbs, [tueNo.carbs, tue.carbs])
check('...and protein unchanged (it is set by body weight)', tue.protein === tueNo.protein)
const wed = calculateDailyMacros(dyn, 'Wednesday', plan)!, wedNo = calculateDailyMacros(dynNo, 'Wednesday', plan)!
check('a day with no sport does not move', wed.calories === wedNo.calories && wed.carbs === wedNo.carbs)
const sunSport = { ...dyn, concurrent_activities: [{ ...MUAY, days: ['Sunday'] }] } as UserProfile
const sun = calculateDailyMacros(sunSport, 'Sunday', plan)!
check('a sport on a day with no gym session makes it a training day, not a rest day', sun.dayType === 'training' && sun.calories > calculateDailyMacros(dynNo, 'Sunday', plan)!.calories, sun)

console.log('\n4. What she is told, and one function for the day\'s burn')
check('standard says what each class adds, that it assumed an hour, and the daily rise',
  sportFuelNote(withSport, 68) === 'Muay Thai adds about 480 kcal a class (taken as 60 minutes), twice a week, spread across the week: +136 kcal a day.', sportFuelNote(withSport, 68))
check('dynamic says it goes on the day itself',
  sportFuelNote(dyn, 68) === 'Muay Thai adds about 480 kcal a class (taken as 60 minutes), twice a week, on the day itself.', sportFuelNote(dyn, 68))
check('no sport, no sentence', sportFuelNote(base, 68) === null)
for (const f of ['src/App.tsx', 'src/components/ChatAssistant.tsx', 'src/lib/nutrition-targets.ts']) {
  const src = strip(readFileSync(f, 'utf8'))
  check(`${f} reads the day's burn through the sport-aware function`, /staticTDEEFor\(/.test(src) && !/computeStaticTDEE\(/.test(src))
}
const nd = strip(readFileSync('src/components/NutritionDisplay.tsx', 'utf8'))
check('the Nutrition sheet shows the sentence', /data-testid="sport-fuel-note"[^>]*>\{sportFuelNote\(effectiveProfile, effectiveProfile\.weight_kg\)\}/.test(nd))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`sport fuel: ${failures} check(s) failed`); process.exit(1) }
console.log('sport fuel: all checks passed')
