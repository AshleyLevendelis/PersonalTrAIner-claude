/**
 * test:setup-sports — ANOTHER SPORT SAID IN SETUP REACHES THE FIRST PLAN
 * (7 Nov 2026, Ashley's ruling "Remember it when they say it", from her setup
 * sentence "I train mon, tue, thu, fri mornings and do muay thai tue and thu
 * evenings").
 *
 *   1. sportsIn: which sport, which days, what time of day, read in code and
 *      only when certain (a hedge, a sport with no days, or days nothing ties
 *      to the sport give nothing).
 *   2. The slot: stored and read back, shown in words, and kept from the
 *      setup coach (it may not set it, and is not told it can).
 *   3. Her setup answers, assembled: the profile carries the sport, the plan's
 *      recovery drops a notch for it, and the FIRST plan puts the lighter
 *      session on a class day and no prescribed cardio on either.
 *   4. The wiring (source): setup reads every typed message for a sport,
 *      ignores the coach setting the slot, and the profile insert names the
 *      column. The browser half is verify:onboarding-turns §26.
 */
import { readFileSync } from 'node:fs'
import { sportsIn, parseSportsSlot, formatSportsSlot, mergeSports } from '../src/lib/setup-sports'
import { assembleProfile, initialSlotValues, getSlotDef, displaySlotValue, buildSlotCatalog, NEVER_BLOCKING_SLOTS, APP_ONLY_SLOTS, openSlotsInOrder } from '../src/lib/onboarding-slots'
import { activityCountsAsLoad, effectiveRecoveryCapacity, HEAVY_TRACKS, countWorkingSets } from '../src/lib/concurrent-activity'
import { generateExercisePlan, generateMesocycle } from '../src/lib/exercise-plan'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const quiet = <T>(f: () => T): T => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const brief = (t: string) => sportsIn(t).map(a => `${a.name}|${a.days.join(',')}|${a.timeOfDay ?? '-'}`)

console.log('\n1. What a typed message says about another sport')
const HERS = 'I train mon, tue, thu, fri mornings and do muay thai tue and thu evenings'
const hers = sportsIn(HERS)
check('her sentence: Muay Thai, Tuesday and Thursday, evenings', JSON.stringify(brief(HERS)) === JSON.stringify(['Muay Thai|Tuesday,Thursday|evening']), brief(HERS))
check('...a combat sport, so it counts as load from one session (and she does two)', hers.length === 1 && hers[0].movement_demands.includes('striking') && activityCountsAsLoad(hers[0]), hers)
const reads: [string, string[]][] = [
  ['I do muay thai tuesday and thursday', ['Muay Thai|Tuesday,Thursday|-']],
  ['tue and thu evenings muay thai, and I lift mon and wed', ['Muay Thai|Tuesday,Thursday|evening']],
  ['I play football on saturday mornings', ['Football|Saturday|morning']],
  ['I go running monday, wednesday and friday before work', ['Running|Monday,Wednesday,Friday|morning']],
  ['kickboxing on monday night and bjj on thursday', ['Kickboxing|Monday|evening', 'BJJ|Thursday|-']],
  ['I do thai boxing wed', ['Muay Thai|Wednesday|-']],
  ['I do yoga on sundays', ['Yoga|Sunday|-']],
  ['muay thai tuesday evenings and muay thai saturday mornings', ['Muay Thai|Tuesday,Saturday|-']],
  ['muay thai on tuesday evening and muay thai on friday evening', ['Muay Thai|Tuesday,Friday|evening']],
]
for (const [t, want] of reads) check(`"${t}"`, JSON.stringify(brief(t)) === JSON.stringify(want), brief(t))
const nothing = ['I used to do muay thai on tuesdays', 'I might start boxing on wednesday', 'I do muay thai', 'I lift mon, wed, fri', 'I go to a class on tuesdays', 'maybe football on saturday']
for (const t of nothing) check(`nothing taken: "${t}"`, sportsIn(t).length === 0, brief(t))
check('yoga is a sport for scheduling, not load (her 6 Sep "light mobility/yoga only affects scheduling")',
  sportsIn('I do yoga on sundays').every(a => !activityCountsAsLoad(a)))

console.log('\n2. The slot')
const stored = formatSportsSlot(hers)
check('stored and read back unchanged', JSON.stringify(parseSportsSlot(stored)) === JSON.stringify(hers))
check('anything else is not a sport list (what a model might send)', parseSportsSlot('Muay Thai Tue Thu') === null && parseSportsSlot('[]') === null && parseSportsSlot(JSON.stringify([{ name: 'X', days: ['Funday'], intensity: 1, movement_demands: [] }])) === null)
const def = getSlotDef('otherSports')!
check('the slot accepts a stored list or nothing, and refuses the rest', def.validate(stored) && def.validate('') && !def.validate('Muay Thai'))
check('shown in words, with its days and time', displaySlotValue(def, { ...initialSlotValues(), otherSports: stored }) === 'Muay Thai · Tuesday & Thursday evenings', displaySlotValue(def, { ...initialSlotValues(), otherSports: stored }))
check('said again with other days, a sport is corrected, never doubled',
  JSON.stringify(mergeSports(hers, sportsIn('muay thai on wednesday')).map(a => a.days)) === JSON.stringify([['Wednesday']]))
