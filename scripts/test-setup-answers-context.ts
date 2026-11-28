// THE SETUP ANSWERS THE COACH WAS NOT TOLD (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (a) 3, 5, 6, 10).
// Held by behaviour: each figure the coach is given is the one the plan's own reader returns for the same profile, so
// the coach cannot say "3 cardio days" while the plan holds 2, or "week 30" while the 28-week rules are off.
import { buildCoachSetupAnswers, type SetupAnswersProfile } from '../src/lib/setup-answers-context'
import { cardioDaysFrom } from '../src/lib/cardio-days'
import { pregnancyWeeksOn } from '../src/lib/health-conditions'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const days = (n: number) => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, i) => ({ day, available: i < n }))
const base: SetupAnswersProfile = {
  recovery_capacity: undefined as never, concurrent_activities: [], conditioning_preference: undefined as never,
  cardio_days_per_week: null, running_goal: null, training_days: days(4) as never, cooking_time_preference: undefined,
  meal_variety: null, macro_split_preset: undefined, meals_elsewhere: undefined, health_conditions: [], due_date: null,
}
const p = (extra: Partial<SetupAnswersProfile>) => ({ ...base, ...extra }) as SetupAnswersProfile
const TODAY = '2026-11-28'

console.log('1. Nothing answered, nothing said')
check('an empty profile gives an empty block', buildCoachSetupAnswers(base, TODAY) === '')
check('no profile gives an empty block', buildCoachSetupAnswers(null, TODAY) === '')

console.log('2. Recovery: the stated answer, and the plan\'s own reading when a sport lowers it')
{
  const plain = buildCoachSetupAnswers(p({ recovery_capacity: 'high' }), TODAY)
  check('stated recovery is said', /Recovery: high\./.test(plain), plain)
  const sport = buildCoachSetupAnswers(p({ recovery_capacity: 'high', concurrent_activities: [{ name: 'Football', intensity: 0.7, days: ['Tuesday', 'Thursday'], movement_demands: ['conditioning'] }] as never }), TODAY)
  check('a sport that counts as load: the plan reads it one notch down, and says why', /they said high; the plan treats it as moderate because their other sport/.test(sport), sport)
}

console.log('3. Cardio days: the plan\'s count, never the asked one when lifting keeps two days')
{
  const fits = buildCoachSetupAnswers(p({ cardio_days_per_week: 2, training_days: days(5) as never }), TODAY)
  check('2 asked of 5 days: 2 of 5 are cardio', /Cardio days: 2 of their 5 training days/.test(fits), fits)
  const capped = buildCoachSetupAnswers(p({ cardio_days_per_week: 3, training_days: days(3) as never }), TODAY)
  check('3 asked of 3 days: the plan keeps two lifting, so 1', cardioDaysFrom(3, 3) === 1 && /they asked for 3; 1 of their 3 training days are cardio, so at least two stay lifting/.test(capped), capped)
  const one = buildCoachSetupAnswers(p({ cardio_days_per_week: 1, training_days: days(4) as never }), TODAY)
  check('one cardio day asked is said too', /Cardio days: 1 of their 4 training days/.test(one), one)
  const run = buildCoachSetupAnswers(p({ cardio_days_per_week: 2, running_goal: 'run_5k' as never }), TODAY)
  check('a running goal sets the cardio days aside, and says so', /set aside while their running goal/.test(run) && !/of their \d+ training days/.test(run), run)
  check('the conditioning answer is said in words', /Cardio: they love cardio\./.test(buildCoachSetupAnswers(p({ conditioning_preference: 'love' }), TODAY)))
}

console.log('4. Food answers in words')
{
  const t = buildCoachSetupAnswers(p({ cooking_time_preference: 'quick', meal_variety: 'same', macro_split_preset: 'higher_protein' }), TODAY)
  check('cooking time', /Cooking: quick meals only/.test(t), t)
  check('meal variety', /Meal variety: happy to eat the same meals often/.test(t), t)
  check('macro split', /Macro split they picked: higher protein/.test(t), t)
  const e = buildCoachSetupAnswers(p({ meals_elsewhere: { lunch: [1, 2, 3, 4, 5] } }), TODAY)
  check('meals cooked for them, through the screen\'s own wording', /Meals cooked for them .*: Lunch, Monday to Friday\./.test(e), e)
  check('no meals cooked for them: no line', !/Meals cooked/.test(buildCoachSetupAnswers(p({ meals_elsewhere: {} }), TODAY)))
}

console.log('5. Pregnancy: the week the app acts on, and whether the 28-week rules are on')
{
  const late = buildCoachSetupAnswers(p({ health_conditions: ['pregnancy'], due_date: '2027-01-30' }), TODAY)
  const lateWeeks = pregnancyWeeksOn('2027-01-30', TODAY)
  check('the week is pregnancyWeeksOn\'s', lateWeeks != null && late.includes(`about week ${lateWeeks} `), { late, lateWeeks })
  check('past 28 weeks: the late rules are said to be on', (lateWeeks ?? 0) >= 28 && /From 28 weeks the weights hold/.test(late), late)
  const early = buildCoachSetupAnswers(p({ health_conditions: ['pregnancy'], due_date: '2027-05-30' }), TODAY)
  const earlyWeeks = pregnancyWeeksOn('2027-05-30', TODAY)
  check('before 28 weeks: the late rules have not started', (earlyWeeks ?? 99) < 28 && /have not started/.test(early) && !/From 28 weeks the weights hold/.test(early), early)
  const mid = buildCoachSetupAnswers(p({ health_conditions: ['pregnancy'], due_date: '2027-03-20' }), TODAY)
  const midWeeks = pregnancyWeeksOn('2027-03-20', TODAY)
  check('week 20-27 (where a looser cut-off would bind): still not the late rules', (midWeeks ?? 0) >= 20 && (midWeeks ?? 99) < 28 && /have not started/.test(mid), { mid, midWeeks })
  const none = buildCoachSetupAnswers(p({ health_conditions: ['pregnancy'] }), TODAY)
  check('no due date: said, and the plan\'s safe default named', /no due date given/.test(none), none)
  check('a due date without the Pregnant tick says nothing', !/Pregnancy/.test(buildCoachSetupAnswers(p({ due_date: '2027-01-30' }), TODAY)))
}

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')