check('...and a second sport is added beside it', mergeSports(hers, sportsIn('football on saturday')).map(a => a.name).join() === 'Muay Thai,Football')
check('never asked: it never holds setup up', NEVER_BLOCKING_SLOTS.includes('otherSports') && !openSlotsInOrder(new Set(), initialSlotValues()).includes('otherSports'))
check('the setup coach is not told it can set it', APP_ONLY_SLOTS.includes('otherSports') && !buildSlotCatalog().some(s => s.key === 'otherSports'))

console.log('\n3. Her setup, assembled into the first plan')
const answers = {
  ...initialSlotValues(),
  displayName: 'Ashley', fitnessGoal: 'hypertrophy', trainingExperience: 'intermediate', activityLevel: 'moderate',
  equipment: 'full_gym', injuries: [], trainingDays: ['Mon', 'Tue', 'Thu', 'Fri'], sessionDuration: '45-60',
  trainingStyle: 'hybrid', conditioningPreference: 'tolerate', recoveryCapacity: 'moderate',
  age: '34', heightCm: '170', weightKg: '68', gender: 'female', mealsPerDay: 3, includeSnacks: true,
}
const withSport = assembleProfile({ ...answers, otherSports: stored } as never)
const without = assembleProfile({ ...answers } as never)
check('the profile carries the sport', JSON.stringify(withSport.concurrent_activities) === JSON.stringify(hers), withSport.concurrent_activities)
check('...and none when none was said', JSON.stringify(without.concurrent_activities) === '[]', without.concurrent_activities)
check('the plan reads one recovery notch lower for it', effectiveRecoveryCapacity(withSport) === 'low' && effectiveRecoveryCapacity(without) === 'moderate',
  [effectiveRecoveryCapacity(withSport), effectiveRecoveryCapacity(without)])
const plan = quiet(() => generateExercisePlan(withSport).plan)
const planWithout = quiet(() => generateExercisePlan(without).plan)
const focus = (p: typeof plan, day: string) => p.find(d => d.day === day)?.focus ?? ''
const gym = plan.filter(d => d.exercises.length > 0).map(d => d.day)
check('her four gym days are kept', JSON.stringify(gym) === JSON.stringify(['Monday', 'Tuesday', 'Thursday', 'Friday']), gym)
check('a class day carries the lighter session', !HEAVY_TRACKS.has(focus(plan, 'Tuesday')) || !HEAVY_TRACKS.has(focus(plan, 'Thursday')),
  { Tue: focus(plan, 'Tuesday'), Thu: focus(plan, 'Thursday') })
check('no prescribed cardio on either class day',
  !plan.some(d => ['Tuesday', 'Thursday'].includes(d.day) && d.recommendedCardio && !(d.recommendedCardio as { is_filler?: boolean }).is_filler),
  plan.filter(d => ['Tuesday', 'Thursday'].includes(d.day)).map(d => [d.day, d.recommendedCardio?.activity]))
void planWithout
// Measured as test:concurrent-activity §6 does: the notch acts on the weeks, read at week 2.
const week2 = (m: ReturnType<typeof generateMesocycle>) => m.find(w => w.week_number === 2)
const a2 = countWorkingSets(week2(quiet(() => generateMesocycle(withSport))))
const b2 = countWorkingSets(week2(quiet(() => generateMesocycle(without))))
check('...and week 2 holds less work than it would without the sport (the recovery notch)', a2 < b2, [a2, b2])

console.log('\n4. The wiring (source; verify:onboarding-turns §26 drives it)')
const onb = strip(readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
check('every typed message is read for a sport, merged with what was said before, and ticked',
  /const saidSports = preRecorded \? \[\] : sportsIn\(trimmed\)/.test(onb)
    && /const sports = mergeSports\(parseSportsSlot\(ws\.values\.otherSports\) \?\? \[\], saidSports\)\s*if \(applySlot\(ws, 'otherSports', formatSportsSlot\(sports\), ws\.values\)\) immediateCommit = true/.test(onb))
check('the coach setting it is ignored', /if \(APP_ONLY_SLOTS\.includes\(key\)\) continue/.test(onb))
const app = strip(readFileSync('src/App.tsx', 'utf8'))
// RE-ANCHORED 9 Nov 2026: the setup save is one object (`profileInsert`), read up to the insert that sends it.
const ins = app.indexOf('const profileInsert = {')
const insEnd = ins >= 0 ? app.indexOf('.insert(profileInsert)', ins) : -1
check('the profile insert names the column, or a reload forgets it', ins >= 0 && insEnd > ins && /concurrent_activities: enrichedProfile\.concurrent_activities \?\? \[\],/.test(app.slice(ins, insEnd)))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`setup sports: ${failures} check(s) failed`); process.exit(1) }
console.log('setup sports: all checks passed')
